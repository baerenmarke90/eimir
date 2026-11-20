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

from fastapi import APIRouter, Response
from sqlalchemy import text

from eimir.api.schema import ApiModel
from eimir.db.session import get_engine
from eimir.deployment.revision import build_revision

router = APIRouter(tags=["health"])

REVISION_HEADER = "X-Eimir-Revision"
LEGACY_REVISION_HEADER = "X-SideBySide-Revision"


class Health(ApiModel):
    status: str


class Readiness(ApiModel):
    status: str
    database: str


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
