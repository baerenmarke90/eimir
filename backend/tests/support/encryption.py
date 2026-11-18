"""Key material for encryption tests.

Keys are generated per call from the OS random source. No key value is written
in the repository, so there is no test key that could be mistaken for, or copied
into, a production configuration.
"""

from __future__ import annotations

import base64
import os
from collections.abc import Callable
from typing import TYPE_CHECKING

from eimir.security.keyring import KeyRing

if TYPE_CHECKING:
    from eimir.security.payload_envelope import PayloadProtector


def random_key() -> bytes:
    return os.urandom(32)


def encoded_key() -> str:
    return base64.b64encode(random_key()).decode("ascii")


def key_ring(*key_ids: str, active: str | None = None) -> KeyRing:
    ids = key_ids or ("k1",)
    return KeyRing({key_id: random_key() for key_id in ids}, active or ids[-1])


def ring_with(keys: dict[str, bytes], active: str) -> KeyRing:
    return KeyRing(keys, active)


_ENCRYPTION_ENV = (
    "EIMIR_ENCRYPTION_AT_REST",
    "EIMIR_ENCRYPTION_KEYS",
    "EIMIR_ENCRYPTION_ACTIVE_KEY_ID",
    "SBS_ENCRYPTION_AT_REST",
    "SBS_ENCRYPTION_KEYS",
    "SBS_ENCRYPTION_ACTIVE_KEY_ID",
)


def reset_encryption_caches() -> None:
    from eimir.config import get_settings
    from eimir.media import get_media_store

    get_settings.cache_clear()
    get_media_store.cache_clear()


def _protector() -> PayloadProtector | None:
    """The protector of the current settings, or None while they are invalid.

    Some tests configure a combination that must fail at startup; carrying
    accounts over is not their subject.
    """
    from eimir.security.runtime import get_payload_protector

    try:
        return get_payload_protector()
    except Exception:
        return None


class EncryptionConfigurator:
    """Applies an encryption configuration to the process environment for one test.

    Accounts carry a protected payload (their display name), and fixtures create
    them before a test chooses its mode. ``carry_accounts`` is called after every
    switch with the previous and the new protector so those rows can be brought
    into the new mode; a test that wants a legacy row creates it itself, after
    the switch.

    The first switch of a test leaves the mode the suite was started in, which
    the test did not choose: the suite also runs with encryption required from
    the start, where the fixture accounts are sealed before a test switches to
    ``disabled``. That first switch therefore carries accounts in either
    direction, so a test meets the same accounts in both lanes. Every later
    switch is the test's own scenario and only ever seals: a test that encrypts
    and then turns encryption off expects its rows to stay sealed, because no
    migration opens them either.
    """

    def __init__(
        self,
        monkeypatch: object,
        carry_accounts: Callable[[PayloadProtector, PayloadProtector, bool], None] | None = None,
    ) -> None:
        self._monkeypatch = monkeypatch
        self._carry_accounts = carry_accounts
        self._left_the_suite_mode = False

    def apply(
        self,
        mode: str,
        *,
        keys: dict[str, str] | None = None,
        active: str | None = None,
    ) -> dict[str, str]:
        """Set ``mode`` and (for encrypting modes) fresh random keys; returns the keys."""
        import json

        previous = _protector() if self._carry_accounts is not None else None
        monkeypatch = self._monkeypatch
        for name in _ENCRYPTION_ENV:
            monkeypatch.delenv(name, raising=False)  # type: ignore[attr-defined]
        monkeypatch.setenv("EIMIR_ENCRYPTION_AT_REST", mode)  # type: ignore[attr-defined]
        used: dict[str, str] = {}
        if mode != "disabled":
            used = keys if keys is not None else {"k1": encoded_key()}
            monkeypatch.setenv("EIMIR_ENCRYPTION_KEYS", json.dumps(used))  # type: ignore[attr-defined]
            monkeypatch.setenv(  # type: ignore[attr-defined]
                "EIMIR_ENCRYPTION_ACTIVE_KEY_ID", active or list(used)[-1]
            )
        reset_encryption_caches()
        current = _protector() if previous is not None else None
        first_switch = not self._left_the_suite_mode
        self._left_the_suite_mode = True
        if self._carry_accounts is not None and previous is not None and current is not None:
            self._carry_accounts(previous, current, first_switch)
        return used
