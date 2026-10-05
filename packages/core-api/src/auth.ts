import { createHash, timingSafeEqual } from 'node:crypto'

export const API_KEY_PREFIX_LENGTH = 22

export interface ApiKeyRecord {
  id: string
  tenantId: string
  keyHash: string
  scopes: string[]
}

export interface ApiKeyStore {
  findActiveApiKeyByPrefix(prefix: string): Promise<ApiKeyRecord | undefined>
}

export type AuthenticationResult =
  | { ok: true; apiKey: ApiKeyRecord }
  | { ok: false; status: 401 | 403; error: string }

export function hashApiKey(apiKey: string) {
  return createHash('sha256').update(apiKey).digest('hex')
}

export async function authenticateApiKey(
  authorization: string | undefined,
  requiredScope: string,
  store: ApiKeyStore
): Promise<AuthenticationResult> {
  const match = authorization?.match(/^Bearer (omni_live_[A-Za-z0-9_-]{43})$/i)
  if (!match) return { ok: false, status: 401, error: 'A valid bearer API key is required.' }

  const apiKey = match[1]
  const prefix = apiKey.slice(0, API_KEY_PREFIX_LENGTH)
  const record = await store.findActiveApiKeyByPrefix(prefix)
  const suppliedHash = Buffer.from(hashApiKey(apiKey), 'hex')
  const storedHash = record ? Buffer.from(record.keyHash, 'hex') : Buffer.alloc(suppliedHash.length)
  const validHash = suppliedHash.length === storedHash.length &&
    timingSafeEqual(suppliedHash, storedHash)

  if (!record || !validHash) {
    return { ok: false, status: 401, error: 'A valid bearer API key is required.' }
  }
  if (!record.scopes.includes(requiredScope)) {
    return { ok: false, status: 403, error: `API key does not allow '${requiredScope}'.` }
  }
  return { ok: true, apiKey: record }
}
