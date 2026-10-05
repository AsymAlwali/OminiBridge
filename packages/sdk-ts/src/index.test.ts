import assert from 'node:assert/strict'
import { test } from 'node:test'
import { OmniBridge, OmniBridgeError } from './index.js'

test('throws a typed error with server details for non-success responses', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(
    JSON.stringify({ success: false, error: 'API key revoked.' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  )
  try {
    const bridge = new OmniBridge({ apiKey: 'test-key' })
    await assert.rejects(bridge.search({ query: 'test' }), (error: unknown) => {
      assert.ok(error instanceof OmniBridgeError)
      assert.equal(error.status, 401)
      assert.equal(error.message, 'API key revoked.')
      assert.deepEqual(error.responseBody, { success: false, error: 'API key revoked.' })
      return true
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('returns parsed bodies for successful responses', async () => {
  const originalFetch = globalThis.fetch
  let authorization: string | null = null
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init?.headers).get('Authorization')
    return Response.json({ success: true, results: [] })
  }
  try {
    const bridge = new OmniBridge({ apiKey: 'test-key' })
    assert.deepEqual(await bridge.search({ query: 'test' }), { success: true, results: [] })
    assert.equal(authorization, 'Bearer test-key')
  } finally {
    globalThis.fetch = originalFetch
  }
})
