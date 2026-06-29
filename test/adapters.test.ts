import { createClient } from '@libsql/client'
import { describe, expect, it } from 'vitest'
import cloudflare, { resolveStore } from '../src/adapters/cloudflare.js'
import { GET } from '../src/adapters/vercel.js'
import { fakeD1 } from './fake-d1.js'

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext

describe('platform adapters', () => {
  it('cloudflare default export serves the app with the env binding', async () => {
    const res = await cloudflare.fetch(
      new Request('https://example.com/api/users'),
      { JWT_SECRET: 'from-binding' },
      ctx,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(2)
  })

  it('vercel GET handler serves the app', async () => {
    const res = await GET(new Request('https://example.com/api/users/1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '1', name: 'Ada' })
  })
})

describe('cloudflare store selection', () => {
  it('uses the in-memory demo seed when no D1 binding is present', async () => {
    expect(await resolveStore({}).listUsers()).toHaveLength(2)
  })

  it('uses D1 when the binding is present', async () => {
    const store = resolveStore({ DB: fakeD1(createClient({ url: ':memory:' })) })
    expect(await store.listUsers()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })
})
