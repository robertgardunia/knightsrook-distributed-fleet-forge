# Build client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json .
RUN npm install -g pnpm && pnpm install
COPY client/ .
RUN pnpm build

# Build server
FROM node:20-alpine AS server-build
WORKDIR /app/server
COPY server/package.json .
RUN npm install -g pnpm && pnpm install
COPY server/ .
RUN pnpm build

# Production
FROM node:20-alpine
WORKDIR /app
COPY --from=server-build /app/server/dist ./dist
COPY --from=server-build /app/server/node_modules ./node_modules
COPY --from=client-build /app/client/dist ./public

ENV NODE_ENV=production
ENV PORT=5020

EXPOSE 5020
CMD ["node", "dist/index.js"]
