# 🌉 OminiBridge — Complete Project Context

> *"One API to rule them all. An ultra-lightweight, open-source proxy abstraction layer built to unify top AI models, services, and live search engines into a singular context-aware structure. Built from the ground up to support both human developers and autonomous AI agents natively."*

<div align="center">

![Status](https://img.shields.io/badge/status-active-brightgreen?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript)
![Python](https://img.shields.io/badge/Python-≥3.8-3776AB?style=for-the-badge&logo=python)
![Hono](https://img.shields.io/badge/Hono-4.x-FF3E00?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js)
![Build](https://img.shields.io/badge/build-passing-brightgreen?style=for-the-badge)

</div>

---

## 📋 Table of Contents

- [Executive Summary](#executive-summary)
- [Project Identity](#project-identity)
- [Repository Structure](#repository-structure)
- [System Architecture](#system-architecture)
- [Core API (`packages/core-api`)](#core-api-packagescore-api)
  - [Tech Stack](#tech-stack)
  - [Design Principles](#design-principles)
  - [API Endpoints](#api-endpoints)
    - [`GET /health`](#get-health)
    - [`POST /v1/chat/completions`](#post-v1chatcompletions)
    - [`POST /v1/search`](#post-v1search)
  - [Security & Guardrails (SSRF Hardening)](#security--guardrails-ssrf-hardening)
  - [Search Caching](#search-caching)
  - [HTML → Markdown Normalization](#html--markdown-normalization)
  - [Provider Routing Logic](#provider-routing-logic)
- [TypeScript SDK (`packages/sdk-ts`)](#typescript-sdk-packagessdk-ts)
- [Python SDK (`packages/sdk-python`)](#python-sdk-packagessdk-python)
- [Dashboard (`packages/dashboard`)](#dashboard-packagesdashboard)
- [Environment Configuration](#environment-configuration)
- [Integration Test Pipeline](#integration-test-pipeline)
- [Root Workspace](#root-workspace)
- [License](#license)
- [Quick Context for AI Agents](#quick-context-for-ai-agents)
- [Development Workflow](#development-workflow)
- [Roadmap Ideas](#roadmap-ideas)

---

## 🎯 Executive Summary

OminiBridge is a **unified bridge layer** between applications/agents and AI model providers + live search. Instead of wiring multiple provider SDKs and search APIs, you hit a single Hono-based proxy with consistent request/response shapes.

The key distinction: **dual identity model** — `human` vs `agent`. When `agent_mode=true`, the OpenAI path requests `response_format: { type: 'json_object' }` to encourage stricter, parseable JSON for autonomous runtimes.

It also ships with a pragmatic **live search + scraping** stack: Serper (primary) → DuckDuckGo HTML fallback, in-memory SHA-256 cached results (TTL 10m), and safe HTML→Markdown extraction for up to 5 public URLs.

---

## 🏷️ Project Identity

| Field | Value |
|---|---|
| Name | OmniBridge / OminiBridge |
| Tagline | One API to rule them all |
| Focus | Provider abstraction + live search grounding for humans & AI agents |
| License | MIT |
| Author | Mohammed Alwali Yunusa |

---

## 📁 Repository Structure

```text
/workspaces/OminiBridge
├── LICENSE
├── README.md
├── CONTEXT.md         # Complete project context & architecture
├── package.json        # npm workspaces (packages/*)
├── package-lock.json
├── packages
│   ├── core-api        # Hono proxy server
│   ├── dashboard       # Static admin UI stub (GitHub OAuth only)
│   ├── sdk-python      # Agent-first Python client
│   └── sdk-ts          # Universal TS/JS client
└── test-pipeline.ts    # Local integration smoke test
```

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HUMAN DEV  /  AI AGENT                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │  Unified SDK Calls (Bearer Key)
                                ▼
                        ┌─────────────────────────────────┐
                        │   OminiBridge SDKs             │
                        │   TypeScript  ·  Python       │
                        └──────────────┬────────────────┘
                                       │  HTTP POST (JSON)
                                       ▼
                        ┌─────────────────────────────────┐
                        │   Core API (Hono v4)           │
                        │   http://localhost:3000        │
                        └────────────┬──────────┬────────┘
                                     │          │
                              /v1/chat  /v1/search
                                     │          ▼
                                     │    ┌────────────────────────┐
                                     │    │  Search Orchestrator  │
                                     │    │  • Cache (SHA-256)    │
                                     │    │  • Serper → DDG Fallback│
                                     │    │  • SSRF-Safe Scrape  │
                                     │    └────────┬─────┬────────┘
                                     │             │     │
                                     │          Serper  DDG HTML
                                     ▼
                        ┌─────────────────────────────────────┐
                        │        Provider Router             │
                        │  OpenAI (Round-Robin + Failover)  │
                        │  Others → Simulated (Extensible)  │
                        └──────────────┬────────────────────┘
                                       │  identity: human | agent
                                       ▼
                                ┌───────────────────┐
                                │  Unified JSON     │
                                │  Response Shape   │
                                └───────────────────┘
```

---

## 🚀 Core API (`packages/core-api`)

### Tech Stack

- **Runtime**: Node.js + TypeScript (ESM)
- **Framework**: [Hono v4](https://hono.dev/)
- **Server**: `@hono/node-server`
- **Dev**: `tsx watch`
- **Build**: `tsc`

### Design Principles

- **Minimal surface**: Two main actions (`complete`, `search`) exposed via consistent REST.
- **Agent-aware**: `agent_mode` toggles structural expectations (JSON object response format for OpenAI).
- **Resilient search**: Primary + fallback with graceful degradation.
- **Safe scraping**: Strict public-only URL validation + DNS/IP checks + byte/URL limits.
- **Deterministic caching**: Hash-based key includes query, max_results, engine, scrape_urls.
- **Round-robin upstream keys**: Simple, stateless rotation across configured OpenAI keys.

### API Endpoints

#### `GET /health`

Returns service liveness.

```json
{
  "status": "healthy",
  "timestamp": "2026-10-04T..."
}
```

#### `POST /v1/chat/completions`

Unified chat completion proxy.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `provider` | `string` | no | Default `'openai'`. Currently OpenAI uses live routing; others return simulated stub until credentials/logic added. |
| `messages` | `Array<{role:'user'\|'assistant'\|'system', content:string}>` | yes | Standard chat format. |
| `agent_mode` | `boolean` | no | Default `false`. If `true` → identity `'agent'`, OpenAI uses `response_format: { type: 'json_object' }`. |

**Behavior (OpenAI path):**

1. Load keys from `OPENAI_API_KEYS` (comma-split) or fallback to `OPENAI_API_KEY`.
2. If none → return simulated success response with `identity: human|agent`.
3. Else perform round-robin across keys; on each attempt POST to `https://api.openai.com/v1/chat/completions` with model `gpt-4o-mini`.
4. On HTTP error, keep last error/details and try next key.
5. If all keys fail → return `502` with aggregated error + last response data.
6. On success → return upstream JSON wrapped with `{ success: true, provider: 'openai', identity, data }`.

#### `POST /v1/search`

Unified live search + optional page scraping.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `query` | `string` | yes | Non-empty, trimmed. |
| `max_results` | `number` | no | Default `5`. Integer `1..20` (`MAX_SEARCH_RESULTS=20`). |
| `engine` | `'google'\|'bing'\|'perplexity'` | no | Default `'google'`. Accepted values enforced. |
| `scrape_urls` | `string[]` | no | Up to `5` (`MAX_SCRAPE_URLS=5`). Each must be public HTTP(S), no auth, valid. |

**Response shape:**

```json
{
  "success": true,
  "engine": "serper" | "duckduckgo-html",
  "results": [{ "title": "...", "url": "...", "snippet": "..." }],
  "data": { "...": "raw Serper payload if present" },
  "fallback_reason": "...",
  "scraped_content": [...]
}
```

### Security & Guardrails (SSRF Hardening)

- **Protocol allowlist**: Only `http:`/`https:`, no credentials in URL.
- **Hostname blocking**: `localhost`, `.localhost`, `.local`, `.internal` rejected.
- **IP filtering**: Blocks private/loopback/link-local/multicast/CGNAT ranges (IPv4 & IPv6).
- **DNS validation**: All resolved addresses must be public.
- **Safe fetch**: `redirect: 'error'`, 8s timeout, 1MB cap (`MAX_PAGE_BYTES`), stream-limited.
- **Content-type guard**: Only `text/html` or `text/plain` for scraping.

### Search Caching

- In-memory `Map<string, { expiresAt, response }>`
- TTL: `10 * 60 * 1000` (10 minutes)
- Key: SHA-256 of `[query, max_results, engine, scrape_urls]`
- Auto-cleanup of expired entries
- Cap: 500 entries (LRU-style eviction)

### HTML → Markdown Normalization

Cleans noisy blocks, normalizes headings/links/lists, decodes entities, collapses whitespace, resolves relative links.

### Provider Routing Logic

- **OpenAI**: Live proxy with key rotation + `agent_mode` JSON enforcement. Model: `gpt-4o-mini`.
- **Others**: Simulated success with identity (extensible for custom upstreams).

---

## 💻 TypeScript SDK (`packages/sdk-ts`)

```ts
export class OmniBridge {
  constructor(config: { apiKey: string; baseUrl?: string }) { ... }
  async complete(options: CompletionOptions): Promise<any>
  async search(options: SearchOptions): Promise<any>
}
```

- Default `baseUrl`: `http://localhost:3000`
- Auth: `Bearer <apiKey>`
- Maps `agentMode` → `agent_mode`, `maxResults` → `max_results`

---

## 🐍 Python SDK (`packages/sdk-python`)

```python
class OmniBridge:
    def complete(self, provider: str, messages: list[dict], agent_mode: bool = False) -> dict
    def search(self, query: str, engine: str = "google", max_results: int = 5) -> dict
```

Agent-first design, uses `requests>=2.28.0`. Mirrors TS surface exactly.

---

## 🖥️ Dashboard (`packages/dashboard`)

- **Auth**: GitHub OAuth only (stub)
- **Status**: In-memory prototype
- Rotating-key UI controls do not persist or connect to API
- Requires deployed OAuth client + callback/token exchange to enable sign-in

---

## ⚙️ Environment Configuration

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | optional | Single OpenAI key (fallback) |
| `OPENAI_API_KEYS` | optional | Comma-separated for round-robin + failover (takes precedence) |
| `SERPER_API_KEY` | optional | Enables Serper primary search; falls back to DDG HTML if missing/failed |
| `PORT` | optional | Core API port (default 3000) |

---

## 🧪 Integration Test Pipeline

`test-pipeline.ts` validates the full local matrix:

1. **Human Mode** — `agentMode:false`, checks `success` + `identity: 'human'`
2. **Agent Mode** — `agentMode:true`, checks `identity: 'agent'`
3. **Unified Search** — validates search flow, engine selection, results shape

Run: `npx tsx test-pipeline.ts`

---

## 📦 Root Workspace

```json
{
  "name": "omnibridge-root",
  "private": true,
  "workspaces": ["packages/*"],
  "devDependencies": { "tsx": "^4.23.15" }
}
```

---

## 📄 License

MIT License — Copyright (c) 2026 Mohammed Alwali Yunusa  
*"Build By Asym Alwali Cheers 🥂"*

---

## 🤖 Quick Context for AI Agents

```text
Repo: OminiBridge (omnibridge)
Goal: Unified proxy (chat + search) with human/agent identity.

Key files:
- packages/core-api/src/index.ts  -> Hono API, routing, SSRF, search, caching
- packages/sdk-ts/src/index.ts   -> TS client
- packages/sdk-python/omnibridge/__init__.py -> Python client
- packages/dashboard/package.json -> OAuth stub
- test-pipeline.ts -> integration smoke
- README.md, CONTEXT.md -> full docs

Behavior:
- /v1/chat/completions: agent_mode → response_format json_object (OpenAI), identity returned
- /v1/search: Serper if SERPER_API_KEY else DDG HTML; public-only scrape_urls; 10m SHA-256 cache; HTML->MD
- SSRF: DNS+IP private checks, redirects disabled, 1MB cap, text/* only
- Keys: OPENAI_API_KEYS round-robin or OPENAI_API_KEY
- Model: gpt-4o-mini for OpenAI live path

When editing:
- Preserve SSRF guards if touching scrape/search
- Keep identity model consistent (human|agent)
- Don't log secrets
- Follow existing minimal, direct style
- Update CONTEXT.md if architecture changes
```

---

## 💫 Development Workflow

```bash
# Core API (dev)
cd packages/core-api
npm install
npm run dev  # http://localhost:3000

# Build TS SDK
cd packages/sdk-ts && npx tsc

# Build Core API
cd packages/core-api && npx tsc

# Python SDK (editable)
cd packages/sdk-python && pip install -e .

# Smoke test
npx tsx test-pipeline.ts
```

---

## 🗺️ Roadmap Ideas

- [ ] Multi-provider expansion with per-provider keys
- [ ] Persistent dashboard backend (auth + key management)
- [ ] Rate limiting + proxy-level API key auth
- [ ] Response caching by request hash
- [ ] Streaming passthrough (`stream: true`)
- [ ] Structured search parsing & typed results
- [ ] Zod request validation
- [ ] Observability (logs/metrics/tracing)
- [ ] Docker + Docker Compose
- [ ] Typed error contracts across SDKs

---

<div align="center">

**⚡ Bridging Intent • Grounding Context • Powering Agents ⚡**

</div>
