"""Operator command line: refuses to act without key material."""

from __future__ import annotations

import pytest

from eimir.security.__main__ import COMMANDS, main

# ``status`` and ``audit-raw`` inspect the stored representation and need no key.
KEYLESS_COMMANDS = ("status", "audit-raw")


@pytest.mark.parametrize("command", [c for c in COMMANDS if c not in KEYLESS_COMMANDS])
def test_every_mutating_or_verifying_command_refuses_without_keys(
    command: str, encryption, capsys: pytest.CaptureFixture[str]
) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("disabled")
    assert main([command]) == 2
    error = capsys.readouterr().err
    assert "key material is not configured" in error


def test_unknown_command_is_rejected() -> None:
    with pytest.raises(SystemExit):
        main(["decrypt-everything"])


def test_negative_media_sample_is_rejected() -> None:
    with pytest.raises(SystemExit):
        main(["audit-raw", "--media-sample", "-1"])
