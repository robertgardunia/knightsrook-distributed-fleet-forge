# Stage 1 — compile the fleet agent
FROM node:20-alpine AS agent-build
WORKDIR /build
COPY package.json tsconfig.json agent.ts ./
RUN npm install && npm run build

# Stage 2 — runtime: nginx + Node agent + HexGL
FROM node:20-alpine
RUN apk add --no-cache nginx git

# Clone HexGL (depth 1 keeps the image lean)
RUN git clone --depth 1 https://github.com/BKcore/HexGL.git /tmp/hexgl \
 && cp -r /tmp/hexgl/. /usr/share/nginx/html/ \
 && rm -rf /tmp/hexgl

# Inject attract.js and title.html
COPY attract.js /usr/share/nginx/html/attract.js
COPY title.html /usr/share/nginx/html/title.html

# Patch HexGL's index.html to load attract.js before </body>
RUN sed -i 's|</body>|<script src="/attract.js"></script></body>|' \
    /usr/share/nginx/html/index.html

# Nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Fleet agent
WORKDIR /agent
COPY package.json ./
RUN npm install --omit=dev
COPY --from=agent-build /build/dist ./dist

COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080
CMD ["/start.sh"]
