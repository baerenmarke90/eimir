"""Persistence type for the explicitly allowed outbox metadata class."""

from __future__ import annotations

from typing import Any

from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

from eimir.domain.events import PublicEventPayload


class PublicEventPayloadJSON(TypeDecorator[PublicEventPayload]):
    """Reject raw dictionaries even when the ORM is used directly."""

    impl = postgresql.JSONB
    cache_ok = True
    should_evaluate_none = True

    @property
    def python_type(self) -> type[PublicEventPayload]:
        return PublicEventPayload

    def process_bind_param(
        self, value: PublicEventPayload | None, dialect: Dialect
    ) -> dict[str, Any]:
        del dialect
        if type(value) is not PublicEventPayload:
            raise TypeError("PublicEventPayload required; raw outbox payload rejected")
        return value.model_dump(mode="json", exclude_none=True)

    def process_result_value(
        self, value: dict[str, Any] | None, dialect: Dialect
    ) -> PublicEventPayload:
        del dialect
        if value is None:
            raise ValueError("Outbox payload is missing from a non-null persistence column")
        return PublicEventPayload.model_validate(value)
