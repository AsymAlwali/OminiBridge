import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Pool } from 'pg'
import { closeDatabasePool } from './database.js'
import { runMigrations } from './migrate.js'

test('applies all migrations once and is safe to rerun', {
  skip: !process.env.DATABASE_URL
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await runMigrations(pool)
    await runMigrations(pool)
    const result = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    )
    assert.deepEqual(result.rows.map(({ version }) => version), [
      '001_tenant_api_keys.sql',
      '002_shared_limits_and_usage.sql',
      '003_monthly_request_budgets.sql'
    ])
  } finally {
    await pool.end()
    await closeDatabasePool()
  }
})
