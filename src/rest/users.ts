import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import type { DataStore } from '../core/index'

const UserSchema = z.object({ id: z.string(), name: z.string() }).openapi('User')
const ErrorSchema = z.object({ error: z.string() }).openapi('Error')
const CreateUserSchema = z.object({ name: z.string().trim().min(1) }).openapi('CreateUser')

const jsonError = (description: string) => ({
  content: { 'application/json': { schema: ErrorSchema } },
  description,
})

const listUsers = createRoute({
  method: 'get',
  path: '/users',
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(UserSchema) } },
      description: 'all users',
    },
  },
})

const getUser = createRoute({
  method: 'get',
  path: '/users/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { content: { 'application/json': { schema: UserSchema } }, description: 'a single user' },
    404: jsonError('no such user'),
  },
})

const createUser = createRoute({
  method: 'post',
  path: '/users',
  request: {
    body: { content: { 'application/json': { schema: CreateUserSchema } }, required: true },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: UserSchema } },
      description: 'the created user',
    },
    400: jsonError('invalid body'),
  },
})

/**
 * REST surface over the shared DataStore. Returns the chained app so its route
 * types are preserved for a typed `hc` client; `servers` carries the mount base.
 */
export function createRest(store: DataStore) {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) return c.json({ error: 'invalid request' }, 400)
    },
  })
    .openapi(listUsers, async (c) => c.json(await store.listUsers(), 200))
    .openapi(getUser, async (c) => {
      const { id } = c.req.valid('param')
      const user = await store.getUser(id)
      return user === null ? c.json({ error: 'not found' }, 404) : c.json(user, 200)
    })
    .openapi(createUser, async (c) => c.json(await store.createUser(c.req.valid('json')), 201))
    .doc('/openapi.json', {
      openapi: '3.0.0',
      info: { title: 'ts-api REST', version: '0.0.0' },
      servers: [{ url: '/api' }],
    })
}

export type RestApp = ReturnType<typeof createRest>
