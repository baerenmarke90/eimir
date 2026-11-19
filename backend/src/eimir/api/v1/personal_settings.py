"""Owner-only personal settings that every signed-in device applies.

Two documents exist per person: one for the Account (theme, diary layout,
garden feedback) and one per Space (display choices inside that Space). Only
the caller's own document is ever read or written; no partner ID is accepted
and the partner can never read it. The key set is closed: unknown keys are
rejected, and ``null`` removes a saved choice so the device default applies.

No capability gate applies. A display opt-in for a Pro surface grants nothing:
clients still show that surface only while the live entitlement allows it.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Response
from pydantic import ConfigDict, StrictBool, model_validator

from eimir.api.concurrency import IfMatchToken, etag_for_token
from eimir.api.deps import Authorization, CurrentAccount, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.personal_settings import service
from eimir.personal_settings.models import (
    SCHEMA_VERSION,
    AccountSettings,
    DiaryLayout,
    PersonalSettings,
    SpaceSettings,
    ThemePreference,
)

router = APIRouter(tags=["personal-settings"])
ETAG_HEADERS = {
    "ETag": {
        "description": "Opaque personal settings token; send unchanged as If-Match on writes.",
        "schema": {"type": "string"},
    }
}


class AccountPersonalSettingsView(ApiModel):
    """The caller's Account-wide choices; ``null`` means no saved choice."""

    theme: ThemePreference | None
    diary_layout: DiaryLayout | None
    garden_sound: bool | None
    garden_vibration: bool | None
    schema_version: int
    version: int


class AccountPersonalSettingsPatch(ApiModel):
    """Only the changed keys; ``null`` removes a saved choice."""

    model_config = ConfigDict(extra="forbid")

    theme: ThemePreference | None = None
    diary_layout: DiaryLayout | None = None
    garden_sound: StrictBool | None = None
    garden_vibration: StrictBool | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> AccountPersonalSettingsPatch:
        _require_change(self)
        return self


class SpacePersonalSettingsView(ApiModel):
    """The caller's own choices in one Space; ``null`` means no saved choice."""

    occasion_holidays: bool | None
    wir_statistics: bool | None
    schema_version: int
    version: int


class SpacePersonalSettingsPatch(ApiModel):
    """Only the changed keys; ``null`` removes a saved choice."""

    model_config = ConfigDict(extra="forbid")

    occasion_holidays: StrictBool | None = None
    wir_statistics: StrictBool | None = None

    @model_validator(mode="after")
    def require_a_change(self) -> SpacePersonalSettingsPatch:
        _require_change(self)
        return self


def _require_change(patch: ApiModel) -> None:
    if not patch.model_fields_set:
        raise ValueError("A personal settings patch must name at least one setting.")


def _changes(patch: ApiModel) -> dict[str, Any]:
    values = patch.model_dump(mode="json")
    return {name: values[name] for name in patch.model_fields_set}


def _headers(response: Response, token: str) -> None:
    response.headers["ETag"] = etag_for_token(token)
    response.headers["Cache-Control"] = "private, no-store"


def _account_view(
    document: PersonalSettings | None, account_id: Any, response: Response
) -> AccountPersonalSettingsView:
    _headers(response, service.concurrency_token(document, account_id, None))
    settings = service.settings_of(document, AccountSettings)
    return AccountPersonalSettingsView(
        theme=settings.theme,
        diary_layout=settings.diary_layout,
        garden_sound=settings.garden_sound,
        garden_vibration=settings.garden_vibration,
        schema_version=SCHEMA_VERSION,
        version=document.version if document else 0,
    )


def _space_view(
    document: PersonalSettings | None,
    account_id: Any,
    space_id: Any,
    response: Response,
) -> SpacePersonalSettingsView:
    _headers(response, service.concurrency_token(document, account_id, space_id))
    settings = service.settings_of(document, SpaceSettings)
    return SpacePersonalSettingsView(
        occasion_holidays=settings.occasion_holidays,
        wir_statistics=settings.wir_statistics,
        schema_version=SCHEMA_VERSION,
        version=document.version if document else 0,
    )


@router.get(
    "/account/personal-settings",
    response_model=AccountPersonalSettingsView,
    operation_id="getAccountPersonalSettings",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401)},
)
def get_account_personal_settings(
    account: CurrentAccount,
    session: DbSession,
    response: Response,
) -> AccountPersonalSettingsView:
    """Read only the caller's Account-wide choices. A read never creates a row."""
    document = service.read_document(session, account.id, None)
    return _account_view(document, account.id, response)


@router.patch(
    "/account/personal-settings",
    response_model=AccountPersonalSettingsView,
    operation_id="updateAccountPersonalSettings",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 409, 422)},
)
def update_account_personal_settings(
    account: CurrentAccount,
    session: DbSession,
    response: Response,
    body: AccountPersonalSettingsPatch,
    expected_token: IfMatchToken,
) -> AccountPersonalSettingsView:
    """Merge the changed keys into the caller's Account-wide document."""
    saved = service.save_changes(
        session, account.id, None, AccountSettings, _changes(body), expected_token
    )
    return _account_view(saved, account.id, response)


@router.get(
    "/spaces/{spaceId}/personal-settings",
    response_model=SpacePersonalSettingsView,
    operation_id="getSpacePersonalSettings",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404)},
)
def get_space_personal_settings(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> SpacePersonalSettingsView:
    """Read only the caller's own choices in this Space, never the partner's."""
    document = service.read_document(session, authorization.account_id, authorization.space_id)
    return _space_view(document, authorization.account_id, authorization.space_id, response)


@router.patch(
    "/spaces/{spaceId}/personal-settings",
    response_model=SpacePersonalSettingsView,
    operation_id="updateSpacePersonalSettings",
    responses={200: {"headers": ETAG_HEADERS}, **problem_responses(401, 404, 409, 422)},
)
def update_space_personal_settings(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: SpacePersonalSettingsPatch,
    expected_token: IfMatchToken,
) -> SpacePersonalSettingsView:
    """Merge the changed keys into the caller's document for this Space."""
    saved = service.save_changes(
        session,
        authorization.account_id,
        authorization.space_id,
        SpaceSettings,
        _changes(body),
        expected_token,
    )
    return _space_view(saved, authorization.account_id, authorization.space_id, response)
