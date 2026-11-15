"""Concrete periods in the privacy policy must match the code that enforces them.

A failure means a product change contradicts a statement users read. Update
``legal/de/privacy-policy.md`` and its version together with the change
(``legal/README.md``).
"""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pytest

from eimir.auth import action_tokens, tokens
from eimir.jobs import maintenance
from eimir.once_messages import service as once_messages
from eimir.photo_sources import service as photo_sources
from eimir.relationship import invitations, policy
from eimir.transfer import service as transfer

DOCUMENT = Path(__file__).resolve().parents[3] / "legal" / "de" / "privacy-policy.md"

STATEMENTS = [
    pytest.param(
        action_tokens.MAGIC_LINK_LIFETIME,
        timedelta(minutes=15),
        "Ein Anmeldelink gilt 15 Minuten",
        id="magic-link",
    ),
    pytest.param(
        action_tokens.SIGNUP_PROOF_LIFETIME,
        timedelta(minutes=15),
        "Ein Anmeldelink gilt 15 Minuten",
        id="signup-link",
    ),
    pytest.param(
        action_tokens.EMAIL_VERIFICATION_LIFETIME,
        timedelta(hours=24),
        "ein Link zur Bestätigung deiner Adresse 24 Stunden",
        id="email-verification",
    ),
    pytest.param(
        maintenance.RETENTION_INTERVAL,
        timedelta(hours=6),
        "in der Regel innerhalb von sechs Stunden nach Ablauf des Links",
        id="unused-signup-address",
    ),
    pytest.param(
        tokens.REFRESH_TOKEN_LIFETIME,
        timedelta(days=60),
        "Eine Sitzung endet nach 60 Tagen ohne Nutzung",
        id="idle-session",
    ),
    pytest.param(
        tokens.SESSION_ABSOLUTE_LIFETIME,
        timedelta(days=180),
        "spätestens aber nach 180 Tagen",
        id="absolute-session",
    ),
    pytest.param(
        invitations.INVITATION_LIFETIME,
        timedelta(days=14),
        "Einladungen für deinen Partner 14 Tage",
        id="invitation",
    ),
    pytest.param(
        policy.SPACE_OFFBOARDING_RETENTION,
        timedelta(days=30),
        "löschen wir ihn 30 Tage später mit allen Inhalten",
        id="orphaned-space",
    ),
    pytest.param(
        transfer.RETENTION,
        timedelta(hours=24),
        "halten sie 24 Stunden verschlüsselt zum Herunterladen bereit",
        id="export-bundle",
    ),
    pytest.param(
        once_messages.LIFETIME,
        timedelta(hours=24),
        "Ungeöffnete Einmalnachrichten löschen wir nach 24 Stunden",
        id="unopened-once-message",
    ),
    pytest.param(
        once_messages.CLAIM_LIFETIME,
        timedelta(minutes=5),
        "die Ansicht endet mit dem Schließen, spätestens nach fünf Minuten",
        id="opened-once-message",
    ),
    pytest.param(
        photo_sources._LIFETIME,
        timedelta(minutes=10),
        "Eine Auswahl verfällt nach zehn Minuten",
        id="photo-source-selection",
    ),
]


@pytest.mark.parametrize(("actual", "stated", "sentence"), STATEMENTS)
def test_privacy_policy_period_matches_code(
    actual: timedelta, stated: timedelta, sentence: str
) -> None:
    text = " ".join(DOCUMENT.read_text(encoding="utf-8").split())

    assert sentence in text, f"The privacy policy no longer states: {sentence}"
    assert actual == stated, (
        f"The code now uses {actual}, but the privacy policy states {stated}. "
        "Update legal/de/privacy-policy.md and its version with the change."
    )


def test_privacy_policy_is_an_informational_draft() -> None:
    text = DOCUMENT.read_text(encoding="utf-8")

    assert text.startswith("---\ndocument: privacy-policy\nlocale: de-DE\n")
    assert "\nstatus: draft\n" in text
    assert "Du musst ihnen nicht zustimmen." in text
