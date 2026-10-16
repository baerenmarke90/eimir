"""HTTP contract for the controlled M4-C Rule catalog and preferences."""

from __future__ import annotations

from datetime import time
from typing import Annotated

from fastapi import APIRouter, Path, Response
from pydantic import ConfigDict, Field, StrictInt

from eimir.api.deps import Authorization, DbSession
from eimir.api.errors import problem_responses
from eimir.api.schema import ApiModel
from eimir.reminders import rules, runtime

router = APIRouter(tags=["rules"])


class RuleParametersView(ApiModel):
    days_before: list[int]
    local_time: time | None = None


class RuleParametersUpdate(ApiModel):
    """Typed, provider-neutral M4 Rule parameters accepted at the API boundary."""

    model_config = ConfigDict(extra="forbid")

    days_before: list[StrictInt] | None = None
    local_time: time | None = None


class RuleView(ApiModel):
    rule_key: str
    catalog_version: int
    source_type: str
    action_kind: str
    enabled: bool
    parameters: RuleParametersView


class RuleList(ApiModel):
    items: list[RuleView]


class RulePreferenceUpdate(ApiModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    parameters: RuleParametersUpdate = Field(default_factory=RuleParametersUpdate)


class RulePreferenceView(ApiModel):
    rule_key: str
    enabled: bool
    parameters: RuleParametersView


def _view(
    session: DbSession,
    authorization: Authorization,
    definition: rules.RuleDefinition,
) -> RuleView:
    enabled, parameters = runtime.effective_rule_preference(
        session,
        account_id=authorization.account_id,
        space_id=authorization.space_id,
        rule=definition,
    )
    return RuleView(
        rule_key=definition.key,
        catalog_version=definition.catalog_version,
        source_type=definition.source_type,
        action_kind=definition.action_kind,
        enabled=enabled,
        parameters=RuleParametersView(
            days_before=list(parameters.days_before),
            local_time=parameters.local_time,
        ),
    )


@router.get(
    "/spaces/{spaceId}/rules",
    response_model=RuleList,
    operation_id="listRules",
    responses=problem_responses(401, 404),
)
def list_rules(
    authorization: Authorization,
    session: DbSession,
    response: Response,
) -> RuleList:
    response.headers["Cache-Control"] = "private, no-store"
    return RuleList(items=[_view(session, authorization, rule) for rule in rules.CATALOG.values()])


@router.get(
    "/spaces/{spaceId}/rules/{ruleKey}/preference",
    response_model=RulePreferenceView,
    operation_id="getRulePreference",
    responses=problem_responses(401, 404, 422),
)
def get_rule_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    rule_key: Annotated[str, Path(alias="ruleKey")],
) -> RulePreferenceView:
    definition = rules.require(rule_key)
    enabled, parameters = runtime.effective_rule_preference(
        session,
        account_id=authorization.account_id,
        space_id=authorization.space_id,
        rule=definition,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return RulePreferenceView(
        rule_key=definition.key,
        enabled=enabled,
        parameters=RuleParametersView(
            days_before=list(parameters.days_before),
            local_time=parameters.local_time,
        ),
    )


@router.put(
    "/spaces/{spaceId}/rules/{ruleKey}/preference",
    response_model=RulePreferenceView,
    operation_id="setRulePreference",
    responses=problem_responses(401, 404, 422),
)
def set_rule_preference(
    authorization: Authorization,
    session: DbSession,
    response: Response,
    body: RulePreferenceUpdate,
    rule_key: Annotated[str, Path(alias="ruleKey")],
) -> RulePreferenceView:
    definition = rules.require(rule_key)
    row = runtime.set_rule_preference(
        session,
        account_id=authorization.account_id,
        space_id=authorization.space_id,
        rule=definition,
        enabled=body.enabled,
        parameters=body.parameters.model_dump(
            mode="json",
            by_alias=True,
            exclude_none=True,
        ),
    )
    parameters = rules.validate_parameters(definition, row.parameters)
    response.headers["Cache-Control"] = "private, no-store"
    return RulePreferenceView(
        rule_key=definition.key,
        enabled=row.enabled,
        parameters=RuleParametersView(
            days_before=list(parameters.days_before),
            local_time=parameters.local_time,
        ),
    )
