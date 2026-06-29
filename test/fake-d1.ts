import type { Client, InValue } from '@libsql/client'

/**
 * A D1Database backed by a libSQL client, exposing just the prepared-statement surface
 * d1Driver uses (prepare → bind → run/all). It lets the D1 driver run against a real
 * SQLite engine in tests; the actual D1 binding is exercised at deploy.
 */
export function fakeD1(client: Client): D1Database {
  const statement = (sql: string, args: readonly unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    async run() {
      const res = await client.execute({ sql, args: args as unknown as InValue[] })
      return { success: true, meta: { last_row_id: Number(res.lastInsertRowid ?? 0) } }
    },
    async all<T = unknown>() {
      const res = await client.execute({ sql, args: args as unknown as InValue[] })
      return { success: true, results: res.rows as unknown as T[], meta: {} }
    },
  })
  return {
    prepare: (sql: string) => statement(sql) as unknown as D1PreparedStatement,
  } as unknown as D1Database
}
