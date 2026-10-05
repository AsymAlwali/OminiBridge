import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { authenticateApiKey } from './auth.js'
import { apiKeyStore } from './api-keys.js'
import { closeDatabasePool, getDatabasePool } from './database.js'
import { readPositiveInteger, TenantRateLimiter } from './rate-limiter.js'
import { closeRedisClient, getRedisClient, redisCounter } from './redis.js'
import {
  getCacheFailureMode,
  getSearchCache,
  type CacheFailureMode,
  type SearchCache
} from './search-cache.js'
import { recordRequestMetric, renderPrometheusMetrics } from './metrics.js'
import { recordRequestUsage, reserveMonthlyRequest } from './usage.js'
import { isTracingEnabled, shutdownTracing, tracedFetch, withServerSpan } from './tracing.js'

const app = new Hono<{ Variables: { tenantId: string } }>()
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_SEARCH_RESULTS = 20
const MAX_SCRAPE_URLS = 5
const MAX_PAGE_BYTES = 1_000_000
let nextOpenAiKeyIndex = 0

type SearchResult = { title: string; url: string; snippet: string }

if (isTracingEnabled()) {
  app.use('*', async (c, next) => {
    await withServerSpan(c.req.raw, async (span) => {
      try {
        await next()
      } catch (error) {
        span.setAttribute('http.response.status_code', 500)
        throw error
      }
      span.setAttribute('http.response.status_code', c.res.status)
      const traceId = span.spanContext().traceId
      if (traceId !== '00000000000000000000000000000000') {
        c.header('X-Trace-ID', traceId)
      }
    })
  })
}

function getOpenAiKeys() {
  const configuredKeys = process.env.OPENAI_API_KEYS
    ?.split(',')
    .map((key) => key.trim())
    .filter(Boolean)

  if (configuredKeys?.length) return configuredKeys

  const singleKey = process.env.OPENAI_API_KEY?.trim()
  return singleKey ? [singleKey] : []
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const numeric = code[1]?.toLowerCase() === 'x'
        ? Number.parseInt(code.slice(2), 16)
        : Number.parseInt(code.slice(1), 10)
      return Number.isFinite(numeric) && numeric > 0 && numeric <= 0x10ffff
        ? String.fromCodePoint(numeric)
        : ''
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[code.toLowerCase()] ?? entity
  })
}

function stripHtmlToMarkdown(html: string, baseUrl?: string) {
  let markdown = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|iframe|nav|footer|header|form|button|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1\s*>/gi, (_, tag: string, text: string) => `\n${'#'.repeat(Number(tag[1]))} ${text}\n`)
    .replace(/<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_, _quote: string, href: string, text: string) => {
      const label = text.replace(/<[^>]*>/g, '').trim()
      try {
        const url = baseUrl ? new URL(decodeHtmlEntities(href), baseUrl).toString() : decodeHtmlEntities(href)
        return label && /^https?:\/\//i.test(url) ? `[${label}](${url})` : label
      } catch {
        return label
      }
    })
    .replace(/<(li)\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|section|article|main|ul|ol|li|blockquote|pre|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<br\b[^>]*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
  markdown = decodeHtmlEntities(markdown)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return markdown
}

function isPrivateAddress(address: string) {
  if (address.startsWith('::ffff:')) return isPrivateAddress(address.slice(7))
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number)
    const [first, second] = octets
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19))
  }
  const normalized = address.toLowerCase()
  return normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    /^fe[89ab]/i.test(normalized)
}

async function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
    if (hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') || hostname.endsWith('.internal')) return false
    if (isIP(hostname)) return !isPrivateAddress(hostname)
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address))
  } catch {
    return false
  }
}

async function readTextWithLimit(response: Response, maxBytes: number) {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  const chunks: string[] = []
  let bytesRead = 0
  let streamFinished = false
  try {
    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read()
      if (done) {
        streamFinished = true
        chunks.push(decoder.decode())
        break
      }
      const remaining = maxBytes - bytesRead
      const chunk = value.subarray(0, remaining)
      chunks.push(decoder.decode(chunk, { stream: true }))
      bytesRead += chunk.byteLength
      if (chunk.byteLength < value.byteLength) {
        await reader.cancel()
        streamFinished = true
        chunks.push(decoder.decode())
        break
      }
    }
    return chunks.join('')
  } finally {
    if (!streamFinished) await reader.cancel()
    reader.releaseLock()
  }
}

function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = []
  const resultPattern = /<a\b([^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*)>([\s\S]*?)<\/a\s*>/gi
  for (const match of html.matchAll(resultPattern)) {
    const href = match[1].match(/\bhref=(["'])(.*?)\1/i)?.[2]
    if (!href) continue
    let url: string
    try {
      const decodedHref = decodeHtmlEntities(href)
      const redirectUrl = new URL(decodedHref, 'https://html.duckduckgo.com')
      url = redirectUrl.searchParams.get('uddg')
        ? decodeURIComponent(redirectUrl.searchParams.get('uddg')!)
        : redirectUrl.toString()
      if (!/^https?:\/\//i.test(url)) continue
    } catch {
      continue
    }

    const title = stripHtmlToMarkdown(match[2])
    const remainder = html.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 1500)
    const snippetMatch = remainder.match(/<a\b[^>]*class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/a\s*>/i)
    results.push({ title, url, snippet: snippetMatch ? stripHtmlToMarkdown(snippetMatch[1]) : '' })
    if (results.length >= MAX_SEARCH_RESULTS) break
  }
  return results
}

async function scrapePage(url: string) {
  if (!(await isPublicHttpUrl(url))) {
    return { url, error: 'URL must resolve to a public HTTP or HTTPS address.' }
  }
  const response = await tracedFetch('search.scrape', url, {
    headers: { 'User-Agent': 'OminiBridge/1.0 (readability text extraction)' },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000)
  })
  if (!response.ok) return { url, error: `Page fetch failed with status ${response.status}.` }
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    return { url, error: `Unsupported page content type: ${contentType || 'unknown'}.` }
  }
  const html = await readTextWithLimit(response, MAX_PAGE_BYTES)
  return { url, markdown: stripHtmlToMarkdown(html, url) }
}

app.get('/health', (c) => c.json({ status: 'healthy', timestamp: new Date().toISOString() }))

app.get('/metrics', (c) => {
  const expectedToken = process.env.METRICS_TOKEN
  if (!expectedToken) return c.json({ success: false, error: 'Not found.' }, 404)
  const suppliedToken = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1]
  const expectedHash = createHash('sha256').update(expectedToken).digest()
  const suppliedHash = createHash('sha256').update(suppliedToken ?? '').digest()
  if (!suppliedToken || !timingSafeEqual(expectedHash, suppliedHash)) {
    c.header('WWW-Authenticate', 'Bearer')
    return c.json({ success: false, error: 'A valid metrics bearer token is required.' }, 401)
  }
  c.header('Cache-Control', 'no-store')
  return c.text(renderPrometheusMetrics(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8'
  })
})

app.get('/ready', async (c) => {
  const authMode = process.env.AUTH_MODE ?? 'required'
  if (authMode === 'development') {
    return c.json({ status: 'ready', timestamp: new Date().toISOString() })
  }
  if (authMode !== 'required') return c.json({ status: 'not_ready' }, 503)
  try {
    await getDatabasePool().query('SELECT 1')
    await (await getRedisClient()).ping()
    return c.json({ status: 'ready', timestamp: new Date().toISOString() })
  } catch {
    return c.json({ status: 'not_ready' }, 503)
  }
})

app.use('/v1/*', async (c, next) => {
  const authMode = process.env.AUTH_MODE ?? 'required'
  if (authMode === 'development') return next()
  if (authMode !== 'required') {
    return c.json({ success: false, error: 'API authentication is not configured correctly.' }, 503)
  }

  const requiredScope = c.req.path === '/v1/chat/completions' ? 'chat:complete' :
    c.req.path === '/v1/search' ? 'search:read' : undefined
  if (!requiredScope) return c.json({ success: false, error: 'Not found.' }, 404)

  let result
  try {
    result = await authenticateApiKey(c.req.header('Authorization'), requiredScope, apiKeyStore)
  } catch {
    return c.json({ success: false, error: 'API authentication service is unavailable.' }, 503)
  }
  if (!result.ok) {
    if (result.status === 401) c.header('WWW-Authenticate', 'Bearer')
    return c.json({ success: false, error: result.error }, result.status)
  }
  c.set('tenantId', result.apiKey.tenantId)

  const operation = requiredScope
  const requestId = randomUUID()
  const startedAt = Date.now()
  c.header('X-Request-ID', requestId)
  const replaceResponse = (body: Record<string, unknown>, status: 503) => {
    const response = c.json(body, status)
    c.res = response
    return c.res
  }
  const persistUsage = async (statusCode: number) => {
    try {
      await recordRequestUsage({
        requestId,
        tenantId: result.apiKey.tenantId,
        operation: requiredScope,
        statusCode,
        durationMs: Math.max(0, Date.now() - startedAt)
      })
      recordRequestMetric(operation, statusCode, Date.now() - startedAt)
      return true
    } catch {
      recordRequestMetric(operation, 503, Date.now() - startedAt)
      console.error('PostgreSQL usage recording failed for an authenticated API request.')
      return false
    }
  }

  let decision
  try {
    const limit = readPositiveInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 60, 'RATE_LIMIT_MAX_REQUESTS')
    const windowMs = readPositiveInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000, 'RATE_LIMIT_WINDOW_MS')
    decision = await new TenantRateLimiter(redisCounter, limit, windowMs).consume(result.apiKey.tenantId)
  } catch {
    console.error('Shared rate limiting is unavailable; rejecting the authenticated API request.')
    if (!(await persistUsage(503))) {
      return c.json({ success: false, error: 'Usage storage is unavailable.' }, 503)
    }
    return c.json({ success: false, error: 'Shared rate limiting is unavailable.' }, 503)
  }

  c.header('RateLimit-Limit', String(decision.limit))
  c.header('RateLimit-Remaining', String(decision.remaining))
  if (!decision.allowed) {
    c.header('Retry-After', String(decision.retryAfterSeconds))
    if (!(await persistUsage(429))) {
      return c.json({ success: false, error: 'Usage storage is unavailable.' }, 503)
    }
    return c.json({ success: false, error: 'Tenant request limit exceeded.' }, 429)
  }

  let monthlyBudget
  try {
    monthlyBudget = await reserveMonthlyRequest(requestId, result.apiKey.tenantId)
  } catch {
    console.error('Monthly request budget is unavailable; rejecting the authenticated API request.')
    if (!(await persistUsage(503))) {
      return c.json({ success: false, error: 'Usage storage is unavailable.' }, 503)
    }
    return c.json({ success: false, error: 'Monthly request budget is unavailable.' }, 503)
  }
  if (monthlyBudget.limit !== null) {
    c.header('Monthly-Request-Limit', String(monthlyBudget.limit))
    c.header('Monthly-Request-Remaining', String(Math.max(0, monthlyBudget.limit - monthlyBudget.used - 1)))
  }
  if (!monthlyBudget.allowed) {
    if (!(await persistUsage(429))) {
      return c.json({ success: false, error: 'Usage storage is unavailable.' }, 503)
    }
    return c.json({ success: false, error: 'Monthly successful request budget exceeded.' }, 429)
  }

  try {
    await next()
  } catch (error) {
    if (!(await persistUsage(500))) {
      return replaceResponse({
        success: false,
        error: 'Usage storage is unavailable; request outcome may be uncertain.'
      }, 503)
    }
    throw error
  }

  if (!(await persistUsage(c.res.status))) {
    return replaceResponse({
      success: false,
      error: 'Usage storage is unavailable; request outcome may be uncertain.'
    }, 503)
  }
})

// 🤖 Real Upstream AI Provider Forwarder
app.post('/v1/chat/completions', async (c) => {
  try {
    const body = await c.req.json()
    const { provider = 'openai', messages, agent_mode = false } = body

    if (!messages || !Array.isArray(messages)) {
      return c.json({ success: false, error: "Missing or invalid 'messages' array." }, 400)
    }

    if (provider === 'openai') {
      const openAiKeys = getOpenAiKeys()
      if (openAiKeys.length === 0) {
        return c.json({
          success: true,
          provider,
          identity: agent_mode ? 'agent' : 'human',
          message: `Simulated response for ${provider}. Configure upstream environmental credentials to enable direct live proxying.`
        })
      }

      let lastError: unknown
      let lastData: unknown
      const startIndex = nextOpenAiKeyIndex
      const requestSignal = AbortSignal.timeout(60_000)

      for (let attempt = 0; attempt < openAiKeys.length; attempt++) {
        const keyIndex = (startIndex + attempt) % openAiKeys.length
        const openAiKey = openAiKeys[keyIndex]
        nextOpenAiKeyIndex = (keyIndex + 1) % openAiKeys.length

        try {
          const upstreamRes = await tracedFetch('provider.openai', 'https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openAiKey}`
            },
            signal: requestSignal,
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages,
              response_format: agent_mode ? { type: 'json_object' } : undefined
            })
          })

          const responseText = await upstreamRes.text()
          let data: unknown
          try {
            data = JSON.parse(responseText)
          } catch {
            data = responseText
          }

          if (upstreamRes.ok) {
            return c.json({ success: true, provider: 'openai', identity: agent_mode ? 'agent' : 'human', data })
          }

          lastData = data
          lastError = `OpenAI request failed with status ${upstreamRes.status}.`
        } catch (err) {
          lastData = undefined
          lastError = err instanceof Error ? err.message : String(err)
        }
      }

      return c.json({
        success: false,
        provider: 'openai',
        error: 'All configured OpenAI API keys failed.',
        details: lastError,
        data: lastData
      }, 502)
    }

    // Fallback stub for other providers until custom keys are provided
    return c.json({
      success: true,
      provider,
      identity: agent_mode ? 'agent' : 'human',
      message: `Simulated response for ${provider}. Configure upstream environmental credentials to enable direct live proxying.`
    })
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

// 🔍 Real Serper / Google Live Search Integration
app.post('/v1/search', async (c) => {
  try {
    const body = await c.req.json()
    const { query, max_results = 5, engine = 'google', scrape_urls = [] } = body

    if (typeof query !== 'string' || !query.trim()) {
      return c.json({ success: false, error: "Missing required parameter 'query'." }, 400)
    }
    if (!Number.isInteger(max_results) || max_results < 1 || max_results > MAX_SEARCH_RESULTS) {
      return c.json({ success: false, error: `'max_results' must be an integer from 1 to ${MAX_SEARCH_RESULTS}.` }, 400)
    }
    if (!Array.isArray(scrape_urls) || scrape_urls.length > MAX_SCRAPE_URLS ||
      scrape_urls.some((url: unknown) => typeof url !== 'string')) {
      return c.json({ success: false, error: `'scrape_urls' must be an array of up to ${MAX_SCRAPE_URLS} URLs.` }, 400)
    }
    if (typeof engine !== 'string' || !['google', 'bing', 'perplexity'].includes(engine)) {
      return c.json({ success: false, error: "'engine' must be one of: google, bing, perplexity." }, 400)
    }
    const normalizedQuery = query.trim()
    const cacheKey = createHash('sha256')
      .update(JSON.stringify([normalizedQuery, max_results, engine, scrape_urls]))
      .digest('hex')
    let cache: SearchCache
    let cacheFailureMode: CacheFailureMode
    try {
      cache = getSearchCache()
      cacheFailureMode = getCacheFailureMode()
    } catch (err) {
      return c.json({
        success: false,
        error: err instanceof Error ? err.message : 'Search cache configuration is invalid.'
      }, 503)
    }
    try {
      const cached = await cache.get(`omnibridge:search-cache:${cacheKey}`)
      if (cached) return c.json(cached)
    } catch {
      console.error('Search cache read failed.')
      if (cacheFailureMode === 'fail') {
        return c.json({ success: false, error: 'Search cache is unavailable.' }, 503)
      }
    }

    for (const url of scrape_urls as string[]) {
      if (!(await isPublicHttpUrl(url))) {
        return c.json({ success: false, error: 'Every scrape URL must resolve to a public HTTP or HTTPS address.' }, 400)
      }
    }

    const cacheResponse = async (response: Record<string, unknown>) => {
      try {
        await cache.set(`omnibridge:search-cache:${cacheKey}`, response, SEARCH_CACHE_TTL_MS)
      } catch {
        console.error('Search cache write failed.')
        if (cacheFailureMode === 'fail') {
          return c.json({ success: false, error: 'Search cache is unavailable.' }, 503)
        }
      }
      return c.json(response)
    }
    const searchKey = process.env.SERPER_API_KEY
    let results: SearchResult[] | undefined
    let searchData: unknown
    let selectedEngine = ''
    let primaryError: string | undefined

    if (searchKey) {
      try {
        const searchRes = await tracedFetch('search.serper', 'https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': searchKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: normalizedQuery, num: max_results }),
          signal: AbortSignal.timeout(8_000)
        })
        searchData = await searchRes.json()
        if (!searchRes.ok) {
          primaryError = `Serper request failed with status ${searchRes.status}.`
        } else {
          const data = searchData as { organic?: unknown }
          if (Array.isArray(data?.organic)) {
            results = (data.organic as unknown[]).slice(0, max_results).map((item) => {
              const result = item && typeof item === 'object' ? item as Record<string, unknown> : {}
              return {
                title: typeof result.title === 'string' ? result.title : '',
                url: typeof result.link === 'string' ? result.link : '',
                snippet: typeof result.snippet === 'string' ? result.snippet : ''
              }
            })
            selectedEngine = 'serper'
          } else {
            primaryError = 'Serper returned an invalid response.'
          }
        }
      } catch (err) {
        primaryError = err instanceof Error ? err.message : String(err)
      }
    } else {
      primaryError = 'SERPER_API_KEY is not configured.'
    }

    if (!results) {
      try {
        const fallbackUrl = new URL('https://html.duckduckgo.com/html/')
        fallbackUrl.searchParams.set('q', normalizedQuery)
        const fallbackRes = await tracedFetch('search.duckduckgo', fallbackUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OminiBridge/1.0)' },
          signal: AbortSignal.timeout(8_000)
        })
        if (!fallbackRes.ok) {
          return c.json({
            success: false,
            error: 'All search providers failed.',
            details: `DuckDuckGo fallback failed with status ${fallbackRes.status}.`,
            primary_error: primaryError
          }, 502)
        }
        results = parseDuckDuckGoResults((await readTextWithLimit(fallbackRes, MAX_PAGE_BYTES))).slice(0, max_results)
        selectedEngine = 'duckduckgo-html'
      } catch (err) {
        return c.json({
          success: false,
          error: 'All search providers failed.',
          details: err instanceof Error ? err.message : String(err),
          primary_error: primaryError
        }, 502)
      }
    }

    const scrapedContent = await Promise.all((scrape_urls as string[]).map(async (url) => {
      try {
        return await scrapePage(url)
      } catch (err) {
        return { url, error: err instanceof Error ? err.message : String(err) }
      }
    }))
    return cacheResponse({
      success: true,
      engine: selectedEngine,
      results,
      ...(searchData === undefined ? {} : { data: searchData }),
      ...(primaryError && selectedEngine !== 'serper' ? { fallback_reason: primaryError } : {}),
      ...(scrapedContent.length ? { scraped_content: scrapedContent } : {})
    })
  } catch (err) {
    return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = readPositiveInteger(process.env.PORT, 3000, 'PORT')
  const server = serve({ fetch: app.fetch, port })
  let shuttingDown = false
  const shutdown = () => {
    if (shuttingDown) return
    shuttingDown = true
    server.close((error) => {
      if (error) {
        console.error('HTTP server shutdown failed.')
        process.exitCode = 1
      }
      Promise.all([closeRedisClient(), closeDatabasePool(), shutdownTracing()])
        .catch(() => {
          console.error('Infrastructure client shutdown failed.')
          process.exitCode = 1
        })
    })
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

export default app
