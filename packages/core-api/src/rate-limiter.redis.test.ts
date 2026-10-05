import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { closeRedisClient, getRedisClient, redisCounter } from './redis.js'
import { TenantRateLimiter } from './rate-limiter.js'

test('registers one error listener on the shared Redis client', {
  skip: !process.env.REDIS_URL
}, async () => {
  try {
    const client = await getRedisClient()
    const listenerCount = client.listenerCount('error')
    for (let index = 0; index < 20; index++) await getRedisClient()
    assert.equal(client.listenerCount('error'), listenerCount)
  } finally {
    await closeRedisClient()
  }
})

test('shares atomic rate-limit counts between limiter instances in Redis', {
  skip: !process.env.REDIS_URL
}, async () => {
  const tenantId = `redis-test-${randomUUID()}`
  const firstInstance = new TenantRateLimiter(redisCounter, 2, 60_000)
  const secondInstance = new TenantRateLimiter(redisCounter, 2, 60_000)
  try {
    assert.equal((await firstInstance.consume(tenantId)).allowed, true)
    assert.equal((await secondInstance.consume(tenantId)).allowed, true)
    assert.equal((await firstInstance.consume(tenantId)).allowed, false)
  } finally {
    await closeRedisClient()
  }
})
