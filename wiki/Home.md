# OminiBridge Wiki

Welcome to the OminiBridge wiki.

OminiBridge is a lightweight proxy abstraction layer that unifies AI model access, live search, grounded retrieval, and agent-friendly interfaces behind one API.

## What OminiBridge does

- Routes requests across providers and keys
- Supports `human` and `agent` response modes
- Adds live search with Serper and DuckDuckGo fallback
- Scrapes pages safely and converts HTML into readable Markdown
- Exposes consistent TypeScript and Python SDKs

## Repository structure

- `packages/core-api` — unified API server built with Hono
- `packages/sdk-ts` — TypeScript client
- `packages/sdk-python` — Python client for AI agents
- `packages/dashboard` — admin UI stub
- `CONTEXT.md` — deep technical context
- `USE_CASES.md` — use cases and architecture tradeoffs

## Quick start

```bash
npm install
cd packages/core-api
npm install
npm run dev
```

The API runs on `http://localhost:3000` by default.

## Key docs

- [Getting Started](./Getting-Started.md)
- [Architecture](./Architecture.md)
- [API Overview](./API-Overview.md)
- [SDKs](./SDKs.md)
- [Roadmap](./Roadmap.md)

## Related links

- [README](../README.md)
- [CONTEXT](../CONTEXT.md)
- [USE_CASES](../USE_CASES.md)

## Maintainer

Built by Mohammed Alwali Yunusa.
