import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolveNodeStore } from '../core/turso.js'
import { benchOverSocket, buildUnifiedDispatcher } from '../node-bench.js'

// Node function entry for the socket bench. The store and the unified dispatcher are built
// once at module load (the dispatcher carries the whole framework stack, so it is not rebuilt
// per request); only the ephemeral loopback server is per-call. node:http, Express and
// Connect's Node adapter stay on this Node path, never in the Workers bundle.
const store = resolveNodeStore(process.env)
const dispatch = buildUnifiedDispatcher(store)

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  res.setHeader('content-type', 'application/json')
  try {
    const result = await benchOverSocket(dispatch, {
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
