# Turso persistence

The Node/Vercel deploys persist to [Turso](https://turso.tech) (hosted libSQL) through
the same `DataStore` interface the Cloudflare deploys use over D1. `resolveNodeStore`
selects the Turso-backed `SqliteStore` when `TURSO_DATABASE_URL` is set and otherwise
falls back to the in-memory demo seed:

```ts
// src/core/turso.ts
export function resolveNodeStore(
  env: Record<string, string | undefined>,
  fallback: DataStore = new InMemoryStore(DEMO_USERS),
): DataStore {
  const url = env.TURSO_DATABASE_URL
  if (url === undefined || url === '') return fallback
  const authToken = env.TURSO_AUTH_TOKEN
  const client = createClient(authToken ? { url, authToken } : { url })
  return new SqliteStore(tursoDriver(client), DEMO_USERS)
}
```

The connection itself is two env vars (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`).
Populating them is the work; the credential traps below are why.

## Turso has two kinds of credentials — don't mix them up

Turso issues two unrelated token types that authenticate to two different hosts:

| Token | Authenticates to | Used for | Minted by |
| --- | --- | --- | --- |
| **Platform API token** | `api.turso.tech` | Managing the account: create/destroy databases, manage groups, mint connection tokens | `turso auth token` / dashboard |
| **Connection token** | `libsql://<db>-<org>.turso.io` | Connecting a client to a database to read/write rows | `turso db tokens create <db>` (one db) or `turso group tokens create <group>` (a group) |

The connection token is the `TURSO_AUTH_TOKEN` value (a per-group token is
`TURSO_GROUP_AUTH_TOKEN`); both pair with `TURSO_DATABASE_URL`. `TURSO_ORG` and
`TURSO_GROUP` are identifiers, not credentials.

The application only needs a **connection** token. Provisioning the database needs the
**platform** token (or an authenticated CLI). A connection token cannot create a database,
and a platform token is not a connection string.

## The Vercel↔Turso integration doesn't hand you a platform token

Reusing an existing Turso account by pulling its credentials out of another project's
Vercel↔Turso integration (`vercel env pull`) does not yield a usable platform token. In
this project the pulled production env came back as:

```
TURSO_DATABASE_URL=libsql://…turso.io   # set (91 chars)
TURSO_AUTH_TOKEN=eyJ…                    # set (267-char JWT)
TURSO_API_TOKEN=                          # empty
TURSO_ORG=                                # empty
TURSO_GROUP=                              # empty
TURSO_GROUP_AUTH_TOKEN=                   # empty
```

The integration populates the connection pair a deployed app reads and leaves the
platform-management variables empty — those are marked sensitive and aren't exposed to a
plain env pull. Feeding the empty value (or, from the dashboard, a Vercel sensitive-value
envelope, `{"v":…,"c":…,"k":…}`) to the CLI fails at the JWT parser rather than at the API:

```
$ TURSO_API_TOKEN=… turso db create ts-api
Error: token contains an invalid number of segments
```

A JWT has three dot-separated segments; an empty string or an envelope has the wrong count,
so the request never reaches `api.turso.tech`.

## Provisioning needs an authenticated CLI

With no reusable platform token, the database is created through an authenticated CLI
session. `turso auth login` authenticates in a browser — there is a `--headless` variant
that prints a URL to open elsewhere, but a human still has to complete it, so CI can't do it
unattended:

```bash
turso auth login                       # browser auth, one time
turso db create ts-api --group rc      # create the database
turso db show ts-api --url             # -> libsql://ts-api-…turso.io  (TURSO_DATABASE_URL)
turso db tokens create ts-api          # -> connection token            (TURSO_AUTH_TOKEN)
```

## Wiring the credentials into Vercel

The connection pair goes into the Vercel project for both `production` and `preview`, so
preview deploys persist too. Setting `production` over stdin works:

```bash
printf '%s' "$URL"   | vercel env add TURSO_DATABASE_URL production
printf '%s' "$TOKEN" | vercel env add TURSO_AUTH_TOKEN  production
```

The Vercel CLI used here (54.13.0) rejects the `preview` form, including with `--yes`,
asking for a git branch it then declines to default:

```
reason: "git_branch_required"
message: "Add … to which Git branch for Preview? Pass branch as third argument,
          or omit for all Preview branches."
```

The REST API has no such requirement — post each variable with `target: ["preview"]` and no
branch (repeat for `TURSO_AUTH_TOKEN`):

```bash
curl -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H 'Content-Type: application/json' \
  -d '{"key":"TURSO_DATABASE_URL","value":"libsql://…","type":"encrypted","target":["preview"]}'
```

## Schema and seeding need no migration

`SqliteStore.init()` runs `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY
AUTOINCREMENT, name TEXT NOT NULL)` and seeds `DEMO_USERS` with `INSERT OR IGNORE` on first
use, so a freshly created Turso database is ready on the first request over the same code
path D1 uses. There is no separate migration step and no schema drift between the two
backends.

## Verifying durability

A write through the deployed API must survive as a row in the database, independent of the
serverless process:

```bash
id=$(curl -s -X POST https://ts-api.vercel.app/api/users \
  -H 'content-type: application/json' -d '{"name":"Grace"}' | jq -r .id)

turso db shell ts-api "SELECT id, name FROM users WHERE id = $id;"   # the new row
```

Reading the row back through `turso db shell` — a different client than the Vercel function
— confirms the write reached Turso rather than living in process memory.
