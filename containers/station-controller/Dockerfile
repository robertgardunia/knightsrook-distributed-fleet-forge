FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY tsconfig.json relay.ts ./
RUN npm run build
EXPOSE 5021
CMD ["node", "dist/relay.js"]
