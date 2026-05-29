// Email service — AWS SES v2, SMTP (nodemailer), and no-op (dev) implementations.
// Provider is selected by EMAIL_PROVIDER env var: aws-ses | smtp | none (default: none).
// Follows the same factory pattern as server/src/kms/key-service.ts.
//
// Security notes:
//   - HTML bodies are constructed server-side from trusted notification records only.
//   - No user-supplied content is interpolated into the HTML template without escaping.
//   - SES sending identity must be verified in AWS before production use.
//   - SMTP credentials are read from env vars; never hardcoded.

import { SESv2Client, SendEmailCommand, type SendEmailCommandInput } from '@aws-sdk/client-sesv2'
import nodemailer from 'nodemailer'
import { otel } from '../observability/otel.js'

export interface EmailMessage {
  /** Recipient email address. */
  to: string
  /** Email subject line. */
  subject: string
  /** HTML body. Must contain only server-constructed content — no raw user input. */
  html: string
  /** Plain-text fallback. */
  text: string
}

export interface EmailService {
  send(message: EmailMessage): Promise<void>
}

// ── AWS SES v2 ────────────────────────────────────────────────────────────────

export class AwsSesEmailService implements EmailService {
  private readonly _client: SESv2Client
  private readonly _fromAddress: string

  constructor(region: string, fromAddress: string) {
    this._client = new SESv2Client({ region })
    this._fromAddress = fromAddress
  }

  async send(message: EmailMessage): Promise<void> {
    const input: SendEmailCommandInput = {
      FromEmailAddress: this._fromAddress,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: message.html, Charset: 'UTF-8' },
            Text: { Data: message.text, Charset: 'UTF-8' },
          },
        },
      },
    }
    const result = await this._client.send(new SendEmailCommand(input))
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'tktaskapp-server',
      tenantId: 'system',
      requestId: 'email-dispatch',
      message: `SES email sent to ${message.to}, messageId=${result.MessageId ?? 'unknown'}`,
    })
  }
}

// ── SMTP (nodemailer) ─────────────────────────────────────────────────────────

export class SmtpEmailService implements EmailService {
  private readonly _transporter: ReturnType<typeof nodemailer.createTransport>
  private readonly _fromAddress: string

  constructor(opts: {
    host: string
    port: number
    secure: boolean
    user?: string
    password?: string
    fromAddress: string
  }) {
    this._fromAddress = opts.fromAddress
    this._transporter = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.secure,
      ...(opts.user && opts.password ? { auth: { user: opts.user, pass: opts.password } } : {}),
    })
  }

  async send(message: EmailMessage): Promise<void> {
    const info = await this._transporter.sendMail({
      from: this._fromAddress,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'tktaskapp-server',
      tenantId: 'system',
      requestId: 'email-dispatch',
      message: `SMTP email sent to ${message.to}, messageId=${info.messageId}`,
    })
  }
}

// ── No-op (dev / disabled) ────────────────────────────────────────────────────

export class NoneEmailService implements EmailService {
  send(message: EmailMessage): Promise<void> {
    otel.log({
      timestamp: new Date().toISOString(),
      level: 'info',
      service: 'tktaskapp-server',
      tenantId: 'system',
      requestId: 'email-dispatch',
      message: `[EMAIL_PROVIDER=none] would send to=${message.to} subject="${message.subject}"`,
    })
    return Promise.resolve()
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Returns the configured email service based on EMAIL_PROVIDER env var.
 *
 * EMAIL_PROVIDER=aws-ses  → AwsSesEmailService
 *   Required: EMAIL_FROM_ADDRESS, AWS_REGION (shared with KMS)
 *
 * EMAIL_PROVIDER=smtp     → SmtpEmailService
 *   Required: SMTP_HOST, SMTP_FROM
 *   Optional: SMTP_PORT (default 587), SMTP_SECURE (default false), SMTP_USER, SMTP_PASSWORD
 *
 * EMAIL_PROVIDER=none (default) → NoneEmailService (logs only — safe for dev/CI)
 */
export function getEmailService(): EmailService {
  const provider = process.env['EMAIL_PROVIDER'] ?? 'none'

  if (provider === 'aws-ses') {
    const region = process.env['AWS_REGION']
    if (!region) throw new Error('EMAIL_PROVIDER=aws-ses requires AWS_REGION env var')
    const fromAddress = process.env['EMAIL_FROM_ADDRESS']
    if (!fromAddress) throw new Error('EMAIL_PROVIDER=aws-ses requires EMAIL_FROM_ADDRESS env var')
    return new AwsSesEmailService(region, fromAddress)
  }

  if (provider === 'smtp') {
    const host = process.env['SMTP_HOST']
    if (!host) throw new Error('EMAIL_PROVIDER=smtp requires SMTP_HOST env var')
    const fromAddress = process.env['SMTP_FROM']
    if (!fromAddress) throw new Error('EMAIL_PROVIDER=smtp requires SMTP_FROM env var')
    const smtpUser = process.env['SMTP_USER']
    const smtpPassword = process.env['SMTP_PASSWORD']
    return new SmtpEmailService({
      host,
      port: Number(process.env['SMTP_PORT'] ?? '587'),
      secure: process.env['SMTP_SECURE'] === 'true',
      ...(smtpUser !== undefined ? { user: smtpUser } : {}),
      ...(smtpPassword !== undefined ? { password: smtpPassword } : {}),
      fromAddress,
    })
  }

  // provider === 'none' or any unrecognised value — fail open to no-op (safe default for dev)
  return new NoneEmailService()
}

// ── HTML template ─────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

/**
 * Builds a minimal, accessible plain-HTML notification email.
 * All user-sourced strings (title, body) are HTML-escaped before interpolation.
 */
export function buildNotificationEmail(opts: {
  recipientEmail: string
  notificationTitle: string
  notificationBody: string | null
  appName?: string
}): EmailMessage {
  const appName = opts.appName ?? 'Task App CRM'
  const safeTitle = escHtml(opts.notificationTitle)
  const safeBody = opts.notificationBody ? escHtml(opts.notificationBody) : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;">
  <h1 style="font-size:20px;margin-bottom:8px;">${safeTitle}</h1>
  ${safeBody ? `<p style="font-size:15px;line-height:1.6;margin-top:0;">${safeBody}</p>` : ''}
  <hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">
  <p style="font-size:12px;color:#666;">This notification was sent by ${escHtml(appName)}. Do not reply to this email.</p>
</body>
</html>`

  const text = `${opts.notificationTitle}\n\n${opts.notificationBody ?? ''}\n\n— ${appName}`

  return {
    to: opts.recipientEmail,
    subject: opts.notificationTitle,
    html,
    text,
  }
}
