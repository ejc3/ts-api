# TypeScript API Approaches — REST and GraphQL (2026)

A survey of the current TypeScript API landscape and the stack decision for this repo,
which will demo **both** a REST API and a GraphQL API, deployable to **Vercel or
Cloudflare** without code changes.

## TL;DR — the decision

| Axis | Choice | Why |
| --- | --- | --- |
| **REST** | **Hono** + `@hono/zod-openapi` | Web-standard, multi-runtime, type-safe RPC client + OpenAPI from one schema |
| **GraphQL** | **GraphQL Yoga** (server) + **Pothos** (code-first schema) | Only mainstream GraphQL server that is Fetch-API-native and edge-portable; Pothos gives type-safe schemas with no codegen |
| **Validation / types** | **Zod** (via Standard Schema) | One schema → runtime validation + static types + OpenAPI/GraphQL types; swappable for Valibot/ArkType |
| **Portability** | **Web-standard `Request`/`Response` (Fetch API)** | Both Hono and Yoga are built on it, so the same handler runs on Vercel Functions and Cloudflare Workers |

The throughline: pick frameworks built on the **Web Fetch API** (`Request`/`Response`),
not on Node's `http` module. That is what makes "deploy to Vercel or Cloudflare —
shouldn't matter" actually true.

## Landscape snapshot (mid-2026)

What the field looks like right now, from the survey below:

- **TypeScript adoption has crossed ~69%** of JS developers, which is steering API
  choices toward end-to-end-typed stacks.
- **REST is still the default**: ~93% of teams rely on it; ~67% of large orgs run REST
  **and** GraphQL together. The "REST vs GraphQL" framing is now a false dichotomy — they
  serve different needs and both keep growing. (This is why we demo both.)
- **GraphQL adoption surged ~340% since 2023**; Federation v2 matured. For TypeScript,
  **code-first with Pothos** is the modern default.
- **Express is in maintenance mode** (still ~35M weekly downloads, huge middleware
  ecosystem, but no major release in years). For greenfield, the energy is on
  Web-standard frameworks.
- **Edge runtimes (Cloudflare Workers, Vercel Functions) use V8 isolates** → millisecond
  cold starts, and they speak Web-standard `Request`/`Response`. Cloudflare's
  `nodejs_compat` (auto-enabled for compatibility dates ≥ 2026-03-17) means most Node
  packages now run on Workers unmodified; Vercel Fluid Compute runs full Node.js
  regionally. Either way, a Fetch-API handler is the portable unit.

## REST: Hono + zod-openapi

**Hono** is the consensus 2026 pick for a portable TypeScript REST API. It is ultra-light,
fast, and **runs on Node.js, Bun, Deno, Cloudflare Workers, Vercel, and AWS Lambda from a
single codebase** — built on the Fetch API from the start. Independent benchmarks put it
2–4× Express throughput and competitive with or ahead of Fastify, with low memory and fast
cold starts.

The REST demo stack:

- **`@hono/zod-openapi`** — an extended Hono app where routes are defined with Zod schemas.
  One definition gives you: request/response **validation**, generated **OpenAPI** docs
  (Swagger UI), and a **type-safe RPC client** (`hc`) so callers get end-to-end types.
- Validators are pluggable: anything supporting **Standard Schema** works — Zod, Valibot,
  ArkType, TypeBox — via `@hono/valibot-validator` etc. The newer **`hono-openapi`**
  middleware generalizes OpenAPI generation across all Standard Schema libraries.
- Default to **Zod** for the demo (largest ecosystem, best-known); note Valibot as the
  smaller-bundle alternative for tight edge budgets.

Why not Express/Fastify here: Express is maintenance-mode and edge-only via adapters;
Fastify is excellent on Node but is Node-`http`-centric, so it is not the natural fit for a
"same code on Workers and Vercel" demo. Hono is.

## GraphQL: GraphQL Yoga + Pothos

**GraphQL Yoga** is the server, **Pothos** builds the schema.

- **Yoga** has an HTTP handler built on the Fetch API's `Request`/`Response`, so it deploys
  to **Cloudflare Workers, Vercel, AWS Lambda** and more from one codebase — the only
  mainstream GraphQL server that is genuinely edge-portable. It supports subscriptions and
  file uploads and accepts any schema-building approach (Pothos, Nexus, TypeGraphQL,
  GraphQL Tools, SDL-first).
- **Pothos** is the **code-first** schema builder: you define types with TypeScript builder
  methods, the SDL is generated, and TypeScript enforces at compile time that resolver
  return types match the schema. It is the most type-safe option **with no code generation
  step** — it leans on inference rather than a codegen pipeline.

Why this combo over **Apollo Server**: Apollo is the full-featured incumbent with the
largest ecosystem, but it is heavier and not Fetch-API-native in the same way — Yoga is the
portable-edge choice that matches our Vercel-or-Cloudflare requirement. Schema-first (`.graphql`
+ graphql-codegen) remains valid, but for a new TS project code-first/Pothos is the
recommended default.

## What we are deliberately NOT doing

- **tRPC** — excellent for a TS-monorepo with a single TS web client (5KB client, ~50–100ms
  cold start, RSC-native in v11). But it is **not** a REST or GraphQL approach — it is a
  TypeScript-only RPC layer with no language-agnostic contract. Out of scope for a REST +
  GraphQL demo; worth a footnote as "the third option."
- **gRPC / Connect** — strong for service-to-service, not the target here.

## Portability contract (the part that makes "Vercel or Cloudflare" true)

Both demos must obey one rule: **the app is a `(Request) => Response` handler**; the
platform adapter is the only platform-specific code.

- **Vercel**: export the Fetch handler (Hono/Yoga both ship Vercel adapters; Fluid Compute
  runs Node.js, so `node:*` APIs are available).
- **Cloudflare Workers**: export `{ fetch }`; set `nodejs_compat` and a recent compatibility
  date if any `node:*` modules are used; use `wrangler types` for accurate runtime types.
- Keep platform bindings (Cloudflare KV/R2/D1/Durable Objects, Vercel storage) behind a thin
  interface so the core handler stays portable. Note the one true lock-in: **Durable Objects
  have no equivalent off Cloudflare**; R2 (S3-compatible) and D1 (SQLite) are portable.

## Sources

REST / framework landscape:
- [Hono vs Express vs Fastify vs Elysia — 2026 (Oflight)](https://www.oflight.co.jp/en/columns/hono-vs-express-fastify-elysia-comparison-2026)
- [Best TypeScript Backend Frameworks 2026 (Encore)](https://encore.dev/resources/best-typescript-backend-frameworks-2026)
- [Using TypeScript in the Edge Era: Cloudflare Workers & Vercel Edge 2026 (Medium)](https://medium.com/@mernstackdevbykevin/using-typescript-in-the-edge-era-cloudflare-workers-vercel-edge-7a8062eb1885)
- [Hono — Cloudflare Workers getting started](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono — Zod OpenAPI example](https://hono.dev/examples/zod-openapi) · [`@hono/zod-openapi` (npm)](https://www.npmjs.com/package/@hono/zod-openapi) · [Hono OpenAPI](https://hono.dev/examples/hono-openapi)

GraphQL:
- [Build a GraphQL API with TypeScript in 2026 (Encore)](https://encore.dev/articles/typescript-graphql-api-guide)
- [Pothos GraphQL — guide](https://pothos-graphql.dev/docs/guide) · [Pothos (GitHub)](https://github.com/hayes/pothos)
- [GraphQL Yoga — Cloudflare Workers integration](https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-cloudflare-workers)
- [graphql-yoga vs apollo-server vs mercurius 2026 (PkgPulse)](https://www.pkgpulse.com/guides/graphql-yoga-vs-apollo-server-vs-mercurius-graphql-2026)
- [graphql-yoga-worker-with-pothos (GitHub)](https://github.com/chimame/graphql-yoga-worker-with-pothos)

REST vs GraphQL vs tRPC + adoption:
- [REST vs GraphQL vs tRPC vs gRPC in 2026 (DEV/Pockit)](https://dev.to/pockit_tools/rest-vs-graphql-vs-trpc-vs-grpc-in-2026-the-definitive-guide-to-choosing-your-api-layer-1j8m)
- [GraphQL vs REST in 2026 (DevX)](https://www.devx.com/uncategorized/graphql-vs-rest-2026-which-api-style-wins/)

Runtime / portability:
- [Cloudflare Workers — Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) · [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Cloudflare Workers vs Vercel 2026 (morphllm)](https://www.morphllm.com/comparisons/cloudflare-workers-vs-vercel)
