import type { DataStore, User } from './types.js'

/**
 * In-memory DataStore for demos and tests; writes are not durable. Real backings
 * (D1, Turso) implement the same interface.
 */
export class InMemoryStore implements DataStore {
  private readonly users = new Map<string, User>()
  private seq = 0

  constructor(seed: readonly User[] = []) {
    for (const user of seed) {
      this.users.set(user.id, user)
      const n = Number(user.id)
      if (Number.isSafeInteger(n)) this.seq = Math.max(this.seq, n)
    }
  }

  getUser(id: string): Promise<User | null> {
    return Promise.resolve(this.users.get(id) ?? null)
  }

  listUsers(): Promise<User[]> {
    return Promise.resolve(Array.from(this.users.values()))
  }

  createUser(input: { name: string }): Promise<User> {
    const user: User = { id: String(++this.seq), name: input.name }
    this.users.set(user.id, user)
    return Promise.resolve(user)
  }
}
