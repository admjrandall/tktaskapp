// ── WebAuthn Passkeys with PRF Extension (2026, NIST AAL2+) ───────────────────
// WebAuthn Level 3 PRF extension — the passkey's PRF output protects the master password.
// Only available on https:// origins (not file://).

export interface PasskeyCredential {
  id: string;           // base64url credential ID
  prfSalt: string;      // base64url — random salt for PRF evaluation
  encPassword: string;  // AES-GCM(prf_key, utf8(masterPassword))
  createdAt: string;    // ISO
  deviceHint?: string;  // "Touch ID", "Windows Hello", etc.
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof PublicKeyCredential !== 'undefined' &&
    typeof window !== 'undefined' &&
    window.isSecureContext === true &&
    location.protocol !== 'file:'
  );
}

// ── Base64 helpers (avoid btoa(String.fromCharCode(...)) — stack overflow risk) ─
function _u8ToBase64(u8: Uint8Array): string {
  let str = '';
  for (let i = 0; i < u8.length; i++) str += String.fromCharCode(u8[i]!);
  return btoa(str);
}

function _base64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Ensure plain ArrayBuffer for WebCrypto / WebAuthn API compatibility
const _toAB = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

// ── Registration ───────────────────────────────────────────────────────────────

export async function registerPasskey(masterPassword: string): Promise<PasskeyCredential> {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn is not available on this origin (requires https://).');
  }

  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: _toAB(challenge),
      rp: { name: 'Task App CRM', id: location.hostname },
      user: {
        id: _toAB(crypto.getRandomValues(new Uint8Array(16))),
        name: 'vault',
        displayName: 'Task App CRM Vault',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      extensions: {
        prf: { eval: { first: prfSalt.buffer },
        } as unknown as AuthenticationExtensionsClientInputs,
      } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential;

  type PRFResult = { results?: { first?: ArrayBuffer } };
  const prfResult = (cred.getClientExtensionResults() as Record<string, unknown>)?.['prf'] as PRFResult | undefined;
  const prfOutput = prfResult?.results?.first;

  if (!prfOutput) {
    throw new Error(
      'PRF extension not supported by this authenticator. Use TOTP instead.',
    );
  }

  // Derive AES key from PRF output
  const prfKey = await crypto.subtle.importKey(
    'raw', prfOutput,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  );

  // Encrypt master password under PRF key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    prfKey,
    new TextEncoder().encode(masterPassword),
  );
  const encBlob = new Uint8Array(12 + enc.byteLength);
  encBlob.set(iv);
  encBlob.set(new Uint8Array(enc), 12);

  // Try to extract a device hint from authenticator attachment
  const attachment = (cred as PublicKeyCredential & { authenticatorAttachment?: string }).authenticatorAttachment;
  const deviceHint = attachment === 'platform' ? 'Platform authenticator' : 'Security key';

  return {
    id: _u8ToBase64(new Uint8Array(cred.rawId)),
    prfSalt: _u8ToBase64(prfSalt),
    encPassword: _u8ToBase64(encBlob),
    createdAt: new Date().toISOString(),
    deviceHint,
  };
}

// ── Authentication ─────────────────────────────────────────────────────────────

export async function authenticateWithPasskey(cred: PasskeyCredential): Promise<string> {
  if (!isWebAuthnAvailable()) {
    throw new Error('WebAuthn is not available on this origin (requires https://).');
  }

  const prfSalt = _base64ToU8(cred.prfSalt);
  const credId = _base64ToU8(cred.id);
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  // Ensure ArrayBuffer (not SharedArrayBuffer) for WebCrypto/WebAuthn compatibility
  const toAB = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: toAB(challenge),
      allowCredentials: [{ id: toAB(credId), type: 'public-key' }],
      userVerification: 'required',
      extensions: {
        prf: { eval: { first: prfSalt.buffer },
        } as unknown as AuthenticationExtensionsClientInputs,
      } as AuthenticationExtensionsClientInputs,
    },
  }) as PublicKeyCredential;

  type PRFResult = { results?: { first?: ArrayBuffer } };
  const prfResult = (assertion.getClientExtensionResults() as Record<string, unknown>)?.['prf'] as PRFResult | undefined;
  const prfOutput = prfResult?.results?.first;
  if (!prfOutput) throw new Error('PRF output not available from this authenticator.');

  const prfKey = await crypto.subtle.importKey(
    'raw', prfOutput,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt'],
  );

  const encBlob = _base64ToU8(cred.encPassword);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encBlob.slice(0, 12) },
    prfKey,
    encBlob.slice(12),
  );
  return new TextDecoder().decode(plain);
}

// ── Passkey storage (stored in nexus_data_v1 / documents store) ────────────────
// Uses INTERNAL_DOCUMENT_IDS id '__mfa_passkeys__'

export interface PasskeyStore {
  id: '__mfa_passkeys__';
  credentials: PasskeyCredential[];
}

let _getKey: () => CryptoKey | null = () => null;
let _putRecord: (store: string, rec: Record<string, unknown>) => Promise<void> = async () => {};
let _loadStore: (store: string) => Promise<Record<string, unknown>[]> = async () => [];

export function setWebAuthnHooks(hooks: {
  getKey: () => CryptoKey | null;
  putRecord: (store: string, rec: Record<string, unknown>) => Promise<void>;
  loadStore: (store: string) => Promise<Record<string, unknown>[]>;
}): void {
  _getKey = hooks.getKey;
  _putRecord = hooks.putRecord;
  _loadStore = hooks.loadStore;
}

export async function loadPasskeys(): Promise<PasskeyCredential[]> {
  if (!_getKey()) return [];
  try {
    const records = await _loadStore('documents');
    const rec = records.find((r: Record<string, unknown>) => r['id'] === '__mfa_passkeys__') as PasskeyStore | undefined;
    return rec?.credentials || [];
  } catch {
    return [];
  }
}

export async function savePasskeys(credentials: PasskeyCredential[]): Promise<void> {
  const key = _getKey();
  if (!key) return;
  await _putRecord('documents', { id: '__mfa_passkeys__', credentials });
}

export async function addPasskey(masterPassword: string): Promise<PasskeyCredential> {
  const cred = await registerPasskey(masterPassword);
  const existing = await loadPasskeys();
  await savePasskeys([...existing, cred]);
  return cred;
}

export async function removePasskey(credId: string): Promise<void> {
  const existing = await loadPasskeys();
  await savePasskeys(existing.filter(c => c.id !== credId));
}
