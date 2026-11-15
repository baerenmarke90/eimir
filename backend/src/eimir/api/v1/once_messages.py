"""No content on GET: ciphertext is available only through a deliberate POST claim."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Response
from pydantic import ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import defer

from eimir.api.authors import resolve_author_summary
from eimir.api.deps import Authorization, DbSession, PhotoBindingAuthorization
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel, AuthorSummary
from eimir.core.ids import parse_id
from eimir.once_messages import service
from eimir.once_messages.models import OnceMessage, OnceReception

router = APIRouter(tags=["once-messages"])


def require_message_id(message_id: Annotated[str, Path(alias="messageId")]) -> UUID:
    parsed = parse_id(message_id)
    if parsed is None:
        raise service.absent()
    return parsed


MessageId = Annotated[UUID, Depends(require_message_id)]


class OnceReceptionUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = Field(strict=True)
    expected_version: int = Field(ge=0)
    device_id: UUID | None = None
    public_jwk: dict[str, Any] | None = None


class OnceDeviceView(ApiModel):
    id: UUID
    public_jwk: dict[str, Any]


class OnceStatus(ApiModel):
    reception_version: int
    own_enabled: bool
    partner_enabled: bool
    can_send: bool
    partner: AuthorSummary | None
    own_device_ids: list[UUID]
    recipient_devices: list[OnceDeviceView]


class OnceMessageCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    recipient_id: UUID
    envelope: dict[str, Any]


class OnceMessageSent(ApiModel):
    id: UUID
    expires_at: datetime


class OnceSealedMessage(ApiModel):
    id: UUID
    request_id: UUID
    sender: AuthorSummary
    expires_at: datetime


class OnceInbox(ApiModel):
    items: list[OnceSealedMessage]


class OnceClaim(ApiModel):
    model_config = ConfigDict(extra="forbid")
    device_id: UUID
    token: UUID


class OnceAcknowledgement(ApiModel):
    model_config = ConfigDict(extra="forbid")
    token: UUID


class OnceClaimedMessage(ApiModel):
    envelope: dict[str, Any]
    view_until: datetime


def no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Pragma"] = "no-cache"
    response.headers["Vary"] = "Authorization"


def status_view(session: DbSession, context: Authorization) -> OnceStatus:
    members = service.members(session, context)
    own = next(member for member in members if member.account_id == context.account_id)
    partner = next((member for member in members if member.account_id != context.account_id), None)
    own_enabled = service.enabled(session, own)
    partner_enabled = partner is not None and service.enabled(session, partner)
    reception = session.get(OnceReception, (context.space_id, context.account_id))
    return OnceStatus(
        reception_version=reception.version if reception else 0,
        own_enabled=own_enabled,
        partner_enabled=partner_enabled,
        can_send=service.can_send(session, context.space_id),
        partner=resolve_author_summary(session, partner.account_id, resource="Partner")
        if partner
        else None,
        own_device_ids=[key.id for key in service.current_keys(session, own)],
        recipient_devices=[
            OnceDeviceView(id=key.id, public_jwk=key.public_jwk)
            for key in service.current_keys(session, partner)
        ]
        if partner and own_enabled and partner_enabled
        else [],
    )


def sealed_view(session: DbSession, message: OnceMessage) -> OnceSealedMessage:
    return OnceSealedMessage(
        id=message.id,
        request_id=message.request_id,
        sender=resolve_author_summary(session, message.sender_id, resource="Message sender"),
        expires_at=message.expires_at,
    )


@router.get(
    "/spaces/{spaceId}/once-messages/status",
    response_model=OnceStatus,
    operation_id="getOnceMessageStatus",
    responses=problem_responses(401, 404),
)
def get_status(session: DbSession, authorization: Authorization, response: Response) -> OnceStatus:
    no_store(response)
    return status_view(session, authorization)


@router.put(
    "/spaces/{spaceId}/once-messages/reception",
    response_model=OnceStatus,
    operation_id="setOnceMessageReception",
    responses=problem_responses(401, 404, 409, 422),
)
def reception(
    session: DbSession,
    authorization: PhotoBindingAuthorization,
    response: Response,
    body: OnceReceptionUpdate,
) -> OnceStatus:
    service.set_reception(
        session,
        authorization,
        enable=body.enabled,
        device_id=body.device_id,
        public_jwk=body.public_jwk,
        expected_version=body.expected_version,
    )
    no_store(response)
    return status_view(session, authorization)


@router.post(
    "/spaces/{spaceId}/once-messages",
    response_model=OnceMessageSent,
    status_code=201,
    operation_id="sendOnceMessage",
    responses=problem_responses(401, 403, 404, 409, 422, 429),
)
def send(
    session: DbSession,
    authorization: PhotoBindingAuthorization,
    response: Response,
    body: OnceMessageCreate,
) -> OnceMessageSent:
    message = service.create(
        session,
        authorization,
        request_id=body.request_id,
        recipient_id=body.recipient_id,
        jwe=body.envelope,
    )
    no_store(response)
    return OnceMessageSent(id=message.id, expires_at=message.expires_at)


@router.get(
    "/spaces/{spaceId}/once-messages",
    response_model=OnceInbox,
    operation_id="listOnceMessages",
    responses=problem_responses(401, 404),
)
def inbox(session: DbSession, authorization: Authorization, response: Response) -> OnceInbox:
    no_store(response)
    messages = session.scalars(
        select(OnceMessage)
        .options(defer(OnceMessage.payload))
        .where(service.available_predicate(authorization))
        .order_by(OnceMessage.created_at, OnceMessage.id)
        .limit(50)
    )
    return OnceInbox(items=[sealed_view(session, message) for message in messages])


@router.get(
    "/spaces/{spaceId}/once-messages/{messageId}",
    response_model=OnceSealedMessage,
    operation_id="getSealedOnceMessage",
    responses=problem_responses(401, 404),
)
def get_message(
    session: DbSession, authorization: Authorization, response: Response, message_id: MessageId
) -> OnceSealedMessage:
    no_store(response)
    return sealed_view(session, service.get_sealed(session, authorization, message_id))


@router.post(
    "/spaces/{spaceId}/once-messages/{messageId}/open",
    response_model=OnceClaimedMessage,
    operation_id="openOnceMessage",
    responses=problem_responses(401, 404, 409, 422),
)
def open_message(
    session: DbSession,
    authorization: PhotoBindingAuthorization,
    response: Response,
    message_id: MessageId,
    body: OnceClaim,
) -> OnceClaimedMessage:
    message = service.claim(
        session, authorization, message_id, device_id=body.device_id, token=body.token
    )
    no_store(response)
    assert message.claim_until is not None
    return OnceClaimedMessage(envelope=message.payload.jwe, view_until=message.claim_until)


@router.post(
    "/spaces/{spaceId}/once-messages/{messageId}/acknowledge",
    status_code=204,
    operation_id="acknowledgeOnceMessage",
    responses=problem_responses(401, 404, 422),
)
def acknowledge(
    session: DbSession,
    authorization: PhotoBindingAuthorization,
    response: Response,
    message_id: MessageId,
    body: OnceAcknowledgement,
) -> Response:
    service.acknowledge(session, authorization, message_id, token=body.token)
    no_store(response)
    response.status_code = 204
    return response


@router.delete(
    "/spaces/{spaceId}/once-messages/{messageId}",
    status_code=204,
    operation_id="discardOnceMessage",
    responses=problem_responses(401, 404),
)
def discard(
    session: DbSession,
    authorization: PhotoBindingAuthorization,
    response: Response,
    message_id: MessageId,
) -> Response:
    service.discard(session, authorization, message_id)
    no_store(response)
    response.status_code = 204
    return response
