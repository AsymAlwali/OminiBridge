# OminiBridge Use Cases

OminiBridge is a small, self-hostable API gateway that gives applications one place to send chat-completion and live web-search requests. Its strength is as a thin integration layer for prototypes, internal tools, and agent experiments that need a unified API boundary without adopting a large orchestration framework.

This guide covers practical applications, architectural comparisons, and realistic current limitations so you can evaluate fit properly.

---

## At a Glance

| Need | How OminiBridge Helps | Best When |
|---|---|---|
| **One API endpoint** | Clients call `/v1/chat/completions` instead of wiring provider URLs everywhere | You want a single control point to adjust routing/config |
| **OpenAI key rotation + failover** | Tries `OPENAI_API_KEYS` in round-robin, falling back to next keys on failure | You have multiple authorized keys and need basic resilience |
| **Search-grounded answers** | `/v1/search` returns normalized results with Serper (primary) → DuckDuckGo HTML (fallback) | Fresh public web context improves answer quality |
| **Reduce repeated search traffic** | SHA-256 hashed in-memory cache reuses identical queries for 10 minutes | Same queries repeat often in the same process |
| **Concise page context for agents** | Optional `scrape_urls` extracts clean Markdown from up to 5 public pages | You need readable text, not raw HTML |
| **Human + Agent parity** | Dual identity model (`human` vs `agent`) with `agent_mode` toggle | You need consistent APIs for both dev UIs and autonomous runtimes |
| **Cross-language clients** | TypeScript and Python SDKs wrap the same HTTP surface | Teams work in mixed JS/Python environments |

> OminiBridge is a **gateway foundation**, not a full AI platform. It doesn't yet include durable conversations, a database, task queues, policy engines, full observability, multi-provider production adapters, or completed admin auth.

---

## Practical Use Cases

### 1. Internal Knowledge & Research Assistant

Build a small assistant that searches the public web, optionally extracts key pages, and passes grounded context to an LLM.

**Flow:**
1. Call `/v1/search` with query (+ optional `scrape_urls`)
2. Gateway uses Serper if `SERPER_API_KEY` is set, else falls back to DuckDuckGo HTML
3. Receive normalized `{ title, url, snippet }` results + optional `scraped_content` as Markdown
4. Feed curated sources to the model with citations

**Tips:** Treat retrieved content as untrusted input. Always preserve source URLs and guard against prompt injection.

### 2. Developer Docs & Support Helper

Give engineers a lightweight tool to pull public release notes, API docs, or changelogs. Extract known doc pages to clean Markdown for summarization or Q&A.

**Works best when:** content is public (no authenticated sessions). For private/internal docs, add an allowlisted authenticated retriever instead of scraping arbitrary gated URLs.

### 3. Lightweight AI Features in Existing Products

Route server-side completions through OminiBridge to centralize provider selection, key management, and request shaping. Keep provider credentials off the client and in one backend boundary.

**Note:** Only **OpenAI chat completions** are live today. Other `provider` values return a simulated response (useful for prototyping) and should not be treated as live upstream calls.

### 4. Agent Prototypes & Automation

The `agent_mode` flag signals agent-oriented usage. For OpenAI, it sets `response_format: { type: 'json_object' }` to encourage stricter, parseable JSON. The API also returns `identity: 'human' | 'agent'` so clients can branch logic.

**Scope:** Perfect for prototypes where the app owns tool execution, safety checks, approvals, and state. OminiBridge does **not** implement tool registries, function-calling loops, durable agent memory, or schedulers — keep those in your application.

### 5. Resilient Access Across Multiple OpenAI Keys

Set `OPENAI_API_KEYS` (comma-separated) or fallback to `OPENAI_API_KEY`. The gateway rotates starting keys per request and retries remaining configured keys on failure.

**Use cases:** environment separation, basic high-availability against transient failures. This doesn't create extra quota, guarantee success, or bypass provider rate/account limits. Production use should add per-key health, cooldowns, retry policies, audit trails, and secret-manager integration.

### 6. Low-Volume Search Reuse

The process-local in-memory cache (10 min TTL, 500-entry cap, SHA-256 keyed by `[query, max_results, engine, scrape_urls]`) avoids duplicate upstream calls for identical requests.

**Great for:** repeated popular questions, UI refreshes, or dev/demo loops. Cache is **not** shared across replicas and resets on restart — treat TTL as a freshness/performance trade-off.

### 7. Thin Backend for Static UIs

The dashboard stub illustrates GitHub OAuth placeholder + in-memory key UI. It's a scaffold, **not** a production admin boundary yet:

- OAuth callback/state/token exchange not implemented
- Key list is in-memory only (lost on reload)
- Doesn't connect to or configure the API's secrets
- Core API has no auth/authorization yet

Don't expose it to control production credentials or as an access-control surface.

---

## Example Request Patterns

### Basic Search

```bash
curl http://localhost:3000/v1/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "Practical vector database design trade-offs",
    "max_results": 5
  }'
```

Response includes `engine` (`serper` or `duckduckgo-html`), `results[]` `{title,url,snippet}`, and optional `fallback_reason` if Serper fell back.

### Search + Extract Public Pages

```bash
curl http://localhost:3000/v1/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "HTTP caching guidance",
    "max_results": 3,
    "scrape_urls": ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching"]
  }'
```

Extractions land in `scraped_content` as clean Markdown. Guards: max 5 URLs, 1MB/page cap, 8s timeout, redirects disabled, public-only (DNS+IP validated), `text/html|text/plain` only.

### Chat Completion (Human vs Agent)

```bash
# Human mode
curl http://localhost:3000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "openai",
    "messages": [{"role":"user","content":"Summarize this topic concisely."}],
    "agent_mode": false
  }'

# Agent mode (requests JSON object)
curl http://localhost:3000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "provider": "openai",
    "messages": [{"role":"user","content":"Return structured plan as JSON."}],
    "agent_mode": true
  }'
```

### Python SDK

```python
from omnibridge import OmniBridge

bridge = OmniBridge(api_key="app-token", base_url="http://localhost:3000")

# Agent-first structured call
res = bridge.complete(
    provider="openai",
    messages=[{"role":"user","content":"Return findings in JSON schema form."}],
    agent_mode=True
)
print(res.get("identity"))  # 'agent' or 'human'
```

### TypeScript SDK

```ts
import { OmniBridge } from '@omnibridge/sdk';

const omni = new OmniBridge({ apiKey: 'app-token', baseUrl: 'http://localhost:3000' });

const search = await omni.search({ query: 'RAG best practices 2026', maxResults: 3 });
console.log(search.results);
```

---

## Architecture Comparison

| Approach | Setup | Portability | Search/Extract | Ops Burden | Best For |
|---|---|---|---|---|---|
| Direct provider SDK | Low | Low | Separate | Duplicated per app | Single app, single provider |
| Provider SDKs only | Easy | Provider-locked | Separate | Repeated config | Max provider-native features |
| Full agent/orchestration (LangGraph, etc.) | Medium-High | Framework-bound | Via tools/integrations | Higher surface | Multi-step workflows, tools, memory |
| Build custom proxy | High | Your design | Your impl | Highest | Strict governance/custom needs |
| Hosted AI gateway | Low | Varies | Varies by plan | Less infra, vendor lock-in | Want managed ops |
| **OminiBridge** | Low | Unified boundary | Serper+DDG, SSRF-safe scrape, cache | You run it | Small internal/prototype, want modifiable thin gateway |

### Quick Decision Guide

- **One provider, one simple app:** Call provider directly.
- **Need shared HTTP boundary + basic search + human/agent split:** **OminiBridge fits well**.
- **Need durable shared cache, quotas, authZ/authN, audit, multi-replica:** Extend OminiBridge or use a fuller gateway.
- **Need complex agent orchestration/tools:** Use an agent framework.
- **Need non-OpenAI live in prod:** Implement/test real adapters first.

---

## Capabilities vs. Boundaries

| Area | Current Behavior | Don't Assume |
|---|---|---|
| **Chat Completions** | OpenAI live (gpt-4o-mini) with round-robin/failover; others simulated when no real adapter | All providers are live or simulations equal production behavior |
| **Key Rotation** | Rotates starting key, retries others on failure | Cooldowns, quota awareness, or classifying retryable vs permanent errors |
| **Search Providers** | Serper primary → DuckDuckGo HTML fallback | `engine` ('google'/'bing'/'perplexity') selects those upstreams today (currently routes via Serper/DDG selection) |
| **Caching** | In-memory, 10m TTL, 500 cap, SHA-256 keyed by query+options | Shared across replicas, durable, or survives restarts |
| **Scraping** | Up to 5 public HTTP(S), 1MB, 8s, redirects disabled, DNS+IP public checks, text/* only | Full JS rendering, full article extraction, or authenticated pages |
| **Identity Model** | Returns `identity: 'human' \| 'agent'`; `agent_mode` enforces JSON object for OpenAI | Other providers honor the same JSON constraint yet |
| **Dashboard** | Static GitHub OAuth stub + in-memory UI | OAuth complete, secrets stored, or UI connected to API |
| **Security** | SSRF guards on scrape + fetch limits | API has request authN/authZ, rate limits, tenant isolation, or full egress policy yet |

---

## Recommendations Before Production

1. **AuthN/AuthZ** — Add request-level auth (API keys/JWT), per-tenant scoping, rate limits, and max request sizes
2. **Real Provider Adapters** — Implement and test non-OpenAI providers with clear error semantics
3. **Secret Management** — Load keys from a secrets manager; rotate/safe lifecycle, never log secrets
4. **Observability** — Add structured logs, metrics, traces, and health/readiness endpoints
5. **Hardened Egress** — Layer network-level egress allowlists on top of app-level SSRF checks
6. **Complete Dashboard Auth** — Implement OAuth callback, state validation, CSRF, server-side token exchange before treating as admin
7. **Resilient Search** — Add timeouts/retries per provider, circuit breakers, and better parsing
8. **Cache Semantics** — Define cross-replica strategy if scaling horizontally

---

## Related Documentation

- [README.md](./README.md) — Quickstart, features, examples
- [CONTEXT.md](./CONTEXT.md) — Complete architecture, internals, API details, AI agent context
- [Core API](./packages/core-api) — Hono server implementation
- [TypeScript SDK](./packages/sdk-ts) — Universal TS/JS client
- [Python SDK](./packages/sdk-python) — Agent-first Python client
- [Dashboard](./packages/dashboard) — Static OAuth stub
- [Integration Tests](./test-pipeline.ts) — Smoke validation matrix

---

<div align="center">

**⚡ Bridging Intent • Grounding Context • Powering Agents ⚡**

</div>
