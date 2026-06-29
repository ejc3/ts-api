/**
 * The one user-name rule every style enforces: trim, then require non-empty.
 * Returns the normalized name, or null when invalid. REST and tRPC encode the same
 * rule with `z.string().trim().min(1)`; GraphQL and gRPC call this directly.
 */
export function normalizeUserName(name: string): string | null {
  const trimmed = name.trim()
  return trimmed === '' ? null : trimmed
}
