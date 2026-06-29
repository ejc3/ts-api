# Latency decomposition

The 89 ms a client sees calling this API from across the country is almost all network.
The benchmark here strips the layers off one at a time — framework dispatch, the HTTP
socket, the database read, the client network — so each shows its own cost.

## Result

Median p50 over 60 runs on the deployed bench. The bench's own `region` field reported
`vercel:iad1`; the Turso database is `aws-us-east-1` (from its libSQL URL). `n=25` per socket
run, `n=50` per in-process run:

| p50 (ms) | REST | tRPC | GraphQL | gRPC | Express |
| --- | --- | --- | --- | --- | --- |
| in-process `hello` (dispatch only) | 0.12 | 0.20 | 0.29 | — | — |
| socket `hello` (+ HTTP/TCP) | 0.58 | 0.73 | 2.19 | 0.87 | 0.53 |
| in-process `list` (+ Turso read) | 3.29 | 3.58 | 3.76 | — | — |
| socket `list` (+ socket + Turso) | 3.80 | 3.87 | 5.53 | 4.13 | 3.76 |

`—` marks the in-process path gRPC and Express don't have — both bind `node:http`, so they are
measured only over the socket. Read **down** a column, not across: each style's `hello` is a
different op (a GraphQL `hello` is a POST query; REST/tRPC/Express `hello` is a trivial GET), so
the absolute `hello` values are not comparable across styles. The one cross-style-comparable
number is the within-style `list − hello` delta, and on it the five tie: the socket delta is
**≈3.2 ms for every style** (3.15–3.34 ms — REST 3.23, tRPC 3.15, GraphQL 3.34, gRPC 3.26,
Express 3.22) — the SQL read costs the same regardless of framework; only the protocol envelope
differs.

Each layer adds to the one above it:

- **Framework dispatch** (`hello`, no DataStore access): **0.12–0.29 ms**, REST < tRPC < GraphQL.
- **+ HTTP/TCP socket**: +0.46 (REST), +0.53 (tRPC), **+1.90 (GraphQL)** ms. GraphQL's `hello`
  does the most per request — a POST body to read off the socket, then parse, validate, and
  execute the query — where REST/tRPC/Express `hello` is a trivial GET.
- **+ Turso read** (in-process `list − hello`): **~3.2–3.5 ms**, the libSQL round-trip to the
  co-located east-region database.
- **+ client network**: the original client-side run (US-west client → `iad1`) measured
  **~89 ms** for every style — the ~85 ms cross-country round-trip dwarfs everything above.

The medians are stable: per-run p50 moved little across the 60 runs (REST `hello`
`[0.53, 0.97]`, GraphQL `hello` `[2.10, 2.76]`). The high p95 numbers are rare tail spikes —
isolated runs reached the tens of milliseconds, up to ~69 ms (one in-process tRPC `list` run),
while the median p95 stayed under ~9 ms. The benchmark does not isolate their cause; they leave
the median unmoved.

## How it works

One entry point runs the request loop on the server, so the client pays the network once and
the per-style timings are taken next to the handlers. Every style exposes two ops: `hello`
(no DataStore access) and `list` (the SQL-backed read), so the read cost separates from
dispatch.

```
GET /bench                  in-process app.fetch, no socket (REST/tRPC/GraphQL)
GET /bench?mode=loopback    server-side HTTPS round-trip to the project, all five (Vercel)
GET /bench-socket           one node:http loopback server fronting all five, timed over a socket
```

- **in-process** calls the app's own handlers via `app.fetch` — no socket — so only dispatch
  and the DataStore read remain. Runs on both platforms (the three Fetch styles).
- **socket** stands up one ephemeral `node:http` server on `127.0.0.1` fronting all five
  frameworks (Hono via `@hono/node-server`, gRPC via Connect's Node adapter, Express) and times
  each over a real loopback socket. The socket−in-process delta is the HTTP/TCP cost. Node-only.
- **loopback** times all five via same-origin HTTPS to the project's production URL, in-region.

`scripts/bench.mjs --url <base>` is the client-side counterpart that includes the network.

## It is a closed probe, not an open proxy

There is no caller-supplied target. The query params are `mode`, `n` (clamped: ≤50 in-process,
≤25 networked), and `styles` (intersected with a fixed allowlist and deduped, so
`styles=rest,rest,...` cannot multiply the work). Targets are hardcoded same-origin paths; the
loopback origin is a trusted server constant (`VERCEL_PROJECT_PRODUCTION_URL`), never the
request `Host`. The probes call only read endpoints, so the bench creates no users, and a
non-2xx probe throws rather than being timed as a fast success. The socket server binds loopback
only and is always torn down.

## Platform notes

- **gRPC and Express are Vercel-only.** Both bind Node's `http` server, which the Cloudflare
  Workers V8-isolate runtime does not provide; `/bench-socket` cannot run on a Worker at all.
  The three Fetch styles run unchanged on both platforms.
- **Cloudflare cannot resolve dispatch timings.** Workers coarsen `performance.now()` between
  I/O as a side-channel mitigation, so a no-I/O op (`hello`) reads ~0 on a Worker and only `list`
  — which makes a D1 call — advances the clock. The in-process response carries a caveat there;
  read dispatch timings from the Node (Vercel) runtime.
- Tail percentiles need the default sample count to be meaningful; `n` below ~10 makes p90/p95
  collapse toward the max.
