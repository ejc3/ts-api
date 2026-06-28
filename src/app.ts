import { Hono } from 'hono'
import { type Config, configFromEnv, type DataStore, InMemoryStore } from './core/index'
import { createRest } from './rest/users'
import { createTrpcHandler } from './trpc/index'

/** Demo seed. Non-durable: lives in the isolate until PR5 wires D1/Turso. */
const SEED = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Linus' },
] as const

const API_BASE = '/api'
const TRPC_BASE = '/trpc'

/** The styles currently mounted; grows as each demo PR lands. */
export const STYLES = ['rest', 'trpc'] as const

export type Variables = { config: Config }

const PROCESS_ENV: Record<string, string | undefined> =
  typeof process === 'undefined' ? {} : process.env

/** Merge the Workers env binding over process.env so config resolves on either platform. */
function readEnv(workerEnv: unknown): Record<string, string | undefined> {
  return { ...PROCESS_ENV, ...((workerEnv ?? {}) as Record<string, string | undefined>) }
}

/** Compose every API style onto one Fetch handler over a shared DataStore. */
export function buildApp(
  store: DataStore = new InMemoryStore(SEED),
): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>()

  // Resolve config per request, so the Workers env binding (only available per
  // request) is honored rather than frozen at module load.
  app.use('*', async (c, next) => {
    c.set('config', configFromEnv(readEnv(c.env)))
    await next()
  })

  app.get('/', (c) => c.json({ ok: true, styles: STYLES }))
  // Fetch-native styles mount here via app.route / app.all(c.req.raw). gRPC and
  // Express are Node-only and attach through their own adapters (see API-APPROACHES.md).
  app.route(API_BASE, createRest(store))

  const trpc = createTrpcHandler(store, TRPC_BASE)
  app.all(`${TRPC_BASE}/*`, (c) => trpc(c.req.raw))
  return app
}
