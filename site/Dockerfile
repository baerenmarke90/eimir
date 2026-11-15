# syntax=docker/dockerfile:1.7
# Static eimir.de main site. Build context: the repository root (a Git URL works).
#   docker build -f site/Dockerfile -t eimir-site .
# The build uses --production, so it fails while the imprint still has [[PLACEHOLDER]] markers.

FROM python:3.14.8-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 AS build

WORKDIR /src
COPY site site
COPY tools/site tools/site
COPY web/public/fonts web/public/fonts
COPY web/public/identity/app-icons/v1/daylight-192.png web/public/identity/app-icons/v1/daylight-192.png
COPY web/public/identity/app-icons/v1/daylight-180.png web/public/identity/app-icons/v1/daylight-180.png
RUN python tools/site/build_main_site.py --production

FROM ghcr.io/nginx/nginx-unprivileged:1.31.7@sha256:94193d5c4c5df716f412bb08eb97956d98fe6b59886f0bc57d6d3a3402a88a02

COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/site/dist /usr/share/nginx/html

EXPOSE 8080
