import { describe, expect, it } from 'vitest'
import cloudflare from '../src/adapters/cloudflare'
import { GET } from '../src/adapters/vercel'

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
