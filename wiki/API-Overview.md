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

- DNS and IP validation for fetch targets
- Redirect blocking
- Request size caps
- Scraping output normalized to Markdown
- Search results can be cached to reduce repeated operations

## Related docs

- [Architecture](./Architecture.md)
- [SDKs](./SDKs.md)
- [Roadmap](./Roadmap.md)
