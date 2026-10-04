# 🌉 OmniBridge

One API to rule them all. An ultra-lightweight, open-source proxy abstraction layer built to unify top AI models, services, and live search engines into a singular context-aware structure. **Built from the ground up to support both human developers and autonomous AI agents natively.**

## 📂 Repository Architecture
- `packages/core-api`: High-performance Hono-based routing framework.
- `packages/sdk-ts`: Universal JavaScript/TypeScript client library.
- `packages/sdk-python`: Agent-first Python client library.

## 🚀 Quickstart

### Core API Server Setup
```bash
cd packages/core-api
npm install
npm run dev
```

### SDK Usage Examples

#### TypeScript (Humans)
```typescript
import { OmniBridge } from '@omnibridge/sdk';

const omni = new OmniBridge({ apiKey: 'OMNI_KEY_SECRET' });
const response = await omni.complete({
  provider: 'anthropic',
  messages: [{ role: 'user', content: 'Execute core analysis.' }]
});
console.log(response);
```

#### Python (AI Agents / Automated Runtimes)
```python
from omnibridge import OmniBridge

omni = OmniBridge(api_key="OMNI_KEY_SECRET")
# Elevate to agent_mode=True for structural JSON alignment
response = omni.complete(
    provider="openai", 
    messages=[{"role": "user", "content": "Retrieve search space definitions."}], 
    agent_mode=True
)
print(response)
```

## 📄 License
Distributed under the MIT License. See `LICENSE` for more information.
