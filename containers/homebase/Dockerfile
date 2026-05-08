# ── compile @knightsrook/xapi ────────────────────────────────────────────────
FROM node:20-alpine AS xapi-build
WORKDIR /repo/packages/xapi
COPY packages/xapi/package.json .
RUN npm install
COPY packages/xapi/tsconfig.json .
COPY packages/xapi/src/ ./src/
RUN npm run build

# ── compile the server ───────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /build
COPY server/package.json ./
RUN npm install
RUN mkdir -p node_modules/@knightsrook/xapi
COPY --from=xapi-build /repo/packages/xapi/dist/ node_modules/@knightsrook/xapi/dist/
RUN echo '{"name":"@knightsrook/xapi","version":"0.1.0","type":"module","exports":{".":{"import":"./dist/index.js","types":"./dist/index.d.ts"},"./file-queue":{"import":"./dist/fileQueue.js","types":"./dist/fileQueue.d.ts"},"./lrs-client":{"import":"./dist/lrsClient.js","types":"./dist/lrsClient.d.ts"}}}' \
    > node_modules/@knightsrook/xapi/package.json
COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY --from=build /build/package.json ./
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
RUN mkdir -p /app/data

ENV PORT=5020
ENV NODE_ENV=production
ENV USE_MOCK=false

EXPOSE 5020
CMD ["node", "dist/index.js"]
