import { resolveNodeStore } from '../core/turso'
import { createExpressApp } from '../express/app'

// Express is a Node framework with no edge Fetch adapter, so like gRPC it deploys as a
// Vercel Node function, using the same Node store resolution as the Hono app (Turso
// when configured, else the in-memory demo seed).
export default createExpressApp(resolveNodeStore(process.env))
