"""A test endpoint built on the authorization foundation.

Isolation must be tested through HTTP. Calling the guard directly skips the
exact path where a check can be forgotten: path parameters, dependencies,
error handling, and serialization.

The router is not attached to the production application but to a dedicated
app instance. The versioned OpenAPI contract therefore remains unchanged; the
probe is a test fixture, not an interface offered to clients.

The routes are deliberately as concise as a later domain should be. If more
than one guard call were required here, a real domain would need to duplicate
it as well.
"""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, FastAPI, Path, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.api.deps import Authorization, DbSession
from eimir.api.schema import ApiModel
from eimir.authorization import readable, require_readable, require_writable
from eimir.db.session import get_session
from eimir.main import create_app
from tests.support.privacy_probe import PrivacyProbe

router = APIRouter(tags=["privacy-probes"])

ProbeId = Annotated[str, Path(alias="probeId")]


class ProbeView(ApiModel):
    id: UUID
    owner_id: UUID
    privacy_class: str
    label: str


class ProbeUpdate(ApiModel):
    label: str


class ProbeCount(ApiModel):
    total: int


@router.get("/spaces/{spaceId}/privacy-probes", response_model=list[ProbeView])
def list_probes(authorization: Authorization, session: DbSession) -> list[ProbeView]:
    visible = (
        session.execute(readable(PrivacyProbe, authorization).order_by(PrivacyProbe.created_at))
        .scalars()
        .all()
    )
    return [ProbeView.model_validate(probe) for probe in visible]


@router.get("/spaces/{spaceId}/privacy-probes/count", response_model=ProbeCount)
def count_probes(authorization: Authorization, session: DbSession) -> ProbeCount:
    """Count on the same statement used for reads.

    A hit count is itself information: counting resources a caller cannot see
    reveals that those resources exist.
    """
    count = session.execute(
        select(func.count()).select_from(readable(PrivacyProbe, authorization).subquery())
    ).scalar_one()
    return ProbeCount(total=count)


@router.get("/spaces/{spaceId}/privacy-probes/{probeId}", response_model=ProbeView)
def get_probe(authorization: Authorization, session: DbSession, probe_id: ProbeId) -> ProbeView:
    return ProbeView.model_validate(
        require_readable(session, PrivacyProbe, authorization, probe_id)
    )


@router.patch("/spaces/{spaceId}/privacy-probes/{probeId}", response_model=ProbeView)
def update_probe(
    authorization: Authorization,
    session: DbSession,
    probe_id: ProbeId,
    input_data: ProbeUpdate,
) -> ProbeView:
    probe = require_writable(session, PrivacyProbe, authorization, probe_id)
    probe.label = input_data.label
    session.flush()
    return ProbeView.model_validate(probe)


@router.delete(
    "/spaces/{spaceId}/privacy-probes/{probeId}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_probe(authorization: Authorization, session: DbSession, probe_id: ProbeId) -> None:
    session.delete(require_writable(session, PrivacyProbe, authorization, probe_id))
    session.flush()


def create_probe_app(session: Session) -> FastAPI:
    """The production app plus the probe router on the test transaction."""
    app = create_app()
    app.include_router(router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: session
    return app
