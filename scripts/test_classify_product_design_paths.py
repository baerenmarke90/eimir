#!/usr/bin/env python3
"""Unit tests for product design review path classification (Issue #675)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

# Allow direct invocation without external PYTHONPATH configuration.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.classify_product_design_paths import (
    classify_paths,
    is_user_facing_path,
)


class TestClassifyProductDesignPaths(unittest.TestCase):
    """Verify positive, negative, and edge path classification."""

    def test_design_tokens_classified_as_user_facing(self) -> None:
        self.assertTrue(is_user_facing_path("design/tokens.json"))

    def test_design_system_manifest_and_assets_classified_as_user_facing(self) -> None:
        self.assertTrue(is_user_facing_path("design/component-manifest.json"))
        self.assertTrue(is_user_facing_path("design/m2/m2-screenflow.svg"))
        self.assertTrue(is_user_facing_path("design/icons/heart.svg"))

    def test_web_runtime_assets_classified_as_user_facing(self) -> None:
        self.assertTrue(is_user_facing_path("web/index.html"))
        self.assertTrue(is_user_facing_path("web/public/favicon.svg"))
        self.assertTrue(is_user_facing_path("web/public/apple-touch-icon.png"))
        self.assertTrue(is_user_facing_path("web/public/theme-bootstrap.js"))
        self.assertTrue(is_user_facing_path("web/public/fonts/instrument-sans-latin-variable.woff2"))

    def test_web_src_client_code_classified_as_user_facing(self) -> None:
        self.assertTrue(is_user_facing_path("web/src/components/Brand.tsx"))
        self.assertTrue(is_user_facing_path("web/src/theme.css"))
        self.assertTrue(is_user_facing_path("web/src/styles.css"))
        self.assertTrue(is_user_facing_path("web/src/TodayPage.css"))

    def test_capacitor_wrapper_is_not_a_parallel_product_ui_surface(self) -> None:
        self.assertFalse(is_user_facing_path("android/app/src/main/java/de/eimir/app/MainActivity.kt"))
        self.assertFalse(is_user_facing_path("android/app/src/main/AndroidManifest.xml"))
        self.assertFalse(is_user_facing_path("android/app/src/main/res/values/strings.xml"))

    def test_generated_openapi_clients_excluded(self) -> None:
        self.assertFalse(is_user_facing_path("web/src/api/generated/apis/DashboardApi.ts"))
        self.assertFalse(is_user_facing_path("web/src/api/generated/models/DashboardView.ts"))
        self.assertFalse(is_user_facing_path("web/src/api/generated/runtime.ts"))

    def test_backend_paths_excluded(self) -> None:
        self.assertFalse(is_user_facing_path("backend/src/eimir/api/v1/auth.py"))
        self.assertFalse(is_user_facing_path("backend/alembic/versions/0001_initial.py"))
        self.assertFalse(is_user_facing_path("backend/pyproject.toml"))

    def test_docs_and_ci_paths_excluded(self) -> None:
        self.assertFalse(is_user_facing_path("docs/DESIGN-PRINCIPLES.md"))
        self.assertFalse(is_user_facing_path("docs/decisions/0001-record.md"))
        self.assertFalse(is_user_facing_path(".github/workflows/product-design-review.yml"))
        self.assertFalse(is_user_facing_path(".github/workflows/ci.yml"))
        self.assertFalse(is_user_facing_path("README.md"))
        self.assertFalse(is_user_facing_path("AGENTS.md"))
        self.assertFalse(is_user_facing_path("biome.json"))
        self.assertFalse(is_user_facing_path(".gitignore"))

    def test_classify_paths_filters_correctly(self) -> None:
        input_paths = [
            "backend/src/eimir/service.py",
            "design/tokens.json",
            "docs/README.md",
            "web/src/api/generated/models/User.ts",
            "web/public/favicon.svg",
            "android/app/src/main/res/values/strings.xml",
            "scripts/compose_checked.py",
        ]
        expected = [
            "design/tokens.json",
            "web/public/favicon.svg",
        ]
        self.assertEqual(classify_paths(input_paths), expected)

    def test_empty_or_whitespace_paths_ignored(self) -> None:
        self.assertFalse(is_user_facing_path(""))
        self.assertFalse(is_user_facing_path("   "))
        self.assertEqual(classify_paths(["", "  ", "\n"]), [])


if __name__ == "__main__":
    unittest.main()
