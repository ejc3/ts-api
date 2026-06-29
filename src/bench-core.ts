/**
 * Shared, platform-neutral bench helpers: the probe allowlists, the timing loop, and the
 * summary stats. Imported by the edge `/bench` endpoint (src/bench.ts) and the Node socket
 * bench (src/node-bench.ts) so both measure the exact same ops. No Node-only imports, so it
 * is safe in the Workers bundle.
 *
 * Each style is probed with two ops: `hello` (no DataStore access) and `list` (the SQL-backed
 * read), so the SQL cost separates from framework dispatch. Targets are this app's own fixed
 * paths — there is no caller-supplied URL, so nothing built on these can be aimed elsewhere.
 */

export type Probe = { readonly path: string; readonly init?: RequestInit }
export type StyleProbes = { readonly hello: Probe; readonly list: Probe }

const jsonPost = (body: string): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
})

const LIST_QUERY = jsonPost(JSON.stringify({ query: '{ users { id name } }' }))
const HELLO_QUERY = jsonPost(JSON.stringify({ query: '{ hello }' }))
const RPC_EMPTY = jsonPost('{}')

/** Styles reachable in-process through the one Hono app (the portable Fetch core). */
export const INPROC_STYLES = {
  rest: { hello: { path: '/api/hello' }, list: { path: '/api/users' } },
  trpc: { hello: { path: '/trpc/hello' }, list: { path: '/trpc/users.list' } },
  graphql: {
    hello: { path: '/graphql', init: HELLO_QUERY },
    list: { path: '/graphql', init: LIST_QUERY },
  },
} satisfies Record<string, StyleProbes>

/**
 * Every style's two ops, by same-origin path. gRPC (Connect) and Express are separate Node
 * functions, not part of the Hono app, so they are only reachable over a socket — which is
 * why the in-process mode omits them and the socket/loopback paths include them.
 */
export const ALL_STYLES = {
  ...INPROC_STYLES,
  grpc: {
    hello: { path: '/user.v1.UserService/Hello', init: RPC_EMPTY },
    list: { path: '/user.v1.UserService/ListUsers', init: RPC_EMPTY },
  },
  express: { hello: { path: '/express/hello' }, list: { path: '/express/users' } },
} satisfies Record<string, StyleProbes>

export const DEFAULT_N = 30
export const MAX_INPROC_N = 50
// A real outbound request per sample, so capped tighter than the in-process loop to keep
// the amplification factor of one bench call small.
export const MAX_NET_N = 25
const WARMUP = 3

export type Summary = {
  n: number
  min: number
  p50: number
  p90: number
  p95: number
  max: number
  mean: number
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)] ?? Number.NaN
}

const round = (x: number) => Math.round(x * 1000) / 1000

export function summarize(samples: number[]): Summary {
  samples.sort((a, b) => a - b)
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length
  return {
    n: samples.length,
    min: round(samples[0] ?? Number.NaN),
    p50: round(percentile(samples, 50)),
    p90: round(percentile(samples, 90)),
    p95: round(percentile(samples, 95)),
    max: round(samples[samples.length - 1] ?? Number.NaN),
    mean: round(mean),
  }
}

/** Time `n` calls of `call`, after a few warmups, draining each body to time the whole response. */
export async function measure(call: () => Promise<Response>, n: number): Promise<Summary> {
  for (let i = 0; i < WARMUP; i++) await (await call()).text()
  const samples: number[] = []
  for (let i = 0; i < n; i++) {
    const t0 = performance.now()
    const res = await call()
    await res.text()
    samples.push(performance.now() - t0)
  }
  return summarize(samples)
}

/** Probe both ops of a style, returning a summary per op. */
export async function measureStyle(
  probes: StyleProbes,
  call: (probe: Probe) => Promise<Response>,
  n: number,
): Promise<{ hello: Summary; list: Summary }> {
  return {
    hello: await measure(() => call(probes.hello), n),
    list: await measure(() => call(probes.list), n),
  }
}

export function clampN(raw: string | undefined, max: number): number {
  const parsed = Math.trunc(Number(raw))
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(DEFAULT_N, max)
  return Math.min(parsed, max)
}

export function selectStyles(raw: string | undefined, allowed: readonly string[]): string[] {
  const set = new Set(allowed)
  if (raw === undefined) return [...allowed]
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => set.has(s))
}
