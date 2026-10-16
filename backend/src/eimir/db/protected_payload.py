"""SQLAlchemy persistence boundary for protected domain content.

Encryption at rest (issue #797) is applied here and nowhere else: domain code
reads and writes typed ``ProtectedPayload`` objects and never sees ciphertext.
Every payload is serialized, encrypted according to the active
``EncryptionMode``, and stored as one JSONB value; every read authenticates and
decrypts it or fails closed.

Two invariants are enforced together:

- the ``payload`` column holds the envelope (``eimir.security.payload_envelope``);
- the sibling ``crypto_version`` metadata column always states the scheme the
  payload was written in, so migration progress can be queried without keys.
  A mapper event keeps the two in step because a column type cannot see its row.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import ValidationError
from sqlalchemy import event, inspect
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapper
from sqlalchemy.types import TypeDecorator

from eimir.db.base import Base
from eimir.domain.payload import ProtectedPayload
from eimir.security.errors import EncryptionError
from eimir.security.runtime import get_payload_protector

log = logging.getLogger(__name__)


class ProtectedPayloadError(EncryptionError):
    """Stored protected content does not satisfy its payload type.

    Raised instead of the underlying validation error, whose message would
    quote the offending (decrypted) values.
    """


class ProtectedPayloadJSON[PayloadT: ProtectedPayload](TypeDecorator[PayloadT]):
    """JSONB column bound exclusively to one concrete ProtectedPayload type.

    A raw dictionary therefore cannot accidentally be persisted as sensitive
    content. The concrete payload class is part of the column definition and
    restores strict Pydantic validation when reading.
    """

    impl = postgresql.JSONB
    cache_ok = True
    should_evaluate_none = True

    def __init__(self, payload_type: type[PayloadT]) -> None:
        super().__init__()
        self.payload_type = payload_type

    @property
    def python_type(self) -> type[PayloadT]:
        return self.payload_type

    def process_bind_param(self, value: PayloadT | None, dialect: Dialect) -> dict[str, Any]:
        del dialect
        if type(value) is not self.payload_type:
            raise TypeError(
                f"{self.payload_type.__name__} required; raw or foreign payload rejected"
            )
        return get_payload_protector().protect(
            value.seal(), context=self.payload_type.crypto_context()
        )

    def process_result_value(self, value: dict[str, Any] | None, dialect: Dialect) -> PayloadT:
        del dialect
        if value is None:
            raise ValueError("Protected payload is missing from a non-null persistence column")
        plain = get_payload_protector().reveal(value, context=self.payload_type.crypto_context())
        try:
            return self.payload_type.unseal(plain)
        except ValidationError:
            log.error("stored protected payload failed validation")
            raise ProtectedPayloadError("Stored protected payload is invalid.") from None


_PAYLOAD_KEYS: dict[type, tuple[str, ...]] = {}


def _payload_attribute_keys(mapper: Mapper[Any]) -> tuple[str, ...]:
    cls = mapper.class_
    cached = _PAYLOAD_KEYS.get(cls)
    if cached is None:
        cached = tuple(
            attribute.key
            for attribute in mapper.column_attrs
            if isinstance(attribute.columns[0].type, ProtectedPayloadJSON)
        )
        _PAYLOAD_KEYS[cls] = cached
    return cached


def _has_crypto_version(mapper: Mapper[Any]) -> bool:
    return "crypto_version" in mapper.column_attrs


def _sync_on_insert(mapper: Mapper[Any], connection: Any, target: Any) -> None:
    del connection
    if _payload_attribute_keys(mapper) and _has_crypto_version(mapper):
        target.crypto_version = get_payload_protector().write_crypto_version


def _sync_on_update(mapper: Mapper[Any], connection: Any, target: Any) -> None:
    del connection
    keys = _payload_attribute_keys(mapper)
    if not keys or not _has_crypto_version(mapper):
        return
    state = inspect(target)
    # Only a rewritten payload changes scheme; an untouched legacy row keeps the
    # version that still describes what is stored.
    if any(state.attrs[key].history.has_changes() for key in keys):
        target.crypto_version = get_payload_protector().write_crypto_version


event.listen(Base, "before_insert", _sync_on_insert, propagate=True)
event.listen(Base, "before_update", _sync_on_update, propagate=True)
