import { describe, expect, it } from 'vitest'
import { DEMO_USERS, InMemoryStore } from '../src/core/index.js'
import { benchOverSocket } from '../src/node-bench.js'

describe('socket bench (node:http over loopback)', () => {
  it('times hello and list for all five frameworks over a real socket', async () => {
    const result = await benchOverSocket(new InMemoryStore(DEMO_USERS), { n: '2' })
    expect(result.mode).toBe('socket')
    expect(result.n).toBe(2)
    // The unified server fronts every framework, including the Node-only gRPC and Express
    // that the in-process /bench cannot reach.
    expect(Object.keys(result.styles).sort()).toEqual([
      'express',
      'graphql',
      'grpc',
      'rest',
      'trpc',
    ])
    for (const ops of Object.values(result.styles)) {
      expect(ops.hello.n).toBe(2)
      expect(ops.list.n).toBe(2)
      expect(ops.list.p50).toBeGreaterThanOrEqual(0)
    }
  })

  it('honors the styles filter and clamps n', async () => {
    const result = await benchOverSocket(new InMemoryStore(DEMO_USERS), {
      n: '9999',
      styles: 'grpc,express',
    })
    expect(Object.keys(result.styles).sort()).toEqual(['express', 'grpc'])
    // MAX_NET_N caps the outbound sample count.
    expect(result.styles.grpc?.list?.n).toBe(25)
  })
})
