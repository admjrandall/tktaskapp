// ── CONSTANTS ──────────────────────────────────────────────────────────
// Extracted from taskapp.html ~2669–2677 and ~2956–2960
// OWASP 2026 recommendation: 600,000 iterations for PBKDF2-HMAC-SHA-256

export const PBKDF2_ITERATIONS = 600000;
export const PBKDF2_ITERATIONS_LEGACY = 310000; // old value — used only during migration detection
export const KDF_VERSION_KEY = 'nexus_kdf_v';   // IDB key: '1' = legacy 310k, '2' = current 600k
export const SALT_BYTES = 32;
export const IV_BYTES = 12;
export const VAULT_KEY = 'nexus_vault_v1';
export const SALT_KEY = 'nexus_salt_v1';
export const VERIFY_KEY = 'nexus_verify_v1';
export const VERIFY_PAYLOAD = 'NEXUS_CRM_OK';

// ── Session key store (IndexedDB) ──────────────────────────────────────
export const KEYS_DB_NAME = 'nexus_keys_v1';
export const SESSION_CRYPTOKEY_STORE = 'sessionKey';

// ── Vault metadata store (IndexedDB) ───────────────────────────────────
export const VAULT_DB_NAME = 'nexus_vault_v2';
export const VAULT_META_STORE = 'meta';

// ── DATABASE — CRM stores (IDB vault) ──────────────────────────────────
export const STORES: string[] = [
  'clients', 'departments', 'projects', 'tasks', 'people', 'standaloneNotes',
  'tags', 'communications', 'files', 'timeEntries', 'notifications', 'trash',
];
// IDB-backed stores for large content (Documents + Conversations)
export const IDB_STORES: string[] = ['documents', 'conversations'];
export const DATA_DB_NAME = 'nexus_data_v1';

// ── File System persistence ────────────────────────────────────────────
export const FS_HANDLE_DB = 'nexus_fs_v1';
export const FS_HANDLE_KEY = 'fileHandle';
export const FS_FILENAME = 'nexus-data.vault';

// ── Domain constants ───────────────────────────────────────────────────
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
export const PROJECT_STAGES = ['Lead', 'Active', 'Review', 'On Hold', 'Done', 'Cancelled'];
export const TASK_STATUSES = ['Todo', 'In Progress', 'Blocked', 'Done'];
export const COMM_TYPES = ['Email', 'Call', 'Meeting', 'Note', 'Other'];

// ── Visual constants ───────────────────────────────────────────────────
export const AVATAR_COLORS: [string, string][] = [
  ['#e0e7ff', '#4338ca'], ['#fce7f3', '#be185d'], ['#dcfce7', '#15803d'],
  ['#fef3c7', '#b45309'], ['#ffe4e6', '#be123c'], ['#f0fdf4', '#166534'],
  ['#f0f9ff', '#0369a1'], ['#fdf4ff', '#7e22ce'], ['#fff7ed', '#c2410c'],
];
export const TAG_COLORS = [
  { bg: '#e0e7ff', text: '#4338ca', border: '#c7d2fe', label: 'Indigo' },
  { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'Green' },
  { bg: '#fef3c7', text: '#b45309', border: '#fde68a', label: 'Amber' },
  { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', label: 'Red' },
  { bg: '#f3e8ff', text: '#7e22ce', border: '#e9d5ff', label: 'Purple' },
  { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', label: 'Orange' },
  { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd', label: 'Sky' },
  { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0', label: 'Slate' },
];
