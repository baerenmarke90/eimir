#!/usr/bin/env python3
"""Validate reusable Android test plans and verify immutable anonymous assets."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path

REPOSITORY = "baerenmarke90/eimir"
API = f"https://api.github.com/repos/{REPOSITORY}/releases"
DOWNLOAD = f"https://github.com/{REPOSITORY}/releases/download"
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+-test\.([1-9][0-9]*)\Z")
PACKAGE = "de.eimir.app"
LEGACY_PACKAGE = "de.sidebyside.app"
CERTIFICATE = "1d403a18b4d3694f8e5fd9853906a60c012644d23e5a3a1ef40819b119cb1da9"
LEGACY_CERTIFICATE = "b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472"
FIREBASE_PROJECT = "eimir-production"
ORIGIN = "https://demo.eimir.ur-cloud.de"
MAX_APK_BYTES = 256 * 1024 * 1024
FIELDS = {"schemaVersion", "sourceRevision", "versionName", "versionCode", "previousVersionName", "notesFile"}


def package_for_version(version: str) -> str:
    """Keep immutable pre-migration plans verifiable without permitting new legacy APKs."""
    match = VERSION.fullmatch(version)
    if not match:
        raise ValueError("Invalid test-channel version")
    return LEGACY_PACKAGE if int(match[1]) <= 38 else PACKAGE


class PublicationPending(Exception):
    """A successful publication has not propagated to a public read yet."""


@dataclass(frozen=True)
class Plan:
    source: str
    version: str
    code: int
    previous: str
    notes: str

    @property
    def fresh_package(self) -> bool:
        return package_for_version(self.version) != package_for_version(self.previous)

    @property
    def tag(self) -> str:
        return "android-test-v" + self.version

    @property
    def apk(self) -> str:
        return "eimir-" + self.tag + ".apk"

    def values(self) -> dict[str, str]:
        return {
            "SOURCE": self.source,
            "VERSION_NAME": self.version,
            "VERSION_CODE": str(self.code),
            "PREVIOUS_VERSION_NAME": self.previous,
            "PREVIOUS_TAG": "android-test-v" + self.previous,
            "PREVIOUS_APK": "eimir-android-test-v" + self.previous + ".apk",
            "NOTES_FILE": self.notes,
            "TAG": self.tag,
            "APK": self.apk,
            "FRESH_PACKAGE": "true" if self.fresh_package else "false",
        }


def validate_plan(value: object) -> Plan:
    if not isinstance(value, dict) or set(value) != FIELDS:
        raise ValueError("Release plan fields do not match schema 1")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1:
        raise ValueError("Unsupported release plan schema")
    source, version, previous, notes = (
        value["sourceRevision"], value["versionName"],
        value["previousVersionName"], value["notesFile"],
    )
    if not all(isinstance(item, str) and len(item) <= 200 for item in (source, version, previous, notes)):
        raise ValueError("Release plan strings are invalid")
    current_match, previous_match = VERSION.fullmatch(version), VERSION.fullmatch(previous)
    code = value["versionCode"]
    if (
        not re.fullmatch(r"[0-9a-f]{40}", source)
        or not current_match or not previous_match
        or type(code) is not int or not 0 < code <= 2_100_000_000
        or int(current_match[1]) != code or int(previous_match[1]) >= code
        or notes != f"docs/releases/android-test-{version}-notes.txt"
        or (package_for_version(version) != package_for_version(previous)
            and (version != "0.2.0-test.39" or previous != "0.2.0-test.38"))
    ):
        raise ValueError("Release plan identity, version order or notes path is invalid")
    return Plan(source, version, code, previous, notes)


def read_plan(path: Path) -> Plan:
    if not 0 < path.stat().st_size <= 8192:
        raise ValueError("Release plan exceeds its size bound")
    return validate_plan(json.loads(path.read_text(encoding="utf-8")))


def fetch(url: str, limit: int) -> bytes:
    parsed = urllib.parse.urlsplit(url)
    asset_variant = url.startswith(DOWNLOAD + "/") and not parsed.query and not parsed.fragment
    request_url = url
    for attempt in range(2):
        request = urllib.request.Request(request_url, headers={"User-Agent": "eimir-android-test-publication-verifier"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                content = response.read(limit + 1)
            break
        except urllib.error.HTTPError as error:
            if attempt or not asset_variant or error.code not in {502, 503, 504}:
                raise
            error.close()
            # GitHub may serve a stale gateway error for the canonical download
            # route while its download variant serves the same immutable asset.
            request_url = url + "?download=1"
    if len(content) > limit:
        raise ValueError("Public response exceeds its size bound")
    return content


def verify_once(plan: Plan, reader=fetch, expected_root: Path | None = None) -> dict:
    catalog = json.loads(reader(API + "?per_page=30", 2 * 1024 * 1024))
    if not isinstance(catalog, list) or len(catalog) > 30:
        raise ValueError("Invalid bounded public catalog")
    releases = [item for item in catalog if item.get("tag_name") == plan.tag]
    if not releases:
        raise PublicationPending("Release is not yet in the anonymous 30-release catalog")
    if len(releases) != 1:
        raise ValueError("Duplicate release identity")
    release = releases[0]
    if (
        release.get("draft") is not False or release.get("prerelease") is not True
        or release.get("immutable") is not True or release.get("target_commitish") != plan.source
    ):
        raise ValueError("Public immutable release identity does not match the plan")
    names = {plan.apk, "SHA256SUMS", "native-acceptance.md", "eimir-test-update.json"}
    assets = release.get("assets", [])
    if len(assets) != 4 or {item.get("name") for item in assets} != names:
        raise ValueError("Public release does not contain exactly the four required assets")
    downloaded = {}
    for asset in assets:
        name = asset["name"]
        url = f"{DOWNLOAD}/{plan.tag}/{name}"
        if asset.get("browser_download_url") != url:
            raise ValueError("Public asset URL does not match its exact release")
        limit = MAX_APK_BYTES if name == plan.apk else 32768
        if type(asset.get("size")) is not int or not 0 < asset["size"] <= limit:
            raise ValueError("Public asset size is invalid")
        content = reader(url, limit)
        digest = hashlib.sha256(content).hexdigest()
        if len(content) != asset["size"] or asset.get("digest") != "sha256:" + digest:
            raise ValueError("Public asset bytes do not match immutable GitHub metadata")
        if expected_root is not None and content != (expected_root / name).read_bytes():
            raise ValueError("Public asset bytes differ from the verified local release")
        downloaded[name] = content
    apk = downloaded[plan.apk]
    digest = hashlib.sha256(apk).hexdigest()
    marker = json.loads(downloaded["eimir-test-update.json"])
    if (
        type(marker.get("schemaVersion")) is not int or marker["schemaVersion"] != 1
        or marker.get("channel") != "android-test"
        or marker.get("packageName") != package_for_version(plan.version)
        or marker.get("sourceRevision") != plan.source
        or marker.get("versionName") != plan.version or type(marker.get("versionCode")) is not int
        or marker["versionCode"] != plan.code or marker.get("minSdk") != 26
        or marker.get("asset") != {
            "name": plan.apk, "size": len(apk), "sha256": digest,
            "url": f"{DOWNLOAD}/{plan.tag}/{plan.apk}",
        }
        or downloaded["SHA256SUMS"].decode().split() != [digest, plan.apk]
    ):
        raise ValueError("Public marker/checksum is not bound to the planned APK")
    with zipfile.ZipFile(io.BytesIO(apk)) as archive:
        identity_path = "assets/public/eimir-test-build.json"
        if archive.getinfo(identity_path).file_size > 8192:
            raise ValueError("Embedded build identity is too large")
        identity = json.loads(archive.read(identity_path))
    expected = {
        "channel": "android-test", "sourceRevision": plan.source,
        "versionName": plan.version, "versionCode": plan.code, "dirty": False,
        "validationOnly": False, "apiOrigin": ORIGIN, "demoMode": False,
        "demoResetTimer": False, "testUpdates": True,
    }
    if package_for_version(plan.version) == PACKAGE:
        expected["firebaseProjectId"] = FIREBASE_PROJECT
    if type(identity.get("versionCode")) is not int or any(
        identity.get(key) != value or (isinstance(value, bool) and identity.get(key) is not value)
        for key, value in expected.items()
    ):
        raise ValueError("Public APK embedded identity differs from the planned release")
    return {"tag": plan.tag, "sourceRevision": plan.source, "sha256": digest, "bytes": len(apk)}


def verify_public(plan: Plan, reader=fetch, expected_root: Path | None = None,
                  timeout: float = 90, clock=time.monotonic, pause=time.sleep) -> dict:
    deadline = clock() + timeout
    while True:
        try:
            return verify_once(plan, reader, expected_root)
        except urllib.error.HTTPError as error:
            if error.code not in {404, 429, 500, 502, 503, 504}:
                raise
            pending = error
        except PublicationPending as error:
            pending = error
        remaining = deadline - clock()
        if remaining <= 0:
            raise ValueError("Public publication did not propagate within the verification deadline") from pending
        pause(min(5, remaining))


def admit(plan: Plan, reader=fetch) -> bool:
    """Return whether new signing is needed; never rewrite a published release."""
    try:
        reader(API + "/tags/" + plan.tag, 256 * 1024)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return True
        raise
    verify_public(plan, reader)
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["admit", "verify"])
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--github-output", type=Path)
    parser.add_argument("--github-env", type=Path)
    parser.add_argument("--expected-root", type=Path)
    args = parser.parse_args()
    plan = read_plan(args.plan)
    if args.command == "verify":
        print(json.dumps(verify_public(plan, expected_root=args.expected_root), sort_keys=True))
        return
    ready = admit(plan)
    if args.github_output:
        with args.github_output.open("a") as output:
            output.write(f"ready={'true' if ready else 'false'}\n")
            for key, value in plan.values().items():
                output.write(f"{key.lower()}={value}\n")
    if args.github_env:
        with args.github_env.open("a") as output:
            for key, value in plan.values().items():
                output.write(f"{key}={value}\n")
    print(f"{plan.tag}: {'new signing required' if ready else 'already published; anonymous bytes verified; no signing or rewrite'}")


if __name__ == "__main__":
    main()
