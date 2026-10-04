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

Set `OPENAI_API_KEYS` to a comma-separated list of upstream OpenAI API keys to enable round-robin routing and automatic fallback; `OPENAI_API_KEY` remains supported for a single key. `/v1/search` tries Serper when `SERPER_API_KEY` is configured, then falls back to DuckDuckGo HTML search if Serper fails or is unavailable. Successful results are cached in memory for ten minutes using a SHA-256 hash of the query and request options. To extract page text, pass up to five public HTTP(S) URLs in `scrape_urls`; the response includes clean Markdown under `scraped_content`.

### Dashboard Stub

`packages/dashboard` contains a static administrative UI stub. It is configured for GitHub OAuth only; a deployed OAuth client and callback/token-exchange service must be configured before sign-in can be enabled. The rotating-key controls are an in-memory UI prototype and do not persist credentials or connect to the API.

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
