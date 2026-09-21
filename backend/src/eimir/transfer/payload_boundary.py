"""Encryption boundary of the portable Transfer Bundle.

Transfer reads and writes the reflected tables with Core statements, so it does
not pass through the ORM column type that encrypts protected payloads. This
module applies the same protection explicitly at the two places where content
crosses:

- export: stored payloads are decrypted into the archive. A user-authorized
  export is plaintext by definition (the person asked for their own data); it is
  built from rows the caller is authorized to read and is stored encrypted like
  any other object (``EncryptingMediaStore``) until it expires;
- import: archive payloads are encrypted before insert and ``crypto_version`` is
  set from the active mode, whatever the archive claimed.

Backups are a different thing and never use this path: they copy ciphertext as
stored.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT
from eimir.security.lifecycle import payload_tables
from eimir.security.runtime import get_payload_protector


@lru_cache(maxsize=1)
def _contexts() -> dict[str, str]:
    return {entry.name: entry.context for entry in payload_tables()}


def is_protected_table(table_name: str) -> bool:
    return table_name in _contexts()


def reveal_row(table_name: str, row: dict[str, Any]) -> dict[str, Any]:
    """Return ``row`` with a decrypted payload, or unchanged for other tables."""
    context = _contexts().get(table_name)
    if context is None or row.get("payload") is None:
        return row
    revealed = dict(row)
    revealed["payload"] = get_payload_protector().reveal(row["payload"], context=context)
    # The archive carries plaintext, so it says so.
    revealed["crypto_version"] = CRYPTO_VERSION_PLAINTEXT
    return revealed


def protect_values(table_name: str, values: dict[str, Any]) -> dict[str, Any]:
    """Return insert ``values`` whose payload is protected under the active mode."""
    context = _contexts().get(table_name)
    if context is None or values.get("payload") is None:
        return values
    protector = get_payload_protector()
    protected = dict(values)
    protected["payload"] = protector.protect(values["payload"], context=context)
    protected["crypto_version"] = protector.write_crypto_version
    return protected
