"""The installed native presentation fixtures cover the actual sender catalog."""

from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest
from joserfc import jwe
from joserfc.jwk import OctKey

from eimir.engagement import fcm_push, push_preview
from eimir.engagement.models import NotificationKind

CATALOG = Path(__file__).resolve().parents[3] / (
    "android/app/src/androidTest/assets/push-preview-catalog.json"
)


def test_installed_catalog_covers_every_sender_kind_and_both_envelope_versions() -> None:
    fixture = json.loads(CATALOG.read_text())
    cases = fixture["cases"]
    kinds = {kind.value for kind in NotificationKind}
    for title in ("", "Unser Spaziergang"):
        assert kinds <= {
            case["payload"]["kind"] for case in cases if case["payload"]["title"] == title
        }
    assert {case["payload"]["v"] for case in cases} == {1, 2}
    key = OctKey.import_key(
        {
            "kty": "oct",
            "k": base64.urlsafe_b64encode(bytes(fixture["keyBytes"])).decode().rstrip("="),
        }
    )
    for case in cases:
        decoded = jwe.decrypt_compact(case["jwe"], key, algorithms=["dir", "A256GCM"])
        assert json.loads(decoded.plaintext) == case["payload"]
        assert decoded.headers()["kid"] == fixture["activationId"]
        assert len(case["jwe"]) <= 3000
        for language in ("de", "en"):
            text = case["expectedBody"][language]
            if case["payload"]["kind"] in kinds:
                assert text not in {"Du hast neue Nachrichten.", "You have new messages."}
            if case["payload"]["digest"]:
                assert case["payload"]["body"] not in text


@pytest.mark.parametrize("limit", [80, 140, 180])
def test_preview_text_removes_controls_and_marks_bounded_unicode_truncation(limit: int) -> None:
    assert push_preview._label("  Alex\n\t\u202e \x00hello\u200d💛 ", limit) == "Alex hello\u200d💛"
    assert push_preview._label("💛" * limit, limit) == "💛" * limit
    shortened = push_preview._label("💛" * (limit + 1), limit)
    assert len(shortened) == limit and shortened.endswith("…")


def test_largest_content_envelope_fits_existing_provider_and_native_limits() -> None:
    fixture = json.loads(CATALOG.read_text())
    value = dict(fixture["cases"][0]["payload"])
    value.update(v=2, kind="COUPLE_EXPERIENCE_SHARED", targetType="MEMORY")
    value.update(name="💛" * 80, title="💛" * 140, body="💛" * 180)
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    assert len(raw.encode("utf-16-le")) // 2 <= 1600
    key = base64.urlsafe_b64encode(bytes(fixture["keyBytes"])).decode().rstrip("=")
    compact = fcm_push.encrypt_preview(
        json.dumps(
            {"fid": "c" + "a" * 21, "activationId": fixture["activationId"]}, separators=(",", ":")
        ),
        key,
        raw,
    )
    assert len(compact) <= 3000
