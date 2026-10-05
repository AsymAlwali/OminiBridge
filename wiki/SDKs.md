# SDKs

OminiBridge includes SDKs for both TypeScript and Python.

## TypeScript SDK

The TypeScript SDK is meant for JavaScript and Node-based application developers.

```ts
import { OmniBridge } from '@omnibridge/sdk';

const omni = new OmniBridge({
  apiKey: process.env.OMNIBRIDGE_API_KEY!,
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
import os
from omnibridge import OmniBridge

omni = OmniBridge(api_key=os.environ["OMNIBRIDGE_API_KEY"], base_url="http://localhost:3000")
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
- Non-success HTTP responses raise typed `OmniBridgeError` exceptions with the
  HTTP status and parsed response body (`status` in TypeScript,
  `status_code` in Python). Keep API keys in environment/configuration secrets.

## Related docs

- [Getting Started](./Getting-Started.md)
- [API Overview](./API-Overview.md)
- [Architecture](./Architecture.md)
