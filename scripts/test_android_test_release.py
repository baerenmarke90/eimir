"""Regressions for test-channel admission and actual APK identity parsing."""

import unittest

from android_test_release import (
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
        current = {"packageName": "de.sidebyside.app", "versionCode": 5}
        validate_upgrade(
            current, {"packageName": "de.sidebyside.app", "versionCode": 4}
        )
        for previous in [
            {"packageName": "de.sidebyside.app", "versionCode": 5},
            {"packageName": "de.sidebyside.app", "versionCode": 6},
            {"packageName": "another.app", "versionCode": 4},
        ]:
            with self.subTest(previous=previous), self.assertRaises(ValueError):
                validate_upgrade(current, previous)


if __name__ == "__main__":
    unittest.main()
