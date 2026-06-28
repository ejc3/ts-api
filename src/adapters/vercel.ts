import { buildApp } from '../app'

// Config is resolved per request from process.env inside the app, so no env is
// threaded here.
const app = buildApp()

const handler = (request: Request): Response | Promise<Response> => app.fetch(request)

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
