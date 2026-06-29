#!/usr/bin/env node
// Small latency benchmark: the same read ("list users") on every API style, on each
// deployment. Read-only, so it leaves no rows behind and is safe against production.
// Sequential from one client with a short warmup, so the numbers are warm-path latency
// from THIS host — directional, not a controlled microbenchmark.
//
//   node scripts/bench.mjs --url https://ts-api.vercel.app --styles rest,trpc,graphql,grpc,express
//   node scripts/bench.mjs --url https://ts-api.ejc3-ts.workers.dev --styles rest,trpc,graphql
//
// Flags: --url <base> (required), --styles a,b,c (default all), --n <count> (default 40),
//        --warmup <count> (default 5), --label <name> (for the header).

const STYLES = {
  rest: (base) => [`${base}/api/users`, undefined],
  trpc: (base) => [`${base}/trpc/users.list`, undefined],
  graphql: (base) => [
    `${base}/graphql`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{ users { id name } }' }),
    },
  ],
  grpc: (base) => [
    `${base}/user.v1.UserService/ListUsers`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
  ],
  express: (base) => [`${base}/express/users`, undefined],
}

function parseArgs(argv) {
  const out = { n: 40, warmup: 5 }
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]]
    if (flag === '--url') out.url = value
    else if (flag === '--styles') out.styles = value
    else if (flag === '--n') out.n = Number(value)
    else if (flag === '--warmup') out.warmup = Number(value)
    else if (flag === '--label') out.label = value
    else throw new Error(`unknown argument: ${flag}`)
  }
  return out
}

async function timeOne(url, init) {
  const t0 = performance.now()
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  await res.text() // drain the body so we time the full response
  const ms = performance.now() - t0
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return ms
}

function pct(sorted, p) {
  if (sorted.length === 0) return Number.NaN
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.url) throw new Error('missing --url <base>')
  const base = args.url.replace(/\/$/, '')
  const styles = (args.styles ?? Object.keys(STYLES).join(',')).split(',').map((s) => s.trim())

  console.log(`# ${args.label ?? base}  (n=${args.n}, warmup=${args.warmup})`)
  console.log('style    min    p50    p90    p95    max   mean   (ms)')
  for (const style of styles) {
    const make = STYLES[style]
    if (!make) throw new Error(`unknown style: ${style}`)
    const [url, init] = make(base)
    try {
      for (let i = 0; i < args.warmup; i++) await timeOne(url, init)
      const samples = []
      for (let i = 0; i < args.n; i++) samples.push(await timeOne(url, init))
      samples.sort((a, b) => a - b)
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      const f = (x) => x.toFixed(0).padStart(5)
      console.log(
        `${style.padEnd(8)} ${f(samples[0])} ${f(pct(samples, 50))} ${f(pct(samples, 90))} ${f(pct(samples, 95))} ${f(samples[samples.length - 1])} ${f(mean)}`,
      )
    } catch (err) {
      console.log(`${style.padEnd(8)} ERROR: ${err.message}`)
    }
  }
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
