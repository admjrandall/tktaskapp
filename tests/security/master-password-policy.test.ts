import { describe, expect, it } from 'vitest'
import { validateMasterPassword } from '../../packages/core/src/security/master-password-policy.js'

describe('offline vault master password policy', () => {
  it('requires at least 15 characters for new vaults', () => {
    expect(validateMasterPassword('short-password')).toBe(
      'Password must be at least 15 characters.',
    )
  })

  it('rejects common application-specific passwords', () => {
    expect(validateMasterPassword('task app crm password')).toBe('Choose a less common password.')
  })

  it('accepts a long memorable password without composition rules', () => {
    expect(validateMasterPassword('correct horse battery staple')).toBeNull()
  })
})
