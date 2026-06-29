import { createTRPCClient, httpBatchLink, type TRPCClient, TRPCClientError } from '@trpc/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { AppRouter } from '../src/trpc/router.js'

/** A typed tRPC client whose transport is the in-process composed app. */
function clientFor(app: ReturnType<typeof buildApp>): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://app/trpc',
        fetch: (input, init) =>
          Promise.resolve(app.request(input as string | URL, init as RequestInit)),
      }),
    ],
  })
}

describe('tRPC (integration)', () => {
  let app: ReturnType<typeof buildApp>
  let client: TRPCClient<AppRouter>

  beforeEach(() => {
    app = buildApp()
    client = clientFor(app)
  })

  it('lists seeded users (typed end-to-end)', async () => {
    expect(await client.users.list.query()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })

  it('gets a user by id', async () => {
    expect(await client.users.get.query({ id: '1' })).toEqual({ id: '1', name: 'Ada' })
  })

  it('maps a missing user to a typed NOT_FOUND error', async () => {
    try {
      await client.users.get.query({ id: '999' })
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCClientError)
      expect((err as TRPCClientError<AppRouter>).data?.code).toBe('NOT_FOUND')
    }
  })

  it('creates a user via mutation', async () => {
    expect(await client.users.create.mutate({ name: 'Grace' })).toMatchObject({ name: 'Grace' })
  })

  it('rejects an empty or whitespace-only name', async () => {
    await expect(client.users.create.mutate({ name: '' })).rejects.toThrow()
    await expect(client.users.create.mutate({ name: '   ' })).rejects.toThrow()
  })

  it('trims the stored name', async () => {
    expect(await client.users.create.mutate({ name: '  Grace  ' })).toMatchObject({ name: 'Grace' })
  })

  it('resolves several procedures in one batch', async () => {
    const [list, one] = await Promise.all([
      client.users.list.query(),
      client.users.get.query({ id: '2' }),
    ])
    expect(list).toHaveLength(2)
    expect(one).toEqual({ id: '2', name: 'Linus' })
  })

  it('speaks the tRPC HTTP wire protocol directly', async () => {
    const input = encodeURIComponent(JSON.stringify({ id: '1' }))
    const ok = await app.request(`/trpc/users.get?input=${input}`)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ result: { data: { id: '1', name: 'Ada' } } })

    const missing = encodeURIComponent(JSON.stringify({ id: '999' }))
    const notFound = await app.request(`/trpc/users.get?input=${missing}`)
    expect(notFound.status).toBe(404)
    expect(await notFound.json()).toMatchObject({ error: { data: { code: 'NOT_FOUND' } } })
  })
})
