# TypeScript API Approaches — REST, GraphQL, tRPC, gRPC, Express (2026)

This repo demos five API styles — REST, GraphQL, tRPC, gRPC/Connect, and Express — on **Vercel
or Cloudflare**. REST, GraphQL, and tRPC are Web **Fetch API** handlers that share one core and
both platform adapters. gRPC/Connect and Express are the exceptions: ConnectRPC has no native
edge Fetch adapter, and Express binds Node's `http` server, so both run on the Vercel/Node path
and are absent from the edge build. Express is the Node-only counterpart to the Hono REST demo —
the same surface on a different framework.

## TL;DR — the demos

| Style | Stack |
| --- | --- |
| **REST** | **Hono** + `@hono/zod-openapi` |
| **GraphQL** | **GraphQL Yoga** + **Pothos** code-first schema |
| **tRPC** | `@trpc/server` fetch adapter |
| **gRPC** | **ConnectRPC** (`@connectrpc/connect`), protobuf services via Connect's Node adapter |
| **Express** | **Express 5** on Node's `http` server — the REST surface, Vercel-only |
| **Validation / types** | **Zod** via Standard Schema, swappable for Valibot/ArkType |
| **Portability** | Web-standard `Request`/`Response`; one core, per-platform entry adapter |

## Landscape snapshot (mid-2026)

- TypeScript adoption is reported around ~69% of JS developers, ~93% of teams run REST, and
  ~67% of large orgs run REST and GraphQL together; GraphQL adoption is reported up ~340%
  since 2023 — [DEV/Pockit 2026](https://dev.to/pockit_tools/rest-vs-graphql-vs-trpc-vs-grpc-in-2026-the-definitive-guide-to-choosing-your-api-layer-1j8m).
- Express has ~35M weekly downloads and the largest middleware ecosystem — [Oflight 2026](https://www.oflight.co.jp/en/columns/hono-vs-express-fastify-elysia-comparison-2026).
  It still ships — [5.1 landed 2025-03-31](https://expressjs.com/en/blog/2025-03-31-v5-1-latest-release) —
  but it is Node-`http`-centric, so greenfield edge work favors Fetch-API frameworks.
- Cloudflare Workers run on V8 isolates and Vercel Functions run Node, but both accept a
  Web-standard `Request`/`Response` handler. That handler is the portable unit on both.

## REST: Hono + zod-openapi

One route definition yields request validation, an OpenAPI document, and a typed `hc` client:

```ts
// src/rest/users.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

const User = z.object({ id: z.string(), name: z.string() }).openapi('User')

const getUser = createRoute({
  method: 'get',
  path: '/users/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { content: { 'application/json': { schema: User } }, description: 'one user' } },
})

export const rest = new OpenAPIHono()
  .openapi(getUser, (c) => c.json({ id: c.req.valid('param').id, name: 'Ada' }))
  .doc('/openapi.json', { openapi: '3.0.0', info: { title: 'ts-api', version: '0' } })
```

```ts
// callers get end-to-end types from the same app, no codegen
import { hc } from 'hono/client'
const client = hc<typeof rest>('https://api.example.com')
const res = await client.users[':id'].$get({ param: { id: '1' } }) // typed body
```

Validators are Standard Schema, so Valibot/ArkType/TypeBox swap in via `@hono/valibot-validator`
and friends; `hono-openapi` generalizes the OpenAPI step across them. Default to **Zod**;
Valibot is the smaller-bundle option for tight edge budgets.

## GraphQL: GraphQL Yoga + Pothos

Pothos builds the schema in TypeScript; resolver return types are checked against the fields at
compile time, with no server-side codegen step:

```ts
// src/graphql/schema.ts
import SchemaBuilder from '@pothos/core'

const builder = new SchemaBuilder<{ Objects: { User: { id: string; name: string } } }>({})

builder.objectType('User', { fields: (t) => ({ id: t.exposeID('id'), name: t.exposeString('name') }) })
builder.queryType({
  fields: (t) => ({ user: t.field({ type: 'User', resolve: () => ({ id: '1', name: 'Ada' }) }) }),
})

export const schema = builder.toSchema()
```

```ts
// src/graphql/index.ts — yoga is itself a (Request) => Response handler
import { createYoga } from 'graphql-yoga'
import { schema } from './schema'

export const yoga = createYoga({ schema })
```

Apollo Server also runs on Workers via `@as-integrations/cloudflare-workers`; Yoga is
Fetch-native by default, which is why it is the pick here. Typed client operations still use
GraphQL Code Generator — the no-codegen claim is about the server schema.

Subscriptions break the single-core promise. Yoga's SSE transport works on both platforms, and
a single WebSocket connection serves directly on each. What does not survive a stateless model
is cross-connection coordination — rooms, fan-out, shared pub/sub — which needs Durable Objects
on Workers or an external broker like Upstash on Vercel. The demo core stays queries + mutations.

## tRPC: @trpc/server fetch adapter

No schema artifact — the router type itself is the contract, consumed by a TypeScript client:

```ts
// src/trpc/router.ts
import { initTRPC } from '@trpc/server'
import { z } from 'zod'

const t = initTRPC.create()

export const appRouter = t.router({
  user: t.procedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => ({ id: input.id, name: 'Ada' })),
})

export type AppRouter = typeof appRouter
```

```ts
// src/trpc/index.ts — fetchRequestHandler is a (Request) => Response, portable like the rest
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from './router'

export const trpc = (req: Request) =>
  fetchRequestHandler({ endpoint: '/trpc', req, router: appRouter })
```

```ts
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from './router'
const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: '/trpc' })] })
await client.user.query({ id: '1' }) // typed end-to-end, no generated artifact
```

The trade: inference-only types bind clients to TypeScript; there is no language-agnostic
contract a non-TS consumer can read.

## gRPC: ConnectRPC

Protobuf is the contract; Connect serves it as Connect, gRPC, and gRPC-Web from one endpoint:

```protobuf
// proto/user.proto
syntax = "proto3";
package user.v1;

message GetUserRequest { string id = 1; }
message User { string id = 1; string name = 2; }

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
}
```

```ts
// src/grpc/service.ts — register the generated service descriptor (protoc-gen-es v2)
import type { ConnectRouter } from '@connectrpc/connect'
import { UserService } from './gen/user_pb'

export const routes = (r: ConnectRouter) =>
  r.service(UserService, { getUser: async (req) => ({ id: req.id, name: 'Ada' }) })
```

Connect's official server adapters are Node, Express, Fastify, and Next — there is no native
edge Fetch adapter in v2 — so gRPC rides the Vercel/Node path, not a Workers Fetch handler. On
an HTTP/2-capable Node adapter the one endpoint serves Connect, gRPC, and gRPC-Web together, so
browser clients need no Envoy sidecar.

## Portability contract

REST, GraphQL, and tRPC are Fetch handlers, so they compose under one Hono app that both
adapters export:

```ts
// src/app.ts
import { Hono } from 'hono'
import { rest } from './rest/users'
import { yoga } from './graphql'
import { trpc } from './trpc'

export const app = new Hono()
  .route('/api', rest)
  .all('/graphql', (c) => yoga.fetch(c.req.raw))
  .all('/trpc/*', (c) => trpc(c.req.raw))
```

```ts
// src/adapters/cloudflare.ts
import { app } from '../app'
export default { fetch: app.fetch }
```

```ts
// src/adapters/vercel.ts — same app; Connect/gRPC attaches here via its Node adapter
import { app } from '../app'
export const GET = app.fetch
export const POST = app.fetch
```

```toml
# wrangler.toml
main = "src/adapters/cloudflare.ts"
compatibility_date = "2026-03-17"
compatibility_flags = ["nodejs_compat"]
```

Platform bindings — Cloudflare KV/R2/D1/Durable Objects, Vercel storage — sit behind an
interface in `core` so handlers never touch them directly. Durable Objects are Cloudflare-only
stateful-coordination lock-in. R2 and D1 are portable at the data/model layer — S3 and SQLite
semantics — but their bindings and APIs are Cloudflare-specific. Request-body caps, timeouts,
and streaming differ between the platforms, so validate body size and test both targets.

## Building the demos

```
src/
  core/       domain types, Zod schemas, DataStore + Config interfaces, stub Bearer check
  rest/       Hono app importing core
  graphql/    Yoga + Pothos importing core
  trpc/       @trpc/server router importing core
  grpc/       ConnectRPC service + generated protobuf, importing core
  express/    Express 5 app importing core (Node-only)
  adapters/   vercel/ and cloudflare/ entry points only
```

- **Persistence** — handlers depend on a `DataStore` interface in `core`, backed by D1 on
  Cloudflare and libSQL/Postgres on Vercel.
- **Config & secrets** — a `Config` interface loaded per adapter: `process.env` on Vercel,
  `env` binding via `wrangler secret` on Cloudflare.
- **Auth** — a stub `verifyBearer` check in `core` with the signature a real JWT verifier would
  have, ready to wire into any style behind one import (no style mounts it yet).
- **Testing** — Vitest unit tests on schemas/resolvers/handlers; smoke tests run each Fetch
  handler in-process and under `wrangler dev`. CI gate: lint + `tsc --noEmit` + `vitest run`.
- **Versions** — Node 24 LTS, TypeScript 6.x, Hono 4.x, `graphql-yoga` 5.x, Pothos 4.x,
  `@trpc/server` 11.x, `@connectrpc/connect` 2.x, Zod 4.x, pinned exactly and verified under
  `nodejs_compat`.

## Decisions

1. **Platforms are co-equal** — Vercel and Cloudflare are both first-class targets; neither is a
   mere portability proof.
2. **Datastore is SQLite** — D1 on Cloudflare, Turso/libSQL on Vercel, one `DataStore` interface
   over both.
3. **Subscriptions are in scope** — including the platform-specific transport work for fan-out.
4. **One deployment where the surface allows it** — the three Fetch styles (REST, GraphQL, tRPC)
   compose onto a single Hono app, the one edge/Vercel deployable. gRPC/Connect and Express have
   no edge Fetch adapter, so each rides the Vercel/Node path as its own function.
5. **Auth is a stub JWT** for now, behind the shared `core` middleware so a real provider can
   replace it later.

## Sources

REST / framework landscape:
- [Hono vs Express vs Fastify vs Elysia — 2026 (Oflight)](https://www.oflight.co.jp/en/columns/hono-vs-express-fastify-elysia-comparison-2026)
- [Best TypeScript Backend Frameworks 2026 (Encore)](https://encore.dev/resources/best-typescript-backend-frameworks-2026)
- [Hono — Cloudflare Workers getting started](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Hono — Zod OpenAPI example](https://hono.dev/examples/zod-openapi) · [`@hono/zod-openapi` (npm)](https://www.npmjs.com/package/@hono/zod-openapi) · [Hono RPC](https://hono.dev/docs/guides/rpc)
- [Express 5.1 release notes (2025-03-31)](https://expressjs.com/en/blog/2025-03-31-v5-1-latest-release)

GraphQL:
- [Build a GraphQL API with TypeScript in 2026 (Encore)](https://encore.dev/articles/typescript-graphql-api-guide)
- [Pothos GraphQL — guide](https://pothos-graphql.dev/docs/guide) · [Pothos (GitHub)](https://github.com/hayes/pothos)
- [GraphQL Yoga — Cloudflare Workers integration](https://the-guild.dev/graphql/yoga-server/docs/integrations/integration-with-cloudflare-workers)
- [Apollo Server — Cloudflare Workers integration](https://github.com/apollo-server-integrations/apollo-server-integration-cloudflare-workers)

tRPC / gRPC:
- [tRPC — Fetch / edge adapter](https://trpc.io/docs/server/adapters/fetch)
- [ConnectRPC for ECMAScript](https://connectrpc.com/docs/web/getting-started/) · [Connect Node/Fetch handlers](https://connectrpc.com/docs/node/getting-started/)

REST vs GraphQL vs tRPC vs gRPC + adoption:
- [REST vs GraphQL vs tRPC vs gRPC in 2026 (DEV/Pockit)](https://dev.to/pockit_tools/rest-vs-graphql-vs-trpc-vs-grpc-in-2026-the-definitive-guide-to-choosing-your-api-layer-1j8m)
- [GraphQL vs REST in 2026 (DevX)](https://www.devx.com/uncategorized/graphql-vs-rest-2026-which-api-style-wins/)

Runtime / portability:
- [Cloudflare Workers — Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) · [Compatibility flags](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Cloudflare Workers vs Vercel 2026 (morphllm)](https://www.morphllm.com/comparisons/cloudflare-workers-vs-vercel)
- [Standard Schema](https://standardschema.dev/)
