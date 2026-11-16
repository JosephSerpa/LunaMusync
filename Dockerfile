FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/design-tokens/package.json packages/design-tokens/package.json
RUN npm ci

COPY apps ./apps
COPY packages ./packages
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    WEB_DIST=/app/web
WORKDIR /app

COPY --from=build --chown=node:node /app/apps/api/dist /app/dist
COPY --from=build --chown=node:node /app/apps/web/dist /app/web
USER node
EXPOSE 3001
CMD ["node", "/app/dist/index.js"]
