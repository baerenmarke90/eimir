# syntax=docker/dockerfile:1.7

FROM node:22.19.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ARG EIMIR_BUILD_REVISION=""
ARG SBS_BUILD_REVISION="unverified-local-checkout"
ARG VITE_EIMIR_API_BASE_URL=""
ARG VITE_EIMIR_DEMO_MODE=""
ARG VITE_EIMIR_DEMO_URL=""
ARG VITE_EIMIR_DEMO_RESET_TIMER=""
ARG VITE_EIMIR_DEMO_RESET_INTERVAL=""
ARG VITE_SBS_API_BASE_URL=""
ARG VITE_SBS_DEMO_MODE=""
ARG VITE_SBS_DEMO_URL=""
ARG VITE_SBS_DEMO_RESET_TIMER=""
ARG VITE_SBS_DEMO_RESET_INTERVAL=""
RUN sh scripts/test_csp_config.sh
# The supported Web-only context consumes the checked-in generated adapter.
# Canonical design/tokens.json drift is validated by the monorepo build/test CI.
RUN export VITE_EIMIR_API_BASE_URL="${VITE_EIMIR_API_BASE_URL:-$VITE_SBS_API_BASE_URL}" \
    VITE_EIMIR_DEMO_MODE="${VITE_EIMIR_DEMO_MODE:-$VITE_SBS_DEMO_MODE}" \
    VITE_EIMIR_DEMO_URL="${VITE_EIMIR_DEMO_URL:-$VITE_SBS_DEMO_URL}" \
    VITE_EIMIR_DEMO_RESET_TIMER="${VITE_EIMIR_DEMO_RESET_TIMER:-$VITE_SBS_DEMO_RESET_TIMER}" \
    VITE_EIMIR_DEMO_RESET_INTERVAL="${VITE_EIMIR_DEMO_RESET_INTERVAL:-$VITE_SBS_DEMO_RESET_INTERVAL}" \
    && npm run build:bundle
RUN mkdir -p dist/.well-known \
    && revision="${EIMIR_BUILD_REVISION:-$SBS_BUILD_REVISION}" \
    && printf '%s\n' "$revision" > dist/.well-known/eimir-revision \
    && cp dist/.well-known/eimir-revision dist/.well-known/sidebyside-revision

FROM ghcr.io/nginx/nginx-unprivileged:1.31.4@sha256:197f252f060ed357f2ab98d4256762d7d107c76f18ad8f0b9d5178854611566d

ENV NGINX_ENVSUBST_FILTER="^EIMIR_WEB_CSP_CONNECT_ORIGINS$"

COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=0555 docker-entrypoint.d/19-validate-csp-connect-src.envsh /docker-entrypoint.d/19-validate-csp-connect-src.envsh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=5s \
  CMD ["curl", "--fail", "--silent", "--show-error", "http://127.0.0.1:8080/healthz"]
