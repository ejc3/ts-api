import type { User } from './types'

/** Demo users shared by every style's default store. Non-durable until D1/Turso. */
export const DEMO_USERS: readonly User[] = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Linus' },
]
