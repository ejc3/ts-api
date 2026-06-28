# ts-api

Four TypeScript API styles — REST, GraphQL, tRPC, gRPC — composed onto one Web Fetch
handler over a shared core, deployable to **Vercel or Cloudflare**. The stack rationale and
per-style code are in [`API-APPROACHES.md`](./API-APPROACHES.md).

## Layout

```
src/
  core/       framework-agnostic types, DataStore, config, stub auth
  rest/       Hono + @hono/zod-openapi
  app.ts      composes the styles onto one Hono app
  adapters/   cloudflare.ts (Workers) and vercel.ts entry points
```

## Develop

```bash
pnpm install
pnpm test            # vitest: unit + integration
pnpm typecheck       # tsc --noEmit
pnpm exec biome check .
pnpm dev             # wrangler dev (Cloudflare)
```

Each API style lands as its own reviewed PR; CI runs biome + tsc + vitest on every push.
