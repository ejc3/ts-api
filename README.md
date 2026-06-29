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

Each deploy job checks out the exact commit CI validated and smokes its live URL inline; a
scheduled workflow ([`smoke.yml`](./.github/workflows/smoke.yml)) re-checks both production URLs
daily. Measured commit→ready on gated merges:

| Platform | commit → ready | breakdown |
| --- | --- | --- |
| Cloudflare | ~57 s | ~30 s CI gate + ~26 s `wrangler deploy` |
| Vercel | ~89 s | ~31 s CI gate + a ~58 s deploy (`npm i -g vercel` ~11 s, then `vercel deploy --prod` uploads the source and builds on Vercel's infra ~40 s) |

`vercel deploy` (no `--prebuilt`) builds on Vercel's own infra — warm deps and build cache, the
same fast path the git integration used — so there is no in-runner build. The gate adds the ~30 s
CI wait the old git auto-deploy skipped (that auto-deploy was ~25 s but shipped regardless of CI).
What keeps Vercel slower than Cloudflare here is the one-time CLI install and the source upload; a
Vercel Deploy Hook would shave those (~55 s) but would rebuild main's tip instead of the exact
CI-validated commit.
