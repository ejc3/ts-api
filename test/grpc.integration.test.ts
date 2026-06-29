import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type Client, Code, ConnectError, createClient, type Transport } from '@connectrpc/connect'
import { createConnectTransport, createGrpcWebTransport } from '@connectrpc/connect-node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEMO_USERS, InMemoryStore } from '../src/core/index.js'
import { UserService } from '../src/grpc/gen/user_pb.js'
import { createGrpcNodeHandler } from '../src/grpc/node.js'

// connectNodeAdapter serves Connect, gRPC, and gRPC-Web from one handler, picking the
// protocol off each request. Cover the two that run over HTTP/1.1 — the wire Vercel's
// Node functions speak; native binary gRPC needs end-to-end HTTP/2. A fresh seeded
// store and server per test keep the createUser cases isolated and order-independent.
const TRANSPORTS: ReadonlyArray<[string, (baseUrl: string) => Transport]> = [
  ['Connect', (baseUrl) => createConnectTransport({ baseUrl, httpVersion: '1.1' })],
  ['gRPC-Web', (baseUrl) => createGrpcWebTransport({ baseUrl, httpVersion: '1.1' })],
]

describe.each(TRANSPORTS)('gRPC / Connect over %s (integration)', (_name, makeTransport) => {
  let server: Server
  let client: Client<typeof UserService>

  beforeEach(async () => {
    server = createServer(createGrpcNodeHandler(new InMemoryStore(DEMO_USERS)))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const { port } = server.address() as AddressInfo
    client = createClient(UserService, makeTransport(`http://127.0.0.1:${port}`))
  })

  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('lists seeded users', async () => {
    const { users } = await client.listUsers({})
    expect(users.map((u) => ({ id: u.id, name: u.name }))).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })

  it('gets a user by id', async () => {
    expect(await client.getUser({ id: '1' })).toMatchObject({ id: '1', name: 'Ada' })
  })

  it('maps a missing user to NOT_FOUND', async () => {
    try {
      await client.getUser({ id: '999' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(ConnectError.from(err).code).toBe(Code.NotFound)
    }
  })

  it('creates a user, trimming the name', async () => {
    expect(await client.createUser({ name: '  Grace  ' })).toMatchObject({ name: 'Grace' })
  })

  it('rejects an empty or whitespace-only name with INVALID_ARGUMENT', async () => {
    for (const name of ['', '   ']) {
      try {
        await client.createUser({ name })
        expect.unreachable('should have thrown')
      } catch (err) {
        expect(ConnectError.from(err).code).toBe(Code.InvalidArgument)
      }
    }
  })
})
