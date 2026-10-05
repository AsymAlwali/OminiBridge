import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Pool } from 'pg'
import { apiKeyStore } from './api-keys.js'
import { API_KEY_PREFIX_LENGTH, authenticateApiKey, hashApiKey } from './auth.js'
import { closeDatabasePool } from './database.js'

test('persists active keys, scopes, and revocation in PostgreSQL', {
  skip: !process.env.DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const tenantName = `auth-test-${randomUUID()}`
  let tenantId: string | undefined
  try {
    await pool.query(await readFile(new URL('../migrations/001_tenant_api_keys.sql', import.meta.url), 'utf8'))
    const tenant = await pool.query<{ id: string }>(
      'INSERT INTO tenants (name) VALUES ($1) RETURNING id',
      [tenantName]
    )
    tenantId = tenant.rows[0].id

    const apiKey = `omni_live_${randomBytes(32).toString('base64url')}`
    const prefix = apiKey.slice(0, API_KEY_PREFIX_LENGTH)
    await pool.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, 'test key', $2, $3, $4)`,
      [tenantId, prefix, hashApiKey(apiKey), ['chat:complete']]
    )

    assert.equal((await authenticateApiKey(`Bearer ${apiKey}`, 'chat:complete', apiKeyStore)).ok, true)
    const denied = await authenticateApiKey(`Bearer ${apiKey}`, 'search:read', apiKeyStore)
    assert.equal(denied.ok ? 200 : denied.status, 403)

    await pool.query('UPDATE api_keys SET revoked_at = now() WHERE key_prefix = $1', [prefix])
    const revoked = await authenticateApiKey(`Bearer ${apiKey}`, 'chat:complete', apiKeyStore)
    assert.equal(revoked.ok ? 200 : revoked.status, 401)
  } finally {
    if (tenantId) {
      await pool.query('DELETE FROM api_keys WHERE tenant_id = $1', [tenantId])
      await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    }
    await pool.end()
    await closeDatabasePool()
  }
})
