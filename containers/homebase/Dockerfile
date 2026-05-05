# Stage 1 — compile the server
FROM node:20-alpine AS build
WORKDIR /build
RUN apk add --no-cache python3 make g++
COPY server/package.json ./
RUN npm install
COPY server/src ./src
COPY server/tsconfig.json ./
RUN npm run build

# Stage 2 — runtime
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
