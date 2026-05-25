// ── Domain layer — core types, value objects, and domain errors ────────────────
// This module defines the types that cross every layer of the application.
// No infrastructure dependencies; no async; no side effects.
// Consumers: application layer, server services, adapter tests.

// ── Branded primitive types ────────────────────────────────────────────────────
// Use brand types so the compiler rejects e.g. passing a ClientId where a
// TaskId is expected, even though both are strings at runtime.

declare const __brand: unique symbol
type Brand<T, B> = T & { readonly [__brand]: B }

export type TenantId = Brand<string, 'TenantId'>
export type OrgId = Brand<string, 'OrgId'>
export type UserId = Brand<string, 'UserId'>
export type ClientId = Brand<string, 'ClientId'>
export type ProjectId = Brand<string, 'ProjectId'>
export type TaskId = Brand<string, 'TaskId'>
export type PersonId = Brand<string, 'PersonId'>
export type DepartmentId = Brand<string, 'DepartmentId'>
export type DealId = Brand<string, 'DealId'>
export type PipelineId = Brand<string, 'PipelineId'>
export type TagId = Brand<string, 'TagId'>
export type FileId = Brand<string, 'FileId'>
export type DocumentId = Brand<string, 'DocumentId'>
export type ConversationId = Brand<string, 'ConversationId'>
export type AuditEventId = Brand<string, 'AuditEventId'>
export type NotificationId = Brand<string, 'NotificationId'>
export type TimeEntryId = Brand<string, 'TimeEntryId'>
export type CommunicationId = Brand<string, 'CommunicationId'>

// ── Constructor helpers (narrow string → branded type safely) ─────────────────

export function toTenantId(s: string): TenantId {
  return s as TenantId
}
export function toOrgId(s: string): OrgId {
  return s as OrgId
}
export function toUserId(s: string): UserId {
  return s as UserId
}
export function toClientId(s: string): ClientId {
  return s as ClientId
}
export function toProjectId(s: string): ProjectId {
  return s as ProjectId
}
export function toTaskId(s: string): TaskId {
  return s as TaskId
}
export function toPersonId(s: string): PersonId {
  return s as PersonId
}
export function toDepartmentId(s: string): DepartmentId {
  return s as DepartmentId
}
export function toDealId(s: string): DealId {
  return s as DealId
}
export function toPipelineId(s: string): PipelineId {
  return s as PipelineId
}
export function toTagId(s: string): TagId {
  return s as TagId
}
export function toFileId(s: string): FileId {
  return s as FileId
}
export function toDocumentId(s: string): DocumentId {
  return s as DocumentId
}
export function toConversationId(s: string): ConversationId {
  return s as ConversationId
}
export function toAuditEventId(s: string): AuditEventId {
  return s as AuditEventId
}
export function toNotificationId(s: string): NotificationId {
  return s as NotificationId
}
export function toTimeEntryId(s: string): TimeEntryId {
  return s as TimeEntryId
}
export function toCommunicationId(s: string): CommunicationId {
  return s as CommunicationId
}

// ── Core entity interfaces ─────────────────────────────────────────────────────

/** Base interface shared by every persisted CRM record. */
export interface IEntity {
  readonly id: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Entities that support soft-deletion carry an optional deletedAt timestamp. */
export interface ISoftDeletable extends IEntity {
  readonly deletedAt?: string
}

/** Entities that belong to an organisation. */
export interface ITenanted extends IEntity {
  readonly tenantId: string
}

// ── Value objects ──────────────────────────────────────────────────────────────
// Immutable types that encapsulate a primitive with domain-specific validation.

/** An ISO 8601 date string (YYYY-MM-DD). Opaque so callers cannot pass bare strings. */
export type ISODate = Brand<string, 'ISODate'>

export function toISODate(s: string): ISODate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError(`Invalid ISO date: ${s}`)
  return s as ISODate
}

/** An ISO 8601 date-time string. */
export type ISODateTime = Brand<string, 'ISODateTime'>

export function toISODateTime(s: string): ISODateTime {
  const d = new Date(s)
  if (isNaN(d.getTime())) throw new ValidationError(`Invalid ISO datetime: ${s}`)
  return s as ISODateTime
}

/** A non-empty trimmed string. */
export type NonEmptyString = Brand<string, 'NonEmptyString'>

export function toNonEmptyString(s: string, field = 'value'): NonEmptyString {
  const trimmed = s.trim()
  if (!trimmed) throw new ValidationError(`${field} must not be empty`)
  return trimmed as NonEmptyString
}

// ── Domain errors ──────────────────────────────────────────────────────────────
// All domain errors extend DomainError so callers can distinguish domain
// violations from infrastructure failures with a single `instanceof` check.

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'DomainError'
    // Maintain correct prototype chain in TypeScript transpiled to ES5.
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id: string) {
    super(`${resource} with id '${id}' was not found`, 'NOT_FOUND')
    this.name = 'NotFoundError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class AuthorizationError extends DomainError {
  constructor(action: string, resource?: string) {
    super(
      resource ? `Not authorized to ${action} on ${resource}` : `Not authorized to ${action}`,
      'AUTHORIZATION_ERROR',
    )
    this.name = 'AuthorizationError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR')
    this.name = 'ConflictError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class LegalHoldError extends DomainError {
  constructor(userId: string) {
    super(
      `User '${userId}' is on legal hold — erasure is blocked until the hold is lifted`,
      'LEGAL_HOLD_ACTIVE',
    )
    this.name = 'LegalHoldError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

// ── Domain result type ─────────────────────────────────────────────────────────
// A discriminated union that makes error paths explicit without exceptions.
// Use for cross-layer return values; within the domain itself, throw DomainError.

export type DomainResult<T, E extends DomainError = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export function ok<T>(value: T): DomainResult<T, never> {
  return { ok: true, value }
}

export function err<E extends DomainError>(error: E): DomainResult<never, E> {
  return { ok: false, error }
}

// ── Domain events ──────────────────────────────────────────────────────────────
// Lightweight notifications that something significant happened in the domain.
// Subscribers (analytics, audit, notifications) react without coupling to the
// originating use case.

export interface DomainEvent {
  readonly type: string
  readonly occurredAt: ISODateTime
  readonly tenantId: string
}

export interface RecordCreatedEvent extends DomainEvent {
  readonly type: 'record.created'
  readonly store: string
  readonly recordId: string
  readonly actorId: string
}

export interface RecordUpdatedEvent extends DomainEvent {
  readonly type: 'record.updated'
  readonly store: string
  readonly recordId: string
  readonly changedFields: string[]
  readonly actorId: string
}

export interface RecordDeletedEvent extends DomainEvent {
  readonly type: 'record.deleted'
  readonly store: string
  readonly recordId: string
  readonly actorId: string
  readonly permanent: boolean
}

export interface GdprErasureRequestedEvent extends DomainEvent {
  readonly type: 'gdpr.erasure_requested'
  readonly targetUserId: string
  readonly requestedByUserId: string
}

export type AnyDomainEvent =
  | RecordCreatedEvent
  | RecordUpdatedEvent
  | RecordDeletedEvent
  | GdprErasureRequestedEvent

// ── Domain event bus (sync, in-process) ───────────────────────────────────────

type AnyEventHandler = (event: AnyDomainEvent) => void | Promise<void>

class DomainEventBus {
  private readonly _handlers: Map<string, AnyEventHandler[]> = new Map()

  on<E extends AnyDomainEvent>(
    type: E['type'],
    handler: (event: E) => void | Promise<void>,
  ): () => void {
    const list = this._handlers.get(type) ?? []
    const wrapped = handler as AnyEventHandler
    list.push(wrapped)
    this._handlers.set(type, list)
    return () => {
      const updated = this._handlers.get(type) ?? []
      this._handlers.set(
        type,
        updated.filter((h) => h !== wrapped),
      )
    }
  }

  async emit(event: AnyDomainEvent): Promise<void> {
    const handlers = this._handlers.get(event.type) ?? []
    await Promise.all(handlers.map((h) => Promise.resolve(h(event))))
  }
}

export const domainEvents = new DomainEventBus()
