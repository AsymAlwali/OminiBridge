import { redisSearchCache } from './redis.js'

export interface SearchCache {
  get(key: string): Promise<Record<string, unknown> | undefined>
  set(key: string, value: Record<string, unknown>, ttlMs: number): Promise<void>
}

export type CacheFailureMode = 'bypass' | 'fail'

interface MemoryEntry {
  expiresAt: number
  response: Record<string, unknown>
}

const memoryCache = new Map<string, MemoryEntry>()
const maxMemoryEntries = 500

export const inMemorySearchCache: SearchCache = {
  async get(key) {
    const now = Date.now()
    for (const [entryKey, entry] of memoryCache) {
      if (entry.expiresAt <= now) memoryCache.delete(entryKey)
    }
    const entry = memoryCache.get(key)
    if (!entry) return undefined
    memoryCache.delete(key)
    memoryCache.set(key, entry)
    return entry.response
  },
  async set(key, response, ttlMs) {
    const now = Date.now()
    for (const [entryKey, entry] of memoryCache) {
      if (entry.expiresAt <= now) memoryCache.delete(entryKey)
    }
    memoryCache.delete(key)
    memoryCache.set(key, { expiresAt: now + ttlMs, response })
    while (memoryCache.size > maxMemoryEntries) {
      const oldestKey = memoryCache.keys().next().value
      if (oldestKey === undefined) break
      memoryCache.delete(oldestKey)
    }
  }
}

export function getSearchCache() {
  const configuredBackend = process.env.SEARCH_CACHE_BACKEND
  const backend = configuredBackend ?? (process.env.AUTH_MODE === 'development' ? 'memory' : 'redis')
  if (backend === 'redis') return redisSearchCache
  if (backend === 'memory') return inMemorySearchCache
  throw new Error('SEARCH_CACHE_BACKEND must be either redis or memory.')
}

export function getCacheFailureMode(): CacheFailureMode {
  const mode = process.env.SEARCH_CACHE_FAILURE_MODE ?? 'bypass'
  if (mode !== 'bypass' && mode !== 'fail') {
    throw new Error("SEARCH_CACHE_FAILURE_MODE must be either 'bypass' or 'fail'.")
  }
  return mode
}
