# Roadmap

This project is intentionally compact, but the roadmap highlights the next logical improvements.

## Production Gateway Foundation

The proposal's three delivery phases and monthly request budgets are
implemented: tenant API-key authentication and scopes, shared Redis rate
limits and search cache, durable PostgreSQL usage, tracked migrations,
readiness/liveness checks, metrics, SDK error handling, and a Docker Compose
deployment. See the
[proposal](../PROPOSALS/production-gateway-foundation.md) for scope and
acceptance criteria.

### Next

- **Distributed tracing:** add trace context across incoming API requests,
  provider/search calls, and service boundaries, while keeping credentials and
  prompt content out of telemetry.

### Later product improvements

- Expand provider support and improve per-provider key configuration.
- Add streaming passthrough, structured search parsing, and stronger request
  schema validation.
- Develop a persistent dashboard backend only after its authorization model is
  reviewed.

The repo also includes the core abstraction, TypeScript and Python SDKs, search
support, and a CI test pipeline.

## Related docs

- [Architecture](./Architecture.md)
- [API Overview](./API-Overview.md)
- [SDKs](./SDKs.md)
