# OminiBridge Use Cases

OminiBridge is a small, self-hostable API gateway that gives an application one place to send chat-completion requests and web-search requests. Its most practical role today is as a thin integration layer for prototypes, internal tools, and agent experiments that need a simple API boundary without adopting a large orchestration framework.

This guide describes useful applications, compares common architectural choices, and calls out the current project's limits so the design can be evaluated realistically.

## At a glance

| Need | How OminiBridge can help | Good fit when |
|---|---|---|
| One application endpoint for AI calls | Clients call `/v1/chat/completions` rather than embedding an upstream URL in each feature | You own a small app and want one place to adjust provider configuration |
| OpenAI key rotation | The API can try keys from `OPENAI_API_KEYS` in rotation and fall through to another key after a failed request | You have several authorized keys and understand the provider's account, billing, and terms |
| Search-grounded answers | `/v1/search` returns web results and can fall back from configured Serper to DuckDuckGo HTML search | Your user task benefits from fresh public-web context |
| Reduce repeated search traffic | Identical in-process search requests can reuse a cached result for ten minutes | Repeated queries are common and process-local freshness is acceptable |
| Give an agent concise page context | Optional `scrape_urls` turns a small number of public pages into Markdown | You already have URLs and need useful text rather than full HTML |
| Share a client interface across languages | TypeScript and Python SDKs wrap the HTTP endpoints | A small team has clients in both runtimes |

The project is a **gateway foundation**, not a complete AI platform. It does not currently provide durable conversations, a database, a job queue, a policy engine, an observability stack, a full provider catalog, or production dashboard authentication.

## Practical use cases

### 1. Internal knowledge and research assistant

Build a small assistant that takes a question, searches the public web, and passes a few result snippets or extracted pages to a model for a cited summary.

**Example flow**

1. The client submits a search query to `/v1/search`.
2. The gateway queries Serper when `SERPER_API_KEY` is configured, or uses the DuckDuckGo HTML fallback when it is not.
3. The response includes normalized search results. If the caller provides `scrape_urls`, up to five public pages can also be returned as Markdown.
4. The application decides which sources to send to a language model and how to cite them.

**Why this can be useful:** it gives the application one network boundary and a simple result shape while keeping retrieval separate from answer generation.

**Important:** returned web content is untrusted input. Applications should preserve source URLs, verify facts, and defend downstream model prompts against prompt injection in retrieved pages.

### 2. Developer-support or documentation helper

An internal developer tool can search release notes, public documentation, or issue discussions and show a compact digest. A small set of known documentation URLs can be extracted to Markdown for a language model or a human-facing summary.

This works best when:

- the content is public and does not require an authenticated browser session;
- the caller controls the list of URLs to fetch;
- results are treated as context, not as executable instructions; and
- users can see links back to the source material.

For private documentation, add an authenticated, allowlisted retrieval integration rather than exposing arbitrary authenticated URLs to the scraper.

### 3. Lightweight AI features in an existing product

An existing web application can call the gateway from its own server for tasks such as drafting, summarizing, or classifying short text. Keeping upstream calls behind one backend service centralizes endpoint selection and avoids copying provider credentials into every application component.

The current live completion implementation is specifically for OpenAI's chat-completions endpoint. Other provider names currently receive a simulated response; do not interpret those responses as real calls to Anthropic or another provider.

### 4. Agent prototypes and automation experiments

The `agent_mode` request option is useful as a simple signal that the caller wants an agent-oriented response. In the OpenAI path, it asks for JSON-object response formatting. Python and TypeScript callers can use the same HTTP endpoint while experiments evolve.

This is appropriate for a prototype in which the application itself owns tool execution and safety checks. OminiBridge does **not** currently implement a tool registry, function-call execution loop, durable agent state, human approval flow, or task scheduler. Keep those responsibilities explicit in the application.

### 5. Resilient access across multiple authorized OpenAI keys

Set `OPENAI_API_KEYS` to a comma-separated list of keys the service is authorized to use. The gateway rotates the starting key between requests and tries another configured key after a failed attempt.

Potential uses include separating environments or teams by key and reducing interruption when one key is unavailable. This does not create extra provider capacity, combine independent quotas safely, or guarantee that a different key will succeed. Follow the provider's terms and billing rules; do not use key rotation to evade rate limits or account controls.

For production, consider per-key health, cooldowns, retry limits, audit trails, and secret-manager integration. Keep keys on the server; never put provider credentials in the browser or dashboard.

### 6. Low-volume search reuse

The `/v1/search` in-memory cache can eliminate repeated upstream search calls for an identical query and matching request options during its ten-minute TTL.

Good examples include:

- several users asking the same popular question shortly apart;
- a UI that repeats a query during a refresh or navigation cycle; and
- development or demonstration environments where fast repeat responses matter.

The cache is process-local and is cleared when the process restarts. Separate replicas do not share entries, and the first request still pays the provider latency. The TTL is a freshness/performance trade-off, not a guarantee that live results are current.

### 7. A thin backend for a static user interface

The static dashboard stub shows where GitHub-only sign-in and key-list controls might live. It can be used as a starting point for a team console or prototype, but it is not a functioning secure admin product today:

- GitHub OAuth callback handling, state verification, and server-side token exchange are not implemented.
- The key list is in page memory and disappears on reload.
- The UI does not configure or update the API's actual environment secrets.
- The core API currently does not authenticate or authorize requests.

Do not deploy the stub as an access-control boundary or enter real long-lived provider keys into it.

## Example request patterns

### Search from a server or command line

```bash
curl http://localhost:3000/v1/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "Practical vector database design trade-offs",
    "max_results": 5
  }'
```

The response includes an `engine` label and a `results` array with `title`, `url`, and `snippet` fields. Search-provider selection and availability depend on server configuration and network access.

### Search and extract selected public pages

```bash
curl http://localhost:3000/v1/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "HTTP caching guidance",
    "max_results": 3,
    "scrape_urls": ["https://example.org/guide"]
  }'
```

Successful extractions appear in `scraped_content` as Markdown. The endpoint limits result count, scrape URL count, page response size, and fetch time; private/local destinations are rejected. These checks reduce risk but are not a substitute for deployment-level egress controls.

### Use the Python SDK

```python
from omnibridge import OmniBridge

bridge = OmniBridge(
    api_key="application-token",
    base_url="http://localhost:3000",
)

results = bridge.search(
    query="Current guidance for Python packaging",
    max_results=5,
)

if results.get("success"):
    for item in results.get("results", []):
        print(item["title"], item["url"])
```

The SDK's `api_key` is currently sent as a bearer token, but the API does not yet verify it. Treat this as a client placeholder, not authentication.

## Comparisons with common approaches

These are architectural comparisons, not benchmark claims or assertions about specific vendors' latest features.

| Approach | Setup and control | Portability | Search and extraction | Operational burden | Choose it when |
|---|---|---|---|---|---|
| Call a model provider directly | Lowest setup; each app integrates the provider itself | Low unless the app adds its own adapter layer | Usually a separate integration | Duplicated provider setup across clients; little extra infrastructure | One app uses one provider and a gateway adds no value |
| Use a provider's official SDK | Convenient provider-specific features and typed APIs | Low across providers | Usually separate from model calls | Provider-specific code remains in the application | You want the fullest support for one provider's current API |
| Use a larger agent/orchestration framework | More concepts and configuration; richer workflow abstractions | Depends on framework adapters | Often available through integrations or extensions | More dependencies and design surface | You need tool graphs, multi-step orchestration, memory, or workflow controls |
| Build an in-house proxy | Full control over contracts, auth, policy, and routing | Whatever you implement | Whatever you implement | Highest initial engineering and maintenance cost | Requirements demand custom governance, scale, or integrations |
| Use a hosted AI gateway | Little infrastructure to operate; features depend on service | Often designed for multiple providers | Varies by product and plan | Less infrastructure work, but introduces vendor, pricing, and data-processing considerations | Managed operations and support matter more than self-hosting |
| Use OminiBridge | Small self-hosted Hono service with a simple API and SDKs | A useful boundary, but only OpenAI is live for completions today | Basic web search fallback, short-lived process cache, optional Markdown extraction | You operate the API, keys, network, and production controls | You want a small modifiable gateway for an early-stage app or internal prototype |

### A quick decision guide

- **One provider, one app, little repetition:** call the provider directly or use its official SDK.
- **Need a small shared HTTP boundary and simple search behavior:** OminiBridge may be a good starting point.
- **Need durable shared caching, strict authentication, audit logs, quotas, or multi-replica operation:** add those capabilities deliberately or select a more complete gateway.
- **Need complex multi-step agents and tool orchestration:** use a workflow/agent framework or implement an explicit orchestration service.
- **Need a non-OpenAI provider in production:** implement and test a real adapter before routing user traffic to that provider.

## Current capabilities and boundaries

| Area | Current behavior | Do not assume |
|---|---|---|
| Chat completions | Calls OpenAI chat completions when OpenAI keys are configured; otherwise returns a simulation. | That an unconfigured request calls a model, or that every named provider is integrated. |
| Provider key rotation | Reads `OPENAI_API_KEYS` or the single-key `OPENAI_API_KEY`, rotates the starting key, and retries other keys on failures. | That rotation guarantees quota, applies cooldowns, or distinguishes retryable from permanent failures. |
| Search | Attempts Serper if configured, then DuckDuckGo HTML fallback. | That the `engine` parameter currently chooses Bing or Perplexity; it is accepted but does not select those providers. |
| Search cache | In-memory, ten-minute TTL, bounded to 500 entries, keyed by query and request options. | That the cache is durable, shared among replicas, or survives restart. |
| Page extraction | Optional extraction for up to five public HTTP(S) URLs, returning text-oriented Markdown. | That it is a full browser, JavaScript renderer, or complete article-readability engine. |
| Dashboard | Static UI prototype with GitHub OAuth redirect placeholder and in-memory key controls. | That OAuth is complete or the keys are stored securely or connected to the API. |
| Request security | Fetch limits and URL checks exist for page extraction. | That the API has authentication, authorization, tenant isolation, or production-grade egress policy. |

## My take

The strongest near-term use case is a **self-hosted internal assistant backend** for a small team: use the gateway to centralize an OpenAI integration, add basic public-web search, and let Python or TypeScript clients share that boundary. The lightweight footprint makes it understandable and easy to modify, and the separation between clients and upstream integrations is a useful foundation.

The main risk is the gap between the project's ambitious “unified/production” positioning and its present implementation. Before exposing it to public or sensitive traffic, I would prioritize:

1. real authentication and authorization, with rate limits and request-size limits;
2. real provider adapters with clear failure semantics and tests;
3. secret-manager-backed credentials and safe key lifecycle controls;
4. deployment-aware cache semantics and metrics;
5. stronger SSRF defenses at both application and network-egress layers;
6. OAuth callback/token handling before treating the dashboard as an admin interface; and
7. integration tests that assert provider behavior, cache hits, expiration, and failure responses without relying on external services.

Until then, use it as a **local, internal, or controlled prototype**, keep it behind a trusted network boundary, and never rely on its placeholder dashboard or bearer-token field as access control.

## Related project documentation

- [README](./README.md)
- [Core API](./packages/core-api)
- [TypeScript SDK](./packages/sdk-ts)
- [Python SDK](./packages/sdk-python)
- [Dashboard stub](./packages/dashboard)
