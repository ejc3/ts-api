import type { Config } from './types'

/**
 * Build Config from a platform env bag (process.env on Vercel, the env binding on
 * Workers). Values are validated, not trusted: a Workers binding can be a non-string,
 * so anything that is not a non-empty string falls back to the dev default.
 */
export function configFromEnv(env: Record<string, string | undefined>): Config {
  const secret = env.JWT_SECRET
  return { jwtSecret: typeof secret === 'string' && secret !== '' ? secret : 'dev-secret' }
}
