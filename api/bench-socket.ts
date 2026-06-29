import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveNodeStore } from '../src/core/turso.js'
import { benchOverSocket } from '../src/node-bench.js'

// Node function. A default export is the Node (req, res) handler Vercel expects. The socket
// bench needs node:http + Express + Connect's Node adapter, so it lives here on the Node path,
// never in the Hono app or the Workers bundle. The store is built once at module load (Turso
// when configured, else the in-memory demo seed).
const store = resolveNodeStore(process.env)

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  res.setHeader('content-type', 'application/json')
  try {
    const result = await benchOverSocket(store, {
      n: url.searchParams.get('n') ?? undefined,
      styles: url.searchParams.get('styles') ?? undefined,
    })
    res.end(JSON.stringify(result))
  } catch (err) {
    console.error('bench-socket failed', err)
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'socket bench failed' }))
  }
}
