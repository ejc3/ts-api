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
daily. Measured commit→ready on one gated merge (`f4c4257`):

| Platform | commit → ready | breakdown |
| --- | --- | --- |
| Cloudflare | ~57 s | ~30 s CI gate + ~26 s `wrangler deploy` |
| Vercel | ~97 s | ~27 s CI gate + a ~68 s deploy job (`npm i -g vercel` ~11 s, `vercel build` ~12 s, `vercel deploy` upload ~26 s, runner setup + smoke ~19 s) |

Gating adds the CI wait (~30 s) that the old Vercel git auto-deploy skipped — that auto-deploy was
~25 s but shipped regardless of CI. Vercel's gated job is heavier than Cloudflare's because it runs
a from-scratch CLI build and upload in the runner rather than the platform's own build infra.
