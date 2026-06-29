import type { Hono } from 'hono'
import type { Variables } from './app.js'
import {
  ALL_STYLES,
  clampN,
  INPROC_STYLES,
  MAX_INPROC_N,
  MAX_NET_N,
  measureStyles,
  selectStyles,
} from './bench-core.js'

/**
 * In-server latency probe. `/bench` runs the request loop on the server, so the client pays
 * the network once (to call `/bench`) and the per-style timings are taken next to the handlers
 * — the client↔server distance drops out of the comparison.
 *
 * It is a CLOSED probe, not an open proxy. There is no url/host/target input: the only query
 * params are `mode`, `n` (clamped), and `styles` (filtered against a fixed key set). Targets
 * come from the hardcoded allowlists in bench-core; the loopback origin is a trusted server
 * constant, never the request `Host`, so the server can't be aimed at an arbitrary destination.
 * Both modes are read-only and the sample count is bounded.
 *
 *   GET /bench                    in-process app.fetch, no network (REST/tRPC/GraphQL)
 *   GET /bench?mode=loopback      server-side HTTPS round-trip to the project, all five (Vercel only)
 *
 * Note on platforms: in-process timings are CPU-resolved only on the Node (Vercel) runtime.
 * Cloudflare Workers coarsen performance.now() between I/O as a side-channel mitigation, so a
 * no-I/O op (hello) reads ~0 there and only list — which makes a D1 call — advances. The
 * response carries a caveat when it runs on a Worker.
 */

/** Best-effort serving location: Vercel region env, else the Cloudflare colo on the request. */
function detectRegion(req: Request): string {
  const fromVercel = typeof process !== 'undefined' ? process.env.VERCEL_REGION : undefined
  if (fromVercel) return `vercel:${fromVercel}`
  const colo = (req as { cf?: { colo?: unknown } }).cf?.colo
  if (typeof colo === 'string') return `cloudflare:${colo}`
  return 'unknown'
}

/**
 * Trusted same-origin base for loopback, taken from Vercel's own system env (the production
 * domain) with a constant fallback — never from the request, so it can't be redirected.
 * `undefined` off Vercel, where gRPC/Express don't run and loopback adds nothing over the
 * in-process mode.
 */
function loopbackOrigin(): string | undefined {
  if (typeof process === 'undefined' || !process.env.VERCEL) return undefined
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'ts-api.vercel.app'
  return `https://${host}`
}

export function registerBench(app: Hono<{ Variables: Variables }>): void {
  app.get('/bench', async (c) => {
    const mode = c.req.query('mode') === 'loopback' ? 'loopback' : 'inproc'

    if (mode === 'loopback') {
      const origin = loopbackOrigin()
      if (origin === undefined) {
        return c.json({ error: 'loopback mode is only available on the Vercel deployment' }, 400)
      }
      const n = clampN(c.req.query('n'), MAX_NET_N)
      const styles = selectStyles(c.req.query('styles'), Object.keys(ALL_STYLES))
      const out = await measureStyles(
        ALL_STYLES,
        styles,
        (p) => fetch(`${origin}${p.path}`, p.init),
        n,
      )
      return c.json({
        mode,
        origin,
        region: detectRegion(c.req.raw),
        note: 'server-side HTTPS round-trip to the same project (edge routing + TLS included); removes client distance, in-region only on production',
        styles: out,
      })
    }

    const n = clampN(c.req.query('n'), MAX_INPROC_N)
    const styles = selectStyles(c.req.query('styles'), Object.keys(INPROC_STYLES))
    const out = await measureStyles(
      INPROC_STYLES,
      styles,
      async (p) => app.fetch(new Request(`http://bench.local${p.path}`, p.init), c.env),
      n,
    )
    const region = detectRegion(c.req.raw)
    return c.json({
      mode,
      region,
      note: 'in-process app.fetch; no client↔server network, server→DataStore latency included',
      // Workers coarsen performance.now() between I/O, so a no-I/O op (hello) reads ~0 there;
      // CPU-bound dispatch timings are only resolvable on the Node (Vercel) runtime.
      ...(region.startsWith('cloudflare')
        ? {
            caveat:
              'Workers coarsen performance.now() between I/O; hello reads ~0 here — read dispatch timings from Vercel.',
          }
        : {}),
      styles: out,
    })
  })
}
