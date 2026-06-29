import { Hono } from 'hono'
import { type Config, configFromEnv, type DataStore, DEMO_USERS, InMemoryStore } from './core/index'
import { createYogaHandler } from './graphql/index'
import { createRest } from './rest/users'
import { createTrpcHandler } from './trpc/index'

const API_BASE = '/api'
const TRPC_BASE = '/trpc'
const GRAPHQL_BASE = '/graphql'

/** The styles currently mounted; grows as each demo PR lands. */
export const STYLES = ['rest', 'trpc', 'graphql'] as const

export type Variables = { config: Config }

const PROCESS_ENV: Record<string, string | undefined> =
  typeof process === 'undefined' ? {} : process.env

/** Merge the Workers env binding over process.env so config resolves on either platform. */
function readEnv(workerEnv: unknown): Record<string, string | undefined> {
  return { ...PROCESS_ENV, ...((workerEnv ?? {}) as Record<string, string | undefined>) }
}

/** Compose every API style onto one Fetch handler over a shared DataStore. */
export function buildApp(
  store: DataStore = new InMemoryStore(DEMO_USERS),
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

  const yoga = createYogaHandler(store, GRAPHQL_BASE)
  app.all(GRAPHQL_BASE, (c) => yoga(c.req.raw))
  return app
}
