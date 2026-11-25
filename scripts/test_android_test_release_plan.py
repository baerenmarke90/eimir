"""Negative release-plan and public-byte verification regressions."""

import copy
import hashlib
import io
import json
import unittest
from unittest.mock import patch
import urllib.error
import zipfile

from android_test_release_plan import (
    API, DOWNLOAD, FIREBASE_PROJECT, PACKAGE, REPOSITORY, admit, api_url, download_url, fetch,
    origin_for_version, validate_plan, validate_repository, verify_once, verify_public,
)

CORE = "baerenmarke90/eimir-core"


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
    def __init__(self, identity_change=None, data=None, repository=REPOSITORY):
        self.api, self.download = api_url(repository), download_url(repository)
        self.plan = validate_plan(data or plan_data())
        identity = {
            "channel": "android-test", "sourceRevision": "a" * 40,
            "versionName": self.plan.version, "versionCode": self.plan.code,
            "dirty": False, "validationOnly": False,
            "apiOrigin": origin_for_version(self.plan.version), "demoMode": False,
            "demoResetTimer": False, "testUpdates": True,
        }
        identity.update(identity_change or {})
        if self.plan.code >= 39 and "firebaseProjectId" not in (identity_change or {}):
            identity["firebaseProjectId"] = FIREBASE_PROJECT
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("assets/public/eimir-test-build.json", json.dumps(identity))
        apk = buffer.getvalue()
        digest = hashlib.sha256(apk).hexdigest()
        self.marker = {
            "schemaVersion": 1, "channel": "android-test", "packageName": "de.sidebyside.app",
            "sourceRevision": "a" * 40, "versionName": self.plan.version,
            "versionCode": self.plan.code, "minSdk": 26,
            "asset": {"name": self.plan.apk, "size": len(apk), "sha256": digest,
                      "url": f"{self.download}/{self.plan.tag}/{self.plan.apk}"},
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
            {"id": asset_id, "name": name, "size": len(content),
             "digest": "sha256:" + hashlib.sha256(content).hexdigest(),
             "browser_download_url": f"{self.download}/{self.plan.tag}/{name}"}
            for asset_id, (name, content) in enumerate(self.content.items(), 1)
        ]

    def read(self, url, limit):
        self.calls.append(url)
        if url == self.api + "?per_page=30":
            return json.dumps([self.release]).encode()
        if url == self.api + "/tags/" + self.plan.tag:
            return json.dumps(self.release).encode()
        asset_names = {f"{self.api}/assets/{asset['id']}": asset["name"] for asset in self.release["assets"]}
        if url not in asset_names:
            raise AssertionError("Unexpected public request")
        content = self.content[asset_names[url]]
        assert len(content) <= limit
        return content


class ReleasePlanTests(unittest.TestCase):
    def test_public_asset_api_requests_bounded_binary_content_without_credentials(self):
        url = f"{API}/assets/123"
        with patch("android_test_release_plan.urllib.request.urlopen") as open_url:
            open_url.return_value = io.BytesIO(b"verified")
            self.assertEqual(fetch(url, 8), b"verified")
            request = open_url.call_args.args[0]
            self.assertEqual(request.full_url, url)
            self.assertEqual(request.headers["Accept"], "application/octet-stream")
            self.assertEqual(request.headers["X-github-api-version"], "2022-11-28")
            self.assertNotIn("Authorization", request.headers)
            self.assertEqual(open_url.call_args.kwargs, {"timeout": 30})
        with patch("android_test_release_plan.urllib.request.urlopen") as open_url:
            open_url.return_value = io.BytesIO(b"oversized")
            with self.assertRaisesRegex(ValueError, "size bound"):
                fetch(url, 3)

    def test_catalog_requests_remain_json_and_transport_errors_are_not_hidden(self):
        with patch("android_test_release_plan.urllib.request.urlopen") as open_url:
            open_url.return_value = io.BytesIO(b"[]")
            self.assertEqual(fetch(API + "?per_page=30", 8), b"[]")
            self.assertNotIn("Accept", open_url.call_args.args[0].headers)
        for code in (403, 404, 504):
            with self.subTest(code=code), patch("android_test_release_plan.urllib.request.urlopen") as open_url:
                open_url.side_effect = urllib.error.HTTPError(API, code, "Unavailable", {}, None)
                with self.assertRaises(urllib.error.HTTPError):
                    fetch(API, 8)
                self.assertEqual(open_url.call_count, 1)

    def test_public_asset_ids_must_be_positive_integers_from_the_release(self):
        for asset_id in (None, True, 0, -1, "123", 1.5):
            fixture = PublicFixture()
            fixture.release["assets"][0]["id"] = asset_id
            with self.subTest(asset_id=asset_id), self.assertRaisesRegex(ValueError, "asset ID"):
                verify_once(fixture.plan, fixture.read)

    def test_default_asset_repository_is_unchanged_until_the_cutover(self):
        self.assertEqual(REPOSITORY, "baerenmarke90/eimir")
        self.assertEqual(API, "https://api.github.com/repos/baerenmarke90/eimir/releases")
        self.assertEqual(DOWNLOAD, "https://github.com/baerenmarke90/eimir/releases/download")
        self.assertEqual(api_url(CORE), "https://api.github.com/repos/baerenmarke90/eimir-core/releases")
        self.assertEqual(download_url(CORE), "https://github.com/baerenmarke90/eimir-core/releases/download")

    def test_asset_repository_names_cannot_escape_the_url_path(self):
        self.assertEqual(validate_repository(CORE), CORE)
        self.assertEqual(validate_repository("owner-1/repo.name_x"), "owner-1/repo.name_x")
        for bad in ("", "eimir", "a/b/c", "../eimir", "owner/..", "owner/.", "-owner/repo",
                    "owner/repo?x=1", "owner/repo#x", "owner/re po", "evil.test/repo",
                    "owner/repo\n", "https://github.com/o/r", None, 1):
            with self.subTest(repository=bad), self.assertRaises(ValueError):
                validate_repository(bad)

    def test_another_asset_repository_is_verified_entirely_within_itself(self):
        fixture = PublicFixture(repository=CORE)
        result = verify_once(fixture.plan, fixture.read, repository=CORE)
        self.assertEqual(result["assetRepository"], CORE)
        self.assertFalse(admit(fixture.plan, fixture.read, repository=CORE))
        self.assertTrue(fixture.calls)
        self.assertTrue(all(url.startswith(api_url(CORE) + "/") or url.startswith(api_url(CORE) + "?")
                            for url in fixture.calls), fixture.calls)

    def test_marker_and_asset_urls_must_name_the_asset_repository(self):
        # A marker that names another repository than the release it sits in would be
        # rejected by the installed updater, so the publisher must reject it first.
        fixture = PublicFixture(repository=CORE)
        fixture.marker["asset"]["url"] = f"{DOWNLOAD}/{fixture.plan.tag}/{fixture.plan.apk}"
        fixture.content["eimir-test-update.json"] = json.dumps(fixture.marker).encode()
        fixture.sync_assets()
        with self.assertRaisesRegex(ValueError, "marker"):
            verify_once(fixture.plan, fixture.read, repository=CORE)
        fixture = PublicFixture(repository=CORE)
        fixture.release["assets"][0]["browser_download_url"] = (
            f"{DOWNLOAD}/{fixture.plan.tag}/{fixture.release['assets'][0]['name']}")
        with self.assertRaisesRegex(ValueError, "asset URL"):
            verify_once(fixture.plan, fixture.read, repository=CORE)

    def test_admission_reads_the_tag_from_the_requested_asset_repository(self):
        requested = []
        def missing(url, limit):
            requested.append(url)
            raise urllib.error.HTTPError(url, 404, "Not found", {}, None)
        self.assertTrue(admit(validate_plan(plan_data()), missing, repository=CORE))
        self.assertEqual(requested, [api_url(CORE) + "/tags/android-test-v0.2.0-test.14"])
        with self.assertRaises(ValueError):
            admit(validate_plan(plan_data()), missing, repository="owner/../x")

    def test_any_asset_repository_download_uses_the_binary_media_type(self):
        url = f"{api_url(CORE)}/assets/7"
        with patch("android_test_release_plan.urllib.request.urlopen") as open_url:
            open_url.return_value = io.BytesIO(b"ok")
            fetch(url, 8)
            self.assertEqual(open_url.call_args.args[0].headers["Accept"], "application/octet-stream")
        with patch("android_test_release_plan.urllib.request.urlopen") as open_url:
            open_url.return_value = io.BytesIO(b"ok")
            fetch(f"{api_url(CORE)}/assets/7/../8", 8)
            self.assertNotIn("Accept", open_url.call_args.args[0].headers)

    def test_embedded_update_location_is_reported_when_the_build_records_it(self):
        fixture = PublicFixture({"updateRepository": CORE})
        self.assertEqual(verify_once(fixture.plan, fixture.read)["updateRepository"], CORE)
        self.assertNotIn("updateRepository", verify_once(PublicFixture().plan, PublicFixture().read))
        fixture = PublicFixture({"updateRepository": "owner/../x"})
        with self.assertRaises(ValueError):
            verify_once(fixture.plan, fixture.read)

    def test_valid_plan_produces_only_bounded_known_workflow_values(self):
        plan = validate_plan(plan_data())
        self.assertEqual(plan.values()["PREVIOUS_TAG"], "android-test-v0.2.0-test.13")
        self.assertEqual(plan.values()["VERSION_CODE"], "14")
        self.assertTrue(all("\n" not in value for value in plan.values().values()))

    def test_canonical_plan_only_allows_the_exact_fresh_install_boundary(self):
        data = {**plan_data(), "versionName": "0.2.0-test.39", "versionCode": 39,
                "previousVersionName": "0.2.0-test.38",
                "notesFile": "docs/releases/android-test-0.2.0-test.39-notes.txt"}
        plan = validate_plan(data)
        self.assertEqual(plan.values()["FRESH_PACKAGE"], "true")
        for previous in ("0.2.0-test.37", "0.3.0-test.38"):
            with self.subTest(previous=previous), self.assertRaises(ValueError):
                validate_plan({**data, "previousVersionName": previous})
        future = {**data, "versionName": "0.2.0-test.40", "versionCode": 40,
                  "notesFile": "docs/releases/android-test-0.2.0-test.40-notes.txt"}
        with self.assertRaises(ValueError):
            validate_plan(future)
        self.assertFalse(validate_plan({**future, "previousVersionName": data["versionName"]}).fresh_package)

        fixture = PublicFixture(data=data)
        with self.assertRaises(ValueError):
            verify_once(fixture.plan, fixture.read)
        fixture.marker["packageName"] = PACKAGE
        fixture.content["eimir-test-update.json"] = json.dumps(fixture.marker).encode()
        fixture.sync_assets()
        self.assertEqual(verify_once(fixture.plan, fixture.read)["tag"], plan.tag)

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
            *[f"{API}/assets/{asset['id']}" for asset in fixture.release["assets"]],
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

    def test_origin_follows_the_version_so_published_builds_stay_verifiable(self):
        self.assertEqual(origin_for_version("0.2.0-test.98"), "https://demo.eimir.ur-cloud.de")
        self.assertEqual(origin_for_version("0.2.0-test.99"), "https://app.eimir.de")
        for version, origin in [("0.2.0-test.98", "https://demo.eimir.ur-cloud.de"),
                                ("0.2.0-test.99", "https://app.eimir.de")]:
            data = dict(plan_data(), versionName=version, versionCode=int(version.rsplit(".", 1)[1]),
                        previousVersionName="0.2.0-test." + str(int(version.rsplit(".", 1)[1]) - 1),
                        notesFile=f"docs/releases/android-test-{version}-notes.txt")
            fixture = PublicFixture(data=data)
            fixture.marker["packageName"] = PACKAGE
            fixture.content["eimir-test-update.json"] = json.dumps(fixture.marker).encode()
            fixture.sync_assets()
            with self.subTest(version=version):
                self.assertEqual(verify_once(fixture.plan, fixture.read)["tag"], fixture.plan.tag)
        stale = dict(plan_data(), versionName="0.2.0-test.99", versionCode=99,
                     previousVersionName="0.2.0-test.98",
                     notesFile="docs/releases/android-test-0.2.0-test.99-notes.txt")
        fixture = PublicFixture({"apiOrigin": "https://demo.eimir.ur-cloud.de"}, stale)
        fixture.marker["packageName"] = PACKAGE
        fixture.content["eimir-test-update.json"] = json.dumps(fixture.marker).encode()
        fixture.sync_assets()
        with self.assertRaises(ValueError):
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
