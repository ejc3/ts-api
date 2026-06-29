import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { DEMO_USERS, type SqlDriver, SqliteStore } from '../src/core/index'
import { resolveNodeStore, tursoDriver } from '../src/core/turso'

const memStore = (seed: readonly { id: string; name: string }[] = DEMO_USERS) =>
  new SqliteStore(tursoDriver(createClient({ url: ':memory:' })), seed)

describe('SqliteStore over the Turso/libSQL driver', () => {
  it('lists seeded users and reads by id', async () => {
    const store = memStore()
    expect(await store.listUsers()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
    expect(await store.getUser('1')).toEqual({ id: '1', name: 'Ada' })
    expect(await store.getUser('999')).toBeNull()
  })

  it('creates users with ids continuing past the seed', async () => {
    const store = memStore()
    expect(await store.createUser({ name: 'Grace' })).toEqual({ id: '3', name: 'Grace' })
    expect(await store.createUser({ name: 'Hedy' })).toEqual({ id: '4', name: 'Hedy' })
    expect(await store.listUsers()).toHaveLength(4)
  })

  it('returns null for non-canonical ids SQLite affinity would coerce', async () => {
    const store = memStore()
    // '01', '1.0', ' 1' all coerce to integer 1 in SQLite; InMemoryStore returns null,
    // so the SQL store must too.
    expect(await store.getUser('01')).toBeNull()
    expect(await store.getUser('1.0')).toBeNull()
    expect(await store.getUser(' 1')).toBeNull()
    expect(await store.getUser('1')).toEqual({ id: '1', name: 'Ada' })
  })

  it('retries init after a transient failure rather than caching the rejection', async () => {
    let attempts = 0
    const base = tursoDriver(createClient({ url: ':memory:' }))
    const flaky: SqlDriver = {
      run: (sql, params) =>
        ++attempts === 1 ? Promise.reject(new Error('transient')) : base.run(sql, params),
      all: (sql, params) => base.all(sql, params),
    }
    const store = new SqliteStore(flaky, DEMO_USERS)
    await expect(store.listUsers()).rejects.toThrow('transient')
    // The rejected init is not cached, so a later call re-runs the migration and works.
    expect(await store.listUsers()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })

  it('seeds once across stores sharing a database', async () => {
    const client = createClient({ url: ':memory:' })
    await new SqliteStore(tursoDriver(client), DEMO_USERS).listUsers()
    // A second store over the same db re-runs the seed; INSERT OR IGNORE keeps it at two.
    const second = new SqliteStore(tursoDriver(client), DEMO_USERS)
    expect(await second.listUsers()).toHaveLength(2)
    expect(await second.createUser({ name: 'Grace' })).toEqual({ id: '3', name: 'Grace' })
  })
})

describe('resolveNodeStore', () => {
  it('returns the fallback when TURSO_DATABASE_URL is absent or empty', () => {
    const fallback = memStore([])
    expect(resolveNodeStore({}, fallback)).toBe(fallback)
    expect(resolveNodeStore({ TURSO_DATABASE_URL: '' }, fallback)).toBe(fallback)
  })

  it('returns a Turso-backed store when configured', async () => {
    const fallback = memStore([])
    const store = resolveNodeStore({ TURSO_DATABASE_URL: ':memory:' }, fallback)
    expect(store).not.toBe(fallback)
    expect(await store.listUsers()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })
})
