import type { Config, Principal } from './types'

/**
 * STUB auth: treats the bearer token as the user id. Same signature a real JWT
 * verifier would have, so it can be swapped in without touching call sites.
 */
export function verifyBearer(authHeader: string | undefined, _config: Config): Principal | null {
  if (authHeader === undefined) return null
  const prefix = 'Bearer '
  if (!authHeader.startsWith(prefix)) return null
  const token = authHeader.slice(prefix.length).trim()
  if (token === '') return null
  return { userId: token }
}
