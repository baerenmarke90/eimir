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

FROM ghcr.io/nginx/nginx-unprivileged:1.31.8@sha256:e4264279b179f0e654579a90a1a9c1eab3ba9124c17551794bee20f68a38b5ce

COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/site/dist /usr/share/nginx/html

EXPOSE 8080
