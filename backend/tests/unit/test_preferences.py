"""Timezone and locale validation at the write boundary."""

from __future__ import annotations

import pytest

from eimir.core.errors import ValidationError
from eimir.identity.preferences import (
    PreferenceErrorCode,
    normalize_locale,
    validate_timezone,
)


class TestTimezone:
    @pytest.mark.parametrize("zone", ["Europe/Berlin", "UTC", "America/Argentina/Ushuaia"])
    def test_known_zone_is_preserved(self, zone: str) -> None:
        assert validate_timezone(zone) == zone

    def test_surrounding_whitespace_is_removed(self) -> None:
        assert validate_timezone("  Europe/Berlin  ") == "Europe/Berlin"

    @pytest.mark.parametrize(
        "zone",
        [
            "",
            "   ",
            "Europe/Berlinn",
            "europe/berlin",
            "MEZ",
            "+01:00",
            "Europe/Berlin; DROP TABLE accounts",
            "A" * 65,
        ],
    )
    def test_unusable_zone_is_rejected(self, zone: str) -> None:
        with pytest.raises(ValidationError) as error:
            validate_timezone(zone)
        assert error.value.code == PreferenceErrorCode.TIMEZONE_INVALID

    def test_validation_uses_timezone_database(self) -> None:
        """A pattern would accept 'Europe/Berlinn' because it looks valid."""
        with pytest.raises(ValidationError):
            validate_timezone("Europe/Berlinn")


class TestLocale:
    @pytest.mark.parametrize(
        ("input_value", "expected"),
        [
            ("de-DE", "de-DE"),
            ("de_DE", "de-DE"),
            ("DE-de", "de-DE"),
            ("de", "de"),
            ("en-US", "en-US"),
            ("zh-hans-cn", "zh-Hans-CN"),
            ("es-419", "es-419"),
            ("  fr-fr  ", "fr-FR"),
        ],
    )
    def test_canonical_spelling(self, input_value: str, expected: str) -> None:
        assert normalize_locale(input_value) == expected

    def test_normalization_is_stable(self) -> None:
        """Stored and returned values must be identical."""
        once = normalize_locale("zh_hans_cn")
        assert normalize_locale(once) == once

    @pytest.mark.parametrize(
        "input_value",
        [
            "",
            "   ",
            "deutsch",
            "d",
            "de-DEUTSCHLAND",
            "de-DE-1996",
            "de-DE@euro",
            "de/DE",
            "12",
            "de-" + "x" * 20,
        ],
    )
    def test_unusable_locale_is_rejected(self, input_value: str) -> None:
        with pytest.raises(ValidationError) as error:
            normalize_locale(input_value)
        assert error.value.code == PreferenceErrorCode.LOCALE_INVALID
