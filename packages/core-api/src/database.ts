import { Pool } from 'pg'

let pool: Pool | undefined

export function getDatabasePool() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required for authenticated API use.')
  pool ??= new Pool({ connectionString })
  return pool
}

export async function closeDatabasePool() {
  await pool?.end()
  pool = undefined
}
