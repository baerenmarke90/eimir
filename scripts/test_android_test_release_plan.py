"""Negative release-plan and public-byte verification regressions."""

import copy
import hashlib
import io
import json
import unittest
import urllib.error
import zipfile

from android_test_release_plan import API, DOWNLOAD, admit, validate_plan, verify_once, verify_public


def plan_data():
    return {
        "schemaVersion": 1,
        "sourceRevision": "a" * 40,
        "versionName": "0.2.0-test.14",
        "versionCode": 14,
        "previousVersionName": "0.2.0-test.13",
        "notesFile": "docs/releases/android-test-0.2.0-test.14-notes.txt",
    }


class PublicFixture:
    def __init__(self, identity_change=None):
        self.plan = validate_plan(plan_data())
        identity = {
            "channel": "android-test", "sourceRevision": "a" * 40,
            "versionName": self.plan.version, "versionCode": 14,
            "dirty": False, "validationOnly": False,
            "apiOrigin": "https://demo.eimir.ur-cloud.de", "demoMode": False,
            "demoResetTimer": False, "testUpdates": True,
        }
        identity.update(identity_change or {})
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("assets/public/eimir-test-build.json", json.dumps(identity))
        apk = buffer.getvalue()
        digest = hashlib.sha256(apk).hexdigest()
        self.marker = {
            "schemaVersion": 1, "channel": "android-test", "packageName": "de.sidebyside.app",
            "sourceRevision": "a" * 40, "versionName": self.plan.version,
            "versionCode": 14, "minSdk": 26,
            "asset": {"name": self.plan.apk, "size": len(apk), "sha256": digest,
                      "url": f"{DOWNLOAD}/{self.plan.tag}/{self.plan.apk}"},
        }
        self.content = {
            self.plan.apk: apk,
            "SHA256SUMS": f"{digest}  {self.plan.apk}\n".encode(),
            "native-acceptance.md": b"Automated verification; device acceptance pending.\n",
            "eimir-test-update.json": json.dumps(self.marker).encode(),
        }
        self.release = {
            "tag_name": self.plan.tag, "draft": False, "prerelease": True,
            "immutable": True, "target_commitish": "a" * 40,
        }
        self.sync_assets()
        self.calls = []

    def sync_assets(self):
        self.release["assets"] = [
            {"name": name, "size": len(content),
             "digest": "sha256:" + hashlib.sha256(content).hexdigest(),
             "browser_download_url": f"{DOWNLOAD}/{self.plan.tag}/{name}"}
            for name, content in self.content.items()
        ]

    def read(self, url, limit):
        self.calls.append(url)
        if url == API + "?per_page=30":
            return json.dumps([self.release]).encode()
        if url == API + "/tags/" + self.plan.tag:
            return json.dumps(self.release).encode()
        prefix = f"{DOWNLOAD}/{self.plan.tag}/"
        if not url.startswith(prefix):
            raise AssertionError("Unexpected public request")
        content = self.content[url[len(prefix):]]
        assert len(content) <= limit
        return content


class ReleasePlanTests(unittest.TestCase):
    def test_valid_plan_produces_only_bounded_known_workflow_values(self):
        plan = validate_plan(plan_data())
        self.assertEqual(plan.values()["PREVIOUS_TAG"], "android-test-v0.2.0-test.13")
        self.assertEqual(plan.values()["VERSION_CODE"], "14")
        self.assertTrue(all("\n" not in value for value in plan.values().values()))

    def test_rejects_extra_fields_types_paths_versions_and_unpinned_sources(self):
        for key, value in [
            ("schemaVersion", True), ("schemaVersion", 2), ("versionCode", True),
            ("versionCode", "14"), ("versionCode", 0), ("versionCode", 2_100_000_001),
            ("versionCode", 15), ("sourceRevision", "main"),
            ("sourceRevision", "a" * 40 + "\nPATH=bad"),
            ("versionName", "0.2.0"), ("previousVersionName", "0.2.0-test.14"),
            ("previousVersionName", "0.2.0-test.15"),
            ("notesFile", "../../secrets"), ("notesFile", "docs/releases/other.txt"),
        ]:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                validate_plan({**plan_data(), key: value})
        for invalid in [None, [], {}, {**plan_data(), "certificate": "other"}]:
            with self.assertRaises(ValueError):
                validate_plan(invalid)

    def test_verifies_all_public_bytes_and_skips_an_identical_published_plan(self):
        fixture = PublicFixture()
        result = verify_once(fixture.plan, fixture.read)
        self.assertEqual(result["tag"], fixture.plan.tag)
        self.assertFalse(admit(fixture.plan, fixture.read))
        self.assertEqual(set(fixture.calls), {
            API + "?per_page=30", API + "/tags/" + fixture.plan.tag,
            *[f"{DOWNLOAD}/{fixture.plan.tag}/{name}" for name in fixture.content],
        })

    def test_only_a_missing_tag_admits_new_signing(self):
        plan = validate_plan(plan_data())
        def missing(url, limit):
            raise urllib.error.HTTPError(url, 404, "Not found", {}, None)
        self.assertTrue(admit(plan, missing))
        def denied(url, limit):
            raise urllib.error.HTTPError(url, 403, "Denied", {}, None)
        with self.assertRaises(urllib.error.HTTPError):
            admit(plan, denied)

    def test_rejects_wrong_release_source_mutability_and_duplicate_assets(self):
        for key, value in [("draft", True), ("prerelease", False), ("immutable", False),
                           ("target_commitish", "b" * 40)]:
            fixture = PublicFixture()
            fixture.release[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_once(fixture.plan, fixture.read)
        fixture = PublicFixture()
        fixture.release["assets"].append(copy.deepcopy(fixture.release["assets"][0]))
        with self.assertRaises(ValueError):
            verify_once(fixture.plan, fixture.read)

    def test_rejects_cross_release_urls_and_corrupted_downloads(self):
        fixture = PublicFixture()
        fixture.release["assets"][0]["browser_download_url"] = "https://elsewhere.invalid/app.apk"
        with self.assertRaises(ValueError):
            verify_once(fixture.plan, fixture.read)
        fixture = PublicFixture()
        fixture.content[fixture.plan.apk] += b"corrupt"
        with self.assertRaises(ValueError):
            verify_once(fixture.plan, fixture.read)

    def test_rejects_marker_disagreement_even_when_github_digests_are_consistent(self):
        for key, value in [("packageName", "other.app"), ("versionCode", True),
                           ("sourceRevision", "b" * 40), ("versionName", "0.2.0-test.15")]:
            fixture = PublicFixture()
            fixture.marker[key] = value
            fixture.content["eimir-test-update.json"] = json.dumps(fixture.marker).encode()
            fixture.sync_assets()
            with self.subTest(key=key), self.assertRaises(ValueError):
                verify_once(fixture.plan, fixture.read)

    def test_rejects_dirty_demo_unsigned_or_different_embedded_apk_identity(self):
        for change in [{"dirty": True}, {"validationOnly": True}, {"demoMode": True},
                       {"apiOrigin": "https://elsewhere.invalid"}, {"sourceRevision": "b" * 40},
                       {"dirty": 0}, {"versionCode": True}]:
            fixture = PublicFixture(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                verify_once(fixture.plan, fixture.read)

    def test_public_catalog_propagation_retries_but_corruption_does_not(self):
        fixture = PublicFixture()
        missing = [True]
        def delayed(url, limit):
            if missing and url == API + "?per_page=30" and missing.pop():
                return b"[]"
            return fixture.read(url, limit)
        pauses = []
        self.assertEqual(verify_public(fixture.plan, delayed, pause=pauses.append)["tag"], fixture.plan.tag)
        self.assertEqual(pauses, [5])
        fixture.content["SHA256SUMS"] += b"corrupt"
        pauses.clear()
        with self.assertRaises(ValueError):
            verify_public(fixture.plan, fixture.read, pause=pauses.append)
        self.assertEqual(pauses, [])

    def test_missing_publication_has_a_finite_retry_deadline(self):
        ticks = iter([0, 1, 2, 3])
        pauses = []
        with self.assertRaisesRegex(ValueError, "deadline"):
            verify_public(validate_plan(plan_data()), lambda url, limit: b"[]",
                          timeout=2, clock=lambda: next(ticks), pause=pauses.append)
        self.assertEqual(pauses, [1])


if __name__ == "__main__":
    unittest.main()
