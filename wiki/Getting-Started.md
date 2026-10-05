# Getting Started

This guide helps you get the project running locally and start using the platform.

## Prerequisites

- Node.js 20+
- npm
- Python 3.8+
- Optional API keys for OpenAI or Serper

## Install dependencies

```bash
npm install
```

## Run the API server

```bash
cd packages/core-api
npm install
npm run dev
```

The service should run at:

```text
http://localhost:3000
```

## Optional environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Optional | Default OpenAI key |
| `OPENAI_API_KEYS` | Optional | Comma-separated key rotation list |
| `SERPER_API_KEY` | Optional | Enables Serper search |
| `PORT` | Optional | Overrides default port |

If no keys are configured, the project can still operate in simulated mode for local testing.

## Test the stack

```bash
npx tsx test-pipeline.ts
```

## Next steps

- Read the [Architecture](./Architecture.md)
- Review the [API Overview](./API-Overview.md)
- Explore the SDK guides in [SDKs](./SDKs.md)
