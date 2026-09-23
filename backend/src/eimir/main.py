"""ASGI application entry point."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.trustedhost import TrustedHostMiddleware

from eimir.api.errors import problem_responses, register_error_handlers
from eimir.api.openapi import EimirFastAPI
from eimir.api.transport import RequestBodyLimitMiddleware, RequireHttpsForExternalHostsMiddleware
from eimir.api.v1 import router as v1_router
from eimir.config import Environment, Settings, get_settings
from eimir.identity.deletion_self_service import reconcile_configured_deletions_on_startup
from eimir.observability import (
    RequestIdMiddleware,
    RequestLoggingMiddleware,
    configure_logging,
)

configure_logging(get_settings())


_log = logging.getLogger(__name__)


def _log_operating_mode(settings: Settings) -> None:
    """Log the operating mode of this instance.

    Per ADR 0002, the bundled Compose stack intentionally starts in local
    test mode. To keep that from becoming an unnoticed permanent state, the
    distinction is logged at startup instead of existing only in setup
    documentation that may be read once.
    """
    if settings.is_production:
        _log.info(
            "Production mode: HTTPS enforcement, host validation, and closed "
            "schema discovery enabled."
        )
        return
    if settings.environment is Environment.TEST:
        # The test suite rebuilds the app for each test; one warning per setup
        # would add noise rather than useful information.
        return
    _log.warning(
        "Local test mode (EIMIR_ENVIRONMENT=%s). HTTPS enforcement and host validation "
        "are disabled, /docs is open, and the cursor signing key uses a local "
        "fallback value. Set EIMIR_ENVIRONMENT=production for real deployments; "
        "see the checklist in docs/SELF-HOSTING.md.",
        settings.environment.value,
    )


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncIterator[None]:
    # A forward deletion tombstone may have been fsynced immediately before a
    # process failure. Re-establish its fail-closed database state before this
    # process can serve normal requests.
    reconcile_configured_deletions_on_startup()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    _log_operating_mode(settings)

    app = EimirFastAPI(
        title="eimir.",
        version="0.1.0",
        description="Application Core. OpenAPI is the authoritative contract.",
        # Production does not expose schema discovery: it is a map of the
        # attack surface.
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
        responses=problem_responses(413),
        lifespan=_lifespan,
    )

    if settings.is_production:
        # HTTPS validation relies only on the scheme Uvicorn has already
        # normalized. Uvicorn trusts forwarded headers exclusively from the
        # proxy addresses explicitly configured by the deployment.
        app.add_middleware(RequireHttpsForExternalHostsMiddleware)
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)

    app.add_middleware(RequestBodyLimitMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(RequestIdMiddleware)

    register_error_handlers(app)
    app.include_router(v1_router, prefix="/api/v1")

    return app


app = create_app()
