// Shared in-memory MockKmsAdapter for KMS contract and GDPR erasure tests.
// Implements the full KmsAdapter interface from packages/adapter-kms using
// WebCrypto AES-KW for real wrap/unwrap operations.
// Lifecycle state (active → scheduled_for_destruction → destroyed) is time-driven
// via Date.now() so tests can control it with vi.setSystemTime().

import {
  KmsAdapter,
  type KeyHandle,
  type WrappedKey,
  type KeyStatus,
} from '../../packages/adapter-kms/src/index.js'

export class MockKmsAdapter extends KmsAdapter {
  // userId → AES-KW CryptoKey used to wrap/unwrap DEKs
  private readonly _wrapKeys = new Map<string, CryptoKey>()
  // keyId → full lifecycle status (mutated in place)
  private readonly _statuses = new Map<string, KeyStatus>()
  // userId → keyId (the user's current KEK id)
  private readonly _userKeyIds = new Map<string, string>()
  // wrapHandle → raw wrapped-DEK bytes (output of SubtleCrypto.wrapKey)
  private readonly _wrappedDeks = new Map<string, ArrayBuffer>()

  private _now(): string {
    return new Date().toISOString()
  }

  // Advance status to 'destroyed' if the scheduled destruction time has passed.
  // Does NOT throw — callers check status.status after calling this.
  private _maybeExpire(status: KeyStatus): void {
    if (
      status.status === 'scheduled_for_destruction' &&
      status.scheduledDestroyAt !== null &&
      Date.now() >= new Date(status.scheduledDestroyAt).getTime()
    ) {
      status.status = 'destroyed'
      if (!status.destroyedAt) {
        const ts = this._now()
        status.destroyedAt = ts
        status.auditTrail.push({ event: 'destroyed', ts, actor: 'system' })
      }
      this._wrapKeys.delete(status.userId)
    }
  }

  async issueKey(userId: string): Promise<KeyHandle> {
    const cryptoKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
      'wrapKey',
      'unwrapKey',
    ])
    const keyId = `mock-kek-${userId}-${Date.now()}`
    const issuedAt = this._now()
    this._wrapKeys.set(userId, cryptoKey)
    this._userKeyIds.set(userId, keyId)
    this._statuses.set(keyId, {
      keyId,
      userId,
      status: 'active',
      issuedAt,
      lastUsedAt: null,
      scheduledDestroyAt: null,
      destroyedAt: null,
      auditTrail: [{ event: 'issued', ts: issuedAt, actor: 'system' }],
    })
    return { keyId, userId, issuedAt, provider: 'mock' }
  }

  async wrapKey(dek: CryptoKey, kek: KeyHandle): Promise<WrappedKey> {
    const status = this._statuses.get(kek.keyId)
    if (!status) throw new Error(`KEK not found: ${kek.keyId}`)
    this._maybeExpire(status)
    if (status.status === 'destroyed') {
      throw new Error(`KEK ${kek.keyId} has been destroyed — no new data can be encrypted`)
    }
    const wrapCryptoKey = this._wrapKeys.get(kek.userId)
    if (!wrapCryptoKey) throw new Error(`Wrapping key not found for user ${kek.userId}`)

    const wrapped = await crypto.subtle.wrapKey('raw', dek, wrapCryptoKey, { name: 'AES-KW' })
    const handle = `wh-${kek.keyId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    this._wrappedDeks.set(handle, wrapped)

    const ts = this._now()
    status.lastUsedAt = ts
    status.auditTrail.push({ event: 'used', ts, actor: 'system' })

    return { keyId: kek.keyId, wrappedKeyMaterial: handle, algorithm: 'AES-KW' }
  }

  async unwrapKey(wrapped: WrappedKey, kek: KeyHandle): Promise<CryptoKey> {
    const status = this._statuses.get(kek.keyId)
    if (!status) throw new Error(`KEK not found: ${kek.keyId}`)
    this._maybeExpire(status)
    if (status.status === 'destroyed') {
      throw new Error(`KEK ${kek.keyId} has been destroyed — data is permanently unreadable`)
    }
    const wrapCryptoKey = this._wrapKeys.get(kek.userId)
    if (!wrapCryptoKey) throw new Error(`Wrapping key not found for user ${kek.userId}`)

    const rawWrapped = this._wrappedDeks.get(wrapped.wrappedKeyMaterial)
    if (!rawWrapped)
      throw new Error(`Wrapped key material not found: ${wrapped.wrappedKeyMaterial}`)

    const ts = this._now()
    status.lastUsedAt = ts
    status.auditTrail.push({ event: 'used', ts, actor: 'system' })

    return crypto.subtle.unwrapKey(
      'raw',
      rawWrapped,
      wrapCryptoKey,
      { name: 'AES-KW' },
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    )
  }

  async scheduleKeyDestruction(userId: string, destroyAt: Date): Promise<void> {
    const keyId = this._userKeyIds.get(userId)
    if (!keyId) throw new Error(`No key found for user ${userId}`)
    const status = this._statuses.get(keyId)
    if (!status) throw new Error(`No status for key ${keyId}`)
    if (status.status === 'destroyed') throw new Error(`Key ${keyId} is already destroyed`)

    const destroyAtISO = destroyAt.toISOString()
    status.status = 'scheduled_for_destruction'
    status.scheduledDestroyAt = destroyAtISO
    const ts = this._now()
    status.auditTrail.push({ event: 'destruction_scheduled', ts, actor: 'system' })
  }

  async getKeyStatus(userId: string): Promise<KeyStatus> {
    const keyId = this._userKeyIds.get(userId)
    if (!keyId) {
      // Key may already be destroyed — scan statuses by userId
      for (const status of this._statuses.values()) {
        if (status.userId === userId) {
          this._maybeExpire(status)
          return { ...status, auditTrail: status.auditTrail.map((e) => ({ ...e })) }
        }
      }
      throw new Error(`No key found for user ${userId}`)
    }
    const status = this._statuses.get(keyId)!
    this._maybeExpire(status)
    return { ...status, auditTrail: status.auditTrail.map((e) => ({ ...e })) }
  }
}
