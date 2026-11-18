FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
RUN npm ci

FROM node:24-alpine AS production-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --workspace @luna/api --include-workspace-root=false

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM node:24-alpine AS runtime
ARG LUNA_VERSION=dev
ENV NODE_ENV=production \
    PORT=3001 \
    LUNA_VERSION=$LUNA_VERSION \
    WEB_DIST=/app/web
WORKDIR /app
COPY --from=production-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist /app/dist
COPY --from=build --chown=node:node /app/apps/web/dist /app/web
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
CMD ["node", "/app/dist/index.js"]
