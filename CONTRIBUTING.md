# 🌉 Contributing to OminiBridge

Thank you for checking out OminiBridge! This project is an open-source AI gateway prototype that provides a shared HTTP interface for chat requests and web search, with TypeScript and Python client libraries.

Contributions are welcome, especially work that makes provider behavior more reliable, improves security and testing, or develops the administrative dashboard beyond its current static prototype.

## 🎨 Dashboard design and implementation

The `packages/dashboard` directory currently contains a static UI stub. It is not a finished admin product: GitHub OAuth callback/token exchange is not implemented, the API does not authenticate dashboard users, and the key controls are in-memory UI only.

We welcome creative frontend contributions. Dark mode, accessible interactions, clear status displays, and responsive layouts are encouraged.

### Dashboard goals

- **Low-cost hosting:** Aim for static hosting such as GitHub Pages or a Vercel free tier where suitable. Hosting and OAuth callback requirements may still need a serverless function and can be subject to provider plan limits.
- **GitHub sign-in:** GitHub should be the only sign-in provider unless maintainers approve a change. A secure implementation must validate OAuth state and exchange secrets server-side; a static page must never contain a GitHub OAuth client secret.
- **Key management UX:** Design interfaces for listing, adding, labeling, rotating, and removing configured keys. A secure implementation must use a trusted server-side secret store or protected backend API. Never persist real provider keys in browser storage or expose them to client-side scripts.
- **Cache analytics:** A dashboard panel could visualize cache hits, misses, latency, or estimated upstream requests saved. The current API does not expose these metrics, so backend instrumentation and a documented API may be needed before a live chart can work.
- **Creative freedom:** There is no required component library or fixed wireframe. Include screenshots or a short GIF with UI pull requests when possible.

No custom database is required for a static interface, but authentication and secret management still need secure server-side components. Please explain the trust boundary and deployment assumptions in your proposal.

## 🛠️ Local development setup

### 1. Clone the repository

```bash
git clone https://github.com/AsymAlwali/OminiBridge.git
cd OminiBridge
```

### 2. Install dependencies

Use Node.js 20 or later and install the workspace dependencies:

```bash
npm install
```

The Python SDK requires Python 3.8 or later and `requests`. If `requests` is not already installed in your environment:

```bash
python -m pip install requests
```

### 3. Configure optional upstream credentials

The API can run without credentials for local checks. In that mode, chat requests may return simulated responses and search uses the DuckDuckGo HTML fallback. To exercise live Serper search, configure `SERPER_API_KEY`. To exercise live OpenAI completions, configure `OPENAI_API_KEY` or a comma-separated list in `OPENAI_API_KEYS`.

Keep credentials in environment variables or an approved secret manager. Do not add real credentials to source files, examples, screenshots, logs, or pull requests.

### 4. Start the API

In one terminal:

```bash
npx tsx packages/core-api/src/index.ts
```

The default address is `http://localhost:3000`. Check readiness in another terminal:

```bash
curl --fail http://localhost:3000/health
```

### 5. Run validation

In a second terminal, run the TypeScript and Python integration matrices:

```bash
npx tsx test-pipeline.ts
python test_pipeline.py
```

The search checks can make an external request to DuckDuckGo when no Serper key is configured. A green local test is useful evidence, but it does not replace deterministic mocked tests for provider errors, cache expiry, security checks, or parsing edge cases.

Build all TypeScript workspaces with:

```bash
npm run build --workspaces --if-present
```

## 🧭 Contribution areas

Good areas for focused contributions include:

- provider adapters with normalized response and error contracts;
- deterministic tests for key rotation, timeouts, cache behavior, and provider failures;
- authentication, authorization, rate limits, and request validation;
- bounded, well-tested search parsing and SSRF defenses;
- cache metrics and deployment-aware shared caching;
- dashboard accessibility, responsive design, and secure serverless integration;
- SDK typing, error handling, and clear usage examples; and
- documentation that accurately distinguishes implemented features from roadmap ideas.

Before starting a large feature, check existing issues or open a discussion to agree on scope and security expectations.

## 📬 Submitting pull requests

1. Fork the repository and create a focused branch:

   ```bash
   git checkout -b feature/short-description
   ```

2. Make the smallest complete change that addresses the issue. Follow existing project patterns and update related documentation.
3. Add or update tests for behavior changes. Avoid tests that depend on live upstream services when a deterministic mock can cover the behavior.
4. Run relevant validation, including the workspace build and integration matrices when applicable.
5. Open a pull request with a clear summary, rationale, testing performed, and any configuration or security implications.
6. For dashboard changes, include a screenshot or GIF when it helps reviewers evaluate the UI.

If an issue is marked as available to claim, comment on it before starting substantial work so maintainers can coordinate contributors. Reference the relevant issue in the pull request when one exists.

## 🔐 Security and responsible use

- Never commit API keys, OAuth client secrets, tokens, or personal data.
- Do not describe key rotation as a way to evade provider rate limits, quotas, account controls, or terms.
- Treat search results and scraped pages as untrusted input; do not execute page content or treat it as trusted instructions.
- Report security vulnerabilities privately to repository maintainers rather than publishing exploit details in a public issue.
- Do not present the current dashboard stub, bearer-token SDK field, or in-memory key controls as production authentication or secure key storage.
