import { randomBytes } from 'node:crypto'
import { API_KEY_PREFIX_LENGTH, hashApiKey, type ApiKeyStore } from './auth.js'
import { closeDatabasePool, getDatabasePool } from './database.js'

const validScopes = new Set(['chat:complete', 'search:read'])

function getPool() {
  return getDatabasePool()
}

export const apiKeyStore: ApiKeyStore = {
  async findActiveApiKeyByPrefix(prefix) {
    const result = await getPool().query<{
      id: string
      tenant_id: string
      key_hash: string
      scopes: string[]
    }>(
      `SELECT id, tenant_id, key_hash, scopes
       FROM api_keys
       WHERE key_prefix = $1 AND revoked_at IS NULL`,
      [prefix]
    )
    const row = result.rows[0]
    return row
      ? { id: row.id, tenantId: row.tenant_id, keyHash: row.key_hash, scopes: row.scopes }
      : undefined
  }
}

export async function closeApiKeyPool() {
  await closeDatabasePool()
}

function parseScopes(value: string) {
  const scopes = [...new Set(value.split(',').map((scope) => scope.trim()).filter(Boolean))]
  if (scopes.length === 0 || scopes.some((scope) => !validScopes.has(scope))) {
    throw new Error(`Scopes must be selected from: ${[...validScopes].join(', ')}.`)
  }
  return scopes
}

async function createKey(tenantName: string, name: string, scopes: string[]) {
  const db = getPool()
  const client = await db.connect()
  const secret = `omni_live_${randomBytes(32).toString('base64url')}`
  const prefix = secret.slice(0, API_KEY_PREFIX_LENGTH)

  try {
    await client.query('BEGIN')
    const tenant = await client.query<{ id: string }>(
      `INSERT INTO tenants (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenantName]
    )
    await client.query(
      `INSERT INTO api_keys (tenant_id, name, key_prefix, key_hash, scopes)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant.rows[0].id, name, prefix, hashApiKey(secret), scopes]
    )
    await client.query('COMMIT')
    return { key: secret, prefix, tenantId: tenant.rows[0].id }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function runCommand(args: string[]) {
  const [command, ...values] = args
  const options = new Map<string, string>()
  for (let index = 0; index < values.length; index += 2) {
    const option = values[index]
    const value = values[index + 1]
    if (!option.startsWith('--') || !value || options.has(option)) {
      throw new Error('Options must be unique --name value pairs.')
    }
    options.set(option, value)
  }

  if (command === 'create') {
    const tenant = options.get('--tenant')
    const name = options.get('--name')
    const scopes = options.get('--scopes')
    if (!tenant || !name || !scopes) {
      throw new Error('Usage: keys create --tenant NAME --name NAME --scopes chat:complete,search:read')
    }
    const created = await createKey(tenant, name, parseScopes(scopes))
    console.log(`Created API key for tenant ${tenant} (${created.tenantId}), prefix ${created.prefix}.`)
    console.log(`Copy this key now; it cannot be retrieved later:\n${created.key}`)
    return
  }

  if (command === 'revoke') {
    const prefix = options.get('--prefix')
    if (!prefix || options.size !== 1) {
      throw new Error('Usage: keys revoke --prefix KEY_PREFIX')
    }
    const result = await getPool().query(
      `UPDATE api_keys SET revoked_at = now()
       WHERE key_prefix = $1 AND revoked_at IS NULL`,
      [prefix]
    )
    if (result.rowCount !== 1) throw new Error('No active API key found for that prefix.')
    console.log(`Revoked API key ${prefix}.`)
    return
  }

  if (command === 'list') {
    const tenant = options.get('--tenant')
    if (!tenant || options.size !== 1) throw new Error('Usage: keys list --tenant NAME')
    const result = await getPool().query(
      `SELECT k.name, k.key_prefix, k.scopes, k.created_at, k.revoked_at,
              t.monthly_request_budget
       FROM api_keys k JOIN tenants t ON t.id = k.tenant_id
       WHERE t.name = $1 ORDER BY k.created_at`,
      [tenant]
    )
    for (const row of result.rows) console.log(JSON.stringify(row))
    return
  }

  if (command === 'set-budget') {
    const tenant = options.get('--tenant')
    const requests = options.get('--requests')
    if (!tenant || !requests || options.size !== 2) {
      throw new Error('Usage: keys set-budget --tenant NAME --requests COUNT|unlimited')
    }
    const budget = requests === 'unlimited' ? null : Number(requests)
    if (budget !== null && (!Number.isSafeInteger(budget) || budget < 1)) {
      throw new Error('Monthly request budget must be a positive integer or "unlimited".')
    }
    const result = await getPool().query(
      'UPDATE tenants SET monthly_request_budget = $2 WHERE name = $1',
      [tenant, budget]
    )
    if (result.rowCount !== 1) throw new Error(`Tenant "${tenant}" was not found.`)
    console.log(`Set tenant ${tenant} monthly successful-request budget to ${requests}.`)
    return
  }

  throw new Error('Usage: keys <create|list|revoke|set-budget> [options]')
}

const invokedPath = process.argv[1]
if (invokedPath?.endsWith('/api-keys.ts') || invokedPath?.endsWith('/api-keys.js')) {
  runCommand(process.argv.slice(2))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    })
    .finally(closeDatabasePool)
}
