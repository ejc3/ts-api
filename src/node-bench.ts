import { createServer, type Server } from 'node:http'
import { getRequestListener } from '@hono/node-server'
import express from 'express'
import { buildApp } from './app.js'
import {
  ALL_STYLES,
  clampN,
  MAX_NET_N,
  measureStyle,
  type Summary,
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

/** One server fronting all five frameworks, dispatched by path prefix. */
function buildUnifiedServer(store: DataStore): Server {
  const hono = getRequestListener(buildApp(store).fetch)
  const grpc = createGrpcNodeHandler(store)
  const expressRoot = express()
  expressRoot.use(EXPRESS_PREFIX, createExpressApp(store))

  return createServer((req, res) => {
    const url = req.url ?? '/'
    if (url.startsWith(GRPC_PREFIX)) {
      grpc(req, res)
    } else if (url === EXPRESS_PREFIX || url.startsWith(`${EXPRESS_PREFIX}/`)) {
      expressRoot(req, res)
    } else {
      hono(req, res)
    }
  })
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
  styles: Record<string, { hello: Summary; list: Summary }>
}

/** Run the socket bench for the requested styles, tearing the server down afterward. */
export async function benchOverSocket(
  store: DataStore,
  query: { n?: string | undefined; styles?: string | undefined },
): Promise<SocketBenchResult> {
  const n = clampN(query.n, MAX_NET_N)
  const styles = selectStyles(query.styles, Object.keys(ALL_STYLES))
  const server = buildUnifiedServer(store)
  try {
    const base = await listen(server)
    const out: Record<string, { hello: Summary; list: Summary }> = {}
    for (const style of styles) {
      const probes = ALL_STYLES[style as keyof typeof ALL_STYLES]
      out[style] = await measureStyle(probes, (p) => fetch(`${base}${p.path}`, p.init), n)
    }
    return { mode: 'socket', transport: 'node:http over 127.0.0.1', n, styles: out }
  } finally {
    // Close only if the bind succeeded; closing a never-listening server throws.
    if (server.listening) await close(server)
  }
}
