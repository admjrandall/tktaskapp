// ── TOTP MFA (SEC-12, NIST IA-2, NIST SP 800-63B AAL2) ────────────────────────
// Pure WebCrypto implementation — no external dependencies except qrcode-generator.
// RFC 4226 HOTP + RFC 6238 TOTP
// Uses HMAC-SHA1 for universal authenticator app compatibility
// Base32 encoding per RFC 4648

// ── Base32 ─────────────────────────────────────────────────────────────────────
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const B32_MAP: Record<string, number> = {}
for (let i = 0; i < B32_CHARS.length; i++) B32_MAP[B32_CHARS[i]!] = i

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0,
    value = 0,
    output = ''
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!
    bits += 8
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 31] ?? ''
      bits -= 5
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 31] ?? ''
  while (output.length % 8 !== 0) output += '='
  return output
}

export function base32Decode(b32: string): Uint8Array {
  const input = b32.replace(/=+$/, '').toUpperCase().replace(/\s/g, '')
  let bits = 0,
    value = 0
  const output: number[] = []
  for (const char of input) {
    const v = B32_MAP[char]
    if (v === undefined) continue // skip unknown chars
    value = (value << 5) | v
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

// ── Core TOTP functions ────────────────────────────────────────────────────────

export function generateTOTPSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(20))
}

async function hmacSHA1(key: Uint8Array, msg: Uint8Array): Promise<Uint8Array> {
  // Ensure ArrayBuffer (not SharedArrayBuffer) for WebCrypto compatibility
  const toAB = (u: Uint8Array): ArrayBuffer =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
  const k = await crypto.subtle.importKey(
    'raw',
    toAB(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, toAB(msg)))
}

async function hotp(secret: Uint8Array, counter: bigint): Promise<number> {
  const msg = new Uint8Array(8)
  new DataView(msg.buffer).setBigUint64(0, counter, false)
  const mac = await hmacSHA1(secret, msg)
  const offset = mac[19]! & 0xf
  const code =
    ((mac[offset]! & 0x7f) << 24) |
    ((mac[offset + 1]! & 0xff) << 16) |
    ((mac[offset + 2]! & 0xff) << 8) |
    (mac[offset + 3]! & 0xff)
  return code % 1_000_000
}

export async function generateTOTPCode(secretB32: string, ts = Date.now()): Promise<string> {
  const secret = base32Decode(secretB32)
  const code = await hotp(secret, BigInt(Math.floor(ts / 30000)))
  return String(code).padStart(6, '0')
}

export async function verifyTOTPCode(
  secretB32: string,
  userCode: string,
  drift = 1,
): Promise<boolean> {
  const secret = base32Decode(secretB32)
  const T = BigInt(Math.floor(Date.now() / 30000))
  for (let d = -drift; d <= drift; d++) {
    const expected = await hotp(secret, T + BigInt(d))
    if (String(expected).padStart(6, '0') === userCode.trim()) return true
  }
  return false
}

export function buildOTPAuthURI(
  secretB32: string,
  accountName: string,
  issuer = 'Task App CRM',
): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}

/**
 * Returns seconds until the current TOTP window expires.
 */
export function totpSecondsRemaining(): number {
  return 30 - (Math.floor(Date.now() / 1000) % 30)
}

/**
 * Generate a QR code SVG string for the given otpauth URI.
 * Uses qrcode-generator for SVG output.
 */
export function generateQRCodeSVG(uri: string): string {
  try {
    // Dynamic import pattern — qrcode-generator is a UMD module

    const qr = (
      require as (id: string) => (
        typeNumber: number,
        errorCorrectionLevel: string,
      ) => {
        addData(data: string): void
        make(): void
        createSvgTag(cellSize?: number, margin?: number): string
      }
    )('qrcode-generator')
    const qrCode = qr(0, 'M')
    qrCode.addData(uri)
    qrCode.make()
    return qrCode.createSvgTag(4, 4)
  } catch (e) {
    console.warn('[totp] QR code generation failed:', (e as Error).message)
    return ''
  }
}
