"""Regressions for all eleven Android adaptive-icon variants."""

import unittest

from android_adaptive_icon_resources import (
    RES,
    validate_icon_xml,
    validate_resource_catalog,
)


class AdaptiveIconResourceTests(unittest.TestCase):
    def test_full_catalog_has_mask_safe_sources(self) -> None:
        validate_resource_catalog()

    def test_rejects_the_old_too_small_direct_foreground(self) -> None:
        adaptive = (RES / "mipmap-anydpi-v26/app_icon_lavender.xml").read_text()
        layer = (RES / "drawable/app_icon_lavender_mask_safe.xml").read_text()
        old = adaptive.replace(
            "@drawable/app_icon_lavender_mask_safe",
            "@drawable/app_icon_lavender_foreground",
        )
        with self.assertRaisesRegex(ValueError, "mask-safe drawable"):
            validate_icon_xml("lavender", old, layer)

    def test_rejects_a_different_choice_bitmap(self) -> None:
        adaptive = (RES / "mipmap-anydpi-v26/app_icon_sand.xml").read_text()
        layer = (RES / "drawable/app_icon_sand_mask_safe.xml").read_text()
        wrong = layer.replace(
            "@drawable/app_icon_sand_foreground",
            "@drawable/app_icon_original_foreground",
        )
        with self.assertRaisesRegex(ValueError, "poster source"):
            validate_icon_xml("sand", adaptive, wrong)

    def test_rejects_clipped_undersized_and_off_center_artwork(self) -> None:
        adaptive = (RES / "mipmap-anydpi-v26/app_icon_minimal.xml").read_text()
        layer = (RES / "drawable/app_icon_minimal_mask_safe.xml").read_text()
        for size in ["132dp", "108dp", "60dp"]:
            with self.subTest(size=size), self.assertRaisesRegex(ValueError, "safe zone"):
                validate_icon_xml("minimal", adaptive, layer.replace("99dp", size))
        with self.assertRaisesRegex(ValueError, "centered"):
            validate_icon_xml("minimal", adaptive, layer.replace('"center"', '"left"'))


if __name__ == "__main__":
    unittest.main()
