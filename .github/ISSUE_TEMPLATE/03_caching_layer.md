---
name: Search caching layer
about: Improve correctness and operations of the in-memory search cache
title: "[Search] Expand cache lifecycle and concurrency coverage"
labels: enhancement, backend
assignees: ''
---

## Summary

Build on the `/v1/search` in-memory ten-minute cache with defined concurrency behavior, observability, and a clear path to shared cache storage for multi-instance deployments.

## Reproduction steps

1. Submit identical `POST /v1/search` requests to one API process.
2. Repeat the request within ten minutes and observe the cached response.
3. Send equivalent requests to separate API processes or send concurrent cache misses.

## Expected behavior

- Equivalent query/options reuse a valid cached response until its TTL expires.
- Concurrent identical misses do not cause a burst of duplicate provider requests.
- Cache entries cannot grow without bound.
- Cache behavior is documented as process-local and not shared between replicas.

## Technical specifications

- Keep cache keys collision-resistant and include all request options that change results.
- Define TTL and maximum entry count/eviction behavior.
- Add tests for expiry, option-sensitive keys, concurrent requests, failed requests, and capacity eviction.
- Add cache hit/miss/eviction metrics without logging query secrets or provider credentials.
- Evaluate an injectable shared cache adapter as a separate, backward-compatible deployment option.

## Claiming this issue

Comment that you would like to work on this issue and wait for maintainer assignment before opening a pull request.
