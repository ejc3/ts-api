import { buildApp } from '../app.js'
import { type DataStore, DEMO_USERS, d1Driver, InMemoryStore, SqliteStore } from '../core/index.js'

/** Worker env: secrets arrive as strings, the optional D1 binding as an object. */
interface Env {
  JWT_SECRET?: string
  DB?: D1Database
}

/** D1-backed store when the binding is present, else the in-memory demo seed. */
export function resolveStore(env: Env): DataStore {
  return env.DB ? new SqliteStore(d1Driver(env.DB), DEMO_USERS) : new InMemoryStore(DEMO_USERS)
}

// The D1 binding is only available per request, so the app (and its store) is built on
// the first request and reused for the isolate's lifetime. Secrets still resolve per
// request inside the app's config middleware.
let app: ReturnType<typeof buildApp> | undefined

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    app ??= buildApp(resolveStore(env))
    return app.fetch(request, env, ctx)
  },
}
