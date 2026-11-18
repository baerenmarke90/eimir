# syntax=docker/dockerfile:1.7
# Static eimir.de main site. Build context: the repository root (a Git URL works).
#   docker build -f site/Dockerfile -t eimir-site .
# The build uses --production, so it fails while the imprint still has [[PLACEHOLDER]] markers.

FROM python:3.15.0-slim@sha256:f5b92f2a669a4c347044f29367f31983280b648250ca94dea66f98c53bc87e58 AS build

WORKDIR /src
COPY site site
COPY tools/site tools/site
COPY web/public/fonts web/public/fonts
COPY web/public/identity/favicon/light.png web/public/identity/favicon/light.png
COPY web/public/identity/favicon/dark.png web/public/identity/favicon/dark.png
COPY web/public/identity/app-icon-light.png web/public/identity/app-icon-light.png
COPY web/public/identity/app-icon-dark.png web/public/identity/app-icon-dark.png
COPY web/public/apple-touch-icon.png web/public/apple-touch-icon.png
COPY docs/assets/site docs/assets/site
RUN python tools/site/build_main_site.py --production

# The product preview: the real Web app on recorded demo data (web/preview), built in its own stage.
FROM node:26.13.1-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1 AS preview

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/tsconfig.json web/tsconfig.app.json web/tsconfig.node.json web/vite.config.ts web/vite.preview.config.ts ./
COPY web/src src
COPY web/preview preview
RUN npm run build:preview

FROM ghcr.io/nginx/nginx-unprivileged:1.31.8@sha256:1d2d62ccb876da984beaef0084b895e8ce490acee185ccdef0c55e6263afd3b8

COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/security-headers.conf /etc/nginx/security-headers.conf
COPY site/security-headers-preview.conf /etc/nginx/security-headers-preview.conf
COPY --from=build /src/site/dist /usr/share/nginx/html
COPY --from=preview /app/dist-preview /usr/share/nginx/html/preview

EXPOSE 8080
