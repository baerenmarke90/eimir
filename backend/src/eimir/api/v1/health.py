"""Operational health endpoints.

Two separate questions require two different answers:

- ``/health``: is the process running? This does not touch the database, so an
  orchestrator does not restart the container merely because the database is
  temporarily unavailable.
- ``/health/ready``: can the process serve requests? This checks the database.

Both responses expose the build revision in a response header so operators can
verify that a healthy deployment is also the intended deployment.
"""

from __future__ import annotations

import os

from fastapi import APIRouter, Response
from sqlalchemy import text

from eimir.api.schema import ApiModel
from eimir.db.session import get_engine

router = APIRouter(tags=["health"])

REVISION_HEADER = "X-Eimir-Revision"
LEGACY_REVISION_HEADER = "X-SideBySide-Revision"
UNVERIFIED_REVISION = "unverified-local-checkout"


class Health(ApiModel):
    status: str


class Readiness(ApiModel):
    status: str
    database: str


def build_revision() -> str:
    """Return a response-header-safe build identity without exposing other config."""
    value = os.environ.get(
        "EIMIR_BUILD_REVISION",
        os.environ.get("SBS_BUILD_REVISION", UNVERIFIED_REVISION),
    ).strip()
    if not value or "\r" in value or "\n" in value:
        return "unknown"
    return value[:128]


def _set_revision_header(response: Response) -> None:
    revision = build_revision()
    response.headers[REVISION_HEADER] = revision
    # Mixed-version deployment checks may still read the former header during
    # the documented transition window.
    response.headers[LEGACY_REVISION_HEADER] = revision


@router.get("/health", response_model=Health)
def health(response: Response) -> Health:
    _set_revision_header(response)
    return Health(status="ok")


@router.get(
    "/health/ready",
    response_model=Readiness,
    responses={
        503: {
            "model": Readiness,
            "description": "The process is running, but the database is unavailable.",
        }
    },
)
def readiness(response: Response) -> Readiness:
    _set_revision_header(response)
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        # Do not expose exception text: a connection error can contain host,
        # port, and username details.
        response.status_code = 503
        return Readiness(status="unavailable", database="unavailable")

    return Readiness(status="ok", database="ok")
