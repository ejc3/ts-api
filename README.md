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
  — a `workflow_run` job that runs `wrangler deploy` after CI succeeds.
- **Vercel** deploys from [`deploy-vercel.yml`](./.github/workflows/deploy-vercel.yml), which
  **stages the build in parallel with CI and promotes on green**: on push it runs `vercel deploy
  --prod --skip-domain` (a production build on Vercel's infra that is *not* made live), waits for
  the push-to-main CI run to pass, then `vercel promote`s that exact build — a ~3 s alias flip. So
  the build overlaps the CI wait instead of stacking after it.
- Both are fail-closed: a red CI never promotes/deploys; a manual `workflow_dispatch` deploys on
  demand. Vercel's git-integration auto-deploy for `main` is off (`git.deploymentEnabled` in
  [`vercel.json`](./vercel.json)), so these workflows are the only path to production; PR preview
  deploys still run.

Each deploy smokes its live URL inline; a scheduled workflow
([`smoke.yml`](./.github/workflows/smoke.yml)) re-checks both production URLs daily. Measured
commit→ready on gated merges:

| Platform | commit → ready | breakdown |
| --- | --- | --- |
| Cloudflare | ~57 s | ~30 s CI gate (serial) + ~26 s `wrangler deploy` |
| Vercel | ~51 s | gate overlapped — the ~29 s build runs parallel with CI (the CI-wait was ~1 s); the rest is runner setup, a ~5 s CLI install (warm cache; ~12 s cold), and a ~3 s promote |

Vercel's build now overlaps the CI wait, so the gate adds almost nothing to its total (the deploy
job waited ~1 s for CI); the ~51 s is the deploy job's own setup + CLI install + Vercel build (a
cold CLI cache makes it ~60 s). The floor is the ~29 s Vercel build. A Vercel Deploy Hook would
drop the CLI install and source upload but would rebuild main's tip instead of the exact
CI-validated commit. The old git auto-deploy was ~25 s but shipped regardless of CI.
