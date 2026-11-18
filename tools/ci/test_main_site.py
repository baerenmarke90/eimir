"""Guard the static eimir.de main site: design-token drift, privacy posture and the build gate."""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
PAGES = (SITE / "index.html", SITE / "en/index.html", SITE / "impressum/index.html")

sys.path.insert(0, str(ROOT / "tools/site"))
import build_main_site

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
    def setUp(self) -> None:
        temp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.dist = temp / "dist"
        self.preview = temp / "dist-preview"
        self.enterContext(patch.multiple(build_main_site, DIST=self.dist, PREVIEW=self.preview))

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

    def test_preview_is_framed_from_the_same_origin_only(self) -> None:
        for page in PAGES[:2]:
            text = page.read_text(encoding="utf-8")
            name = page.relative_to(SITE).as_posix()
            self.assertIn("frame-src 'self'", text, name)
            frames = re.findall(r"<iframe[^>]*>", text)
            self.assertEqual(len(frames), 1, name)
            self.assertRegex(frames[0], r'src="/preview/(\?lang=en)?"', name)
            self.assertIn("sandbox=", frames[0], name)
            self.assertIn('loading="lazy"', frames[0], name)
        self.assertIn("frame-src 'self'", (SITE / "security-headers.conf").read_text())

    def test_privacy_and_terms_links_use_the_application_origin(self) -> None:
        for page in PAGES[:2]:
            text = page.read_text(encoding="utf-8")
            self.assertIn('href="https://app.eimir.de/legal/privacy"', text)
            self.assertIn('href="https://app.eimir.de/legal/terms"', text)
            self.assertIn('href="https://app.eimir.de"', text)

    def test_imprint_is_not_indexed_and_blocks_production_while_unfinished(self) -> None:
        imprint = PAGES[2].read_text(encoding="utf-8")
        self.assertIn('<meta name="robots" content="noindex">', imprint)
        self.preview.mkdir()
        (self.preview / "index.html").write_text("<!doctype html>", encoding="utf-8")
        self.assertEqual(build_main_site.build(production=False), [])
        production = build_main_site.build(production=True)
        if "[[" in imprint:
            self.assertEqual(production, ["impressum/index.html: unresolved [[PLACEHOLDER]] marker"])
        else:
            self.assertEqual(production, [])
        self.assertTrue((self.dist / "preview/index.html").is_file())
        for page in PAGES[:2]:
            html = (self.dist / page.relative_to(SITE)).read_text(encoding="utf-8")
            self.assertIn('src="/preview/', html)
            self.assertIn('href="#ausprobieren"', html)

    def test_development_omits_unbuilt_preview_and_production_requires_it(self) -> None:
        self.assertEqual(build_main_site.build(production=False), [])
        for page in PAGES[:2]:
            html = (self.dist / page.relative_to(SITE)).read_text(encoding="utf-8")
            self.assertNotIn('/preview/', html)
            self.assertNotIn('ausprobieren"', html)
        production = build_main_site.build(production=True)
        self.assertIn("missing web/dist-preview: run npm run build:preview in web/", production)

    def test_built_preview_links_are_validated(self) -> None:
        self.preview.mkdir()
        (self.preview / "index.html").write_text('<script src="/preview/missing.js"></script>', encoding="utf-8")
        self.assertEqual(
            build_main_site.build(production=False),
            ["preview/index.html: broken local reference /preview/missing.js"],
        )

    def test_built_site_does_not_ship_server_configuration(self) -> None:
        self.assertEqual(build_main_site.build(production=False), [])
        for name in ("Dockerfile", "nginx.conf", "security-headers.conf", "security-headers-preview.conf"):
            self.assertFalse((self.dist / name).exists(), f"{name} must not be served")
        self.assertTrue((self.dist / "index.html").is_file())

    def test_container_reuses_the_pinned_web_image_and_sends_security_headers(self) -> None:
        dockerfile = (SITE / "Dockerfile").read_text()
        web_dockerfile = (ROOT / "web/Dockerfile").read_text()
        nginx_pin = re.search(r"FROM (ghcr\.io/nginx/nginx-unprivileged:\S+@sha256:[0-9a-f]{64})", web_dockerfile)
        self.assertIsNotNone(nginx_pin)
        self.assertIn(nginx_pin.group(1), dockerfile, "site and web must share one pinned nginx image")
        self.assertRegex(dockerfile, r"FROM python:\S+@sha256:[0-9a-f]{64} AS build")
        self.assertIn("build_main_site.py --production", dockerfile)
        nginx = (SITE / "nginx.conf").read_text()
        headers = (SITE / "security-headers.conf").read_text()
        for directive in ("Content-Security-Policy", "frame-ancestors 'none'", "Referrer-Policy", "X-Content-Type-Options"):
            self.assertIn(directive, headers)
        includes = nginx.count("include /etc/nginx/security-headers.conf;") + nginx.count(
            "include /etc/nginx/security-headers-preview.conf;"
        )
        self.assertEqual(includes, nginx.count("location "))
        preview_headers = (SITE / "security-headers-preview.conf").read_text()
        for directive in ("frame-ancestors 'self'", "script-src 'self'", "connect-src 'self'", "X-Frame-Options"):
            self.assertIn(directive, preview_headers)
        self.assertNotIn("unsafe-inline", preview_headers)
        self.assertNotIn("http", preview_headers.replace("Referrer-Policy", ""), "the preview may not reach other origins")
        self.assertIn("security-headers-preview.conf", dockerfile)
        self.assertIn("build:preview", dockerfile)
        self.assertRegex(dockerfile, r"COPY --from=preview /app/dist-preview web/dist-preview\s+RUN .* --production")
        self.assertIn("/etc/nginx/security-headers.conf", dockerfile)


if __name__ == "__main__":
    unittest.main()
