# Proposal: Production Gateway Foundation

## The idea

Turn OminiBridge from a useful single-process proxy into a secure, horizontally
scalable gateway that multiple applications and teams can safely share.

The contribution is a tenant-aware control plane for identity, quotas, and
usage, backed by durable shared infrastructure. It closes the gap between the
SDKs' existing bearer authentication headers and the API, which currently does
not authenticate requests. It also replaces important process-local
assumptions with shared state suitable for multiple API replicas.

This is an infrastructure foundation, not a dashboard redesign or a collection
of unrelated provider integrations.

## Implementation status

- **Phase 1 delivered:** PostgreSQL-backed tenant keys, scopes, revocation,
  explicit local-only auth bypass, operator key commands, SDK error handling,
  and deterministic coverage.
- **Phase 2 delivered:** Redis fixed-window limits shared across API instances,
  durable PostgreSQL request outcome metadata, privacy-safe request IDs, and
  fail-closed behavior for limiter/audit-store outages.
- **Phase 3 delivered:** Redis search cache with explicit outage policy,
  advisory-lock-protected tracked migrations, liveness/readiness checks,
  graceful shutdown, authenticated Prometheus metrics, Docker image, Compose
  stack behind a scaleable Nginx proxy, deployment/backup docs, and CI backup/
  restore validation.
- **Monthly budgets delivered:** Per-tenant successful-request budgets are
  enforced in PostgreSQL across replicas, with concurrent request reservations
  and UTC calendar-month accounting.
- **Distributed tracing delivered:** Optional OTLP/HTTP export, W3C trace
  context propagation for inbound and outbound requests, graceful exporter
  shutdown, and bounded spans that exclude bodies, URLs, headers, and error
  messages.

## Why this is the highest-leverage contribution

Today, anyone who can reach the API can use its upstream integrations; the
bearer token the SDK sends is not checked. Search cache entries and OpenAI key
rotation state live in one process, so replicas do not share them. There is no
tenant boundary, request budget, durable usage history, or operational
deployment definition.

Those limitations make it difficult to safely expose OminiBridge to more than
one application or run it as a dependable service. A secure tenant boundary
and shared runtime state create the foundation on which provider expansion,
dashboard controls, and production operations can be built.

## Proposed architecture

- **Core API (data plane):** Keep the existing Hono API and SDK-compatible
  endpoints. Add authentication, authorization, request limits, and consistent
  error responses as middleware around provider and search operations.
- **PostgreSQL (control-plane source of truth):** Persist tenants, API-key
  metadata, per-tenant policies, and usage records. Store only a one-way hash
  of each API key; show the plaintext key only once at creation.
- **Redis (shared runtime state):** Provide atomic distributed rate limits and
  a shared search cache so replicas enforce the same budgets and reuse results.
  Keep cache failure behavior explicit and configurable; never silently turn
  an infrastructure failure into a misleading cache hit.
- **Provider credentials:** Continue to load upstream provider secrets from
  server-side environment configuration or a deployment secret manager. Do
  not put provider credentials in tenant records, SDKs, browser storage, or the
  dashboard.
- **Operations:** Supply a local Docker Compose stack, readiness checks, schema
  migrations, structured request IDs, and documented backup and deployment
  expectations.

- **Administration:** Provide an operator-only CLI bootstrap and key-management
  workflow for the first release. Do not add public key-management endpoints
  or rely on the unfinished dashboard; review a separate admin API and its
  authentication boundary before introducing one.

PostgreSQL remains the durable authority. Redis is disposable and can be
repopulated; losing it must not lose tenants, credentials metadata, or usage
records.

## Main capabilities

1. **Tenant API keys:** Create, list metadata for, revoke, and rotate keys.
   Keys have a recognizable public prefix, are stored as secure hashes, and
   can be scoped to allowed operations. Revocation takes effect across API
   replicas.
2. **Tenant isolation and budgets:** Associate every authenticated request
   with one tenant. Enforce configurable per-tenant request/rate limits and
   monthly successful-request budgets centrally, with clear `401`, `403`, and
   `429` responses. Failed operations do not consume successful-request budget.
3. **Durable usage and audit trail:** Record bounded, privacy-conscious
   metadata such as tenant, operation, provider, status, latency, and estimated
   usage where available. Never record bearer tokens, provider secrets, or
   full prompts by default.
4. **Replica-safe runtime behavior:** Share cache entries and rate-limit
   counters across replicas. Keep provider routing independent of any one
   process's memory.
5. **Safe operations:** Expose liveness and readiness separately, support
   graceful startup/shutdown, provide migrations and a reproducible local
   deployment, and document database backup/restore.

## Delivery plan

### Phase 1 — Secure request boundary

- Define authentication and typed authorization/error contracts.
- Add API-key storage and migrations, secure key generation, hash verification,
  key revocation, and operation scopes.
- Require authentication outside explicit local-development mode; keep
  `/health` public and avoid treating a missing key as a successful identity.
- Update both SDKs to surface non-success HTTP responses and typed auth/rate
  limit errors rather than returning JSON as though every response succeeded.
- Add deterministic tests for valid, invalid, revoked, and scoped keys.

### Phase 2 — Shared limits and durable usage

- Add tenant-aware atomic rate limiting with Redis.
- Add PostgreSQL usage records and configurable budgets with documented
  semantics for failed and retried upstream requests.
- Add privacy-safe metrics and request correlation IDs.
- Test concurrent requests and multiple API instances against the same
  backend services.

### Phase 3 — Deployment and operational readiness

- Move search cache behind a shared cache interface and add a Redis adapter
  while retaining the in-memory adapter for local/minimal deployments.
- Add Docker Compose for the API, PostgreSQL, and Redis, with persistent
  database storage and health/readiness wiring.
- Add migrations, backup/restore instructions, configuration reference, and
  deployment examples.
- Add integration coverage for startup, migration, revocation propagation,
  quota enforcement, cache sharing, and dependency outages.

Ship these phases incrementally. The API-key security boundary is the first
release gate; a partially configured production deployment must fail closed,
not fall back to unauthenticated access.

## Compatibility and rollout

- Preserve the current endpoint shapes for successful completion and search
  requests.
- Make authentication mode explicit. Local simulated development can remain
  convenient, but production mode must reject unauthenticated traffic.
- Do not silently accept the existing SDK placeholder token as a real
  credential. Document local setup and provide a deliberate bootstrap path for
  the first tenant and API key through an operator-only CLI command.
- Keep current in-memory cache behavior available for single-process local
  use; production deployment uses Redis.
- Keep provider credential rotation separate from tenant API-key lifecycle.

## Security and reliability requirements

- Use cryptographically secure random API keys and a constant-time hash
  verification strategy where applicable.
- Never log full API keys, provider secrets, or prompts; redact authorization
  headers in all logging paths.
- Apply request/body limits before expensive parsing and upstream work.
- Rate limiting must be atomic across replicas and fail according to an
  explicit configured policy; production defaults should fail closed for
  protected operations when quota state cannot be checked.
- Migrations must be repeatable and safe to apply during deployment. Document
  rollback limitations for destructive schema changes.
- Database and Redis credentials must be supplied through deployment secrets,
  not committed configuration.
- Do not expose a public admin endpoint for key creation. Bootstrap and
  administrative access need a separately reviewed trust boundary.

## Acceptance criteria

- Requests without a valid tenant key cannot call completion or search
  endpoints in production mode.
- Revoking a key blocks it on every API replica without restarting services.
- Per-tenant rate limits and budgets remain correct under concurrent requests
  and across multiple API instances.
- Usage records survive API restarts and contain no credentials or prompt
  content by default.
- Search cache hits are shared across replicas when the Redis adapter is used;
  Redis outages follow documented behavior.
- `docker compose up` starts a locally usable stack from documented
  configuration, and database migrations run predictably.
- Existing TS and Python SDKs expose authentication and upstream failures
  clearly, with coverage for successful and failed HTTP responses.
- CI exercises deterministic unit/integration tests without relying on paid
  upstream provider credentials.

## Explicit non-goals for this contribution

- Building a general-purpose workflow/agent orchestration engine.
- Storing or proxying end-user/provider credentials in the browser.
- Implementing GitHub OAuth or a production dashboard before its backend
  authorization model is reviewed.
- Claiming exact token-cost accounting for providers that do not return usage.
- Replacing the existing provider adapters or adding every model provider.
- Treating API-key rotation as a way to evade upstream provider quotas or
  account restrictions.

## Why it is a huge lift

This touches the API boundary, both SDKs, persistence, shared coordination,
deployment, security, testing, and operations. It is deliberately a sequence
of reviewable releases rather than one risky rewrite. If completed, it changes
OminiBridge's ceiling: teams can share one deployment with isolated access and
limits, and operators can scale or restart API replicas without losing the
control-plane state that makes the service trustworthy.
