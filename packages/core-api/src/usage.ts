import type { PoolClient } from 'pg'
import { getDatabasePool } from './database.js'

export interface UsageRecord {
  requestId: string
  tenantId: string
  operation: 'chat:complete' | 'search:read'
  statusCode: number
  durationMs: number
}

export interface MonthlyRequestReservation {
  allowed: boolean
  limit: number | null
  used: number
}

function getUtcMonthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString(), month: start.toISOString().slice(0, 10) }
}

async function rollback(client: PoolClient) {
  try {
    await client.query('ROLLBACK')
  } catch {
    // Preserve the original database error.
  }
}

export async function reserveMonthlyRequest(
  requestId: string,
  tenantId: string
): Promise<MonthlyRequestReservation> {
  const client = await getDatabasePool().connect()
  const { start, end, month } = getUtcMonthBounds()
  try {
    await client.query('BEGIN')
    const tenant = await client.query<{ monthly_request_budget: number | null }>(
      'SELECT monthly_request_budget FROM tenants WHERE id = $1 FOR UPDATE',
      [tenantId]
    )
    if (!tenant.rowCount) throw new Error('Tenant not found while reserving monthly request budget.')
    const limit = tenant.rows[0].monthly_request_budget

    await client.query(
      `DELETE FROM monthly_request_reservations
       WHERE tenant_id = $1 AND (month_start < $2::date OR created_at < now() - interval '10 minutes')`,
      [tenantId, month]
    )
    const usage = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM request_usage
       WHERE tenant_id = $1 AND status_code >= 200 AND status_code < 300
         AND created_at >= $2 AND created_at < $3`,
      [tenantId, start, end]
    )
    const reservations = await client.query<{ count: number }>(
      `SELECT count(*)::integer AS count FROM monthly_request_reservations
       WHERE tenant_id = $1 AND month_start = $2::date`,
      [tenantId, month]
    )
    const used = usage.rows[0].count + reservations.rows[0].count
    if (limit !== null && used >= limit) {
      await client.query('COMMIT')
      return { allowed: false, limit, used }
    }

    await client.query(
      `INSERT INTO monthly_request_reservations (request_id, tenant_id, month_start)
       VALUES ($1, $2, $3::date)`,
      [requestId, tenantId, month]
    )
    await client.query('COMMIT')
    return { allowed: true, limit, used }
  } catch (error) {
    await rollback(client)
    throw error
  } finally {
    client.release()
  }
}

export async function recordRequestUsage(record: UsageRecord) {
  const client = await getDatabasePool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO request_usage (request_id, tenant_id, operation, status_code, duration_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.requestId, record.tenantId, record.operation, record.statusCode, record.durationMs]
    )
    await client.query('DELETE FROM monthly_request_reservations WHERE request_id = $1', [record.requestId])
    await client.query('COMMIT')
  } catch (error) {
    await rollback(client)
    throw error
  } finally {
    client.release()
  }
}
