# CLAUDE.md — ts-api

Project-specific context. General git/PR/commit/testing conventions live in the
global `~/.claude/CLAUDE.md`; this file consolidates my **adversarial review** rules
for TypeScript projects, gathered from `pnpm-demo` and `remote-claw`.

## Per-PR / per-change gate

Each change lands as its own reviewed PR (stacked when dependent — keep the stack
coherent per the global CLAUDE.md). Before a change is "done":

1. **Green the mechanical gate first.** All of these must pass clean before review:
   - `pnpm exec biome check .` (or `prettier --check` / the repo's formatter)
   - `pnpm exec tsc --noEmit`
   - `pnpm exec vitest run`
2. **Then the two-reviewer adversarial pass** (both, not one or the other — see below).
3. **Then CI green** before merging. No early stops: Test → Review → Wait → Green → Next.

**TypeScript is strict.** Enable and keep on: `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Fix the types — don't widen,
cast, or `any` around a real error.

## Reviewing each change (the adversarial loop)

Every commit goes through this loop before it lands — **no exceptions, docs included**:

1. **Gather the diff** (`git diff` / the change under review).
2. **Run the `/code-review` skill** on it (multi-angle finders → verify → gap sweep).
   It is self-runnable; the cloud `ultra` variant is the separate user-triggered/billed one.
3. **Run a `codex` adversarial pass** (`codex exec -s read-only`) as an **independent
   second reviewer** — both this *and* `/code-review`, never just one. For docs, have
   codex fact-check every claim against the code/data.
4. **For substantive code changes, add an adversarial verification pass:** skeptic agents
   (or codex) that try to *refute* each fix, plus a regression check that nothing that was
   supposed to stay fixed regressed (no published number / contract moved).
5. **Fix the root cause of every finding** and re-review until it comes back clean.
   Never skip, suppress, or rationalize a finding.
6. **Formatter clean** (`biome check` / `prettier --check`), then commit. The message
   describes what's actually in the diff (global CLAUDE.md commit conventions).

## Mandatory doc-sync pass

Whenever a doc lands (or data/claims it cites change), run a doc-sync pass before the work
is "done" — **mandatory, not a nicety**. It's the doc analogue of the per-commit review.
Fan it out across the affected docs (parallel agents / a workflow), each doc getting all
four lenses, then verify every finding and fix the root cause:

1. **Fairness / no-bias.** Every comparison is like-for-like (same scale, same regime).
   Flag any contrast pitting one option's best case against another's worst, any claim
   stronger than the evidence, any superlative not backed by data. State both sides; a
   real advantage of the non-recommended option is reported, not buried.
2. **No process archeology / hedging.** State results, not the path to them. No "assumed
   vs verified", "honest limitations", apologetic caveats, or iteration narration. A
   plainly sourced limitation stated as a fact is fine.
3. **Claim-tracing.** Every figure/claim traces to a real source field; extrapolations
   beyond the measured/known range are labeled as such. Read the cited source and confirm
   — don't trust from memory.
4. **Loose ends + cross-doc sync.** No dangling/stale references; no internal
   contradictions. Keep the cross-doc spine in sync (front-door index links every current
   companion doc; new findings folded into the right summary docs).

Run `codex exec -s read-only` as the independent second reviewer on each doc, same as the
per-commit loop. Gather genuinely open questions (decisions only the owner can make) into
a short list and surface them rather than silently resolving them.

## Writing style (docs, comments, commit messages, replies)

Plain technical prose. Match it in new docs, comments, commit messages, and replies.

- **No marketing or promotional language.** No "blazing fast", "powerful", "seamless",
  "effortless", "game-changing". (Plain technical uses are fine — "robust to X" meaning
  resilient.) Describe what something does and what it costs.
- **State results plainly; do not hedge.** A real limitation is a fact, not an apologetic
  caveat. Avoid filler ("it's worth noting", "of course", "simply", "just").
- **Every claim is backed by evidence.** No unbacked superlatives.
- **Lead with the result,** then the detail. Be terse.

## Working in this repo

- **Under `/effort` ultracode, parallelize with git worktrees** (`~/src/<name>` per the
  global layout). Fan independent review/edit streams out into separate worktrees and run
  them concurrently; remove each once its work merges.
- **Secrets** never go on argv, never get logged, never appear in any JSON/quiet output.
