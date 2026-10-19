#!/usr/bin/env python3
"""Build and verify the opt-in Android test channel without a release workflow.

The persistent test API is provisioned separately. Never publish the final
update marker until its verified APK is uploaded successfully.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEST_ORIGIN = "https://demo.eimir.ur-cloud.de"
PACKAGE_NAME = "de.sidebyside.app"
MARKER = "eimir-test-update.json"
BUILD_IDENTITY = "eimir-test-build.json"
VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+-test\.[1-9][0-9]*\Z")
MAX_APK_BYTES = 256 * 1024 * 1024


def run(*args: str, cwd: Path = ROOT, env: dict[str, str] | None = None) -> str:
    return subprocess.check_output(args, cwd=cwd, env=env, text=True)


def test_environment(inherited: dict[str, str]) -> dict[str, str]:
    """The demo. hostname must not change real registration into demo entry."""
    env = inherited.copy()
    env.update(
        VITE_EIMIR_API_BASE_URL=TEST_ORIGIN,
        VITE_EIMIR_DEMO_MODE="false",
        VITE_EIMIR_DEMO_RESET_TIMER="false",
        VITE_EIMIR_DEMO_URL="",
        VITE_EIMIR_TEST_UPDATES="true",
        # Explicit canonical values also shadow these historical aliases.
        VITE_SBS_DEMO_MODE="false",
        VITE_SBS_DEMO_RESET_TIMER="false",
        VITE_SBS_DEMO_URL="",
    )
    return env


def validate_identity(value: dict) -> None:
    if (
        value.get("channel") != "android-test"
        or value.get("apiOrigin") != TEST_ORIGIN
        or value.get("demoMode") is not False
        or value.get("demoResetTimer") is not False
        or value.get("testUpdates") is not True
        or value.get("dirty") is not False
        or value.get("validationOnly") is not False
        or not re.fullmatch(r"[0-9a-f]{40}", str(value.get("sourceRevision", "")))
        or not VERSION.fullmatch(str(value.get("versionName", "")))
        or type(value.get("versionCode")) is not int
        or not 0 < value["versionCode"] <= 2_100_000_000
    ):
        raise ValueError("Invalid, dirty or non-test APK build identity")


def parse_badging(value: str) -> dict:
    package = re.search(
        r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'",
        value,
        re.MULTILINE,
    )
    sdk = re.search(r"^sdkVersion:'([0-9]+)'", value, re.MULTILINE)
    if not package or not sdk or "application-debuggable" in value:
        raise ValueError("Missing release APK identity or debuggable APK")
    return {
        "packageName": package[1],
        "versionCode": int(package[2]),
        "versionName": package[3],
        "minSdk": int(sdk[1]),
    }


def validate_upgrade(current: dict, previous: dict) -> None:
    if (
        previous["packageName"] != PACKAGE_NAME
        or current["versionCode"] <= previous["versionCode"]
    ):
        raise ValueError(
            "A test update must preserve the package and increase versionCode"
        )


def sdk_tool(name: str) -> str:
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk:
        raise ValueError("ANDROID_HOME or ANDROID_SDK_ROOT is required")
    directories = list((Path(sdk) / "build-tools").glob("*"))
    directories.sort(
        key=lambda p: tuple(int(part) for part in re.findall(r"\d+", p.name)),
        reverse=True,
    )
    for directory in directories:
        candidate = directory / name
        if candidate.is_file():
            return str(candidate)
    raise ValueError(f"Android SDK tool is missing: {name}")


def build(args: argparse.Namespace) -> None:
    if (
        not VERSION.fullmatch(args.version_name)
        or not 0 < args.version_code <= 2_100_000_000
    ):
        raise ValueError("Use a positive versionCode and X.Y.Z-test.N versionName")
    dirty = bool(run("git", "status", "--porcelain").strip())
    if dirty and not args.unsigned:
        raise ValueError("Signed test builds require a clean, committed checkout")
    env = test_environment(dict(os.environ))
    if not args.unsigned and not env.get("EIMIR_RELEASE_KEYSTORE"):
        raise ValueError(
            "Supply the durable eimir. signing environment; never use an ephemeral/debug key"
        )
    revision = run("git", "rev-parse", "HEAD").strip()
    subprocess.run(
        ["npm", "run", "cap:build:web"], cwd=ROOT / "web", env=env, check=True
    )
    identity = {
        "channel": "android-test",
        "sourceRevision": revision,
        "dirty": dirty,
        "validationOnly": args.unsigned,
        "versionName": args.version_name,
        "versionCode": args.version_code,
        "apiOrigin": TEST_ORIGIN,
        "demoMode": False,
        "demoResetTimer": False,
        "testUpdates": True,
    }
    (ROOT / "web/dist" / BUILD_IDENTITY).write_text(
        json.dumps(identity, indent=2) + "\n"
    )
    subprocess.run(["npm", "run", "cap:sync"], cwd=ROOT / "web", env=env, check=True)
    subprocess.run(
        [
            str(ROOT / "android/gradlew"),
            "--dependency-verification",
            "strict",
            f"-PeimirVersionCode={args.version_code}",
            f"-PeimirVersionName={args.version_name}",
            f"-PeimirSourceRevision={revision}",
            ":app:clean",
            ":app:assembleSideload",
            f"-PeimirUnsignedTestBuild={'true' if args.unsigned else 'false'}",
        ],
        cwd=ROOT / "android",
        env=env,
        check=True,
    )
    artifact = (
        ROOT
        / "android/app/build/outputs/apk/sideload"
        / ("app-sideload-unsigned.apk" if args.unsigned else "app-sideload.apk")
    )
    if not artifact.is_file():
        raise ValueError("Expected universal sideload APK is missing")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    destination = args.output_dir / (
        f"eimir-android-test-v{args.version_name}"
        + ("-unsigned" if args.unsigned else "")
        + ".apk"
    )
    if destination.exists():
        raise ValueError("Refusing to overwrite an existing test artifact")
    shutil.copyfile(artifact, destination)
    print(destination)


def package(args: argparse.Namespace) -> None:
    apk = args.apk.resolve()
    if not 0 < apk.stat().st_size <= MAX_APK_BYTES:
        raise ValueError("APK size is out of bounds")
    verification = run(
        sdk_tool("apksigner"), "verify", "--verbose", "--print-certs", str(apk)
    )
    certificates = re.findall(
        r"^Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$",
        verification,
        re.MULTILINE,
    )
    expected = args.certificate_sha256.lower()
    if not re.fullmatch("[0-9a-f]{64}", expected) or certificates != [expected]:
        raise ValueError(
            "Verified APK signer differs from the expected eimir. signing identity"
        )
    with zipfile.ZipFile(apk) as archive:
        if archive.getinfo("assets/public/" + BUILD_IDENTITY).file_size > 8192:
            raise ValueError("APK build identity is too large")
        identity = json.loads(archive.read("assets/public/" + BUILD_IDENTITY))
        validate_identity(identity)
        if not any(
            name.startswith("classes")
            and name.endswith(".dex")
            and b"de/eimir/app/updates/AppUpdatesPlugin" in archive.read(name)
            for name in archive.namelist()
        ):
            raise ValueError("The APK does not contain the sideload adapter")
    badging = parse_badging(run(sdk_tool("aapt"), "dump", "badging", str(apk)))
    if args.previous_apk:
        previous = parse_badging(
            run(sdk_tool("aapt"), "dump", "badging", str(args.previous_apk))
        )
        validate_upgrade(badging, previous)
        previous_verification = run(
            sdk_tool("apksigner"),
            "verify",
            "--verbose",
            "--print-certs",
            str(args.previous_apk),
        )
        previous_certificates = re.findall(
            r"^Signer #[0-9]+ certificate SHA-256 digest: ([0-9a-fA-F]{64})$",
            previous_verification,
            re.MULTILINE,
        )
        if previous_certificates != [expected]:
            raise ValueError("The previous APK does not share this signing identity")
    if (
        badging["packageName"] != PACKAGE_NAME
        or badging["minSdk"] != 26
        or any(badging[key] != identity[key] for key in ["versionCode", "versionName"])
    ):
        raise ValueError("Actual APK identity differs from the test build")
    permissions = run(sdk_tool("aapt"), "dump", "permissions", str(apk))
    if "android.permission.REQUEST_INSTALL_PACKAGES" not in permissions:
        raise ValueError("The test APK is missing its explicit install capability")
    notes = args.notes_file.read_text(encoding="utf-8").strip()
    if not notes or len(notes) > 12_000:
        raise ValueError("Release notes must contain 1 to 12000 characters")
    tag = "android-test-v" + identity["versionName"]
    name = "eimir-" + tag + ".apk"
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "channel": "android-test",
        "packageName": PACKAGE_NAME,
        "versionName": identity["versionName"],
        "versionCode": identity["versionCode"],
        "minSdk": 26,
        "sourceRevision": identity["sourceRevision"],
        "releaseNotes": notes,
        "asset": {
            "name": name,
            "size": apk.stat().st_size,
            "sha256": digest,
            "url": f"https://github.com/baerenmarke90/eimir/releases/download/{tag}/{name}",
        },
    }
    content = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    if len(content) > 32_768:
        raise ValueError("Encoded update manifest is too large")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if (args.output_dir / MARKER).exists():
        raise ValueError("Refusing to replace an existing release marker")
    destination = args.output_dir / name
    if destination.resolve() != apk:
        if destination.exists():
            raise ValueError("Refusing to overwrite an existing release APK")
        shutil.copyfile(apk, destination)
    (args.output_dir / "SHA256SUMS").write_text(f"{digest}  {name}\n")
    # Attach this marker last to a draft; immutable publication locks all assets.
    marker = args.output_dir / (MARKER + ".tmp")
    marker.write_bytes(content)
    marker.replace(args.output_dir / MARKER)
    print(
        f"Verified {tag}; upload its APK first and {MARKER} last to a draft, "
        "then publish the complete draft. No release was published."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    builder = commands.add_parser("build")
    builder.add_argument("--version-name", required=True)
    builder.add_argument("--version-code", type=int, required=True)
    builder.add_argument("--output-dir", type=Path, required=True)
    builder.add_argument(
        "--unsigned",
        action="store_true",
        help="Local build checks only; not publishable",
    )
    builder.set_defaults(action=build)
    packager = commands.add_parser("package")
    packager.add_argument("--apk", type=Path, required=True)
    packager.add_argument("--certificate-sha256", required=True)
    packager.add_argument("--notes-file", type=Path, required=True)
    packager.add_argument("--output-dir", type=Path, required=True)
    continuity = packager.add_mutually_exclusive_group(required=True)
    continuity.add_argument(
        "--initial-release",
        action="store_true",
        help="Explicitly establish the first test-channel identity",
    )
    continuity.add_argument(
        "--previous-apk",
        type=Path,
        help="Verify increasing versionCode and signing continuity",
    )
    packager.set_defaults(action=package)
    args = parser.parse_args()
    try:
        args.action(args)
    except (
        ValueError,
        OSError,
        subprocess.CalledProcessError,
        zipfile.BadZipFile,
        KeyError,
    ) as error:
        parser.exit(1, f"Android test release failed: {error}\n")


if __name__ == "__main__":
    main()
