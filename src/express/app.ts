import express, { type Express } from 'express'
import { type DataStore, normalizeUserName } from '../core/index.js'

/**
 * Express surface over the shared DataStore — the Node-only counterpart to the Hono
 * REST demo, same endpoints and status codes. Express has no edge Fetch adapter, so it
 * deploys as a Node function (see src/adapters/vercel-express.ts).
 */
export function createExpressApp(store: DataStore): Express {
  const app = express()
  app.use(express.json())

  app.get('/users', async (_req, res) => {
    res.json(await store.listUsers())
  })

  app.get('/users/:id', async (req, res) => {
    const user = await store.getUser(req.params.id)
    if (user === null) {
      res.status(404).json({ error: 'not found' })
      return
    }
    res.json(user)
  })

  app.post('/users', async (req, res) => {
    const raw: unknown = (req.body as { name?: unknown } | undefined)?.name
    const name = typeof raw === 'string' ? normalizeUserName(raw) : null
    if (name === null) {
      res.status(400).json({ error: 'invalid request' })
      return
    }
    res.status(201).json(await store.createUser({ name }))
  })

  // Express forwards async rejections and body-parser errors here. A client error
  // (express.json() flags a malformed body with status 400) keeps its 4xx, matching the
  // REST demo; anything else is an internal 500 with no detail on the wire.
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = clientErrorStatus(err)
      res
        .status(status ?? 500)
        .json({ error: status === undefined ? 'internal' : 'invalid request' })
    },
  )

  return app
}

/** The error's 4xx status if it carries one (e.g. an express.json() parse error), else undefined. */
function clientErrorStatus(err: unknown): number | undefined {
  if (err === null || typeof err !== 'object') return undefined
  const { status, statusCode } = err as { status?: unknown; statusCode?: unknown }
  const code =
    typeof status === 'number' ? status : typeof statusCode === 'number' ? statusCode : undefined
  return code !== undefined && code >= 400 && code < 500 ? code : undefined
}
