import { connectNodeAdapter } from '@connectrpc/connect-node'
import type { DataStore } from '../core/index.js'
import { registerUserService } from './service.js'

/**
 * Node request handler for the Connect/gRPC service. ConnectRPC has no native edge
 * Fetch adapter, so gRPC runs on the Node path (Vercel function) rather than Workers.
 */
export function createGrpcNodeHandler(store: DataStore) {
  return connectNodeAdapter({ routes: registerUserService(store) })
}
