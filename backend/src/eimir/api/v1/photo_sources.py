"""Authenticated, private photo-source selection and connection endpoints."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path, Query, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import ConfigDict, Field, SecretStr

from eimir.api.concurrency import IfMatchToken
from eimir.api.deps import Authorization, CurrentSession, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth.tokens import generate_token
from eimir.config import get_settings
from eimir.entitlements.models import Capability
from eimir.entitlements.service import has_capability
from eimir.photo_sources import browser_binding, service
from eimir.photo_sources.models import PhotoSelection
from eimir.security.keyring import EncryptionMode

router = APIRouter(tags=["photo-sources"])
_HEADERS = {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
}


class PhotoSourceAvailability(ApiModel):
    enabled: bool
    google_available: bool
    immich_connected: bool
    immich_connection_token: str
    immich_origin: str | None = None
    can_import: bool


class PhotoSourceConnectionCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    origin: str = Field(min_length=10, max_length=512)
    api_key: SecretStr = Field(min_length=1, max_length=1024)
    consent: Literal[True]


class PhotoSelectionCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["google", "immich"]
    max_items: int = Field(ge=1, le=20)
    consent: Literal[True]
    media_recovery_policy: Literal["memory-only-v1"] | None = None


class PhotoSelectionItemView(ApiModel):
    id: str


class PhotoSelectionView(ApiModel):
    id: UUID
    source: str
    status: str
    authorization_url: str | None = None
    picker_uri: str | None = None
    poll_after_seconds: int = 5
    items: list[PhotoSelectionItemView]
    has_more: bool


def _view(row: PhotoSelection, authorization_url: str | None = None) -> PhotoSelectionView:
    return PhotoSelectionView(
        id=row.id,
        source=row.provider,
        status=row.status,
        authorization_url=authorization_url,
        picker_uri=row.payload.picker_uri,
        items=[PhotoSelectionItemView(id=item.id) for item in row.payload.items],
        has_more=row.payload.next_page is not None,
    )


@router.get(
    "/spaces/{spaceId}/photo-sources",
    response_model=PhotoSourceAvailability,
    operation_id="getPhotoSources",
    responses=problem_responses(401, 404),
)
def sources(
    authorization: Authorization, session: DbSession, response: Response
) -> PhotoSourceAvailability:
    response.headers.update(_HEADERS)
    settings = get_settings()
    linked = (
        service.connection(session, authorization.account_id)
        if get_settings().encryption_mode is EncryptionMode.REQUIRED
        else None
    )
    return PhotoSourceAvailability(
        enabled=service.enabled(),
        google_available=(
            service.enabled()
            and service.google_import_available()
            and bool(settings.google_photos_client_id)
        ),
        immich_connected=linked is not None,
        immich_connection_token=service.connection_token(linked, authorization.account_id),
        immich_origin=linked.payload.origin if linked else None,
        can_import=has_capability(
            session, authorization.space_id, Capability.INTEGRATION_EXTERNAL_SYNC.value
        ),
    )


@router.put(
    "/spaces/{spaceId}/photo-sources/immich",
    status_code=204,
    response_class=Response,
    operation_id="connectImmichPhotoSource",
    responses=problem_responses(401, 403, 404, 409, 422, 429, 503),
)
def connect(
    authorization: Authorization,
    session: DbSession,
    body: PhotoSourceConnectionCreate,
    expected: IfMatchToken,
) -> Response:
    service.connect_immich(session, authorization, body.origin.rstrip("/"), body.api_key, expected)
    return Response(status_code=204, headers=_HEADERS)


@router.delete(
    "/spaces/{spaceId}/photo-sources/immich",
    status_code=204,
    response_class=Response,
    operation_id="disconnectImmichPhotoSource",
    responses=problem_responses(401, 404, 409, 422),
)
def disconnect(
    authorization: Authorization, session: DbSession, expected: IfMatchToken
) -> Response:
    service.disconnect_immich(session, authorization, expected)
    return Response(status_code=204, headers=_HEADERS)


@router.post(
    "/spaces/{spaceId}/photo-selections",
    response_model=PhotoSelectionView,
    status_code=status.HTTP_201_CREATED,
    operation_id="startPhotoSelection",
    responses=problem_responses(401, 403, 404, 409, 422, 429, 503),
)
def start(
    authorization: Authorization,
    device: CurrentSession,
    session: DbSession,
    body: PhotoSelectionCreate,
    response: Response,
) -> PhotoSelectionView:
    proof = generate_token() if body.source == "google" else None
    row, url = service.start(
        session,
        authorization,
        device,
        body.source,
        body.max_items,
        browser_binding=proof,
        media_recovery_policy=body.media_recovery_policy,
    )
    response.headers.update(_HEADERS)
    if proof and row.payload.oauth_state:
        browser_binding.set_cookie(response, row.payload.oauth_state, proof)
    return _view(row, url)


@router.post(
    "/spaces/{spaceId}/photo-selections/{selectionId}/poll",
    response_model=PhotoSelectionView,
    operation_id="pollPhotoSelection",
    responses=problem_responses(401, 403, 404, 429, 503),
)
def poll(
    authorization: Authorization,
    device: CurrentSession,
    session: DbSession,
    selection_id: Annotated[str, Path(alias="selectionId")],
    response: Response,
    more: bool = False,
) -> PhotoSelectionView:
    row = service.owned(session, authorization, device, selection_id)
    service.advance(session, row, more=more)
    response.headers.update(_HEADERS)
    return _view(row)


@router.post(
    "/spaces/{spaceId}/photo-selections/{selectionId}/items/{itemId}",
    response_class=Response,
    operation_id="readSelectedPhoto",
    responses={
        200: {
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            }
        },
        **problem_responses(401, 403, 404, 409, 429, 503),
    },
)
def read(
    authorization: Authorization,
    device: CurrentSession,
    session: DbSession,
    selection_id: Annotated[str, Path(alias="selectionId")],
    item_id: Annotated[str, Path(alias="itemId")],
    thumbnail: bool = False,
) -> Response:
    row = service.owned(session, authorization, device, selection_id, lock=False)
    photo = service.read_item(session, row, item_id, thumbnail=thumbnail)
    # A concurrent unlink/replacement/cancel invalidates the selection while
    # the provider is streaming; do not return those late bytes to the client.
    service.owned(session, authorization, device, selection_id, lock=False)
    return Response(
        content=photo.content,
        media_type=photo.mime_type,
        headers={**_HEADERS, "Content-Disposition": f'attachment; filename="{photo.filename}"'},
    )


@router.delete(
    "/spaces/{spaceId}/photo-selections/{selectionId}",
    status_code=204,
    response_class=Response,
    operation_id="cancelPhotoSelection",
    responses=problem_responses(401, 404),
)
def cancel(
    authorization: Authorization,
    device: CurrentSession,
    session: DbSession,
    selection_id: Annotated[str, Path(alias="selectionId")],
) -> Response:
    row = service.owned(session, authorization, device, selection_id, commercial=False)
    service.remove(session, row)
    return Response(status_code=204, headers=_HEADERS)


@router.get("/photo-sources/google/callback", include_in_schema=False)
def callback(
    session: DbSession,
    request: Request,
    state: Annotated[str, Query(max_length=1024)] = "",
    code: Annotated[str | None, Query(max_length=4096)] = None,
) -> Response:
    uri = service.callback(
        session,
        state,
        code,
        browser_binding=request.cookies.get(browser_binding.cookie_name(state)),
    )
    if uri:
        response: Response = RedirectResponse(uri, status_code=303, headers=_HEADERS)
        browser_binding.clear_cookie(response, state)
        return response
    # Provider details never reach the browser. The authenticated source sheet
    # owns localized success/error handling; this is only the external return.
    response = HTMLResponse(
        "<!doctype html><html lang=en><meta name=viewport content='width=device-width'>"
        "<title>eimir.</title><p>Return to eimir.</p></html>",
        headers={
            **_HEADERS,
            "Content-Security-Policy": (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            ),
        },
    )
    browser_binding.clear_cookie(response, state)
    return response
