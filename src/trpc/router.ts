import { initTRPC, TRPCError } from '@trpc/server'
import { z } from 'zod'
import type { DataStore } from '../core/index'

export interface TrpcContext {
  store: DataStore
}

const t = initTRPC.context<TrpcContext>().create()

/** tRPC surface over the shared DataStore — the router type is the client contract. */
export const appRouter = t.router({
  users: t.router({
    list: t.procedure.query(({ ctx }) => ctx.store.listUsers()),

    get: t.procedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
      const user = await ctx.store.getUser(input.id)
      if (user === null) throw new TRPCError({ code: 'NOT_FOUND' })
      return user
    }),

    create: t.procedure
      .input(z.object({ name: z.string().trim().min(1) }))
      .mutation(({ ctx, input }) => ctx.store.createUser(input)),
  }),
})

export type AppRouter = typeof appRouter
