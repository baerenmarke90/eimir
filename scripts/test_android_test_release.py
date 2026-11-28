"""Regressions for test-channel admission and actual APK identity parsing."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from android_test_release import (
    LEGACY_PACKAGE,
    PACKAGE_NAME,
    CERTIFICATE,
    LEGACY_CERTIFICATE,
    FIREBASE_PROJECT,
    TEST_ORIGIN,
    parse_badging,
    test_environment,
    update_manifest,
    update_repository,
    validate_identity,
    validate_upgrade,
    verify_signer,
)


class AndroidTestReleaseTests(unittest.TestCase):
    def test_regular_mode_survives_inherited_demo_configuration(self):
        env = test_environment(
            {
                "VITE_EIMIR_DEMO_MODE": "true",
                "VITE_SBS_DEMO_MODE": "true",
                "VITE_EIMIR_DEMO_RESET_TIMER": "true",
                "VITE_SBS_DEMO_URL": "https://old-demo.test",
            }
        )
        self.assertEqual(env["VITE_EIMIR_API_BASE_URL"], TEST_ORIGIN)
        self.assertEqual(env["VITE_EIMIR_DEMO_MODE"], "false")
        self.assertEqual(env["VITE_SBS_DEMO_MODE"], "false")
        self.assertEqual(env["VITE_EIMIR_DEMO_RESET_TIMER"], "false")
        self.assertEqual(env["VITE_SBS_DEMO_URL"], "")
        self.assertEqual(env["VITE_EIMIR_TEST_UPDATES"], "true")

    def test_publication_rejects_wrong_origin_demo_dirty_and_invalid_builds(self):
        identity = {
            "channel": "android-test",
            "apiOrigin": TEST_ORIGIN,
            "demoMode": False,
            "demoResetTimer": False,
            "testUpdates": True,
            "firebaseProjectId": FIREBASE_PROJECT,
            "dirty": False,
            "validationOnly": False,
            "sourceRevision": "a" * 40,
            "versionName": "0.2.0-test.1",
            "versionCode": 1,
            "updateRepository": "baerenmarke90/eimir",
        }
        validate_identity(identity)
        validate_identity({**identity, "updateRepository": "baerenmarke90/eimir-core"})
        with self.assertRaises(ValueError):
            validate_identity({key: value for key, value in identity.items() if key != "updateRepository"})
        for key, bad in [
            ("updateRepository", "owner/../eimir"),
            ("updateRepository", ""),
            ("apiOrigin", "https://elsewhere.test"),
            ("demoMode", True),
            ("demoResetTimer", True),
            ("dirty", True),
            ("testUpdates", False),
            ("firebaseProjectId", "other-project"),
            ("firebaseProjectId", ""),
            ("validationOnly", True),
            ("versionCode", True),
            ("versionCode", 0),
            ("versionCode", 2_100_000_001),
            ("versionName", "0.2.0"),
            ("sourceRevision", "development"),
        ]:
            with self.subTest(key=key, value=bad), self.assertRaises(ValueError):
                validate_identity({**identity, key: bad})

    def test_build_records_the_single_update_location_of_the_updater(self):
        # The real updater source on this branch; it changes only at the cut-over.
        self.assertEqual(update_repository(), "baerenmarke90/eimir")
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "UpdatePolicy.java"
            source.write_bytes(
                b'public final class UpdatePolicy {\r\n'
                b'    public static final String REPOSITORY = "baerenmarke90/eimir-core";\r\n}\r\n')
            self.assertEqual(update_repository(source), "baerenmarke90/eimir-core")
            for body in ('', 'public static final String REPOSITORY = "a/b";\n' * 2,
                         'public static final String REPOSITORY = "owner/../x";\n'):
                source.write_text(body, encoding="utf-8")
                with self.subTest(body=body), self.assertRaises(ValueError):
                    update_repository(source)

    def test_marker_names_the_asset_repository_not_the_update_location(self):
        identity = {"versionName": "0.2.0-test.104", "versionCode": 104,
                    "sourceRevision": "a" * 40, "updateRepository": "baerenmarke90/eimir-core"}
        apk = "eimir-android-test-v0.2.0-test.104.apk"
        bridge = update_manifest(identity, "Notes", size=10, sha256="b" * 64,
                                 asset_repository="baerenmarke90/eimir")
        self.assertEqual(bridge["asset"]["url"], "https://github.com/baerenmarke90/eimir/releases/download/"
                         "android-test-v0.2.0-test.104/" + apk)
        moved = update_manifest(identity, "Notes", size=10, sha256="b" * 64,
                                asset_repository="baerenmarke90/eimir-core")
        self.assertEqual(moved["asset"]["url"], "https://github.com/baerenmarke90/eimir-core/releases/download/"
                         "android-test-v0.2.0-test.104/" + apk)
        self.assertEqual({key for key in bridge if key != "asset"}, {
            "schemaVersion", "channel", "packageName", "versionName", "versionCode", "minSdk",
            "sourceRevision", "releaseNotes"})
        with self.assertRaises(ValueError):
            update_manifest(identity, "Notes", size=10, sha256="b" * 64, asset_repository="owner/../x")

    def test_parses_the_built_apk_and_rejects_debug_or_missing_identity(self):
        badging = "package: name='de.sidebyside.app' versionCode='1' versionName='0.2.0-test.1'\nsdkVersion:'26'\n"
        self.assertEqual(parse_badging(badging)["versionCode"], 1)
        for bad in [
            badging + "application-debuggable\n",
            "package: name='de.sidebyside.app'\n",
            "",
        ]:
            with self.subTest(value=bad), self.assertRaises(ValueError):
                parse_badging(bad)

    def test_updates_reject_same_or_older_code_and_foreign_package(self):
        current = {"packageName": PACKAGE_NAME, "versionCode": 40}
        validate_upgrade(
            current, {"packageName": PACKAGE_NAME, "versionCode": 39}
        )
        for previous in [
            {"packageName": PACKAGE_NAME, "versionCode": 40},
            {"packageName": PACKAGE_NAME, "versionCode": 41},
            {"packageName": LEGACY_PACKAGE, "versionCode": 38},
            {"packageName": "another.app", "versionCode": 39},
        ]:
            with self.subTest(previous=previous), self.assertRaises(ValueError):
                validate_upgrade(current, previous)

    def test_fresh_package_requires_the_exact_approved_boundary(self):
        current = {"packageName": PACKAGE_NAME, "versionName": "0.2.0-test.39", "versionCode": 39}
        previous = {"packageName": LEGACY_PACKAGE, "versionName": "0.2.0-test.38", "versionCode": 38}
        validate_upgrade(current, previous, fresh_package=True)
        with self.assertRaises(ValueError):
            validate_upgrade(current, previous)
        for change in [
            {"packageName": "another.app"}, {"packageName": LEGACY_PACKAGE},
            {"versionCode": 38}, {"versionCode": 40}, {"versionName": "0.2.0-test.40"},
        ]:
            with self.subTest(current=change), self.assertRaises(ValueError):
                validate_upgrade({**current, **change}, previous, fresh_package=True)
        for change in [
            {"packageName": PACKAGE_NAME}, {"packageName": "another.app"},
            {"versionCode": 37}, {"versionName": "0.2.0-test.37"},
        ]:
            with self.subTest(previous=change), self.assertRaises(ValueError):
                validate_upgrade(current, {**previous, **change}, fresh_package=True)

    def test_canonical_and_legacy_signers_are_not_interchangeable(self):
        with patch("android_test_release.sdk_tool", return_value="apksigner"), \
             patch("android_test_release.run") as signer:
            for certificate in (CERTIFICATE, LEGACY_CERTIFICATE):
                signer.return_value = f"Signer #1 certificate SHA-256 digest: {certificate}\n"
                verify_signer(Path("fixture.apk"), certificate)
                other = LEGACY_CERTIFICATE if certificate == CERTIFICATE else CERTIFICATE
                with self.assertRaises(ValueError):
                    verify_signer(Path("fixture.apk"), other)
            signer.return_value = "No signer certificate\n"
            with self.assertRaises(ValueError):
                verify_signer(Path("fixture.apk"), CERTIFICATE)


if __name__ == "__main__":
    unittest.main()
