import { buildApp } from '../app'

// Workers passes the env binding per request; build once, read secrets per request.
const app = buildApp()

export default {
  fetch(
    request: Request,
    env: Record<string, string | undefined>,
    ctx: ExecutionContext,
  ): Response | Promise<Response> {
    return app.fetch(request, env, ctx)
  },
}
