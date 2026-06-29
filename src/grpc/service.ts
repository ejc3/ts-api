import { Code, ConnectError, type ConnectRouter } from '@connectrpc/connect'
import { type DataStore, normalizeUserName } from '../core/index.js'
import { UserService } from './gen/user_pb.js'

/**
 * Register the Connect UserService over the shared DataStore. Handlers return plain
 * core objects; connect-es accepts these as MessageInitShape and serializes them
 * against the response schema.
 */
export function registerUserService(store: DataStore) {
  return (router: ConnectRouter): ConnectRouter =>
    router.service(UserService, {
      async getUser(req) {
        const user = await store.getUser(req.id)
        if (user === null) throw new ConnectError('user not found', Code.NotFound)
        return user
      },
      async listUsers() {
        return { users: await store.listUsers() }
      },
      async createUser(req) {
        const name = normalizeUserName(req.name)
        if (name === null) throw new ConnectError('name must not be empty', Code.InvalidArgument)
        return store.createUser({ name })
      },
    })
}
