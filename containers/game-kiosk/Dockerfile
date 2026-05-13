# ── compile @knightsrook/xapi ────────────────────────────────────────────────
FROM node:20-alpine AS xapi-build
WORKDIR /repo/packages/xapi
COPY packages/xapi/package.json .
RUN npm install
COPY packages/xapi/tsconfig.json .
COPY packages/xapi/src/ ./src/
RUN npm run build

# ── compile @knightsrook/codes ───────────────────────────────────────────────
FROM node:20-alpine AS codes-build
WORKDIR /repo/packages/codes
COPY packages/codes/package.json .
RUN npm install
COPY packages/codes/tsconfig.json .
COPY packages/codes/src/ ./src/
RUN npm run build

# ── compile the fleet agent ──────────────────────────────────────────────────
FROM node:20-alpine AS agent-build
WORKDIR /repo/containers/game-kiosk
COPY containers/game-kiosk/package.json .
RUN npm install
RUN mkdir -p node_modules/@knightsrook/xapi node_modules/@knightsrook/codes
COPY --from=xapi-build  /repo/packages/xapi/dist/  node_modules/@knightsrook/xapi/dist/
COPY --from=codes-build /repo/packages/codes/dist/ node_modules/@knightsrook/codes/dist/
RUN echo '{"name":"@knightsrook/xapi","version":"0.1.0","type":"module","exports":{".":{"import":"./dist/index.js","types":"./dist/index.d.ts"},"./file-queue":{"import":"./dist/fileQueue.js","types":"./dist/fileQueue.d.ts"},"./lrs-client":{"import":"./dist/lrsClient.js","types":"./dist/lrsClient.d.ts"}}}' \
    > node_modules/@knightsrook/xapi/package.json
RUN echo '{"name":"@knightsrook/codes","version":"0.1.0","type":"module","exports":{".":{"import":"./dist/index.js","types":"./dist/index.d.ts"},"./catcher":{"import":"./dist/catcher.js","types":"./dist/catcher.d.ts"},"./batcher":{"import":"./dist/batcher.js","types":"./dist/batcher.d.ts"}}}' \
    > node_modules/@knightsrook/codes/package.json
COPY packages/xapi/src/  /repo/packages/xapi/src/
COPY packages/codes/src/ /repo/packages/codes/src/
COPY containers/game-kiosk/tsconfig.json containers/game-kiosk/agent.ts ./
RUN npm run build

# ── runtime: nginx + Chromium (runs the game) + Node agent + HexGL ──────────
FROM node:20-alpine
RUN apk add --no-cache \
    nginx \
    git \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Clone HexGL (depth 1 keeps the image lean)
RUN git clone --depth 1 https://github.com/BKcore/HexGL.git /tmp/hexgl \
 && cp -r /tmp/hexgl/. /usr/share/nginx/html/ \
 && rm -rf /tmp/hexgl

# Inject attract.js and title.html
COPY containers/game-kiosk/attract.js /usr/share/nginx/html/attract.js
COPY containers/game-kiosk/title.html /usr/share/nginx/html/title.html

# Patch HexGL's index.html to load attract.js before </body>
RUN sed -i 's|</body>|<script src="/attract.js"></script></body>|' \
    /usr/share/nginx/html/index.html

# Nginx config
COPY containers/game-kiosk/nginx.conf /etc/nginx/http.d/default.conf

# Fleet agent
WORKDIR /agent
COPY containers/game-kiosk/package.json ./
RUN npm install --omit=dev
RUN mkdir -p node_modules/@knightsrook/xapi node_modules/@knightsrook/codes
COPY --from=xapi-build  /repo/packages/xapi/dist/  node_modules/@knightsrook/xapi/dist/
COPY --from=codes-build /repo/packages/codes/dist/ node_modules/@knightsrook/codes/dist/
RUN echo '{"name":"@knightsrook/xapi","version":"0.1.0","type":"module","exports":{".":{"import":"./dist/index.js","types":"./dist/index.d.ts"},"./file-queue":{"import":"./dist/fileQueue.js","types":"./dist/fileQueue.d.ts"},"./lrs-client":{"import":"./dist/lrsClient.js","types":"./dist/lrsClient.d.ts"}}}' \
    > node_modules/@knightsrook/xapi/package.json
RUN echo '{"name":"@knightsrook/codes","version":"0.1.0","type":"module","exports":{".":{"import":"./dist/index.js","types":"./dist/index.d.ts"},"./catcher":{"import":"./dist/catcher.js","types":"./dist/catcher.d.ts"},"./batcher":{"import":"./dist/batcher.js","types":"./dist/batcher.d.ts"}}}' \
    > node_modules/@knightsrook/codes/package.json
COPY --from=agent-build /repo/containers/game-kiosk/dist ./dist

COPY containers/game-kiosk/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080
CMD ["/start.sh"]
