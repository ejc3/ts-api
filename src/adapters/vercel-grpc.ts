import { resolveNodeStore } from '../core/turso.js'
import { createGrpcNodeHandler } from '../grpc/node.js'

// ConnectRPC has no edge Fetch adapter, so gRPC deploys as a Vercel Node function — its
// own function, with the same Node store resolution as the Hono app (Turso when
// configured, else the in-memory demo seed). Vercel's HTTP/1.1 functions serve Connect
// and gRPC-Web; native binary gRPC needs end-to-end HTTP/2 and is not reachable here.
export default createGrpcNodeHandler(resolveNodeStore(process.env))
