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

Each API style lands as its own reviewed PR; CI runs biome + tsc + vitest + a Cloudflare
build smoke on every PR and every push to `main`.

## Deploy

Merging to `main` runs CI; **only after CI passes** does either platform deploy to production. A
red gate ships nothing.

- **CI** ([`ci.yml`](./.github/workflows/ci.yml)) runs biome + tsc + vitest + a Cloudflare build
  smoke on every PR and every push to `main`.
- **Cloudflare** deploys from [`deploy-cloudflare.yml`](./.github/workflows/deploy-cloudflare.yml)
  (`wrangler deploy`) and **Vercel** from
  [`deploy-vercel.yml`](./.github/workflows/deploy-vercel.yml) (`vercel deploy --prebuilt --prod`).
  Both are `workflow_run` jobs guarded on `conclusion == 'success'`, so neither ships on a red
  gate; a manual `workflow_dispatch` can still deploy on demand.
- Vercel's git-integration auto-deploy for `main` is turned off (`git.deploymentEnabled` in
  [`vercel.json`](./vercel.json)), so the gate is the only path to production. PR preview deploys
  still run.

Gated this way, commit→ready is CI (~30 s) plus the platform's build/deploy — ~20 s for the
Vercel build, ~25 s for `wrangler deploy` — so roughly ~50–55 s on each. Each deploy smokes its
live URL inline, and a scheduled workflow ([`smoke.yml`](./.github/workflows/smoke.yml)) re-checks
both production URLs daily.
