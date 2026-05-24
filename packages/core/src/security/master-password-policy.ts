const MASTER_PASSWORD_MIN_LENGTH = 15
const MASTER_PASSWORD_BLOCKLIST = new Set([
  'password',
  'password1',
  'password123',
  'password1234',
  'taskappcrm',
  'taskappcrmpassword',
  'taskapp',
  'techkey',
  'letmein',
  'qwerty12345',
  'adminpassword',
])

export function validateMasterPassword(password: string): string | null {
  const normalized = password.normalize('NFKC')
  if (Array.from(normalized).length < MASTER_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${MASTER_PASSWORD_MIN_LENGTH} characters.`
  }

  const compact = normalized.toLowerCase().replace(/[\s._-]+/g, '')
  if (MASTER_PASSWORD_BLOCKLIST.has(compact)) {
    return 'Choose a less common password.'
  }

  if (/^(.)\1+$/.test(normalized)) {
    return 'Password cannot be a single repeated character.'
  }

  return null
}

export { MASTER_PASSWORD_MIN_LENGTH }
