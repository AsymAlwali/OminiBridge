# SDKs

OminiBridge includes SDKs for both TypeScript and Python.

## TypeScript SDK

The TypeScript SDK is meant for JavaScript and Node-based application developers.

```ts
import { OmniBridge } from '@omnibridge/sdk';

const omni = new OmniBridge({
  apiKey: 'OMNI_KEY_SECRET',
  baseUrl: 'http://localhost:3000'
});

const response = await omni.complete({
  provider: 'openai',
  messages: [{ role: 'user', content: 'Generate a summary.' }],
  agentMode: false
});
```

## Python SDK

The Python SDK is designed for agent-driven workflows and automation systems.

```python
from omnibridge import OmniBridge

omni = OmniBridge(api_key="OMNI_KEY_SECRET", base_url="http://localhost:3000")
response = omni.complete(
    provider="openai",
    messages=[{"role": "user", "content": "Analyze system architecture."}],
    agent_mode=True
)
```

## SDK benefits

- Consistent request shape across languages
- Agent-focused response support
- Easier integration for apps that need both generation and search

## Related docs

- [Getting Started](./Getting-Started.md)
- [API Overview](./API-Overview.md)
- [Architecture](./Architecture.md)
