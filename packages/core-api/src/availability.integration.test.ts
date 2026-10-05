import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Pool } from 'pg'
import { API_KEY_PREFIX_LENGTH, hashApiKey } from './auth.js'
import { closeDatabasePool } from './database.js'
import { closeRedisClient } from './redis.js'

test('fails protected requests closed when usage writes or Redis are unavailable', {
  skip: !process.env.DATABASE_URL || !process.env.REDIS_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const tenantId = randomUUID()
  const tenantName = `availability-test-${tenantId}`
  const apiKey = `omni_live_${randomBytes(32).toString('base64url')}`
  const triggerName = `reject_usage_${tenantId.replaceAll('-', '')}`
  const functionName = `reject_usage_fn_${tenantId.replaceAll('-', '')}`
  const previousRedisUrl = process.env.REDIS_URL

  try {
    await pool.query(await readFile(new URL('../migrations/001_tenant_api_keys.sql', import.meta.url), 'utf8'))
    await pool.query(await readFile(new URL('../migrations/002_shared_limits_and_usage.sql', import.meta.url), 'utf8'))
    await pool.query('INSERT INTO tenants (id, name) VALUES ($1, $2)', [tenantId, tenantName])
    await pool.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, 'test key', $2, $3, $4)`,
      [tenantId, apiKey.slice(0, API_KEY_PREFIX_LENGTH), hashApiKey(apiKey), ['chat:complete']]
    )
    process.env.AUTH_MODE = 'required'

    const { default: app } = await import('./index.js')
    const makeRequest = () => app.fetch(new Request('http://localhost/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'not retained' }] })
    }))

    await pool.query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
      BEGIN
        IF NEW.tenant_id = '${tenantId}'::uuid THEN
          RAISE EXCEPTION 'test usage insert failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `)
    await pool.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON request_usage
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()`)

    const usageFailure = await makeRequest()
    assert.equal(usageFailure.status, 503)
    assert.match((await usageFailure.json()).error, /outcome may be uncertain/)

    await pool.query(`DROP TRIGGER ${triggerName} ON request_usage`)
    await pool.query(`DROP FUNCTION ${functionName}()`)
    await closeRedisClient()
    process.env.REDIS_URL = 'redis://127.0.0.1:1'

    const redisFailure = await makeRequest()
    assert.equal(redisFailure.status, 503)
    assert.equal((await redisFailure.json()).error, 'Shared rate limiting is unavailable.')
    const usage = await pool.query(
      'SELECT status_code FROM request_usage WHERE tenant_id = $1',
      [tenantId]
    )
    assert.deepEqual(usage.rows.map((row) => row.status_code), [503])
  } finally {
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previousRedisUrl
    await pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON request_usage`)
    await pool.query(`DROP FUNCTION IF EXISTS ${functionName}()`)
    await pool.query('DELETE FROM api_keys WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM request_usage WHERE tenant_id = $1', [tenantId])
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId])
    await pool.end()
    await closeRedisClient()
    await closeDatabasePool()
  }
})
