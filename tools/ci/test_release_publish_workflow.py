#!/usr/bin/env python3
"""Fail-closed contract checks for the #519/#827 protected publication workflow."""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/release-publish.yml"
CANDIDATE_WORKFLOW = ROOT / ".github/workflows/release-candidate.yml"
WORKFLOW_DIR = ROOT / ".github/workflows"

EXTERNAL_ACTION_PINS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node": "1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a",
    "actions/setup-java": "dd06d9cba3e5552c54d9f8ea23572deb30010f7c",
    "gradle/actions/setup-gradle": "9c971963bec38e04b3d30dcc455b5382be2fdbfb",
    "actions/upload-artifact": "ea165f8d65b6e75b540449e92b4886f43607fa02",
    "actions/download-artifact": "634f93cb2916e3fdff6788551b99b062d0335ce0",
}


def action_uses(text: str) -> list[str]:
    return [
        match.group(1)
        for match in re.finditer(r"^\s*-?\s*uses:\s*([^\s#]+)", text, re.MULTILINE)
    ]


class ReleasePublishWorkflowContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.candidate_workflow = CANDIDATE_WORKFLOW.read_text(encoding="utf-8")

    def test_no_privileged_pull_request_target_trigger(self) -> None:
        self.assertNotIn("pull_request_target", self.workflow)
        self.assertIn("if: github.event_name == 'workflow_dispatch'", self.workflow)

    def test_privileged_job_is_protected_and_least_privileged(self) -> None:
        self.assertIn("environment:\n      name: production-release", self.workflow)
        self.assertIn(
            "permissions:\n      contents: write\n      packages: write\n      id-token: write\n      attestations: write",
            self.workflow,
        )
        self.assertIn("permissions:\n  contents: read", self.workflow)
        self.assertEqual(self.workflow.count("packages: write"), 1)

    def test_release_publish_is_only_workflow_with_contents_write(self) -> None:
        writers: list[str] = []
        for path in sorted((*WORKFLOW_DIR.glob("*.yml"), *WORKFLOW_DIR.glob("*.yaml"))):
            if "contents: write" in path.read_text(encoding="utf-8"):
                writers.append(path.name)
        self.assertEqual(writers, ["release-publish.yml"])

    def test_protected_publication_is_globally_serialized(self) -> None:
        self.assertIn(
            "group: publish-release-${{ github.event_name == 'workflow_dispatch' && 'protected' || github.ref }}",
            self.workflow,
        )
        self.assertIn("cancel-in-progress: false", self.workflow)

    def test_publish_requires_explicit_confirmation_and_merged_main_source(self) -> None:
        self.assertIn("confirm_publish:", self.workflow)
        self.assertIn('if [ "$CONFIRM_PUBLISH" != "true" ]', self.workflow)
        self.assertIn('git merge-base --is-ancestor "$GITHUB_SHA" origin/main', self.workflow)
        self.assertIn("Require existing repository checks to be green", self.workflow)


    def test_release_channel_selection_is_explicit_in_publish_and_candidate(self) -> None:
        for workflow in (self.workflow, self.candidate_workflow):
            with self.subTest(workflow="publish" if workflow is self.workflow else "candidate"):
                self.assertIn("include_android:", workflow)
                self.assertIn("required: true", workflow)
                self.assertIn("default: true", workflow)
                self.assertIn("include_android: ${{ inputs.include_android }}", workflow)
        self.assertIn(
            "Android-excluded publication must not provide Android URL/version inputs",
            self.workflow,
        )
        self.assertIn(
            "Android-excluded candidate must not provide Android URL/version inputs",
            self.candidate_workflow,
        )
        self.assertIn(
            "Android-excluded evidence must carry only explicit not-applicable metadata",
            self.candidate_workflow,
        )

    def test_reusable_evidence_call_permissions_are_workflow_scoped(self) -> None:
        required_permissions = (
            "contents: read",
            "id-token: write",
            "attestations: write",
        )
        for workflow in (self.workflow, self.candidate_workflow):
            with self.subTest(
                workflow="publish" if workflow is self.workflow else "candidate"
            ):
                workflow_permissions = workflow.split("\njobs:\n", 1)[0]
                for permission in required_permissions:
                    self.assertIn(permission, workflow_permissions)

                before_use = workflow.split(
                    "uses: ./.github/workflows/release-evidence.yml", 1
                )[0]
                evidence_call = before_use.rsplit("\n  evidence:\n", 1)[1]
                self.assertNotIn("\n    permissions:", evidence_call)

    def test_android_publication_steps_are_conditional(self) -> None:
        android_steps = (
            "Set up Node.js 24.21.0",
            "Set up JDK 21",
            "Set up Gradle cache and validate wrapper",
            "Verify pinned Gradle wrapper JAR",
            "Install Android SDK 36",
            "Build and sync Capacitor web bundle",
            "Verify generated native wrapper files have not drifted",
            "Build and verify final signed Android artifacts",
            "Install verified Syft release",
            "Regenerate Android SPDX SBOMs for signed bytes",
            "Rebind evidence index to final signed Android bytes",
            "Remove unsigned Android attestation bundles",
            "Attest final signed Android APK",
            "Attest final signed Android AAB",
        )
        for step_name in android_steps:
            with self.subTest(step=step_name):
                step = self.workflow.split(f"- name: {step_name}", 1)[1].split("- name:", 1)[0]
                self.assertIn("if: inputs.include_android", step)

    def test_android_exclusion_is_recorded_in_final_release_notes(self) -> None:
        notes = self.workflow.split("Write human-readable release notes", 1)[1].split(
            "Write and verify final release checksums", 1
        )[0]
        self.assertIn("INCLUDE_ANDROID:", notes)
        self.assertIn("Android is explicitly not part of this release channel", notes)
        self.assertIn("No APK/AAB", notes)

    def test_release_identity_is_immutable_and_not_overwritten(self) -> None:
        self.assertGreaterEqual(self.workflow.count("git ls-remote --exit-code --tags"), 2)
        self.assertGreaterEqual(self.workflow.count("gh release view"), 5)
        self.assertIn('--target "$GITHUB_SHA"', self.workflow)
        self.assertIn("--draft", self.workflow)
        self.assertIn('gh release edit "$tag" --repo "$GITHUB_REPOSITORY" --draft=false', self.workflow)
        self.assertIn("--json isImmutable", self.workflow)
        self.assertIn('if [ "$immutable" != "true" ]', self.workflow)
        self.assertIn("--cleanup-tag --yes", self.workflow)
        self.assertIn('cleanup_status=$?', self.workflow)
        self.assertIn("manual cleanup is required", self.workflow)
        self.assertIn('gh release verify "$tag" --repo "$GITHUB_REPOSITORY"', self.workflow)
        self.assertIn('git rev-list -n 1 "$tag"', self.workflow)

    def test_complete_draft_asset_set_is_verified_before_publish(self) -> None:
        stage = self.workflow.split("Stage and publish immutable GitHub Release", 1)[1].split(
            "Verify published immutable identity", 1
        )[0]
        verify_marker = "python3 scripts/verify_release_asset_set.py"
        publish_marker = 'gh release edit "$tag" --repo "$GITHUB_REPOSITORY" --draft=false'
        self.assertIn("staged-release-assets.json", stage)
        self.assertIn("--json databaseId,isDraft", stage)
        self.assertIn("releases/${release_id}/assets?per_page=100", stage)
        self.assertIn(verify_marker, stage)
        self.assertLess(stage.index(verify_marker), stage.index(publish_marker))
        self.assertIn("cleanup_draft_on_failure()", stage)
        self.assertIn("draft_active=true", stage)

    def test_complete_immutable_asset_set_is_reverified_after_publish(self) -> None:
        verify = self.workflow.split("Verify published immutable identity", 1)[1].split(
            "Upload final release evidence snapshot", 1
        )[0]
        self.assertIn("published-release-assets.json", verify)
        self.assertIn("releases/${release_id}/assets?per_page=100", verify)
        self.assertIn("python3 scripts/verify_release_asset_set.py", verify)
        self.assertIn("--expected-root release-evidence", verify)
        self.assertIn('gh release verify "$tag" --repo "$GITHUB_REPOSITORY"', verify)

    def test_runtime_images_load_exact_evidence_archives_without_rebuild(self) -> None:
        publish_step = self.workflow.split(
            "Publish exact build-once runtime images to GHCR", 1
        )[1].split("Verify anonymous GHCR consumption", 1)[0]
        self.assertIn("docker load --input", publish_step)
        self.assertIn("release-evidence/backend-runtime.image.tar", publish_step)
        self.assertIn("release-evidence/web-runtime.image.tar", publish_step)
        self.assertIn("eimir-backend:evidence-${SOURCE_REVISION}", publish_step)
        self.assertIn("eimir-web:evidence-${SOURCE_REVISION}", publish_step)
        self.assertIn("ghcr.io/${owner}/eimir-backend", publish_step)
        self.assertIn("ghcr.io/${owner}/eimir-web", publish_step)
        self.assertIn('source_tag="sha-${SOURCE_REVISION}"', publish_step)
        self.assertIn('version_tag="v${RELEASE_VERSION}"', publish_step)
        self.assertIn(
            'transport_tag="publish-${SOURCE_REVISION}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"',
            publish_step,
        )
        self.assertIn("GHCR does not provide server-side immutable tags", publish_step)
        self.assertIn("discoverability only", publish_step)
        self.assertIn("self-hosted-image-identity.json", publish_step)
        self.assertIn("releaseArtifactSha256", publish_step)
        self.assertNotIn("docker build", publish_step)
        self.assertNotIn(":latest", publish_step)

    def test_image_labels_are_verified_against_release_identity_before_push(self) -> None:
        publish_archive = self.workflow.split("publish_archive() {", 1)[1].split(
            "publish_archive \\", 1
        )[0]
        revision_check = (
            'require_image_label "$source_image" org.opencontainers.image.revision "$SOURCE_REVISION"'
        )
        version_check = (
            'require_image_label "$source_image" org.opencontainers.image.version "$RELEASE_VERSION"'
        )
        push = 'push_single_digest "$transport_ref" "$repository"'
        for check in (revision_check, version_check):
            self.assertIn(check, publish_archive)
            self.assertLess(publish_archive.index(check), publish_archive.index(push))
        self.assertLess(
            publish_archive.index("docker load --input"),
            publish_archive.index(revision_check),
        )
        helper = self.workflow.split("require_image_label() {", 1)[1].split("publish_archive() {", 1)[0]
        self.assertIn('if [ "$actual" != "$expected" ]; then', helper)
        self.assertIn("refusing publication", helper)
        self.assertIn("exit 1", helper)

    def test_registry_identity_lookup_fails_closed_on_uncertainty(self) -> None:
        publish_step = self.workflow.split(
            "Publish exact build-once runtime images to GHCR", 1
        )[1].split("Verify anonymous GHCR consumption", 1)[0]
        self.assertIn("manifest_state()", publish_step)
        self.assertIn("manifest unknown|no such manifest", publish_step)
        self.assertIn("Unable to verify registry alias", publish_step)
        self.assertIn('state=$(manifest_state "$alias_ref")', publish_step)
        self.assertNotIn('if docker manifest inspect "$source_ref"', publish_step)
        self.assertNotIn('if docker manifest inspect "$version_ref"', publish_step)

    def test_registry_identity_is_bound_to_actual_push_digest_not_tag_atomicity(self) -> None:
        publish_step = self.workflow.split(
            "Publish exact build-once runtime images to GHCR", 1
        )[1].split("Verify anonymous GHCR consumption", 1)[0]
        self.assertIn("require_single_manifest()", publish_step)
        self.assertIn("pull_single_digest()", publish_step)
        self.assertIn("push_single_digest()", publish_step)
        self.assertIn("ensure_alias_matches()", publish_step)
        self.assertIn('output=$(docker pull "$ref" 2>&1)', publish_step)
        self.assertIn('output=$(docker push "$ref" 2>&1)', publish_step)
        self.assertIn('digest=$(extract_registry_digest "$output")', publish_step)
        self.assertIn('digest_ref="${repository}@${digest}"', publish_step)
        self.assertGreaterEqual(
            publish_step.count('require_single_manifest "$digest_ref"'), 2
        )
        self.assertIn(
            'transport_digest_ref=$(push_single_digest "$transport_ref" "$repository")',
            publish_step,
        )
        self.assertIn(
            'ensure_alias_matches "$source_ref" "$repository" "$transport_digest_ref"',
            publish_step,
        )
        self.assertIn(
            'ensure_alias_matches "$version_ref" "$repository" "$transport_digest_ref"',
            publish_step,
        )
        self.assertIn('docker tag "$expected_digest_ref" "$alias_ref"', publish_step)
        self.assertIn("Alias creation is intentionally not an integrity primitive", publish_step)
        self.assertIn('digest="${transport_digest_ref#*@}"', publish_step)

    def test_resolved_registry_digest_rejects_multi_platform_indexes(self) -> None:
        publish_step = self.workflow.split(
            "Publish exact build-once runtime images to GHCR", 1
        )[1].split("Verify anonymous GHCR consumption", 1)[0]
        self.assertIn("application/vnd.oci.image.index.v1+json", publish_step)
        self.assertIn(
            "application/vnd.docker.distribution.manifest.list.v2+json", publish_step
        )
        self.assertIn("application/vnd.oci.image.manifest.v1+json", publish_step)
        self.assertIn(
            "application/vnd.docker.distribution.manifest.v2+json", publish_step
        )
        self.assertIn('isinstance(manifest.get("manifests"), list)', publish_step)
        self.assertIn("registry digest resolves to a multi-platform index", publish_step)
        self.assertIn("not a supported single-image manifest", publish_step)

    def test_public_self_hosted_images_are_clean_pulled_anonymously(self) -> None:
        step = self.workflow.split("Verify anonymous GHCR consumption", 1)[1].split(
            "Build deterministic Self-Hosted operator bundle", 1
        )[0]
        self.assertIn('printf \'{"auths":{}}\\n\'', step)
        self.assertIn("sudo dockerd", step)
        self.assertIn('--data-root="$anonymous_data"', step)
        self.assertIn('--storage-driver=vfs', step)
        self.assertIn('--bridge=none', step)
        self.assertIn('DOCKER_HOST="unix://${anonymous_socket}"', step)
        self.assertIn('DOCKER_CONFIG="$anonymous_config"', step)
        self.assertIn('docker pull "$ref"', step)
        self.assertIn('docker image inspect "$ref"', step)
        self.assertIn("cannot be anonymously pulled from a clean daemon", step)
        self.assertIn("set package visibility to Public and rerun", step)
        self.assertNotIn("manifest inspect", step)
        self.assertNotIn("docker login", step)

    def test_published_runtime_identity_is_release_asset_and_reverified(self) -> None:
        self.assertIn("self-hosted-image-identity.json", self.workflow)
        self.assertIn("release-evidence/self-hosted-image-identity.json", self.workflow)
        self.assertIn("authoritative digest-qualified", self.workflow)
        self.assertGreaterEqual(
            self.workflow.count("python3 scripts/verify_release_asset_set.py"), 2
        )

    def test_self_hosted_operator_bundle_is_minimal_deterministic_and_reverified(self) -> None:
        bundle_step = self.workflow.split(
            "Build deterministic Self-Hosted operator bundle", 1
        )[1].split("Write human-readable release notes", 1)[0]
        self.assertIn('bundle_name="eimir-self-hosted-v${RELEASE_VERSION}"', bundle_step)
        self.assertIn('cp -- compose.yaml "$bundle_root/compose.yaml"', bundle_step)
        self.assertIn("deploy/self-hosted-release.env.example", bundle_step)
        self.assertIn("scripts/self_hosted_release.py", bundle_step)
        self.assertIn("scripts/check_runtime_environment.py", bundle_step)
        self.assertIn("--sort=name", bundle_step)
        self.assertIn("--mtime='UTC 1970-01-01'", bundle_step)
        self.assertIn("--owner=0 --group=0 --numeric-owner", bundle_step)
        self.assertIn("gzip -n -c", bundle_step)
        self.assertIn("tar -tzf", bundle_step)
        self.assertIn("expected-self-hosted-bundle.txt", bundle_step)
        self.assertNotIn("backend/", bundle_step)
        self.assertNotIn("web/", bundle_step)
        self.assertIn("verify_release_asset_set.py", self.workflow)

    def test_release_workflow_tracks_operator_bundle_inputs(self) -> None:
        for path in (
            '"compose.yaml"',
            '"deploy/self-hosted-release.env.example"',
            '"scripts/self_hosted_release.py"',
            '"scripts/check_runtime_environment.py"',
            '"scripts/verify_release_asset_set.py"',
            '"tools/ci/test_verify_release_asset_set.py"',
            '"docs/SELF-HOSTING.md"',
        ):
            with self.subTest(path=path):
                self.assertIn(path, self.workflow)

    def test_signing_material_is_environment_only_and_ephemeral(self) -> None:
        required = (
            "secrets.EIMIR_RELEASE_KEYSTORE_BASE64 || secrets.SBS_RELEASE_KEYSTORE_BASE64",
            "secrets.EIMIR_RELEASE_KEYSTORE_PASSWORD || secrets.SBS_RELEASE_KEYSTORE_PASSWORD",
            "secrets.EIMIR_RELEASE_KEY_ALIAS || secrets.SBS_RELEASE_KEY_ALIAS",
            "secrets.EIMIR_RELEASE_KEY_PASSWORD || secrets.SBS_RELEASE_KEY_PASSWORD",
        )
        for marker in required:
            with self.subTest(marker=marker):
                self.assertIn(marker, self.workflow)
        self.assertIn('keystore="$RUNNER_TEMP/eimir-upload.jks"', self.workflow)
        self.assertIn("trap 'rm -f \"$keystore\"' EXIT", self.workflow)
        signing_step = self.workflow.split(
            "Build and verify final signed Android artifacts", 1
        )[1].split("Install verified Syft release", 1)[0]
        self.assertNotIn('echo "$KEYSTORE_BASE64"', signing_step)
        self.assertNotIn('cat "$keystore"', signing_step)

    def test_signed_android_is_verified_and_replaces_unsigned_candidate(self) -> None:
        self.assertIn('apksigner" verify "$apk"', self.workflow)
        self.assertIn('jarsigner -verify "$aab"', self.workflow)
        self.assertIn('manifest application-id "$apk"', self.workflow)
        self.assertIn('"de.sidebyside.app"', self.workflow)
        self.assertIn("android/eimir-release.apk", self.workflow)
        self.assertIn("android/eimir-release.aab", self.workflow)
        self.assertIn('android["signing"] = "signed-release"', self.workflow)
        self.assertIn("eimir-release-unsigned.apk", self.workflow)
        self.assertIn("eimir-release-unsigned.aab", self.workflow)

    def test_final_signed_bytes_get_fresh_sbom_and_attestations(self) -> None:
        self.assertIn(
            'syft scan "file:release-evidence/android/eimir-release.apk"', self.workflow
        )
        self.assertIn(
            'syft scan "file:release-evidence/android/eimir-release.aab"', self.workflow
        )
        self.assertIn("bundle-prefix: android-apk-signed", self.workflow)
        self.assertIn("bundle-prefix: android-aab-signed", self.workflow)
        self.assertIn("gh attestation verify", self.workflow)
        self.assertIn("release-publish.yml", self.workflow)

    def test_final_manifest_requires_signed_android_and_preserves_rollback_boundary(self) -> None:
        self.assertGreaterEqual(self.workflow.count("--require-signed-android"), 2)
        self.assertIn("previous-known-good/eimir-release-manifest.json", self.workflow)
        self.assertIn("#190 and #375", self.workflow)
        self.assertIn("sidebyside-release-manifest.json", self.workflow)

    def test_external_actions_are_immutable_sha_pins(self) -> None:
        seen: dict[str, set[str]] = {}
        for use in action_uses(self.workflow):
            if use.startswith("./"):
                continue
            self.assertIn("@", use, use)
            name, ref = use.rsplit("@", 1)
            self.assertRegex(ref, r"^[0-9a-f]{40}$", use)
            seen.setdefault(name, set()).add(ref)

        self.assertEqual(set(seen), set(EXTERNAL_ACTION_PINS))
        for name, expected in EXTERNAL_ACTION_PINS.items():
            self.assertEqual(seen[name], {expected})

    def test_syft_is_version_and_digest_pinned(self) -> None:
        self.assertIn('SYFT_VERSION: "1.42.3"', self.workflow)
        self.assertIn(
            'SYFT_LINUX_AMD64_SHA256: "0d6be741479eddd2c8644a288990c04f3df0d609bbc1599a005532a9dff63509"',
            self.workflow,
        )
        self.assertIn("sha256sum --check --strict", self.workflow)

    def test_jdk_version_and_wrapper_jar_are_pinned(self) -> None:
        self.assertIn('java-version: "21"', self.workflow)
        self.assertIn('node-version: "24.21.0"', self.workflow)
        self.assertIn("7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172", self.workflow)

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

    def test_signed_artifacts_packaging_and_badging_verified(self) -> None:
        self.assertIn("dump badging", self.workflow)
        self.assertIn("build-tools/36.0.0/aapt", self.workflow)
        self.assertIn("package: name='de.sidebyside.app'", self.workflow)
        self.assertIn("launchable-activity: name='de.eimir.app.MainActivity'", self.workflow)
        self.assertIn("public/index.html", self.workflow)
        self.assertIn("capacitor.config.json", self.workflow)
        self.assertIn("CapacitorHttp", self.workflow)
        self.assertIn("server.url", self.workflow)
        self.assertIn("allowNavigation", self.workflow)

    def test_android_api_base_url_input_and_preflight_validation(self) -> None:
        self.assertIn("android_api_base_url:", self.workflow)
        self.assertIn(
            "Android-inclusive publication requires an explicit, non-test android_api_base_url.",
            self.workflow,
        )
        self.assertIn("Android apiBaseUrl does not match publication input", self.workflow)
        self.assertIn("preflight-manifest apiBaseUrl mismatch", self.workflow)
        self.assertIn(
            "Android-excluded publication must not provide Android URL/version inputs",
            self.workflow,
        )

    def test_canonical_android_directory_is_the_only_project(self) -> None:
        # android/ is the Capacitor wrapper (#1009); the former staging path and
        # the retired Kotlin/Compose build must not be referenced anymore.
        self.assertNotIn("capacitor-android", self.workflow)
        self.assertNotIn("working-directory: android", self.workflow)
        self.assertNotIn("android/app/build.gradle.kts", self.workflow)


if __name__ == "__main__":
    unittest.main()
