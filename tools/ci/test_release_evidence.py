#!/usr/bin/env python3
"""Fail-closed contract checks for the #193 release-evidence workflow."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/release-evidence.yml"
ACTION = ROOT / ".github/actions/attest-release-artifact/action.yml"

EXTERNAL_ACTION_PINS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node": "1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a",
    "actions/setup-java": "dd06d9cba3e5552c54d9f8ea23572deb30010f7c",
    "gradle/actions/setup-gradle": "9c971963bec38e04b3d30dcc455b5382be2fdbfb",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
    "actions/download-artifact": "634f93cb2916e3fdff6788551b99b062d0335ce0",
    "actions/attest-build-provenance": "977bb373ede98d70efdf65b84cb5f73e068dcc2a",
    "actions/attest-sbom": "4651f806c01d8637787e274ac3bdf724ef169f34",
}

REQUIRED_SUBJECTS = {
    "release-evidence/backend-runtime.image.tar",
    "release-evidence/web-runtime.image.tar",
    "release-evidence/android/eimir-release-unsigned.apk",
    "release-evidence/android/eimir-release-unsigned.aab",
}

REQUIRED_SBOMS = {
    "release-evidence/sbom/backend-runtime.spdx.json",
    "release-evidence/sbom/web-runtime.spdx.json",
    "release-evidence/sbom/android-apk.spdx.json",
    "release-evidence/sbom/android-aab.spdx.json",
}


def action_uses(text: str) -> list[str]:
    return [match.group(1) for match in re.finditer(r"^\s*-?\s*uses:\s*([^\s#]+)", text, re.MULTILINE)]


class ReleaseEvidenceContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.action = ACTION.read_text(encoding="utf-8")
        cls.all_text = cls.workflow + "\n" + cls.action

    def test_no_privileged_pull_request_trigger(self) -> None:
        self.assertNotIn("pull_request_target", self.workflow)
        self.assertIn("if: github.event_name != 'pull_request'", self.workflow)

    def test_build_job_is_read_only_and_attestation_job_is_least_privileged(self) -> None:
        self.assertIn("permissions:\n  contents: read", self.workflow)
        self.assertIn(
            "permissions:\n      contents: read\n      id-token: write\n      attestations: write",
            self.workflow,
        )
        self.assertNotIn("contents: write", self.workflow)
        self.assertNotIn("packages: write", self.workflow)

    def test_workflow_does_not_consume_signing_or_repository_secrets(self) -> None:
        forbidden = (
            "${{ secrets.",
            "EIMIR_RELEASE_KEYSTORE",
            "EIMIR_RELEASE_KEYSTORE_PASSWORD",
            "EIMIR_RELEASE_KEY_ALIAS",
            "EIMIR_RELEASE_KEY_PASSWORD",
        )
        for marker in forbidden:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, self.workflow)

    def test_all_external_actions_are_immutable_sha_pins(self) -> None:
        seen: dict[str, set[str]] = {}
        for use in action_uses(self.all_text):
            if use.startswith("./"):
                continue
            self.assertIn("@", use, use)
            name, ref = use.rsplit("@", 1)
            self.assertRegex(ref, r"^[0-9a-f]{40}$", use)
            seen.setdefault(name, set()).add(ref)

        self.assertEqual(set(seen), set(EXTERNAL_ACTION_PINS))
        for name, expected in EXTERNAL_ACTION_PINS.items():
            self.assertEqual(seen[name], {expected})

    def test_syft_binary_is_version_and_digest_pinned(self) -> None:
        self.assertIn('SYFT_VERSION: "1.42.3"', self.workflow)
        self.assertIn(
            'SYFT_LINUX_AMD64_SHA256: "0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509"',
            self.workflow,
        )
        self.assertIn("sha256sum --check --strict", self.workflow)
        self.assertNotIn("anchore/sbom-action@", self.workflow)

    def test_exact_release_subject_set_is_indexed_and_attested(self) -> None:
        for path in REQUIRED_SUBJECTS:
            with self.subTest(path=path):
                self.assertIn(path, self.workflow)
        self.assertIn('["api", "worker", "migrate"]', self.workflow)
        self.assertIn("docker image save", self.workflow)
        self.assertIn("docker-archive:", self.workflow)

    def test_release_evidence_declares_android_channel_explicitly(self) -> None:
        self.assertIn("include_android:", self.workflow)
        self.assertIn("INCLUDE_ANDROID:", self.workflow)
        self.assertIn('"included": True', self.workflow)
        self.assertIn('"included": False', self.workflow)
        self.assertIn('"signing": "not-applicable"', self.workflow)
        self.assertIn(
            "Android-excluded evidence must not provide Android URL/version inputs",
            self.workflow,
        )

    def test_android_build_and_attestation_are_conditional(self) -> None:
        android_steps = (
            "Set up Node.js 24.21.0",
            "Set up JDK 21",
            "Set up Gradle cache and validate wrapper",
            "Verify pinned Gradle wrapper JAR",
            "Install Android SDK 36",
            "Build and sync Capacitor web bundle",
            "Build unsigned Android release artifacts",
            "Verify APK and AAB packaging and runtime configuration",
            "Verify APK badging",
        )
        for step_name in android_steps:
            with self.subTest(step=step_name):
                step = self.workflow.split(f"- name: {step_name}", 1)[1].split("- name:", 1)[0]
                self.assertIn("if: env.INCLUDE_ANDROID == 'true'", step)
        for step_name in ("Attest Android APK", "Attest Android AAB"):
            with self.subTest(step=step_name):
                step = self.workflow.split(f"- name: {step_name}", 1)[1].split("- name:", 1)[0]
                self.assertIn("if: inputs.include_android || github.event_name == 'pull_request'", step)

    def test_core_evidence_remains_unconditional(self) -> None:
        for step_name in ("Build backend runtime image archive", "Build Web runtime image archive"):
            step = self.workflow.split(f"- name: {step_name}", 1)[1].split("- name:", 1)[0]
            self.assertNotIn("INCLUDE_ANDROID", step)
        self.assertIn(
            'verify_subject release-evidence/backend-runtime.image.tar backend-runtime',
            self.workflow,
        )
        self.assertIn(
            'verify_subject release-evidence/web-runtime.image.tar web-runtime',
            self.workflow,
        )

    def test_runtime_images_carry_oci_identity_labels(self) -> None:
        """Each runtime image names its own source revision and release version (#827).

        The labels are baked into the build-once image, so they are covered by the
        attested archive digest and can be verified again before publication.
        """
        for step_name in (
            "Build backend runtime image archive",
            "Build Web runtime image archive",
        ):
            with self.subTest(step=step_name):
                step = self.workflow.split(f"- name: {step_name}", 1)[1].split("- name:", 1)[0]
                self.assertIn(
                    '--label "org.opencontainers.image.revision=$GITHUB_SHA"', step
                )
                self.assertIn(
                    '--label "org.opencontainers.image.version=$RELEASE_VERSION"', step
                )
                self.assertIn(
                    '--label "org.opencontainers.image.source=$GITHUB_SERVER_URL/$GITHUB_REPOSITORY"',
                    step,
                )
                self.assertIn("docker image save", step)

    def test_each_subject_has_spdx_23_json_evidence(self) -> None:
        for path in REQUIRED_SBOMS:
            with self.subTest(path=path):
                self.assertIn(path, self.workflow)
        self.assertIn('"SPDX-2.3"', self.workflow)
        self.assertIn("actions/attest-sbom@", self.action)
        self.assertIn('https://spdx.dev/Document/v2.3', self.workflow)

    def test_offline_verification_material_is_retained_and_exercised(self) -> None:
        self.assertIn("gh attestation trusted-root", self.workflow)
        self.assertIn("--bundle", self.workflow)
        self.assertIn("--custom-trusted-root", self.workflow)
        self.assertIn("--signer-workflow", self.workflow)
        self.assertIn("release-attestations-${{ github.sha }}", self.workflow)

    def test_evidence_transport_is_checksum_verified(self) -> None:
        self.assertIn("SHA256SUMS", self.workflow)
        self.assertGreaterEqual(self.workflow.count("sha256sum --check --strict"), 3)

    def test_jdk_version_and_wrapper_jar_are_pinned(self) -> None:
        self.assertIn('java-version: "21"', self.workflow)
        self.assertIn("7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172", self.workflow)
        self.assertIn('node-version: "24.21.0"', self.workflow)

    def test_capacitor_wrapper_and_web_bundle_integration(self) -> None:
        self.assertIn('ANDROID_PROJECT_DIR: "android"', self.workflow)
        self.assertIn("working-directory: ${{ env.ANDROID_PROJECT_DIR }}", self.workflow)
        self.assertIn('"platforms;android-36"', self.workflow)
        self.assertIn("npm ci --ignore-scripts --no-audit --no-fund", self.workflow)
        self.assertIn("npm run cap:sync", self.workflow)
        self.assertIn('VITE_EIMIR_API_BASE_URL="$ANDROID_API_BASE_URL" npm run cap:build:web', self.workflow)
        self.assertIn("git diff --exit-code --", self.workflow)
        self.assertIn("android/capacitor.settings.gradle", self.workflow)
        self.assertIn("android/app/capacitor.build.gradle", self.workflow)

    def test_apk_and_aab_packaging_and_badging_verified(self) -> None:
        self.assertIn("dump badging", self.workflow)
        self.assertIn("build-tools/36.0.0/aapt", self.workflow)
        self.assertIn("package: name='de.sidebyside.app'", self.workflow)
        self.assertIn("launchable-activity: name='de.eimir.app.MainActivity'", self.workflow)
        self.assertIn("public/index.html", self.workflow)
        self.assertIn("capacitor.config.json", self.workflow)
        self.assertIn("CapacitorHttp", self.workflow)
        self.assertIn("server.url", self.workflow)
        self.assertIn("allowNavigation", self.workflow)

    def test_canonical_android_directory_is_the_only_project(self) -> None:
        # android/ is the Capacitor wrapper (#1009); the former staging path and
        # the retired Kotlin/Compose build must not be referenced anymore.
        self.assertNotIn("capacitor-android", self.workflow)
        self.assertNotIn("working-directory: android", self.workflow)
        self.assertNotIn("android/app/build.gradle.kts", self.workflow)


if __name__ == "__main__":
    unittest.main()
