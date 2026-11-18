# syntax=docker/dockerfile:1.7
# Static eimir.de main site. Build context: the repository root (a Git URL works).
#   docker build -f site/Dockerfile -t eimir-site .
# The build uses --production, so it fails while the imprint still has [[PLACEHOLDER]] markers.

FROM python:3.15.0-slim@sha256:f5b92f2a669a4c347044f29367f31983280b648250ca94dea66f98c53bc87e58 AS build

WORKDIR /src
COPY site site
COPY tools/site tools/site
COPY web/public/fonts web/public/fonts
COPY web/public/identity/app-icons/v1/daylight-192.png web/public/identity/app-icons/v1/daylight-192.png
COPY web/public/identity/app-icons/v1/daylight-180.png web/public/identity/app-icons/v1/daylight-180.png
RUN python tools/site/build_main_site.py --production

FROM ghcr.io/nginx/nginx-unprivileged:1.31.8@sha256:1d2d62ccb876da984beaef0084b895e8ce490acee185ccdef0c55e6263afd3b8

COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/site/dist /usr/share/nginx/html

EXPOSE 8080
