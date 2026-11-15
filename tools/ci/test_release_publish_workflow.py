#!/usr/bin/env python3
"""Fail-closed contract checks for the #519/#827 protected publication workflow."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/release-publish.yml"
CANDIDATE_WORKFLOW = ROOT / ".github/workflows/release-candidate.yml"
WORKFLOW_DIR = ROOT / ".github/workflows"

EXTERNAL_ACTION_PINS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node": "949feb2413d6458794dcd2491c4babbbce0c15c1",
    "actions/setup-java": "de7274f081f381c8f8158605e0321c36c376e2e6",
    "gradle/actions/setup-gradle": "9c971963bec38e04b3d30dcc455b5382be2fdbfb",
    "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
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
        self.assertEqual(self.workflow.count("packages: write"), 2)

    def test_private_test_publication_cannot_select_the_product_release_jobs(
        self,
    ) -> None:
        # The sole writer workflow now has a second, narrowly scoped publisher.
        # Keep every product-release job dispatch-only and exclude private mode.
        for name in ("evidence", "preflight", "publish"):
            block = self.workflow.split(f"\n  {name}:\n", 1)[1]
            block = re.split(r"\n  [a-z][a-z0-9-]*:\n", block, maxsplit=1)[0]
            self.assertIn(
                "if: github.event_name == 'workflow_dispatch' && !inputs.private_test_channel",
                block,
            )
        self.assertIn("private_test_channel:\n", self.workflow)
        gate = self.workflow.split("\n  test-checked-main:\n", 1)[1].split(
            "\n  test-evidence:\n", 1
        )[0]
        self.assertIn("github.repository == 'baerenmarke90/eimir'", gate)
        self.assertIn("github.event_name != 'pull_request'", gate)
        self.assertIn("github.ref == 'refs/heads/main'", gate)
        self.assertIn("vars.EIMIR_TEST_CHANNEL_ENABLED == 'true'", gate)
        publisher = self.workflow.split("\n  test-publish:\n", 1)[1]
        self.assertIn("needs: test-evidence", publisher)
        self.assertIn("queue: max", publisher)
        self.assertNotIn("if: always()\n    runs-on:", publisher)
        self.assertIn("scripts/test_deployment_channel.py publish", publisher)
        self.assertNotIn("gh release", publisher)
        self.assertNotIn("git tag", publisher)
        jobs = re.findall(
            r"(?ms)^  ([a-z][a-z0-9-]*):\n(.*?)(?=^  [a-z][a-z0-9-]*:\n|\Z)",
            self.workflow.split("\njobs:\n", 1)[1],
        )
        self.assertEqual(
            [name for name, block in jobs if "packages: write" in block],
            ["publish", "test-publish"],
        )

    def test_release_publish_is_only_workflow_with_contents_write(self) -> None:
        writers: list[str] = []
        for path in sorted((*WORKFLOW_DIR.glob("*.yml"), *WORKFLOW_DIR.glob("*.yaml"))):
            if "contents: write" in path.read_text(encoding="utf-8"):
                writers.append(path.name)
        self.assertEqual(writers, ["release-publish.yml"])

    def test_private_channel_checks_completions_without_a_waiting_runner(self) -> None:
        triggers = self.workflow.split("\non:\n", 1)[1].split("\npermissions:\n", 1)[0]
        self.assertNotIn("\n  push:", triggers)
        completion = triggers.split("  workflow_run:\n", 1)[1].split("\n  pull_request:", 1)[0]
        self.assertIn("types: [completed]", completion)
        self.assertIn("branches: [main]", completion)
        sys.path.insert(0, str(ROOT / "scripts"))
        import test_deployment_channel as channel

        expected_names = {
            (ROOT / path).read_text().splitlines()[0].removeprefix("name: ")
            for path in channel.REQUIRED_WORKFLOWS
        }
        self.assertEqual(set(re.findall(r"^      - (.+)$", completion, re.MULTILINE)), expected_names)
        gate = self.workflow.split("\n  test-checked-main:\n", 1)[1].split("\n  test-evidence:\n", 1)[0]
        self.assertIn("timeout-minutes: 5", gate)
        self.assertIn("scripts/test_deployment_channel.py check", gate)
        self.assertNotIn("scripts/test_deployment_channel.py wait", gate)
        self.assertIn("github.event.workflow_run.event == 'push'", gate)
        self.assertIn("github.event.workflow_run.head_repository.full_name == github.repository", gate)
        self.assertIn("persist-credentials: false", gate)
        self.assertNotIn("contents: write", gate)
        self.assertNotIn("packages: write", gate)
        evidence = self.workflow.split("\n  test-evidence:\n", 1)[1].split("\n  test-publish:\n", 1)[0]
        self.assertIn("needs: [test-checked-main, test-channel-contract]", evidence)
        self.assertIn("needs.test-checked-main.outputs.ready == 'true'", evidence)

    def test_protected_publication_is_globally_serialized(self) -> None:
        self.assertIn(
            "group: publish-release-${{ github.event_name == 'workflow_dispatch' && 'protected' || "
            "github.event.workflow_run.head_sha && format('{0}-{1}-{2}', "
            "github.event.workflow_run.head_repository.full_name, github.event.workflow_run.event, "
            "github.event.workflow_run.head_sha) || github.ref }}",
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

    def test_reusable_evidence_call_never_passes_an_empty_number_input(self) -> None:
        """A number-typed workflow_call input rejects an empty value at call setup.

        An Android-excluded dispatch leaves ``android_version_code`` empty, so the
        call must fall back to a number instead of forwarding the bare input.
        """

        for workflow in (self.workflow, self.candidate_workflow):
            with self.subTest(
                workflow="publish" if workflow is self.workflow else "candidate"
            ):
                evidence_call = workflow.split("\n  evidence:\n", 1)[1].split(
                    "\n\n", 1
                )[0]
                self.assertIn(
                    "android_version_code: ${{ inputs.include_android "
                    "&& inputs.android_version_code || 0 }}",
                    evidence_call,
                )
                self.assertNotIn(
                    "android_version_code: ${{ inputs.android_version_code }}",
                    workflow,
                )

    def test_release_notes_heredocs_render_their_backticked_values(self) -> None:
        """An unquoted heredoc executes unescaped backticks as commands.

        The published v0.1.0 notes lost the source revision, the previous release and
        every file name that way. Render each workflow's notes script for real and
        require the values and literal backticks to survive.
        """

        cases = (
            ("publish", self.workflow, "self-hosted-image-identity.json"),
            ("candidate", self.candidate_workflow, "SHA256SUMS"),
        )
        revision = "8bb0c1eadbeb4864788d277a25a3673c79f5e46f"
        for name, workflow, expected_name in cases:
            with self.subTest(workflow=name):
                start = workflow.index("cat > release-evidence/RELEASE-NOTES.md <<EOF")
                end = workflow.index("\n          EOF", start) + len("\n          EOF")
                script = textwrap.dedent(" " * 10 + workflow[start:end].lstrip())
                with tempfile.TemporaryDirectory() as directory:
                    (Path(directory) / "release-evidence").mkdir()
                    subprocess.run(
                        ["bash", "-euo", "pipefail", "-c", script],
                        cwd=directory,
                        check=True,
                        env={
                            "PATH": "/usr/bin:/bin",
                            "RELEASE_VERSION": "0.1.0",
                            "SOURCE_REVISION": revision,
                            "previous": "v0.0.9",
                            "android_note": "android note",
                            "channel_note": "channel note",
                        },
                    )
                    notes = (Path(directory) / "release-evidence/RELEASE-NOTES.md").read_text(
                        encoding="utf-8"
                    )
                self.assertIn(f"`{revision}`", notes)
                self.assertIn("`eimir-release-manifest.json`", notes)
                self.assertIn(f"`{expected_name}`", notes)

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
        self.assertIn(
            'output=$(docker push --platform "$runtime_platform" "$ref" 2>&1)',
            publish_step,
        )
        self.assertIn('runtime_platform="linux/amd64"', publish_step)
        self.assertNotIn('docker push "$ref"', publish_step)
        self.assertIn('digest=$(extract_registry_digest "$output")', publish_step)
        self.assertIn('digest_ref="${repository}@${digest}"', publish_step)
        self.assertGreaterEqual(
            publish_step.count('require_single_manifest "$digest_ref"'), 2
        )
        self.assertIn(
            'transport_digest_ref=$(push_single_digest "$transport_ref" "$repository" "$evidence_config")',
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
        self.assertIn('cp -- deploy/push-fcm.compose.yaml', bundle_step)
        self.assertIn('${bundle_name}/deploy/push-fcm.compose.yaml', bundle_step)
        self.assertIn("scripts/self_hosted_release.py", bundle_step)
        self.assertIn("scripts/check_runtime_environment.py", bundle_step)
        self.assertIn("scripts/_identity_environment.py", bundle_step)
        self.assertIn(
            'cp -- release-evidence/self-hosted-image-identity.json \\\n'
            '            "$bundle_root/self-hosted-image-identity.json"',
            bundle_step,
        )
        self.assertIn("${bundle_name}/self-hosted-image-identity.json", bundle_step)
        self.assertIn("--sort=name", bundle_step)
        self.assertIn("--mtime='UTC 1970-01-01'", bundle_step)
        self.assertIn("--owner=0 --group=0 --numeric-owner", bundle_step)
        self.assertIn("gzip -n -c", bundle_step)
        self.assertIn("tar -tzf", bundle_step)
        self.assertIn("expected-self-hosted-bundle.txt", bundle_step)
        self.assertNotIn("backend/", bundle_step)
        self.assertNotIn("web/", bundle_step)
        self.assertIn("verify_release_asset_set.py", self.workflow)

    def test_shipped_operator_scripts_start_from_the_bundle_alone(self) -> None:
        """The target host has only the bundle, not the source checkout (#915).

        #954 made the launcher and the runtime checker import a sibling helper; the
        bundle step did not ship it, so the published v0.1.0 launcher failed at import
        time on a host. Assemble the bundle exactly as the workflow copies it and start
        every shipped script in isolation.
        """
        bundle_step = self.workflow.split(
            "Build deterministic Self-Hosted operator bundle", 1
        )[1].split("Write human-readable release notes", 1)[0]
        copies = re.findall(r'cp -- (\S+) \\\n?\s*"\$bundle_root/([^"]+)"', bundle_step)
        copies += re.findall(r'cp -- (\S+) "\$bundle_root/([^"]+)"', bundle_step)
        # release-evidence/ only exists in the publish job, not in the checkout.
        repository_copies = [
            (source, target) for source, target in copies if not source.startswith("release-evidence/")
        ]
        shipped_scripts = [t for _, t in repository_copies if t.startswith("scripts/")]
        self.assertIn("scripts/self_hosted_release.py", shipped_scripts)
        self.assertIn("scripts/check_runtime_environment.py", shipped_scripts)

        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory)
            for source, target in repository_copies:
                destination = bundle / target
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes((ROOT / source).read_bytes())
            for target in shipped_scripts:
                with self.subTest(script=target):
                    result = subprocess.run(
                        [sys.executable, target, "--help"],
                        cwd=bundle,
                        env={"PATH": os.environ.get("PATH", ""), "PYTHONDONTWRITEBYTECODE": "1"},
                        capture_output=True,
                        text=True,
                        check=False,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_release_workflow_tracks_operator_bundle_inputs(self) -> None:
        for path in (
            '"compose.yaml"',
            '"deploy/self-hosted-release.env.example"',
            '"deploy/push-fcm.compose.yaml"',
            '"scripts/self_hosted_release.py"',
            '"scripts/check_runtime_environment.py"',
            '"scripts/_identity_environment.py"',
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
        self.assertIn('"de.eimir.app"', self.workflow)
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
        self.assertIn("3b8a25775a69158b5ad2b1d17a80a88dc7b40a352a73eb27d06c612a7ce68e98", self.workflow)

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
        self.assertIn("package: name='de.eimir.app'", self.workflow)
        self.assertIn("scripts/android_launcher_identity.py", self.workflow)
        self.assertIn("cmdline-tools/latest/bin/apkanalyzer", self.workflow)
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


FAKE_DOCKER = r"""#!/bin/bash
# Records every call; models a registry plus the legacy and containerd stores.
state="$FAKE_DOCKER_STATE"
echo "$*" >> "$state/calls.log"
manifest_file() { printf '%s/manifest/%s' "$state" "$(printf '%s' "$1" | tr '/:@' '___')"; }
case "$1" in
  login) cat >/dev/null ;;
  load|tag) ;;
  push)
    shift
    platform=""
    if [ "$1" = "--platform" ]; then platform="$2"; shift 2; fi
    ref="$1"
    digest="$FAKE_PUSH_DIGEST_DEFAULT"
    if [ -n "$platform" ] && [ -z "${FAKE_IGNORE_PLATFORM:-}" ]; then
      digest="$FAKE_PUSH_DIGEST_PLATFORM"
    fi
    case "${ref##*:}" in publish-*) ;; *)
      if [ -n "${FAKE_ALIAS_DIGEST:-}" ]; then digest="$FAKE_ALIAS_DIGEST"; fi ;;
    esac
    echo "latest: digest: $digest size: 1234" ;;
  pull)
    ref="$2"
    case "$ref" in
      *@*) echo "Digest: ${ref##*@}" ;;
      *) echo "Digest: $FAKE_ALIAS_PULL_DIGEST" ;;
    esac ;;
  manifest)
    file=$(manifest_file "$3")
    if [ -f "$file" ]; then cat "$file"; else echo "manifest unknown" >&2; exit 1; fi ;;
  image)
    case "$2" in
      inspect)
        case "$*" in
          *image.revision*) echo "$FAKE_LABEL_REVISION" ;;
          *image.version*) echo "$FAKE_LABEL_VERSION" ;;
          *) exit 1 ;;
        esac ;;
      save) cp "$state/pullback.tar" "$4" ;;
      *) exit 1 ;;
    esac ;;
  *) echo "unexpected docker call: $*" >&2; exit 1 ;;
esac
"""


class RuntimeImagePublicationBehaviorTest(unittest.TestCase):
    """Run the real publish_archive shell functions against a fake Docker.

    Covers #1449: the immutable publisher must push only the runtime platform and
    compare store-independent config digests, not Docker image IDs.
    """

    REVISION = "0123456789abcdef0123456789abcdef01234567"
    VERSION = "0.0.0"
    SINGLE = "sha256:" + "a" * 64
    INDEX = "sha256:" + "b" * 64
    OTHER = "sha256:" + "c" * 64
    REPOSITORY = "ghcr.io/owner/eimir-backend"

    @classmethod
    def setUpClass(cls) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")
        step = workflow.split("- name: Publish exact build-once runtime images to GHCR", 1)[
            1
        ].split("- name: Verify anonymous GHCR consumption", 1)[0]
        script = textwrap.dedent(step.split("        run: |\n", 1)[1])
        script = script[: script.index("\npublish_archive \\\n")]
        # bash 3.2 (macOS) has no ${var,,}; the owner is already lower case here.
        cls.script = script.replace("${GITHUB_REPOSITORY_OWNER,,}", "${GITHUB_REPOSITORY_OWNER}")
        sys.path.insert(0, str(ROOT / "tools/ci"))

    def setUp(self) -> None:
        import test_image_archive_config as fixtures

        self.fixtures = fixtures
        self._directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._directory.cleanup)
        self.directory = Path(self._directory.name)
        (self.directory / "bin").mkdir()
        (self.directory / "state/manifest").mkdir(parents=True)
        fake = self.directory / "bin/docker"
        fake.write_text(FAKE_DOCKER, encoding="utf-8")
        fake.chmod(0o755)
        self.tag = f"eimir-backend:evidence-{self.REVISION}"
        self.environment = {
            "PATH": f"{self.directory / 'bin'}:{os.environ['PATH']}",
            "FAKE_DOCKER_STATE": str(self.directory / "state"),
            "FAKE_PUSH_DIGEST_DEFAULT": self.SINGLE,
            "FAKE_PUSH_DIGEST_PLATFORM": self.SINGLE,
            "FAKE_ALIAS_PULL_DIGEST": self.SINGLE,
            "FAKE_LABEL_REVISION": self.REVISION,
            "FAKE_LABEL_VERSION": self.VERSION,
            "GH_TOKEN": "token",
            "GITHUB_ACTOR": "actor",
            "GITHUB_REPOSITORY_OWNER": "owner",
            "GITHUB_RUN_ID": "7",
            "GITHUB_RUN_ATTEMPT": "1",
            "RUNNER_TEMP": str(self.directory),
            "RELEASE_VERSION": self.VERSION,
            "SOURCE_REVISION": self.REVISION,
        }
        self.config = self.fixtures.CONFIG_HEX
        self.register(self.SINGLE, config="sha256:" + self.config)

    def register(self, digest: str, *, config: str | None = None, index: bool = False) -> None:
        if index:
            body = {
                "schemaVersion": 2,
                "mediaType": "application/vnd.oci.image.index.v1+json",
                "manifests": [{}, {}],
            }
        else:
            body = {
                "schemaVersion": 2,
                "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "config": {"digest": config},
                "layers": [],
            }
        key = f"{self.REPOSITORY}@{digest}".replace("/", "_").replace(":", "_").replace("@", "_")
        (self.directory / "state/manifest" / key).write_text(json.dumps(body), encoding="utf-8")

    def register_alias(self, tag: str) -> None:
        key = f"{self.REPOSITORY}:{tag}".replace("/", "_").replace(":", "_")
        (self.directory / "state/manifest" / key).write_text("{}", encoding="utf-8")

    def publish(
        self, evidence: dict[str, bytes], pullback: dict[str, bytes] | None = None
    ) -> subprocess.CompletedProcess[str]:
        archive = self.directory / "backend-runtime.image.tar"
        self.fixtures.write_archive(archive, evidence)
        self.fixtures.write_archive(
            self.directory / "state/pullback.tar", pullback if pullback is not None else evidence
        )
        script = (
            self.script
            + f'\npublish_archive "{archive}" "{self.tag}" "$backend_repo" '
            + f'"{self.directory}/result"\n'
        )
        return subprocess.run(
            ["bash", "-euo", "pipefail", "-c", script],
            cwd=ROOT,
            env=self.environment,
            capture_output=True,
            text=True,
            check=False,
        )

    def calls(self) -> list[str]:
        return (self.directory / "state/calls.log").read_text(encoding="utf-8").splitlines()

    def test_both_image_stores_publish_the_exact_runtime_platform_only(self) -> None:
        legacy = self.fixtures.legacy_members()
        containerd = self.fixtures.containerd_members()
        cases = {
            "legacy": (legacy, legacy),
            "containerd": (containerd, containerd),
            "containerd build, legacy pull-back": (containerd, legacy),
        }
        for name, (evidence, pullback) in cases.items():
            with self.subTest(store=name):
                (self.directory / "state/calls.log").unlink(missing_ok=True)
                result = self.publish(evidence, pullback)
                self.assertEqual(result.returncode, 0, result.stderr)
                pushes = [call for call in self.calls() if call.startswith("push ")]
                self.assertEqual(len(pushes), 3, pushes)
                for call in pushes:
                    self.assertTrue(call.startswith("push --platform linux/amd64 "), call)
                self.assertEqual(
                    (self.directory / "result").read_text(encoding="utf-8").strip(),
                    f"{self.REPOSITORY}:v{self.VERSION}@{self.SINGLE}",
                )

    def test_containerd_provenance_index_is_never_published_as_the_release(self) -> None:
        # What the old unqualified push did under containerd: it reported the index.
        self.environment["FAKE_PUSH_DIGEST_DEFAULT"] = self.INDEX
        self.register(self.INDEX, index=True)
        self.environment["FAKE_IGNORE_PLATFORM"] = "1"
        result = self.publish(self.fixtures.containerd_members())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a supported single-image manifest", result.stderr)
        self.assertFalse((self.directory / "result").exists())

    def test_registry_config_must_equal_the_evidence_archive_config(self) -> None:
        self.register(self.SINGLE, config=self.OTHER)
        result = self.publish(self.fixtures.legacy_members())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a supported single-image manifest", result.stderr)
        self.assertIn("config differs from the evidence archive", result.stderr)
        self.assertFalse((self.directory / "result").exists())

    def test_pull_back_with_different_config_is_refused_before_aliases(self) -> None:
        other = self.fixtures.legacy_members(config=b'{"architecture":"arm64"}')
        result = self.publish(self.fixtures.legacy_members(), other)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not resolve to the release image bytes", result.stderr)
        self.assertEqual(len([c for c in self.calls() if c.startswith("push ")]), 1)

    def test_wrong_labels_or_archive_tag_fail_before_any_push(self) -> None:
        for name, key, value in (
            ("revision", "FAKE_LABEL_REVISION", "f" * 40),
            ("version", "FAKE_LABEL_VERSION", "9.9.9"),
        ):
            with self.subTest(label=name):
                (self.directory / "state/calls.log").unlink(missing_ok=True)
                self.environment[key] = value
                result = self.publish(self.fixtures.legacy_members())
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(any(c.startswith("push ") for c in self.calls()))
                self.environment[key] = self.REVISION if name == "revision" else self.VERSION
        with self.subTest(label="archive tag"):
            (self.directory / "state/calls.log").unlink(missing_ok=True)
            result = self.publish(self.fixtures.legacy_members(tag="eimir-backend:other"))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("tag", result.stderr)
            self.assertFalse(any(c.startswith(("load ", "push ")) for c in self.calls()))

    def test_existing_alias_pointing_elsewhere_is_a_conflict(self) -> None:
        self.register_alias(f"sha-{self.REVISION}")
        self.environment["FAKE_ALIAS_PULL_DIGEST"] = self.OTHER
        self.register(self.OTHER, config="sha256:" + self.config)
        result = self.publish(self.fixtures.legacy_members())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("already points to a different digest", result.stderr)
        self.assertFalse((self.directory / "result").exists())

    def test_new_alias_must_publish_the_transport_digest(self) -> None:
        self.environment["FAKE_ALIAS_DIGEST"] = self.OTHER
        self.register(self.OTHER, config="sha256:" + self.config)
        result = self.publish(self.fixtures.legacy_members())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("published with a different digest", result.stderr)
        self.assertFalse((self.directory / "result").exists())

    def test_existing_matching_alias_is_reused_without_a_second_push(self) -> None:
        self.register_alias(f"sha-{self.REVISION}")
        self.register_alias(f"v{self.VERSION}")
        result = self.publish(self.fixtures.legacy_members())
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len([c for c in self.calls() if c.startswith("push ")]), 1)


if __name__ == "__main__":
    unittest.main()

