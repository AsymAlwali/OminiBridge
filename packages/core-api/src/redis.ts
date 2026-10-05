import { createClient } from 'redis'
import type { AtomicCounter } from './rate-limiter.js'

const incrementScript = `
local time = redis.call('TIME')
local now_ms = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local window_ms = tonumber(ARGV[1])
local bucket = math.floor(now_ms / window_ms)
local key = KEYS[1] .. bucket
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('PEXPIRE', key, window_ms - (now_ms % window_ms))
end
return {count, redis.call('PTTL', key)}
`

type RedisClient = ReturnType<typeof createClient>
let client: RedisClient | undefined
let connecting: Promise<RedisClient> | undefined

export async function getRedisClient() {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL is required for shared rate limiting.')
  if (!client) {
    client = createClient({
      url,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: (retries) => retries < 2 ? 100 * (retries + 1) : false
      }
    })
    client.on('error', () => {
      console.error('Redis connection error while enforcing tenant rate limits.')
    })
  }
  if (!client.isOpen) {
    connecting ??= client.connect().then(() => client!).finally(() => {
      connecting = undefined
    })
    await connecting
  }
  return client
}

export const redisCounter: AtomicCounter = {
  async incrementWithExpiry(key, windowMs) {
    const connection = await getRedisClient()
    const result = await connection.eval(incrementScript, {
      keys: [key],
      arguments: [String(windowMs)]
    })
    if (!Array.isArray(result) || result.length !== 2 ||
      typeof result[0] !== 'number' || typeof result[1] !== 'number') {
      throw new Error('Redis returned an invalid rate-limit counter result.')
    }
    return { count: result[0], ttlMs: Math.max(0, result[1]) }
  }
}

export const redisSearchCache = {
  async get(key: string): Promise<Record<string, unknown> | undefined> {
    const serialized = await (await getRedisClient()).get(key)
    if (serialized === null) return undefined
    const value: unknown = JSON.parse(serialized)
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Redis returned an invalid cached search response.')
    }
    return value as Record<string, unknown>
  },
  async set(key: string, value: Record<string, unknown>, ttlMs: number) {
    await (await getRedisClient()).set(key, JSON.stringify(value), { PX: ttlMs })
  }
}

export async function closeRedisClient() {
  connecting = undefined
  if (client?.isOpen) await client.quit()
  client = undefined
}
