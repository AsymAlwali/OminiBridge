export interface AtomicCounter {
  incrementWithExpiry(key: string, expiryMs: number): Promise<{ count: number; ttlMs: number }>
}

export interface RateLimitDecision {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

export function readPositiveInteger(value: string | undefined, fallback: number, name: string) {
  if (value === undefined) return fallback
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer.`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a positive safe integer.`)
  return parsed
}

export class TenantRateLimiter {
  constructor(
    private readonly counter: AtomicCounter,
    private readonly limit: number,
    private readonly windowMs: number
  ) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Rate limit must be a positive integer.')
    if (!Number.isSafeInteger(windowMs) || windowMs < 1) throw new Error('Rate-limit window must be a positive integer.')
  }

  async consume(tenantId: string): Promise<RateLimitDecision> {
    const key = `omnibridge:rate-limit:${tenantId}:`
    const result = await this.counter.incrementWithExpiry(key, this.windowMs)
    return {
      allowed: result.count <= this.limit,
      limit: this.limit,
      remaining: Math.max(0, this.limit - result.count),
      retryAfterSeconds: Math.max(1, Math.ceil(result.ttlMs / 1000))
    }
  }
}
