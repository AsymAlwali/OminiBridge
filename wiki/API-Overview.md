# API Overview

OminiBridge provides a simplified API surface intended to hide provider-specific complexity.

## Request flow

Most interactions follow the same pattern:

1. Client sends a request with a provider and prompt
2. OminiBridge selects the right provider handling
3. Optional live search is invoked for grounding
4. Response is normalized and returned

## Typical formats

### Completion request

```ts
const response = await omni.complete({
  provider: 'openai',
  messages: [{ role: 'user', content: 'Summarize this architecture.' }],
  agentMode: false
});
```

### Search request

```ts
const search = await omni.search({
  query: 'Top open-source AI repos 2026',
  engine: 'google',
  maxResults: 5
});
```

## Modes

### Human mode

Used for standard interactive assistant behavior.

### Agent mode

Used for structured, machine-readable responses suitable for agents and automation flows.

## Safety and behavior

- `/health` is public. `/v1/chat/completions` and `/v1/search` require a scoped
  `Authorization: Bearer <api-key>` token by default.
- API keys are tenant-scoped, stored as SHA-256 hashes in PostgreSQL, and can
  be revoked by an operator. Missing/invalid credentials return `401`;
  insufficient scopes return `403`; unavailable auth storage fails closed with
  `503`.
- Local unauthenticated development requires explicitly setting
  `AUTH_MODE=development`. Do not use this mode for deployed services.
- Authenticated production requests require `REDIS_URL` for shared, atomic
  per-tenant fixed-window limits (default 60 requests per 60 seconds;
  configurable with `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`).
  Limit responses return `429` with `Retry-After`; Redis failures fail closed
  with `503`.
- `DATABASE_URL` must have migrations `001_tenant_api_keys.sql`,
  `002_shared_limits_and_usage.sql`, and `003_monthly_request_budgets.sql`
  applied. Authenticated request outcomes
  are durably recorded in `request_usage` as request ID, tenant, operation,
  status, and duration only; prompt and credential fields are not stored.
- Operators can set a tenant's monthly successful-request budget with the
  `keys set-budget` command. Budgets count 2xx operations per UTC month;
  failed operations do not consume a slot, and PostgreSQL reservations prevent
  concurrent API replicas from exceeding the configured budget.
- PostgreSQL usage-write failures return `503` because the upstream operation
  may already have completed and its outcome cannot be safely reported.
- Search cache uses Redis in authenticated mode and a bounded in-memory adapter
  in development. `SEARCH_CACHE_FAILURE_MODE=bypass` (default) lets the search
  proceed without caching; `fail` returns `503`. Cache keys include query,
  result count, engine, and scrape URLs; successful entries expire after ten
  minutes.
- `/health` is liveness; `/ready` checks PostgreSQL and Redis availability.
  Database migrations are ordered and tracked by
  `npm run migrate --workspace @omnibridge/core-api` and run automatically in
  the Docker Compose API container.
- `/metrics` is disabled unless `METRICS_TOKEN` is configured; when enabled it
  requires that bearer token and exposes per-operation/status counters and
  latency histograms without tenant- or prompt-level labels.
- DNS and IP validation for fetch targets
- Redirect blocking
- Request size caps
- Scraping output normalized to Markdown
- Search results can be cached to reduce repeated operations

## Related docs

- [Architecture](./Architecture.md)
- [SDKs](./SDKs.md)
- [Roadmap](./Roadmap.md)
