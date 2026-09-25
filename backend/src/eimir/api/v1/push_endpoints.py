"""Authenticated, content-free registration of the caller's Push endpoints."""

from __future__ import annotations

from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Path, Response, status
from pydantic import ConfigDict, Field, field_validator

from eimir.api.deps import CurrentAccount, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.auth import rate_limit
from eimir.core.errors import ErrorCode, NotFoundError, ServiceUnavailableError, ValidationError
from eimir.core.ids import parse_id
from eimir.engagement import push

router = APIRouter(prefix="/push-endpoints", tags=["notifications"])

_REGISTER_ACTION = "push_endpoint_register"
_REGISTER_LIMIT = rate_limit.Limit(attempts=30, window=timedelta(minutes=15))


class PushEndpointRegistration(ApiModel):
    model_config = ConfigDict(extra="forbid")

    provider_key: str = Field(min_length=1, max_length=64)
    endpoint_value: str = Field(min_length=1, max_length=2048)

    @field_validator("provider_key", "endpoint_value")
    @classmethod
    def validate_opaque_value(cls, value: str) -> str:
        value = value.strip()
        if not value or any(character.isspace() or ord(character) == 127 for character in value):
            raise ValueError("Push endpoint fields must be nonblank and contain no whitespace.")
        return value


class PushEndpointRegistrationResult(ApiModel):
    id: UUID


@router.post(
    "",
    response_model=PushEndpointRegistrationResult,
    operation_id="registerOwnPushEndpoint",
    responses=problem_responses(401, 409, 422, 429, 503),
)
def register_own_push_endpoint(
    body: PushEndpointRegistration,
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> PushEndpointRegistrationResult:
    """Accept only configured transports and return no endpoint secret."""
    provider = push.providers.get(body.provider_key)
    if provider is None:
        raise ServiceUnavailableError(
            "Push transport is unavailable.", ErrorCode.PUSH_TRANSPORT_UNAVAILABLE
        )
    if not provider.accepts_endpoint(body.endpoint_value):
        raise ValidationError("Invalid Push endpoint.", ErrorCode.PUSH_ENDPOINT_INVALID)
    rate_limit.check(session, _REGISTER_ACTION, str(account.id), _REGISTER_LIMIT)
    endpoint = push.register_endpoint(
        session,
        account_id=account.id,
        provider_key=body.provider_key,
        endpoint_value=body.endpoint_value,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return PushEndpointRegistrationResult(id=endpoint.id)


@router.delete(
    "/{endpointId}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="revokeOwnPushEndpoint",
    responses=problem_responses(401, 404, 503),
)
def revoke_own_push_endpoint(
    endpoint_id_text: Annotated[str, Path(alias="endpointId")],
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> None:
    """Keep foreign and unknown IDs indistinguishable to the caller."""
    endpoint_id = parse_id(endpoint_id_text)
    if endpoint_id is None or not push.revoke_endpoint(
        session, account_id=account.id, endpoint_id=endpoint_id
    ):
        raise NotFoundError("Push endpoint not found.", ErrorCode.PUSH_ENDPOINT_NOT_FOUND)
    response.headers["Cache-Control"] = "private, no-store"
