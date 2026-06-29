import express from 'express'
import { resolveNodeStore } from '../core/turso.js'
import { createExpressApp } from '../express/app.js'

// Express is a Node framework with no edge Fetch adapter, so like gRPC it deploys as a
// Vercel Node function. vercel.json rewrites /express/* here preserving the original
// path, so mount the app under /express. Same Node store resolution as the Hono app
// (Turso when configured, else the in-memory demo seed).
const root = express()
root.use('/express', createExpressApp(resolveNodeStore(process.env)))

export default root
