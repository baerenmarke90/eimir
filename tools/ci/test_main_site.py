"""Guard the static eimir.de main site: design-token drift, privacy posture and the build gate."""

from __future__ import annotations

import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
BUILD = ROOT / "tools/site/build_main_site.py"
PAGES = (SITE / "index.html", SITE / "en/index.html", SITE / "impressum/index.html")

DECLARATION = re.compile(r"(--color-[a-z0-9-]+)\s*:\s*([^;]+);")


def _blocks(css: str) -> tuple[str, str, str]:
    """Return (light :root, explicit dark, media dark) bodies of a stylesheet."""
    light = re.search(r"(?m)^:root\s*\{(.*?)^\}", css, re.S)
    dark = re.search(r'(?m):root\[data-theme="dark"\]\s*\{(.*?)^\}', css, re.S)
    media = re.search(r"@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme\]\)\s*\{(.*?)\}\s*\}", css, re.S)
    return (
        light.group(1) if light else "",
        dark.group(1) if dark else "",
        media.group(1) if media else "",
    )


def _values(body: str) -> dict[str, str]:
    return {name: value.strip().lower() for name, value in DECLARATION.findall(body)}


class MainSiteTests(unittest.TestCase):
    def test_site_colors_match_the_web_design_system_adapter(self) -> None:
        site_light, site_dark, site_media = (_values(b) for b in _blocks((SITE / "assets/site.css").read_text()))
        web_light: dict[str, str] = {}
        web_dark: dict[str, str] = {}
        for name in ("styles.css", "theme.css"):
            light, dark, _ = _blocks((ROOT / "web/src" / name).read_text())
            web_light.update(_values(light))
            web_dark.update(_values(dark))
        # Variables that exist only on the public site (hero action) are checked for presence, not drift.
        site_only = {"--color-action-hero", "--color-action-hero-hover", "--color-on-action-hero"}
        for name, value in site_light.items():
            if name in site_only:
                continue
            self.assertIn(name, web_light, f"{name} is not a Web design-system variable")
            self.assertEqual(web_light[name], value, f"light {name} drifted from the Web adapter")
        for name, value in site_dark.items():
            self.assertEqual(web_dark.get(name), value, f"dark {name} drifted from the Web adapter")
        self.assertEqual(site_dark, site_media, "explicit dark theme and the media query must agree")

    def test_pages_are_static_and_privacy_preserving(self) -> None:
        for page in PAGES:
            text = page.read_text(encoding="utf-8")
            name = page.relative_to(SITE).as_posix()
            self.assertNotIn("<script", text, name)
            self.assertIn("default-src 'none'", text, name)
            self.assertRegex(text, r'<html lang="(de|en)"', name)
            for target in re.findall(r'(?:href|src)="(https?://[^"]+)"', text):
                self.assertTrue(
                    target.startswith(("https://app.eimir.de", "https://eimir.de")),
                    f"{name}: unexpected external reference {target}",
                )
        css = (SITE / "assets/site.css").read_text()
        self.assertNotIn("http", re.sub(r"/\*.*?\*/", "", css, flags=re.S), "no remote CSS resources")

    def test_privacy_and_terms_links_use_the_application_origin(self) -> None:
        for page in PAGES[:2]:
            text = page.read_text(encoding="utf-8")
            self.assertIn('href="https://app.eimir.de/legal/privacy"', text)
            self.assertIn('href="https://app.eimir.de/legal/terms"', text)
            self.assertIn('href="https://app.eimir.de"', text)

    def test_imprint_is_not_indexed_and_blocks_production_while_unfinished(self) -> None:
        imprint = PAGES[2].read_text(encoding="utf-8")
        self.assertIn('<meta name="robots" content="noindex">', imprint)
        development = subprocess.run([sys.executable, str(BUILD)], capture_output=True, text=True, check=False)
        self.assertEqual(development.returncode, 0, development.stderr)
        production = subprocess.run([sys.executable, str(BUILD), "--production"], capture_output=True, text=True, check=False)
        if "[[" in imprint:
            self.assertNotEqual(production.returncode, 0)
            self.assertIn("unresolved [[PLACEHOLDER]]", production.stderr)
        else:
            self.assertEqual(production.returncode, 0, production.stderr)


if __name__ == "__main__":
    unittest.main()
