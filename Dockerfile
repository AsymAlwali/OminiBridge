FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core-api/package.json packages/core-api/package.json
COPY packages/sdk-ts/package.json packages/sdk-ts/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN npm ci

COPY packages/core-api/src packages/core-api/src
COPY packages/core-api/migrations packages/core-api/migrations
COPY packages/core-api/tsconfig.json packages/core-api/tsconfig.json
RUN npm run build --workspace @omnibridge/core-api

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/core-api/package.json packages/core-api/package.json
COPY packages/sdk-ts/package.json packages/sdk-ts/package.json
COPY packages/dashboard/package.json packages/dashboard/package.json
RUN npm ci --omit=dev && chown -R node:node /app

COPY --from=build --chown=node:node /app/packages/core-api/dist packages/core-api/dist
COPY --from=build --chown=node:node /app/packages/core-api/migrations packages/core-api/migrations

USER node
EXPOSE 3000
CMD ["sh", "-c", "node packages/core-api/dist/migrate.js && exec node packages/core-api/dist/index.js"]
