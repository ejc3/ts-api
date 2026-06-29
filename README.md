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

Merging to `main` ships both deployments — there is no manual deploy step.

- **Vercel** builds on push through the git integration and promotes to production,
  independent of GitHub Actions.
- **Cloudflare** deploys from a GitHub Action (`wrangler deploy`, [`.github/workflows/deploy-cloudflare.yml`](./.github/workflows/deploy-cloudflare.yml))
  that runs after the CI workflow passes on `main`, so an automatic deploy never ships on a red
  gate (a manual `workflow_dispatch` can still deploy on demand).

Measured commit→ready on one merge (`09d773a`, n=1):

| Platform | build/deploy work | CI-gate wait | commit → ready |
| --- | --- | --- | --- |
| Vercel | ~24 s build (+ ~5 s webhook) | none — builds in parallel with CI | ~29 s |
| Cloudflare | ~25 s `wrangler deploy` | ~31 s — waits for CI green | ~57 s |

The build/deploy work itself is essentially equal (~24 s vs ~25 s). The gap in commit→ready is
the CI gate: Cloudflare deploys only after CI passes, while Vercel builds in parallel and can
promote before CI finishes — faster, but it will ship even if the gate later goes red. The
Cloudflare deploy smokes the live Worker inline, and a scheduled workflow
([`.github/workflows/smoke.yml`](./.github/workflows/smoke.yml)) re-checks both production URLs
daily.
