import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import { closeDatabasePool, getDatabasePool } from './database.js'

const migrationDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations')
const migrationLockId = 8_841_032_026

export async function runMigrations(pool: Pool = getDatabasePool()) {
  const client = await pool.connect()
  let lockAcquired = false
  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId])
    lockAcquired = true
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    const files = (await readdir(migrationDirectory))
      .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/.test(file))
      .sort()
    for (const file of files) {
      const existing = await client.query(
        'SELECT 1 FROM schema_migrations WHERE version = $1',
        [file]
      )
      if (existing.rowCount) continue

      await client.query('BEGIN')
      try {
        await client.query(await readFile(resolve(migrationDirectory, file), 'utf8'))
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
        await client.query('COMMIT')
        console.log(`Applied database migration ${file}.`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    try {
      if (lockAcquired) await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId])
    } finally {
      client.release()
    }
  }
}

const invokedPath = process.argv[1]
if (invokedPath?.endsWith('/migrate.ts') || invokedPath?.endsWith('/migrate.js')) {
  runMigrations()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(closeDatabasePool)
}
