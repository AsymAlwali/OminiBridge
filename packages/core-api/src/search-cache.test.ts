import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getCacheFailureMode, getSearchCache, inMemorySearchCache } from './search-cache.js'

test('in-memory cache expires entries and refreshes recency when read', async () => {
  const key = `test-${Date.now()}`
  const response = { success: true }
  await inMemorySearchCache.set(key, response, 20)
  assert.deepEqual(await inMemorySearchCache.get(key), response)
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.equal(await inMemorySearchCache.get(key), undefined)
})

test('selects memory only for explicit development mode by default', () => {
  const previousAuthMode = process.env.AUTH_MODE
  const previousBackend = process.env.SEARCH_CACHE_BACKEND
  const previousFailureMode = process.env.SEARCH_CACHE_FAILURE_MODE
  try {
    delete process.env.SEARCH_CACHE_BACKEND
    process.env.AUTH_MODE = 'development'
    assert.equal(getSearchCache(), inMemorySearchCache)
    process.env.AUTH_MODE = 'required'
    assert.notEqual(getSearchCache(), inMemorySearchCache)
    process.env.SEARCH_CACHE_BACKEND = 'unknown'
    assert.throws(() => getSearchCache(), /SEARCH_CACHE_BACKEND/)
    process.env.SEARCH_CACHE_FAILURE_MODE = 'unknown'
    assert.throws(() => getCacheFailureMode(), /SEARCH_CACHE_FAILURE_MODE/)
  } finally {
    if (previousAuthMode === undefined) delete process.env.AUTH_MODE
    else process.env.AUTH_MODE = previousAuthMode
    if (previousBackend === undefined) delete process.env.SEARCH_CACHE_BACKEND
    else process.env.SEARCH_CACHE_BACKEND = previousBackend
    if (previousFailureMode === undefined) delete process.env.SEARCH_CACHE_FAILURE_MODE
    else process.env.SEARCH_CACHE_FAILURE_MODE = previousFailureMode
  }
})
