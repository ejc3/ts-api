import { type Client, createClient } from '@libsql/client'
import { DEMO_USERS } from './seed.js'
import { type SqlDriver, SqliteStore } from './sqlite.js'
import { InMemoryStore } from './store.js'
import type { DataStore } from './types.js'

/** SqlDriver backed by a libSQL/Turso client. */
export function tursoDriver(client: Client): SqlDriver {
  return {
    async run(sql, params = []) {
      const res = await client.execute({ sql, args: [...params] })
      return { lastInsertRowId: res.lastInsertRowid ?? 0n }
    },
    async all(sql, params = []) {
      return (await client.execute({ sql, args: [...params] })).rows
    },
  }
}

/**
 * The Node/Vercel store: a Turso-backed SqliteStore when TURSO_DATABASE_URL is set,
 * else the in-memory demo seed. This module imports @libsql/client, so it is reachable
 * only from the Node entry points — never from the Workers bundle (cloudflare.ts →
 * app.ts).
 */
export function resolveNodeStore(
  env: Record<string, string | undefined>,
  fallback: DataStore = new InMemoryStore(DEMO_USERS),
): DataStore {
  const url = env.TURSO_DATABASE_URL
  if (url === undefined || url === '') return fallback
  const authToken = env.TURSO_AUTH_TOKEN
  const client = createClient(authToken ? { url, authToken } : { url })
  return new SqliteStore(tursoDriver(client), DEMO_USERS)
}
