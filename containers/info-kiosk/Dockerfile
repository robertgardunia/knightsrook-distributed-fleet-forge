# Stage 1 — compile the fleet agent
FROM node:20-alpine AS agent-build
WORKDIR /build
COPY containers/fleet-agent/package.json containers/fleet-agent/tsconfig.json ./
COPY containers/info-kiosk/agent.ts ./agent.ts
RUN npm install && npm run build

# Stage 2 — runtime: nginx + Chromium (runs the slideshow) + Node agent
FROM node:20-alpine
RUN apk add --no-cache \
    nginx \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Slideshow page
RUN mkdir -p /usr/share/nginx/html/slides
COPY containers/info-kiosk/slideshow.html /usr/share/nginx/html/slideshow.html

# Slide images — copied from project root at build time
# (docker-compose uses context: . so paths are relative to project root)
COPY client/public/games/info-build-racer.png /usr/share/nginx/html/slides/
COPY client/public/games/info-controls.png    /usr/share/nginx/html/slides/
COPY client/public/games/info-cornering.png   /usr/share/nginx/html/slides/
COPY client/public/games/info-scan-qr.png     /usr/share/nginx/html/slides/

# Nginx config
COPY containers/info-kiosk/nginx.conf /etc/nginx/http.d/default.conf

# Fleet agent
WORKDIR /agent
COPY containers/fleet-agent/package.json ./
RUN npm install --omit=dev
COPY --from=agent-build /build/dist ./dist

COPY containers/info-kiosk/start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080
CMD ["/start.sh"]
