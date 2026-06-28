import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'

interface GraphQLBody {
  data?: Record<string, unknown>
  errors?: { message: string; extensions?: { code?: string } }[]
}

async function gql(
  app: ReturnType<typeof buildApp>,
  query: string,
  variables?: Record<string, unknown>,
): Promise<{ status: number; body: GraphQLBody }> {
  const res = await app.request('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return { status: res.status, body: (await res.json()) as GraphQLBody }
}

describe('GraphQL (integration)', () => {
  it('queries all users', async () => {
    const { status, body } = await gql(buildApp(), '{ users { id name } }')
    expect(status).toBe(200)
    expect(body.data?.users).toEqual([
      { id: '1', name: 'Ada' },
      { id: '2', name: 'Linus' },
    ])
  })

  it('queries a single user by id', async () => {
    const { body } = await gql(buildApp(), 'query($id: ID!){ user(id: $id){ name } }', { id: '1' })
    expect(body.data?.user).toEqual({ name: 'Ada' })
  })

  it('returns null for a missing user', async () => {
    const { body } = await gql(buildApp(), 'query($id: ID!){ user(id: $id){ name } }', {
      id: '999',
    })
    expect(body.data?.user).toBeNull()
    expect(body.errors).toBeUndefined()
  })

  it('creates a user via mutation', async () => {
    const { body } = await gql(
      buildApp(),
      'mutation($n: String!){ createUser(name: $n){ id name } }',
      {
        n: 'Grace',
      },
    )
    expect(body.data?.createUser).toMatchObject({ name: 'Grace' })
  })

  it('rejects an empty or whitespace-only name with BAD_USER_INPUT (HTTP 200)', async () => {
    for (const name of ['', '   ']) {
      const { status, body } = await gql(
        buildApp(),
        'mutation($n: String!){ createUser(name: $n){ id } }',
        { n: name },
      )
      expect(status).toBe(200)
      expect(body.data?.createUser ?? null).toBeNull()
      expect(body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT')
    }
  })

  it('trims the stored name', async () => {
    const { body } = await gql(buildApp(), 'mutation{ createUser(name: "  Grace  "){ name } }')
    expect(body.data?.createUser).toEqual({ name: 'Grace' })
  })

  it('rejects an unknown field at validation time (HTTP 200)', async () => {
    const { status, body } = await gql(buildApp(), '{ users { id bogus } }')
    expect(status).toBe(200)
    expect(body.errors?.[0]?.message).toMatch(/bogus/)
  })

  it('serves queries over GET as well as POST', async () => {
    const query = encodeURIComponent('{ users { id } }')
    const res = await buildApp().request(`/graphql?query=${query}`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as GraphQLBody).data?.users).toHaveLength(2)
  })

  it('supports introspection', async () => {
    const { body } = await gql(buildApp(), '{ __schema { queryType { name } } }')
    expect(body.data?.__schema).toMatchObject({ queryType: { name: 'Query' } })
  })
})
