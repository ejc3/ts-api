import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

const SUMMARY_KEYS = ['n', 'min', 'p50', 'p90', 'p95', 'max', 'mean']

type BenchBody = {
  mode: string
  region: string
  styles: Record<string, { hello: Record<string, number>; list: Record<string, number> }>
}

describe('/bench (in-process)', () => {
  it('times hello and list for every Fetch style', async () => {
    const res = await buildApp().request('/bench?n=2')
    expect(res.status).toBe(200)
    const body = (await res.json()) as BenchBody
    expect(body.mode).toBe('inproc')
    expect(Object.keys(body.styles).sort()).toEqual(['graphql', 'rest', 'trpc'])
    for (const ops of Object.values(body.styles)) {
      for (const summary of [ops.hello, ops.list]) {
        expect(Object.keys(summary).sort()).toEqual([...SUMMARY_KEYS].sort())
        expect(summary.n).toBe(2)
        expect(summary.p50).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('honors the styles filter', async () => {
    const res = await buildApp().request('/bench?n=1&styles=rest')
    const body = (await res.json()) as BenchBody
    expect(Object.keys(body.styles)).toEqual(['rest'])
  })

  it('clamps n above the in-process cap', async () => {
    const res = await buildApp().request('/bench?n=9999&styles=rest')
    const body = (await res.json()) as BenchBody
    expect(body.styles.rest?.list?.n).toBe(50)
  })

  it('ignores unknown styles rather than proxying them', async () => {
    const res = await buildApp().request('/bench?n=1&styles=rest,evil,../etc')
    const body = (await res.json()) as BenchBody
    expect(Object.keys(body.styles)).toEqual(['rest'])
  })

  it('dedupes repeated styles so they cannot multiply the work', async () => {
    const res = await buildApp().request('/bench?n=1&styles=rest,rest,rest,trpc,rest')
    const body = (await res.json()) as BenchBody
    // Each style runs once, in the fixed allowlist order — not once per duplicate.
    expect(Object.keys(body.styles)).toEqual(['rest', 'trpc'])
  })

  it('rejects loopback mode off Vercel (no trusted origin to call)', async () => {
    const res = await buildApp().request('/bench?mode=loopback&n=1')
    expect(res.status).toBe(400)
    expect((await res.json()) as { error: string }).toMatchObject({ error: expect.any(String) })
  })
})
