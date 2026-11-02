"""Regressions for test-channel admission and actual APK identity parsing."""

import unittest

from android_test_release import (
    LEGACY_PACKAGE,
    PACKAGE_NAME,
    TEST_ORIGIN,
    parse_badging,
    test_environment,
    validate_identity,
    validate_upgrade,
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
            "dirty": False,
            "validationOnly": False,
            "sourceRevision": "a" * 40,
            "versionName": "0.2.0-test.1",
            "versionCode": 1,
        }
        validate_identity(identity)
        for key, bad in [
            ("apiOrigin", "https://elsewhere.test"),
            ("demoMode", True),
            ("demoResetTimer", True),
            ("dirty", True),
            ("testUpdates", False),
            ("validationOnly", True),
            ("versionCode", True),
            ("versionCode", 0),
            ("versionCode", 2_100_000_001),
            ("versionName", "0.2.0"),
            ("sourceRevision", "development"),
        ]:
            with self.subTest(key=key, value=bad), self.assertRaises(ValueError):
                validate_identity({**identity, key: bad})

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


if __name__ == "__main__":
    unittest.main()
