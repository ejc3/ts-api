import type { DataStore, User } from './types'

/** A query result row, columns keyed by name. */
export type SqlRow = Record<string, unknown>

/** A value bindable as a SQL parameter. */
export type SqlValue = string | number | null

/**
 * Minimal async SQL surface shared by the SQLite-compatible backings — Turso/libSQL
 * and Cloudflare D1 speak the same SQL, so only this driver differs per platform.
 */
export interface SqlDriver {
  // Rowid is a bigint so a large id survives String() losslessly — Number() would round
  // ids past 2^53. 0n for statements that insert nothing.
  run(sql: string, params?: readonly SqlValue[]): Promise<{ lastInsertRowId: bigint }>
  /** Run a query and return its rows. */
  all(sql: string, params?: readonly SqlValue[]): Promise<SqlRow[]>
}

const CREATE_TABLE =
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)'

function toUser(row: SqlRow): User {
  return { id: String(row.id), name: String(row.name) }
}

/**
 * DataStore over any SQLite-compatible driver. The schema and seed are applied once,
 * lazily, on first use. Seeding inserts the seed's own ids with INSERT OR IGNORE, so a
 * durable database is seeded exactly once however many cold starts hit it; the
 * AUTOINCREMENT sequence then continues past the seeded ids, matching InMemoryStore.
 */
export class SqliteStore implements DataStore {
  private ready: Promise<void> | undefined

  constructor(
    private readonly driver: SqlDriver,
    private readonly seed: readonly User[] = [],
  ) {}

  /** Apply schema + seed once. A failed attempt is not cached, so a later call retries. */
  private init(): Promise<void> {
    if (this.ready === undefined) {
      this.ready = this.migrate().catch((err) => {
        this.ready = undefined
        throw err
      })
    }
    return this.ready
  }

  private async migrate(): Promise<void> {
    await this.driver.run(CREATE_TABLE)
    for (const user of this.seed) {
      await this.driver.run('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)', [
        Number(user.id),
        user.name,
      ])
    }
  }

  async getUser(id: string): Promise<User | null> {
    await this.init()
    const rows = await this.driver.all('SELECT id, name FROM users WHERE id = ?', [id])
    const row = rows[0]
    // SQLite's numeric affinity would match non-canonical ids ('02', ' 2', '2.0'); keep
    // parity with InMemoryStore by accepting only the exact id we would return.
    return row && String(row.id) === id ? toUser(row) : null
  }

  async listUsers(): Promise<User[]> {
    await this.init()
    return (await this.driver.all('SELECT id, name FROM users ORDER BY id')).map(toUser)
  }

  async createUser(input: { name: string }): Promise<User> {
    await this.init()
    const { lastInsertRowId } = await this.driver.run('INSERT INTO users (name) VALUES (?)', [
      input.name,
    ])
    return { id: String(lastInsertRowId), name: input.name }
  }
}
