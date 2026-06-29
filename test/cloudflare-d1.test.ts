import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import cloudflare from '../src/adapters/cloudflare.js'
import { fakeD1 } from './fake-d1.js'

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext

// Its own file so the cloudflare module's per-isolate app singleton is fresh and the
// D1 binding on this first request is the one captured.
describe('cloudflare adapter over D1', () => {
  it('serves users from the D1 binding through the app', async () => {
    const env = { JWT_SECRET: 'x', DB: fakeD1(createClient({ url: ':memory:' })) }
    const res = await cloudflare.fetch(new Request('https://example.com/api/users'), env, ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })
})
