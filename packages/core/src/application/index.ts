// ── Application layer — use case orchestration ─────────────────────────────────
// Coordinates domain objects and storage without owning business rules.
// Each use case:
//   1. Validates its input against domain rules
//   2. Delegates persistence to the db helpers (storage/db.ts)
//   3. Emits domain events via domainEvents.emit()
//   4. Returns a DomainResult so callers handle errors without try/catch
//
// No UI code. No direct IndexedDB calls. No fetch() calls.
// The boundary: UI → application layer → storage/db.ts → IDB/adapter.

import {
  type DomainResult,
  DomainError,
  NotFoundError,
  ValidationError,
  ok,
  err,
  domainEvents,
  toISODateTime,
  type AnyDomainEvent,
} from '../domain/index.js'

// ── Command / Query base types ─────────────────────────────────────────────────

/** A command mutates state and returns a DomainResult. */
export interface ICommand<TInput, TOutput = void> {
  execute(input: TInput): Promise<DomainResult<TOutput>>
}

/** A query reads state and returns a DomainResult. It must not mutate state. */
export interface IQuery<TInput, TOutput> {
  execute(input: TInput): Promise<DomainResult<TOutput>>
}

// ── Pagination ─────────────────────────────────────────────────────────────────

export interface PaginationInput {
  page?: number
  pageSize?: number
}

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export function paginationParams(input: PaginationInput): { page: number; pageSize: number } {
  const page = Math.max(1, input.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20))
  return { page, pageSize }
}

export function paginate<T>(items: T[], page: number, pageSize: number): PaginatedResult<T> {
  const totalCount = items.length
  const totalPages = Math.ceil(totalCount / pageSize)
  const safePage = Math.min(page, Math.max(1, totalPages))
  const start = (safePage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    totalCount,
    page: safePage,
    pageSize,
    totalPages,
  }
}

// ── Base use case class ────────────────────────────────────────────────────────
// Extend this to get domain event dispatch and uniform error handling.

export abstract class UseCase<TInput, TOutput = void> implements ICommand<TInput, TOutput> {
  async execute(input: TInput): Promise<DomainResult<TOutput>> {
    try {
      const result = await this._execute(input)
      for (const event of this._pendingEvents) {
        await domainEvents.emit(event)
      }
      this._pendingEvents.length = 0
      return result
    } catch (e) {
      this._pendingEvents.length = 0
      if (e instanceof DomainError) return err(e)
      throw e // Infrastructure errors propagate to the caller for logging
    }
  }

  protected abstract _execute(input: TInput): Promise<DomainResult<TOutput>>

  protected readonly _pendingEvents: AnyDomainEvent[] = []

  protected _emitLater(event: AnyDomainEvent): void {
    this._pendingEvents.push(event)
  }
}

// ── Record use case inputs / results ──────────────────────────────────────────

export interface CreateRecordInput<T extends Record<string, unknown>> {
  store: string
  fields: T
  actorId: string
  tenantId: string
}

export interface UpdateRecordInput<T extends Record<string, unknown>> {
  store: string
  id: string
  changes: Partial<T>
  actorId: string
  tenantId: string
}

export interface DeleteRecordInput {
  store: string
  id: string
  permanent?: boolean
  actorId: string
  tenantId: string
}

export interface GetRecordInput {
  store: string
  id: string
  tenantId: string
}

export interface ListRecordsInput extends PaginationInput {
  store: string
  tenantId: string
  filter?: Record<string, unknown>
}

// ── Validation helpers ─────────────────────────────────────────────────────────

export function requireField<T>(value: T | undefined | null, fieldName: string): DomainResult<T> {
  if (value === undefined || value === null || value === '') {
    return err(new ValidationError(`'${fieldName}' is required`))
  }
  return ok(value)
}

export function requireId(id: string | undefined | null): DomainResult<string> {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return err(new ValidationError("'id' must be a non-empty string"))
  }
  return ok(id.trim())
}

export function requireExists<T>(
  record: T | null | undefined,
  resource: string,
  id: string,
): DomainResult<T> {
  if (record === null || record === undefined) {
    return err(new NotFoundError(resource, id))
  }
  return ok(record)
}

// ── ISO timestamp factory ──────────────────────────────────────────────────────

export function nowISO(): string {
  return toISODateTime(new Date().toISOString())
}

// ── Re-exports for convenience ─────────────────────────────────────────────────
export { ok, err, DomainError, NotFoundError, ValidationError } from '../domain/index.js'
export type { DomainResult } from '../domain/index.js'
