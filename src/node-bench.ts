import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import express from 'express'
import { buildApp } from './app.js'
import {
  ALL_STYLES,
  clampN,
  MAX_NET_N,
  measureStyles,
  type StyleResults,
  selectStyles,
} from './bench-core.js'
import type { DataStore } from './core/index.js'
import { createExpressApp } from './express/app.js'
import { createGrpcNodeHandler } from './grpc/node.js'

/**
 * Socket bench: serve every framework from one ephemeral HTTP server bound to loopback, then
 * time each style's hello/list over a real TCP socket. This is the socket counterpart to the
 * in-process `/bench` mode — the same ops, but through Node's HTTP stack rather than an
 * in-process `app.fetch`, so the difference is the socket/parse cost. It is Node-only (node:http,
 * @hono/node-server, Express, Connect's Node adapter), so it lives outside the Hono app and the
 * Workers bundle and is reached only through its own Vercel function.
 *
 * The server binds 127.0.0.1 on an OS-assigned port and is closed when the run ends, so it is
 * never reachable off-box. Targets are this app's own fixed paths; there is no caller-supplied
 * URL. Read-only, with the sample count clamped.
 */

const GRPC_PREFIX = '/user.v1.'
const EXPRESS_PREFIX = '/express'

/** A request listener dispatching all five frameworks by path prefix. */
export type Dispatch = (req: IncomingMessage, res: ServerResponse) => void

/**
 * Build the dispatcher fronting all five frameworks. The handlers depend only on `store`, so a
 * caller builds this once (e.g. at module load) and reuses it across bench runs; only the
 * `http.Server` around it is per-run.
 */
export function buildUnifiedDispatcher(store: DataStore): Dispatch {
  const hono = getRequestListener(buildApp(store).fetch)
  const grpc = createGrpcNodeHandler(store)
  const expressRoot = express()
  expressRoot.use(EXPRESS_PREFIX, createExpressApp(store))

  return (req, res) => {
    const url = req.url ?? '/'
    if (url.startsWith(GRPC_PREFIX)) {
      grpc(req, res)
    } else if (url === EXPRESS_PREFIX || url.startsWith(`${EXPRESS_PREFIX}/`)) {
      expressRoot(req, res)
    } else {
      hono(req, res)
    }
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr !== null && typeof addr === 'object') {
        resolve(`http://127.0.0.1:${addr.port}`)
      } else {
        reject(new Error('socket bench: server did not bind a TCP port'))
      }
    })
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}

export type SocketBenchResult = {
  mode: 'socket'
  transport: string
  n: number
  styles: StyleResults
}

/** Run the socket bench for the requested styles, tearing the server down afterward. */
export async function benchOverSocket(
  dispatch: Dispatch,
  query: { n?: string | undefined; styles?: string | undefined },
): Promise<SocketBenchResult> {
  const n = clampN(query.n, MAX_NET_N)
  const styles = selectStyles(query.styles, Object.keys(ALL_STYLES))
  const server = createServer(dispatch)
  try {
    const base = await listen(server)
    const out = await measureStyles(ALL_STYLES, styles, (p) => fetch(`${base}${p.path}`, p.init), n)
    return { mode: 'socket', transport: 'node:http over 127.0.0.1', n, styles: out }
  } finally {
    // Close only if the bind succeeded; closing a never-listening server throws.
    if (server.listening) await close(server)
  }
}
