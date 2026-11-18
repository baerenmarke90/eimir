"""Authenticated, deliberate and ephemeral external link previews."""

from datetime import timedelta

from fastapi import APIRouter, Response
from pydantic import ConfigDict, Field

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import rate_limit
from eimir.providers.link_preview import resolve_link_metadata

router = APIRouter(tags=["link-previews"])


class LinkPreviewRequest(ApiModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=2048)


class LinkPreviewResult(ApiModel):
    available: bool
    title: str | None = None
    description: str | None = None


@router.post(
    "/spaces/{spaceId}/link-preview",
    response_model=LinkPreviewResult,
    operation_id="resolveLinkPreview",
    responses=problem_responses(401, 404, 422, 429),
)
def resolve_link_preview(
    authorization: Authorization,
    session: DbSession,
    body: LinkPreviewRequest,
    response: Response,
) -> LinkPreviewResult:
    """Resolve only after an explicit preview action; never persist target content."""
    rate_limit.check(
        session,
        "link-preview",
        str(authorization.account_id),
        rate_limit.Limit(attempts=30, window=timedelta(minutes=15)),
    )
    response.headers["Cache-Control"] = "private, no-store"
    metadata = resolve_link_metadata(body.url)
    return LinkPreviewResult(
        available=metadata is not None,
        title=metadata.title if metadata else None,
        description=metadata.description if metadata else None,
    )
