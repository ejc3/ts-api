# ts-api

Five TypeScript API styles — REST, GraphQL, tRPC, gRPC, Express — over a shared core.
REST, GraphQL, and tRPC compose onto one Web Fetch handler that runs on **Vercel or
Cloudflare**; gRPC (ConnectRPC) and Express bind Node's `http` server, so they are Node-only
and deploy as Vercel functions. The stack rationale and per-style code are in
[`API-APPROACHES.md`](./API-APPROACHES.md).

Persistence is a shared `DataStore` over SQLite — Turso/libSQL on Node/Vercel, D1 on
Cloudflare. Provisioning Turso has a few credential traps; they're written up in
[`docs/turso.md`](./docs/turso.md).

A benchmark that decomposes request latency — framework dispatch vs the SQL read vs the
socket vs the network — is in [`docs/bench.md`](./docs/bench.md).

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

## Deploy

Merging to `main` ships both deployments — there is no manual deploy step.

- **Vercel** builds on push through the git integration and promotes to production,
  independent of GitHub Actions.
- **Cloudflare** deploys from a GitHub Action (`wrangler deploy`, [`.github/workflows/deploy-cloudflare.yml`](./.github/workflows/deploy-cloudflare.yml))
  that runs only after the CI workflow passes on `main`, so a red gate never ships.

Measured commit→ready on one merge (`09d773a`):

| Platform | commit → ready | what's in it |
| --- | --- | --- |
| Vercel | ~29 s | ~5 s webhook + ~24 s build |
| Cloudflare | ~57 s | ~31 s until CI is green + ~25 s `wrangler deploy` |

Cloudflare is longer because its deploy waits for CI to go green first; Vercel builds in
parallel with CI. The Cloudflare deploy smokes the live Worker inline, and a scheduled
workflow ([`.github/workflows/smoke.yml`](./.github/workflows/smoke.yml)) re-checks both
production URLs daily.
