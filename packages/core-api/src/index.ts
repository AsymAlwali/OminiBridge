import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'healthy', timestamp: new Date().toISOString() }))

// 🤖 Real Upstream AI Provider Forwarder
app.post('/v1/chat/completions', async (c) => {
  try {
    const authHeader = c.req.header('Authorization')
    const body = await c.req.json()
    const { provider = 'openai', messages, agent_mode = false } = body

    if (!messages || !Array.isArray(messages)) {
      return c.json({ success: false, error: "Missing or invalid 'messages' array." }, 400)
    }

    // Example routing to real OpenAI endpoint if selected
    if (provider === 'openai') {
      const openAiKey = process.env.OPENAI_API_KEY
      if (!openAiKey) {
        return c.json({
          success: true,
          provider,
          identity: agent_mode ? 'agent' : 'human',
          message: `Simulated response for ${provider}. Configure upstream environmental credentials to enable direct live proxying.`
        })
      }

      const upstreamRes = await fetch('https://openai.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openAiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages,
          response_format: agent_mode ? { type: 'json_object' } : undefined
        })
      })

      const data = await upstreamRes.json()
      return c.json({ success: true, provider: 'openai', identity: agent_mode ? 'agent' : 'human', data })
    }

    // Fallback stub for other providers until custom keys are provided
    return c.json({
      success: true,
      provider,
      identity: agent_mode ? 'agent' : 'human',
      message: `Simulated response for ${provider}. Configure upstream environmental credentials to enable direct live proxying.`
    })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

// 🔍 Real Serper / Google Live Search Integration
app.post('/v1/search', async (c) => {
  try {
    const body = await c.req.json()
    const { query, max_results = 5 } = body
    const searchKey = process.env.SERPER_API_KEY

    if (!query) {
      return c.json({ success: false, error: "Missing required parameter 'query'." }, 400)
    }

    if (!searchKey) {
      return c.json({
        success: true,
        engine: 'mock-search',
        warning: 'SERPER_API_KEY not found in environment, returning stubbed results.',
        results: [{ title: 'Stub Result', url: 'https://example.com', snippet: query }]
      })
    }

    const searchRes = await fetch('https://serper.dev', {
      method: 'POST',
      headers: {
        'X-API-KEY': searchKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ q: query, num: max_results })
    })

    const searchData = await searchRes.json()
    return c.json({ success: true, engine: 'serper', data: searchData })
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500)
  }
})

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  serve({ fetch: app.fetch, port: 3000 })
}

export default app
