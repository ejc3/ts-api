import { describe, expect, it } from 'vitest'
import { configFromEnv, InMemoryStore, normalizeUserName, verifyBearer } from '../src/core/index.js'

describe('InMemoryStore', () => {
  it('reads seeded users and returns null for unknown ids', async () => {
    const store = new InMemoryStore([{ id: '1', name: 'Ada' }])
    expect(await store.getUser('1')).toEqual({ id: '1', name: 'Ada' })
    expect(await store.getUser('nope')).toBeNull()
    expect(await store.listUsers()).toHaveLength(1)
  })

  it('assigns ids after the highest seeded numeric id', async () => {
    const store = new InMemoryStore([{ id: '5', name: 'Ada' }])
    const created = await store.createUser({ name: 'Grace' })
    expect(created).toEqual({ id: '6', name: 'Grace' })
  })
})

describe('configFromEnv', () => {
  it('falls back to a dev secret', () => {
    expect(configFromEnv({}).jwtSecret).toBe('dev-secret')
    expect(configFromEnv({ JWT_SECRET: 's3cret' }).jwtSecret).toBe('s3cret')
  })

  it('rejects empty or non-string bindings rather than leaking them', () => {
    expect(configFromEnv({ JWT_SECRET: '' }).jwtSecret).toBe('dev-secret')
    // a non-string Workers binding must not become Config.jwtSecret
    expect(configFromEnv({ JWT_SECRET: 123 as unknown as string }).jwtSecret).toBe('dev-secret')
  })
})

describe('normalizeUserName', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeUserName('  Grace  ')).toBe('Grace')
  })
  it('returns null for empty or whitespace-only names', () => {
    expect(normalizeUserName('')).toBeNull()
    expect(normalizeUserName('   ')).toBeNull()
  })
  it('keeps a name that only needs no trimming', () => {
    expect(normalizeUserName('Ada')).toBe('Ada')
  })
})

describe('verifyBearer', () => {
  const config = { jwtSecret: 'x' }
  it('accepts a non-empty bearer token', () => {
    expect(verifyBearer('Bearer u-1', config)).toEqual({ userId: 'u-1' })
  })
  it('rejects missing, malformed, or empty tokens', () => {
    expect(verifyBearer(undefined, config)).toBeNull()
    expect(verifyBearer('Basic abc', config)).toBeNull()
    expect(verifyBearer('Bearer   ', config)).toBeNull()
  })
})
