# ── compile @knightsrook/xapi ────────────────────────────────────────────────
FROM node:20-alpine AS xapi-build
WORKDIR /repo/packages/xapi
COPY packages/xapi/package.json .
RUN npm install
COPY packages/xapi/tsconfig.json .
COPY packages/xapi/src/ ./src/
RUN npm run build

# ── compile the relay ────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /repo/containers/station-controller
COPY containers/station-controller/package.json .
RUN npm install
RUN mkdir -p node_modules/@knightsrook/xapi
COPY --from=xapi-build /repo/packages/xapi/dist/ node_modules/@knightsrook/xapi/dist/
RUN echo '{"name":"@knightsrook/xapi","version":"0.1.0","type":"module","exports":{".":{"import":"./dist/index.js","types":"./dist/index.d.ts"},"./file-queue":{"import":"./dist/fileQueue.js","types":"./dist/fileQueue.d.ts"},"./lrs-client":{"import":"./dist/lrsClient.js","types":"./dist/lrsClient.d.ts"}}}' \
    > node_modules/@knightsrook/xapi/package.json
COPY packages/xapi/src/ /repo/packages/xapi/src/
COPY containers/station-controller/tsconfig.json containers/station-controller/relay.ts containers/station-controller/telemetry.ts ./
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
COPY --from=build /repo/containers/station-controller/package.json ./
COPY --from=build /repo/containers/station-controller/node_modules ./node_modules
COPY --from=build /repo/containers/station-controller/dist ./dist
RUN mkdir -p /app/data

EXPOSE 5021
CMD ["node", "dist/relay.js"]
