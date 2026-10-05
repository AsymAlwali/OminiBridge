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

### Runtime optimization delivered

- **Coalesce identical concurrent search misses:** implemented as a bounded
  in-process single-flight using the existing cache key. Concurrent identical
  cold searches share one cache read, upstream lookup, scrape, and cache write;
  settled or failed operations are removed, and cache outage policy is
  preserved. An integration burst confirms eight simultaneous identical
  requests cause one upstream lookup.

### Next

- Expand provider support and improve per-provider key configuration.
- Add streaming passthrough, structured search parsing, and stronger request
  schema validation.
- Develop a persistent dashboard backend only after its authorization model is
  reviewed.
- Configure optional distributed tracing via OTLP/HTTP and W3C context
  propagation; see the [README](../README.md#distributed-tracing).

The repo also includes the core abstraction, TypeScript and Python SDKs, search
support, and a CI test pipeline.

## Related docs

- [Architecture](./Architecture.md)
- [API Overview](./API-Overview.md)
- [SDKs](./SDKs.md)
