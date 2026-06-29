import type { SqlDriver, SqlRow } from './sqlite'

/**
 * SqlDriver backed by a Cloudflare D1 binding. D1Database is ambient from
 * @cloudflare/workers-types, so this file carries no runtime dependency and is safe in
 * the Workers bundle.
 */
export function d1Driver(db: D1Database): SqlDriver {
  return {
    async run(sql, params = []) {
      const res = await db
        .prepare(sql)
        .bind(...params)
        .run()
      // D1 reports last_row_id as a JS number, so ids are exact within 2^53 — every
      // realistic row count. The Turso path returns a native bigint and stays exact beyond.
      return { lastInsertRowId: BigInt(res.meta.last_row_id ?? 0) }
    },
    async all(sql, params = []) {
      const res = await db
        .prepare(sql)
        .bind(...params)
        .all<SqlRow>()
      return res.results
    },
  }
}
