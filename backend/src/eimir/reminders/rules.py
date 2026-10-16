"""Versioned, code-owned M4-C Rule catalog.

The catalog is deliberately closed. It contains deterministic templates only;
there is no script, SQL, hook, AI, expression, or general workflow surface.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from typing import Any

from eimir.core.errors import ValidationError

CATALOG_VERSION = 2
RULE_NOT_FOUND = "RULE_NOT_FOUND"
RULE_PARAMETERS_INVALID = "RULE_PARAMETERS_INVALID"

IMPORTANT_DATE_RULE = "important_date_reminder"
RELATED_PERSON_BIRTHDAY_RULE = "related_person_birthday_reminder"
PARTNER_BIRTHDAY_RULE = "partner_birthday_reminder"
RELATIONSHIP_ANNIVERSARY_RULE = "relationship_anniversary_reminder"
PLAN_START_RULE = "plan_start_reminder"


@dataclass(frozen=True)
class RuleDefinition:
    key: str
    source_type: str
    default_days_before: tuple[int, ...]
    default_local_time: time | None
    enabled_by_default: bool = True
    catalog_version: int = CATALOG_VERSION
    action_kind: str = "REMINDER"


CATALOG: dict[str, RuleDefinition] = {
    IMPORTANT_DATE_RULE: RuleDefinition(
        key=IMPORTANT_DATE_RULE,
        source_type="IMPORTANT_DATE",
        default_days_before=(7, 1),
        default_local_time=time(9, 0),
    ),
    RELATED_PERSON_BIRTHDAY_RULE: RuleDefinition(
        key=RELATED_PERSON_BIRTHDAY_RULE,
        source_type="RELATED_PERSON",
        default_days_before=(14, 7, 1),
        default_local_time=time(9, 0),
    ),
    PARTNER_BIRTHDAY_RULE: RuleDefinition(
        key=PARTNER_BIRTHDAY_RULE,
        source_type="ACCOUNT",
        default_days_before=(14, 7, 1),
        default_local_time=time(9, 0),
    ),
    RELATIONSHIP_ANNIVERSARY_RULE: RuleDefinition(
        key=RELATIONSHIP_ANNIVERSARY_RULE,
        source_type="RELATIONSHIP",
        default_days_before=(30, 7, 1),
        default_local_time=time(9, 0),
    ),
    PLAN_START_RULE: RuleDefinition(
        key=PLAN_START_RULE,
        source_type="PLAN",
        default_days_before=(1, 0),
        default_local_time=None,
    ),
}


@dataclass(frozen=True)
class RuleParameters:
    days_before: tuple[int, ...]
    local_time: time | None

    def as_json(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"daysBefore": list(self.days_before)}
        if self.local_time is not None:
            payload["localTime"] = self.local_time.isoformat()
        return payload


def get(rule_key: str) -> RuleDefinition | None:
    return CATALOG.get(rule_key)


def require(rule_key: str) -> RuleDefinition:
    rule = get(rule_key)
    if rule is None:
        from eimir.core.errors import NotFoundError

        raise NotFoundError("Rule not found.", RULE_NOT_FOUND)
    return rule


def default_parameters(rule: RuleDefinition) -> RuleParameters:
    return RuleParameters(
        days_before=rule.default_days_before,
        local_time=rule.default_local_time,
    )


def validate_parameters(rule: RuleDefinition, raw: dict[str, Any] | None) -> RuleParameters:
    """Validate the complete per-recipient parameter object for one rule."""
    values = raw or {}
    allowed = {"daysBefore"}
    if rule.default_local_time is not None:
        allowed.add("localTime")
    if set(values) - allowed:
        raise ValidationError("Unsupported Rule parameters.", RULE_PARAMETERS_INVALID)

    days_value = values.get("daysBefore", list(rule.default_days_before))
    if (
        not isinstance(days_value, list)
        or any(isinstance(value, bool) or not isinstance(value, int) for value in days_value)
        or any(value < 0 or value > 365 for value in days_value)
        or len(set(days_value)) != len(days_value)
    ):
        raise ValidationError(
            "daysBefore must be a unique list of integers between 0 and 365.",
            RULE_PARAMETERS_INVALID,
        )
    days_before = tuple(sorted(days_value))

    local_time = rule.default_local_time
    if rule.default_local_time is not None and "localTime" in values:
        raw_time = values["localTime"]
        if not isinstance(raw_time, str):
            raise ValidationError("localTime must be a time string.", RULE_PARAMETERS_INVALID)
        try:
            local_time = time.fromisoformat(raw_time)
        except ValueError as error:
            raise ValidationError(
                "localTime must be a valid local wall-clock time.",
                RULE_PARAMETERS_INVALID,
            ) from error
        if local_time.tzinfo is not None:
            raise ValidationError(
                "localTime must not contain a timezone offset.",
                RULE_PARAMETERS_INVALID,
            )

    return RuleParameters(days_before=days_before, local_time=local_time)
