import { createYoga, maskError as defaultMaskError } from 'graphql-yoga'
import type { DataStore } from '../core/index.js'
import { type GraphQLContext, schema } from './schema.js'

/** Error codes we intentionally raise and are safe to surface to clients. */
const CLIENT_ERROR_CODES = new Set(['BAD_USER_INPUT', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED'])

function clientErrorCode(error: unknown): string | undefined {
  const code = (error as { extensions?: { code?: unknown } }).extensions?.code
  return typeof code === 'string' && CLIENT_ERROR_CODES.has(code) ? code : undefined
}

/** Build a Fetch handler for the GraphQL schema, bound to a store and mount path. */
export function createYogaHandler(store: DataStore, endpoint: string) {
  const yoga = createYoga<Record<string, never>, GraphQLContext>({
    schema,
    graphqlEndpoint: endpoint,
    context: () => ({ store }),
    // Surface only intentional client errors (a known extensions.code on a real
    // GraphQLError); delegate everything else to Yoga's default masking so internals
    // never leak and its INTERNAL_SERVER_ERROR metadata is preserved.
    maskedErrors: {
      maskError: (error, message, isDev): Error => {
        if (error instanceof Error && clientErrorCode(error) !== undefined) return error
        return defaultMaskError(error, message, isDev) as Error
      },
    },
  })
  return (request: Request): Promise<Response> => Promise.resolve(yoga.fetch(request))
}
