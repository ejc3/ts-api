import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import { DEMO_USERS, d1Driver, SqliteStore } from '../src/core/index'
import { fakeD1 } from './fake-d1'

const d1Store = (seed = DEMO_USERS) =>
  new SqliteStore(d1Driver(fakeD1(createClient({ url: ':memory:' }))), seed)

describe('SqliteStore over the D1 driver', () => {
  it('lists seeded users and reads by id', async () => {
    const store = d1Store()
    expect(await store.listUsers()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
    expect(await store.getUser('2')).toEqual({ id: '2', name: 'Linus' })
    expect(await store.getUser('999')).toBeNull()
  })

  it('creates users with ids continuing past the seed', async () => {
    const store = d1Store()
    // Two inserts exercise the driver's last_row_id mapping across statements.
    expect(await store.createUser({ name: 'Grace' })).toEqual({ id: '3', name: 'Grace' })
    expect(await store.createUser({ name: 'Hedy' })).toEqual({ id: '4', name: 'Hedy' })
    expect(await store.listUsers()).toHaveLength(4)
  })
})
