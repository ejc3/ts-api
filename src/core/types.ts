export interface User {
  id: string
  name: string
}

export interface Principal {
  userId: string
}

export interface Config {
  jwtSecret: string
}

export interface DataStore {
  getUser(id: string): Promise<User | null>
  listUsers(): Promise<User[]>
  createUser(input: { name: string }): Promise<User>
}
