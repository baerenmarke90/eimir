"""Locale negotiation and complete bundled recipient templates."""

from string import Formatter

import pytest

from eimir.i18n import account_locale, catalogs, detect_locale, request_locale, text
from eimir.identity.models import Account


@pytest.mark.parametrize(
    ("languages", "expected"),
    [([], "de"), (["zz-ZZ", "en-US", "de-CH"], "en"), (["de_CH"], "de"), (["zz"], "de")],
)
def test_device_preference_order_and_supported_variants(
    languages: list[str], expected: str
) -> None:
    assert detect_locale(languages) == expected


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, "de"),
        ("zz-ZZ,en-US;q=0.8,de;q=0.5", "en"),
        ("en;q=0,de;q=0.5", "de"),
        ("en;q=nan,de;q=0.1", "de"),
        ("de;q=0.4,en;q=0.9", "en"),
    ],
)
def test_http_language_quality_and_fallback(header: str | None, expected: str) -> None:
    assert request_locale(header) == expected


def test_account_override_is_independent_of_the_actor_or_device() -> None:
    account = Account(display_name="Recipient", locale="de-DE", language_preference="en")
    assert account_locale(account) == "en"
    account.language_preference = "auto"
    assert account_locale(account) == "de"
    account.locale = "unsupported"
    assert account_locale(account) == "de"


def test_every_delivery_catalog_has_the_same_keys_and_interpolation_contract() -> None:
    baseline = catalogs()["de"]
    for language, messages in catalogs().items():
        assert messages.keys() == baseline.keys(), language
        for key, value in messages.items():
            assert value.strip(), (language, key)
            expected = {field for _, field, _, _ in Formatter().parse(baseline[key]) if field}
            actual = {field for _, field, _, _ in Formatter().parse(value) if field}
            assert actual == expected, (language, key)


def test_unknown_recipient_locale_falls_back_to_german() -> None:
    assert text("notification.subject", "zz") == text("notification.subject", "de")
    assert text("auth.magic.subject", "en-US") == "Your sign-in link for eimir."
