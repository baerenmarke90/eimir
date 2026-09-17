#!/usr/bin/env python3
"""Static upgrade contracts that do not require Docker or Android tooling."""

from __future__ import annotations

import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(relative_path: str) -> str:
    return (ROOT / relative_path).read_text(encoding="utf-8")


class ProjectIdentityMigrationContractTest(unittest.TestCase):
    def test_self_hosted_volume_keys_and_database_defaults_remain_upgrade_safe(
        self,
    ) -> None:
        compose = read("compose.yaml")
        for volume in ("postgres_data", "media_data", "deletion_journal_data"):
            self.assertIn(f"  {volume}:\n", compose)
        self.assertIn("postgres_data:/var/lib/postgresql/data", compose)
        self.assertIn("media_data:/var/lib/eimir/media", compose)
        self.assertIn("deletion_journal_data:/var/lib/eimir/deletion-journal", compose)
        self.assertIn("POSTGRES_USER: ${POSTGRES_USER:-sidebyside}", compose)
        self.assertIn("POSTGRES_DB: ${POSTGRES_DB:-sidebyside}", compose)

    def test_android_store_and_persistent_crypto_identity_remain_stable(self) -> None:
        gradle = read("android/app/build.gradle.kts")
        self.assertIn('namespace = "de.eimir.app.reference"', gradle)
        self.assertIn('applicationId = "de.sidebyside.app"', gradle)
        self.assertIn(
            'DATABASE_NAME = "sidebyside-read-cache.db"',
            read("android/app/src/main/java/de/eimir/app/cache/ReadCacheDatabase.kt"),
        )
        self.assertIn(
            'DEFAULT_KEY_ALIAS = "sidebyside_owner_only_read_cache"',
            read(
                "android/app/src/main/java/de/eimir/app/cache/"
                "AndroidKeystoreProtectedPayloadCipher.kt"
            ),
        )

    def test_browser_state_has_canonical_write_and_legacy_read_keys(self) -> None:
        session = read("web/src/client/sessionPersistence.ts")
        self.assertIn("SESSION_STORAGE_KEY = 'eimir-session-v1'", session)
        self.assertIn("LEGACY_SESSION_STORAGE_KEY = 'sidebyside-session-v1'", session)
        self.assertIn("setItem(SESSION_STORAGE_KEY", session)
        self.assertIn("removeItem(LEGACY_SESSION_STORAGE_KEY", session)

        theme = read("web/src/theme.ts")
        self.assertIn("THEME_STORAGE_KEY = 'eimir.theme'", theme)
        self.assertIn("LEGACY_THEME_STORAGE_KEY = 'sidebyside.theme'", theme)

    def test_new_evidence_is_canonical_while_old_evidence_remains_readable(
        self,
    ) -> None:
        release = read("scripts/release_manifest.py")
        self.assertIn('PRODUCT_NAME = "eimir."', release)
        self.assertIn(
            'CLOUD_DEPLOYMENT_KIND = "eimir-cloud-deployment-identity"', release
        )
        self.assertIn('LEGACY_PRODUCT_NAME = "SideBySide"', release)

        recovery = read("scripts/self_hosted_recovery.py")
        self.assertIn('ARCHIVE_FORMAT = "eimir-self-hosted-backup"', recovery)
        self.assertIn(
            'LEGACY_ARCHIVE_FORMAT = "sidebyside-self-hosted-backup"', recovery
        )


if __name__ == "__main__":
    unittest.main()
