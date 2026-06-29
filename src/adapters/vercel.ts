import { buildApp } from '../app'
import { resolveNodeStore } from '../core/turso'

// Node runtime: process.env is available at module load, so the store resolves once —
// Turso when TURSO_DATABASE_URL is set, else the in-memory demo seed. Config still
// resolves per request from process.env inside the app.
const app = buildApp(resolveNodeStore(process.env))

const handler = (request: Request): Response | Promise<Response> => app.fetch(request)

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
