import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import type { DataStore } from '../core/index'
import { appRouter } from './router'

/** Build a Fetch handler for the tRPC router, bound to a store and mount path. */
export function createTrpcHandler(store: DataStore, endpoint: string) {
  return (request: Request): Promise<Response> =>
    fetchRequestHandler({
      endpoint,
      req: request,
      router: appRouter,
      createContext: () => ({ store }),
    })
}
