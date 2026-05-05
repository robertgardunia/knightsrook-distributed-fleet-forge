FROM node:20-alpine AS build
WORKDIR /build
COPY package.json ./
RUN npm install
COPY tsconfig.json *.ts ./
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
CMD ["node", "dist/agent.js"]
