"""Shared types and helpers of the operator portability tool."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import MetaData, Table
from sqlalchemy.orm import Session

from eimir_pro.portability.archive import TransferArchiveError


class PortabilityError(Exception):
    """A refusal of the operator tool with a message that is safe to print."""


class TransferScope(StrEnum):
    """What a bundle carries: the shared Space content, or one member's personal view."""

    SHARED = "SHARED"
    PERSONAL = "PERSONAL"


@dataclass(frozen=True)
class ValidatedGraph:
    scope: TransferScope
    source_space_id: UUID
    personal_owner_source_id: UUID | None
    mapping: dict[UUID, UUID]
    tables: dict[str, list[dict[str, Any]]]
    media: list[dict[str, Any]]
    summary: dict[str, object]
    checksums: dict[str, str] = field(default_factory=dict)
    """Manifest SHA-256 per archive entry, e.g. ``media/<sourceId>/original``."""


def _snake_to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


def _camel_to_snake(value: str) -> str:
    chars: list[str] = []
    for char in value:
        if char.isupper():
            chars.append("_")
            chars.append(char.lower())
        else:
            chars.append(char)
    return "".join(chars)


def _json_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, StrEnum):
        return value.value
    if isinstance(value, BaseModel):
        return _json_value(value.model_dump(mode="json"))
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _json_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        _snake_to_camel(key): _json_value(value)
        for key, value in row.items()
        if key != "photo_generated"
    }


def _table(session: Session, name: str, metadata: MetaData) -> Table:
    return Table(name, metadata, autoload_with=session.get_bind())


def _uuid(value: Any, code: str) -> UUID:
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise TransferArchiveError("Transfer identifier is invalid.", code) from None


def _row_snake(row: Mapping[str, Any]) -> dict[str, Any]:
    return {_camel_to_snake(str(key)): value for key, value in row.items()}
