"""PartnerProfile and ProfilePreference endpoints."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Path, Response, status
from fastapi.responses import StreamingResponse
from pydantic import Field, field_validator, model_validator

from eimir.api.concurrency import IfMatchVersion, etag_for
from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.profiles import service
from eimir.profiles.models import (
    PartnerProfile,
    PreferenceCategory,
    PreferenceSentiment,
    ProfilePreference,
    ProfileVisibility,
)

router = APIRouter(tags=["profiles"])

STREAM_CHUNK = 64 * 1024

ETAG_HEADERS = {
    "ETag": {
        "description": "Resource version to use for the next If-Match write request.",
        "schema": {"type": "string"},
    }
}


class PreferenceFields(ApiModel):
    category: PreferenceCategory
    topic: str = Field(min_length=1, max_length=120)
    sentiment: PreferenceSentiment
    value: str = Field(min_length=1, max_length=2000)

    @field_validator("topic", "value")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("must not be blank")
        return cleaned


class ProfilePreferenceCreate(PreferenceFields):
    account_id: UUID
    visibility: ProfileVisibility


class ProfilePreferenceUpdate(PreferenceFields):
    pass


class ProfileIdentityUpdate(ApiModel):
    """Partial update of the authenticated account's presentation identity.

    Omission means unchanged. An explicit null ``profileAttachmentId`` removes
    the current avatar. ``displayName`` deliberately has no competing request-
    layer normalization; the identity domain remains the single authority.
    """

    display_name: str | None = None
    profile_attachment_id: UUID | None = None
    birthday: date | None = None

    @model_validator(mode="after")
    def _contains_change(self) -> Self:
        if not self.model_fields_set.intersection(
            {"display_name", "profile_attachment_id", "birthday"}
        ):
            raise ValueError("at least one profile identity field is required")
        return self


class ProfilePreferenceView(ApiModel):
    id: UUID
    account_id: UUID
    category: PreferenceCategory
    topic: str
    sentiment: PreferenceSentiment
    value: str
    visibility: ProfileVisibility
    version: int
    created_at: datetime
    updated_at: datetime


class PartnerProfileView(ApiModel):
    id: UUID
    account_id: UUID
    display_name: str
    birthday: date | None
    profile_attachment_id: UUID | None
    version: int
    created_at: datetime
    updated_at: datetime
    preferences: list[ProfilePreferenceView]


def _preference_view(preference: ProfilePreference) -> ProfilePreferenceView:
    return ProfilePreferenceView(
        id=preference.id,
        account_id=preference.account_id,
        category=PreferenceCategory(preference.category),
        topic=preference.topic,
        sentiment=PreferenceSentiment(preference.sentiment),
        value=preference.payload.value,
        visibility=ProfileVisibility(preference.visibility),
        version=preference.version,
        created_at=preference.created_at,
        updated_at=preference.updated_at,
    )


def _profile_view(
    profile: PartnerProfile,
    *,
    display_name: str,
    birthday: date | None,
    profile_attachment_id: UUID | None,
    version: int,
    preferences: list[ProfilePreferenceView],
) -> PartnerProfileView:
    return PartnerProfileView(
        id=profile.id,
        account_id=profile.owner_id,
        display_name=display_name,
        birthday=birthday,
        profile_attachment_id=profile_attachment_id,
        version=version,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
        preferences=preferences,
    )


@router.get(
    "/spaces/{spaceId}/profiles/{accountId}",
    response_model=PartnerProfileView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404),
    },
)
def get_partner_profile(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    account_id: Annotated[str, Path(alias="accountId")],
) -> PartnerProfileView:
    profile, subject, preferences = service.profile_preferences(session, authorization, account_id)
    attachment = service.profile_attachment(session, subject.id)
    response.headers["ETag"] = etag_for(subject.version)
    return _profile_view(
        profile,
        display_name=subject.display_name,
        birthday=subject.birthday,
        profile_attachment_id=attachment.id if attachment is not None else None,
        version=subject.version,
        preferences=[_preference_view(preference) for preference in preferences],
    )


@router.patch(
    "/spaces/{spaceId}/profiles/{accountId}",
    response_model=PartnerProfileView,
    operation_id="updateProfileIdentity",
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_profile_identity(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ProfileIdentityUpdate,
    expected_version: IfMatchVersion,
    account_id: Annotated[str, Path(alias="accountId")],
) -> PartnerProfileView:
    """Change only the authenticated account's current presentation identity."""
    subject = service.update_profile_identity(
        session,
        authorization,
        account_id,
        expected_version=expected_version,
        changed_fields=frozenset(body.model_fields_set),
        display_name=body.display_name,
        profile_attachment_id=body.profile_attachment_id,
        birthday=body.birthday,
    )
    profile, subject, preferences = service.profile_preferences(session, authorization, subject.id)
    attachment = service.profile_attachment(session, subject.id)
    response.headers["ETag"] = etag_for(subject.version)
    return _profile_view(
        profile,
        display_name=subject.display_name,
        birthday=subject.birthday,
        profile_attachment_id=attachment.id if attachment is not None else None,
        version=subject.version,
        preferences=[_preference_view(preference) for preference in preferences],
    )


@router.get(
    "/spaces/{spaceId}/profiles/{accountId}/avatar/content",
    operation_id="getProfileAvatarContent",
    response_class=StreamingResponse,
    responses=problem_responses(401, 404),
)
def get_profile_avatar_content(
    authorization: Authorization,
    session: DbSession,
    account_id: Annotated[str, Path(alias="accountId")],
) -> StreamingResponse:
    """Stream only the current avatar after current-Space profile authorization.

    Avatar identity is Account-global while its backing Attachment remains
    Space-scoped. The caller therefore never supplies an arbitrary attachment
    ID here. We first prove that the subject has a readable profile in the
    caller's current Space and only then resolve that Account's one current
    avatar binding. This deliberately permits the same current avatar to appear
    in another Space where the same Account is an active member without making
    any other source-Space attachment readable.
    """
    _, subject = service.profile_for_subject(session, authorization, account_id)
    attachment = service.profile_attachment(session, subject.id)
    if (
        attachment is None
        or attachment.status != AttachmentStatus.READY.value
        or attachment.media_type != MediaType.IMAGE.value
    ):
        raise Attachment.privacy_absence.error()

    variant = (
        attachment_service.THUMBNAIL_VARIANT
        if attachment.has_thumbnail
        else attachment_service.ORIGINAL_VARIANT
    )
    source = attachment_service.open_content(attachment, variant=variant)
    media_type = (
        "image/jpeg"
        if variant == attachment_service.THUMBNAIL_VARIANT
        else (attachment.mime_type or "application/octet-stream")
    )

    def chunks() -> object:
        try:
            while chunk := source.read(STREAM_CHUNK):
                yield chunk
        finally:
            source.close()

    return StreamingResponse(
        chunks(),  # type: ignore[arg-type]
        media_type=media_type,
        headers={
            "Content-Disposition": f'inline; filename="{attachment.id}"',
            "Cache-Control": "private, no-store",
        },
    )


@router.get(
    "/spaces/{spaceId}/profile-preferences",
    response_model=list[ProfilePreferenceView],
    responses=problem_responses(401, 404),
)
def list_profile_preferences(
    authorization: Authorization,
    session: DbSession,
) -> list[ProfilePreferenceView]:
    return [
        _preference_view(preference)
        for preference in service.list_preferences(session, authorization)
    ]


@router.post(
    "/spaces/{spaceId}/profile-preferences",
    response_model=ProfilePreferenceView,
    status_code=status.HTTP_201_CREATED,
    responses={
        201: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 422),
    },
)
def create_profile_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ProfilePreferenceCreate,
) -> ProfilePreferenceView:
    preference = service.create_preference(
        session,
        authorization,
        account_id=body.account_id,
        visibility=body.visibility,
        category=body.category,
        topic=body.topic,
        sentiment=body.sentiment,
        value=body.value,
    )
    response.headers["ETag"] = etag_for(preference.version)
    return _preference_view(preference)


@router.get(
    "/spaces/{spaceId}/profile-preferences/{preferenceId}",
    response_model=ProfilePreferenceView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 404),
    },
)
def get_profile_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    preference_id: Annotated[str, Path(alias="preferenceId")],
) -> ProfilePreferenceView:
    preference = service.get_preference(session, authorization, preference_id)
    response.headers["ETag"] = etag_for(preference.version)
    return _preference_view(preference)


@router.put(
    "/spaces/{spaceId}/profile-preferences/{preferenceId}",
    response_model=ProfilePreferenceView,
    responses={
        200: {"headers": ETAG_HEADERS},
        **problem_responses(401, 403, 404, 409, 422),
    },
)
def update_profile_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: ProfilePreferenceUpdate,
    expected_version: IfMatchVersion,
    preference_id: Annotated[str, Path(alias="preferenceId")],
) -> ProfilePreferenceView:
    preference = service.update_preference(
        session,
        authorization,
        preference_id,
        expected_version=expected_version,
        category=body.category,
        topic=body.topic,
        sentiment=body.sentiment,
        value=body.value,
    )
    response.headers["ETag"] = etag_for(preference.version)
    return _preference_view(preference)


@router.delete(
    "/spaces/{spaceId}/profile-preferences/{preferenceId}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    responses=problem_responses(401, 403, 404, 409, 422),
)
def delete_profile_preference(
    authorization: Authorization,
    session: DbSession,
    expected_version: IfMatchVersion,
    preference_id: Annotated[str, Path(alias="preferenceId")],
) -> Response:
    service.delete_preference(
        session,
        authorization,
        preference_id,
        expected_version=expected_version,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
