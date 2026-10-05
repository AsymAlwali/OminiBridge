import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readPositiveInteger, TenantRateLimiter, type AtomicCounter } from './rate-limiter.js'

test('uses a tenant-specific atomic bucket and enforces the configured limit', async () => {
  const counts = new Map<string, number>()
  const counter: AtomicCounter = {
    async incrementWithExpiry(key, windowMs) {
      assert.equal(windowMs, 60_000)
      assert.match(key, /^omnibridge:rate-limit:tenant-[ab]:$/)
      const count = (counts.get(key) ?? 0) + 1
      counts.set(key, count)
      return { count, ttlMs: 32_000 }
    }
  }
  const limiter = new TenantRateLimiter(counter, 2, 60_000)

  assert.deepEqual(await limiter.consume('tenant-a'), {
    allowed: true, limit: 2, remaining: 1, retryAfterSeconds: 32
  })
  assert.equal((await limiter.consume('tenant-a')).allowed, true)
  assert.deepEqual(await limiter.consume('tenant-a'), {
    allowed: false, limit: 2, remaining: 0, retryAfterSeconds: 32
  })
  assert.equal((await limiter.consume('tenant-b')).allowed, true)
})

test('validates deployment rate-limit configuration', () => {
  assert.equal(readPositiveInteger(undefined, 60, 'RATE_LIMIT_MAX_REQUESTS'), 60)
  assert.equal(readPositiveInteger('17', 60, 'RATE_LIMIT_MAX_REQUESTS'), 17)
  assert.throws(() => readPositiveInteger('0', 60, 'RATE_LIMIT_MAX_REQUESTS'), /positive integer/)
  assert.throws(() => readPositiveInteger('nope', 60, 'RATE_LIMIT_MAX_REQUESTS'), /positive integer/)
})
