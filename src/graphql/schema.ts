import SchemaBuilder from '@pothos/core'
import { GraphQLError } from 'graphql'
import { type DataStore, normalizeUserName, type User } from '../core/index.js'

export interface GraphQLContext {
  store: DataStore
}

const builder = new SchemaBuilder<{
  Context: GraphQLContext
  Objects: { User: User }
}>({})

builder.objectType('User', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
  }),
})

builder.queryType({
  fields: (t) => ({
    // No store access — a benchmark baseline for framework dispatch alone.
    hello: t.string({ resolve: () => 'hello world' }),
    users: t.field({
      type: ['User'],
      resolve: (_root, _args, ctx) => ctx.store.listUsers(),
    }),
    user: t.field({
      type: 'User',
      nullable: true,
      args: { id: t.arg.id({ required: true }) },
      resolve: (_root, args, ctx) => ctx.store.getUser(String(args.id)),
    }),
  }),
})

builder.mutationType({
  fields: (t) => ({
    createUser: t.field({
      type: 'User',
      args: { name: t.arg.string({ required: true }) },
      resolve: (_root, args, ctx) => {
        const name = normalizeUserName(args.name)
        if (name === null) {
          throw new GraphQLError('name must not be empty', {
            extensions: { code: 'BAD_USER_INPUT' },
          })
        }
        return ctx.store.createUser({ name })
      },
    }),
  }),
})

export const schema = builder.toSchema()
