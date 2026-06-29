import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DataStore, DEMO_USERS, InMemoryStore } from '../src/core/index.js'
import { createExpressApp } from '../src/express/app.js'

/** Start an Express app over the given store on a loopback port; returns base URL + close. */
async function serve(store: DataStore): Promise<{ base: string; close: () => Promise<void> }> {
  const server = createServer(createExpressApp(store))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

// A fresh seeded store and server per test keep the createUser cases isolated.
describe('Express demo (integration)', () => {
  let base: string
  let close: () => Promise<void>

  beforeEach(async () => {
    ;({ base, close } = await serve(new InMemoryStore(DEMO_USERS)))
  })

  afterEach(() => close())

  const postUser = (body: BodyInit, contentType = 'application/json') =>
    fetch(`${base}/users`, { method: 'POST', headers: { 'content-type': contentType }, body })

  const postJson = (body: unknown) => postUser(JSON.stringify(body))

  it('lists seeded users', async () => {
    const res = await fetch(`${base}/users`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })

  it('gets a user by id', async () => {
    const res = await fetch(`${base}/users/1`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '1', name: 'Ada' })
  })

  it('returns 404 for a missing user', async () => {
    expect((await fetch(`${base}/users/999`)).status).toBe(404)
  })

  it('creates a user, trimming the name', async () => {
    const res = await postJson({ name: '  Grace  ' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: '3', name: 'Grace' })
  })

  it('rejects an empty, whitespace-only, missing, or non-string name with 400', async () => {
    expect((await postJson({ name: '' })).status).toBe(400)
    expect((await postJson({ name: '   ' })).status).toBe(400)
    expect((await postJson({})).status).toBe(400)
    expect((await postJson({ name: 123 })).status).toBe(400)
  })

  it('returns 400 for a malformed or non-JSON body, matching the REST demo', async () => {
    expect((await postUser('{bad')).status).toBe(400)
    expect((await postUser('hi', 'text/plain')).status).toBe(400)
  })
})

describe('Express demo error handling', () => {
  it('maps a store failure to 500 without leaking detail', async () => {
    const reject = () => Promise.reject(new Error('db down'))
    const failing: DataStore = { listUsers: reject, getUser: reject, createUser: reject }
    const { base, close } = await serve(failing)
    try {
      const res = await fetch(`${base}/users`)
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({ error: 'internal' })
    } finally {
      await close()
    }
  })
})
