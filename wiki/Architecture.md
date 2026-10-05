# Architecture

OminiBridge is designed as a small, focused gateway layer between applications and AI infrastructure.

## Core ideas

1. Unify requests behind one interface.
2. Keep provider-specific logic isolated.
3. Add live grounding and retrieval without forcing app complexity.
4. Support both human and agent workflows with minimal friction.

## High-level flow

```text
Application / Agent
        |
        v
OminiBridge API
        |
   +----+--------------------+
   |                         |
   v                         v
LLM Providers           Search + Scraping
   - OpenAI                - Serper
   - Extensible providers  - DuckDuckGo fallback
                           - Markdown extraction
```

## Package responsibilities

### `packages/core-api`

This is the main API server. It exposes the unified routing and request handling layer built on Hono.

### `packages/sdk-ts`

This package provides the JavaScript/TypeScript client. It is intended for regular app developers and internal integrations.

### `packages/sdk-python`

This package provides Python access for AI agents and automation workflows.

### `packages/dashboard`

A lightweight dashboard stub for future admin or control-plane features.

## Design characteristics

- Fast to start locally
- Minimal dependency footprint
- Safe by default for scraping and external fetches
- Build for context-aware AI use cases

## Related docs

- [Getting Started](./Getting-Started.md)
- [API Overview](./API-Overview.md)
- [SDKs](./SDKs.md)
