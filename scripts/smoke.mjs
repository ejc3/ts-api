#!/usr/bin/env node
// Live smoke test: hit each API style on a deployed base URL and assert the seeded users
// come back. Read-only — it never writes, so running it against production leaves no rows
// behind. Exits non-zero on the first failed style.
//
//   node scripts/smoke.mjs --url https://ts-api.vercel.app
//   node scripts/smoke.mjs --url https://ts-api.ejc3-ts.workers.dev --styles rest,trpc,graphql
//
// The deploy workflows call it after a deploy; it is equally runnable by hand.

const SEEDED = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Linus' },
]

/** Each style: how to call it and how to pull the users array out of its response shape. */
const STYLES = {
  rest: {
    request: (base) => fetchJson(`${base}/api/users`),
    users: (body) => body,
  },
  trpc: {
    request: (base) => fetchJson(`${base}/trpc/users.list`),
    users: (body) => body?.result?.data,
  },
  graphql: {
    request: (base) =>
      fetchJson(`${base}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ users { id name } }' }),
      }),
    users: (body) => body?.data?.users,
  },
  grpc: {
    // ConnectRPC speaks JSON over POST, so no generated client is needed to probe it.
    request: (base) =>
      fetchJson(`${base}/user.v1.UserService/ListUsers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    users: (body) => body?.users,
  },
  express: {
    request: (base) => fetchJson(`${base}/express/users`),
    users: (body) => body,
  },
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === '--url') out.url = value
    else if (flag === '--styles') out.styles = value
    else throw new Error(`unknown argument: ${flag}`)
  }
  return out
}

async function fetchJson(url, init) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 200)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`non-JSON response from ${url}: ${text.slice(0, 200)}`)
  }
}

/** Assert every seeded user is present with the right id, ignoring extras created elsewhere. */
function assertSeeded(users, style) {
  if (!Array.isArray(users)) {
    throw new Error(`${style}: expected a users array, got ${JSON.stringify(users)?.slice(0, 200)}`)
  }
  for (const want of SEEDED) {
    const got = users.find((u) => String(u?.id) === want.id)
    if (!got) throw new Error(`${style}: missing seeded user id=${want.id} (${want.name})`)
    if (got.name !== want.name) {
      throw new Error(`${style}: user id=${want.id} is "${got.name}", expected "${want.name}"`)
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) throw new Error('missing --url <base>')
  const base = args.url.replace(/\/$/, '')
  const styles = (args.styles ?? Object.keys(STYLES).join(',')).split(',').map((s) => s.trim())

  let failed = 0
  for (const style of styles) {
    const spec = STYLES[style]
    if (!spec) throw new Error(`unknown style: ${style} (known: ${Object.keys(STYLES).join(', ')})`)
    try {
      assertSeeded(spec.users(await spec.request(base)), style)
      console.log(`ok    ${style}`)
    } catch (err) {
      failed += 1
      console.error(`FAIL  ${style}: ${err.message}`)
    }
  }

  if (failed > 0) {
    console.error(`\n${failed}/${styles.length} styles failed against ${base}`)
    process.exit(1)
  }
  console.log(`\nall ${styles.length} styles ok against ${base}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
