import { describe, it, expect } from 'vitest'
import {
  sanitize,
  formatDate,
  formatDuration,
  formatFileSize,
  parseDateLocal,
  daysUntil,
  initials,
  avatarColor,
  sortRecords,
  filterRecords,
  searchRecords,
  toCSV,
  plural,
  clamp,
  escH,
} from '../../packages/core/src/utils.js'

describe('escH — XSS sanitisation', () => {
  it('escapes < > & " \' in strings', () => {
    expect(escH('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    )
  })
  it('escapes ampersands', () => {
    expect(escH('A & B')).toBe('A &amp; B')
  })
  it('escapes single quotes', () => {
    expect(escH("it's")).toBe('it&#x27;s')
  })
  it('converts non-string input to string before escaping', () => {
    expect(escH(42)).toBe('42')
    expect(escH(null)).toBe('')
    expect(escH(undefined)).toBe('')
  })
})

describe('sanitize — length cap', () => {
  it('trims strings beyond the max', () => {
    const long = 'a'.repeat(20_000)
    expect(sanitize(long, 100).length).toBe(100)
  })
  it('passes strings within the limit unchanged', () => {
    expect(sanitize('hello', 100)).toBe('hello')
  })
  it('converts non-string input to empty string', () => {
    expect(sanitize(null)).toBe('')
    expect(sanitize(undefined)).toBe('')
  })
})

describe('formatDuration', () => {
  it('formats seconds as H:MM:SS', () => {
    expect(formatDuration(45)).toBe('0:00:45')
  })
  it('formats minutes and seconds', () => {
    expect(formatDuration(90)).toBe('0:01:30')
  })
  it('formats hours', () => {
    expect(formatDuration(3661)).toBe('1:01:01')
  })
})

describe('formatFileSize', () => {
  it('shows bytes for small values', () => {
    expect(formatFileSize(500)).toMatch(/500\s*B/)
  })
  it('shows KB for kilobyte-range values', () => {
    expect(formatFileSize(2048)).toMatch(/\d+(\.\d+)?\s*KB/)
  })
  it('shows MB for megabyte-range values', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toMatch(/\d+(\.\d+)?\s*MB/)
  })
})

describe('initials', () => {
  it('extracts initials from full name', () => {
    expect(initials('Jane Smith')).toBe('JS')
  })
  it('handles single-word names', () => {
    expect(initials('Jane')).toBe('J')
  })
  it('handles null/undefined gracefully', () => {
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})

describe('avatarColor', () => {
  it('returns two hex/CSS strings', () => {
    const [bg, fg] = avatarColor('Alice')
    expect(typeof bg).toBe('string')
    expect(typeof fg).toBe('string')
    expect(bg.length).toBeGreaterThan(0)
  })
  it('is deterministic for the same input', () => {
    expect(avatarColor('Bob')).toEqual(avatarColor('Bob'))
  })
  it('handles null gracefully', () => {
    const [bg, fg] = avatarColor(null)
    expect(typeof bg).toBe('string')
    expect(typeof fg).toBe('string')
  })
})

describe('plural', () => {
  it('returns singular for n=1', () => {
    expect(plural(1, 'item')).toBe('1 item')
  })
  it('returns plural for n≠1', () => {
    expect(plural(0, 'item')).toBe('0 items')
    expect(plural(2, 'item')).toBe('2 items')
  })
})

describe('clamp', () => {
  it('clamps below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })
  it('clamps above max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })
  it('passes through values within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })
})

describe('parseDateLocal', () => {
  it('parses a valid date string', () => {
    const d = parseDateLocal('2026-01-15')
    expect(d).toBeInstanceOf(Date)
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(0) // January
    expect(d?.getDate()).toBe(15)
  })
  it('returns null for empty input', () => {
    expect(parseDateLocal('')).toBeNull()
    expect(parseDateLocal(null)).toBeNull()
    expect(parseDateLocal(undefined)).toBeNull()
  })
})

describe('daysUntil', () => {
  it('returns a number for a future date', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const d = daysUntil(future)
    expect(d).toBeGreaterThan(0)
  })
  it('returns null for empty input', () => {
    expect(daysUntil('')).toBeNull()
    expect(daysUntil(null)).toBeNull()
  })
})

describe('sortRecords', () => {
  const records = [
    { id: '1', name: 'Charlie', age: 30 },
    { id: '2', name: 'Alice', age: 25 },
    { id: '3', name: 'Bob', age: 35 },
  ]

  it('sorts ascending by string field', () => {
    const sorted = sortRecords(records, 'name', 'asc')
    expect(sorted.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })
  it('sorts descending by numeric field', () => {
    const sorted = sortRecords(records, 'age', 'desc')
    expect(sorted.map((r) => r.age)).toEqual([35, 30, 25])
  })
  it('does not mutate the original array', () => {
    const copy = [...records]
    sortRecords(records, 'name', 'asc')
    expect(records).toEqual(copy)
  })
})

describe('filterRecords', () => {
  const records = [
    { id: '1', status: 'active', type: 'A' },
    { id: '2', status: 'inactive', type: 'B' },
    { id: '3', status: 'active', type: 'B' },
  ]

  it('filters by a single field', () => {
    const result = filterRecords(records, { status: 'active' })
    expect(result).toHaveLength(2)
  })
  it('filters by multiple fields (AND)', () => {
    const result = filterRecords(records, { status: 'active', type: 'B' })
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('3')
  })
  it('returns all records when filters is empty', () => {
    expect(filterRecords(records, {})).toHaveLength(3)
  })
})

describe('searchRecords', () => {
  const records = [
    { id: '1', name: 'Alpha project', desc: 'First one' },
    { id: '2', name: 'Beta project', desc: 'Second one' },
    { id: '3', name: 'Gamma task', desc: 'Third one' },
  ]

  it('finds records matching the query in the specified fields', () => {
    const result = searchRecords(records, 'project', ['name'])
    expect(result).toHaveLength(2)
  })
  it('is case-insensitive', () => {
    const result = searchRecords(records, 'ALPHA', ['name'])
    expect(result).toHaveLength(1)
  })
  it('searches across multiple fields', () => {
    const result = searchRecords(records, 'third', ['name', 'desc'])
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('3')
  })
  it('returns empty for no match', () => {
    expect(searchRecords(records, 'zzznomatch', ['name'])).toHaveLength(0)
  })
})

describe('toCSV', () => {
  it('produces a header row plus data rows', () => {
    const recs = [
      { name: 'Alice', age: '25' },
      { name: 'Bob', age: '30' },
    ]
    const csv = toCSV(recs, ['name', 'age'])
    const lines = csv.split('\n').filter(Boolean)
    expect(lines[0]).toBe('name,age')
    expect(lines[1]).toContain('Alice')
    expect(lines[2]).toContain('Bob')
  })
  it('wraps values containing commas in double quotes', () => {
    const recs = [{ name: 'Smith, John', age: '40' }]
    const csv = toCSV(recs, ['name', 'age'])
    expect(csv).toContain('"Smith, John"')
  })
})

describe('formatDate', () => {
  it('formats an ISO date string to a human-readable date', () => {
    const result = formatDate('2026-06-15T12:00:00.000Z')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    // Don't assert locale-specific formatting — just that it doesn't return the raw ISO string
    expect(result).not.toBe('2026-06-15T12:00:00.000Z')
  })
  it('returns a fallback string for null/undefined', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
  })
})
