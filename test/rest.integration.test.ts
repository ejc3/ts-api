import { describe, expect, it } from 'vitest'
import { buildApp, STYLES } from '../src/app'

describe('REST (integration)', () => {
  it('lists seeded users', async () => {
    const res = await buildApp().request('/api/users')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })

  it('gets a user by id', async () => {
    const res = await buildApp().request('/api/users/1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: '1', name: 'Ada' })
  })

  it('404s an unknown user', async () => {
    const res = await buildApp().request('/api/users/999')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not found' })
  })

  it('creates a user', async () => {
    const res = await buildApp().request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Grace' }),
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ name: 'Grace' })
  })

  it('rejects an empty or whitespace-only name with a clean error', async () => {
    for (const name of ['', '   ']) {
      const res = await buildApp().request('/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'invalid request' })
    }
  })

  it('trims the stored name', async () => {
    const res = await buildApp().request('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  Grace  ' }),
    })
    expect(await res.json()).toMatchObject({ name: 'Grace' })
  })

  it('serves an OpenAPI document whose server base is the mount path', async () => {
    const res = await buildApp().request('/api/openapi.json')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      openapi: '3.0.0',
      info: { title: 'ts-api REST' },
      servers: [{ url: '/api' }],
    })
  })

  it('echoes the mounted styles at the root', async () => {
    const res = await buildApp().request('/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, styles: [...STYLES] })
  })
})
