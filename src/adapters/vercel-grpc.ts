import { DEMO_USERS, InMemoryStore } from '../core/index'
import { createGrpcNodeHandler } from '../grpc/node'

// ConnectRPC has no edge Fetch adapter, so gRPC deploys as a Vercel Node function —
// its own function with its own in-memory store, separate from the Hono app. Vercel's
// HTTP/1.1 functions serve Connect and gRPC-Web; native binary gRPC needs end-to-end
// HTTP/2 and is not reachable through them.
export default createGrpcNodeHandler(new InMemoryStore(DEMO_USERS))
