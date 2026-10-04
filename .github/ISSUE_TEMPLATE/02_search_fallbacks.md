---
name: Search provider fallbacks
about: Improve resilient, observable multi-provider search routing
title: "[Search] Harden provider fallback routing"
labels: enhancement, backend
assignees: ''
---

## Summary

Extend the `/v1/search` Serper-to-DuckDuckGo fallback so provider selection, failures, and response normalization remain predictable as more engines are added.

## Reproduction steps

1. Start the core API without `SERPER_API_KEY`.
2. Submit a `POST /v1/search` request with a valid query.
3. Observe the DuckDuckGo HTML fallback response.
4. Configure an invalid Serper key or simulate a provider timeout and repeat the request.

## Expected behavior

- Provider errors and timeouts proceed to the next supported provider.
- Responses consistently identify the provider and return normalized `results`.
- If every provider fails, the endpoint returns an explicit error rather than fabricated success data.
- Provider outages and fallback selection are observable without exposing credentials.

## Technical specifications

- Define ordered provider adapters with bounded request timeouts and per-provider parsing.
- Preserve result shape (`title`, `url`, and `snippet`) across supported engines.
- Respect configurable result limits and avoid following untrusted redirects.
- Add deterministic tests for missing credentials, non-2xx responses, timeouts, malformed HTML, and total outage.
- Document provider environment variables, supported engines, and fallback order.

## Claiming this issue

Comment that you would like to work on this issue and wait for maintainer assignment before opening a pull request.
