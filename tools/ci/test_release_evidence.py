#!/usr/bin/env python3
"""Fail-closed contract checks for the #193 release-evidence workflow."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github/workflows/release-evidence.yml"
ACTION = ROOT / ".github/actions/attest-release-artifact/action.yml"

EXTERNAL_ACTION_PINS = {
    "actions/checkout": "3d3c42e5aac5ba805825da76410c181273ba90b1",
    "actions/setup-node": "949feb2413d6458794dcd2491c4babbbce0c15c1",
    "actions/setup-java": "d1374f8ac74474200d16ef8ecee22c7ae7a51880",
    "gradle/actions/setup-gradle": "8da46b539cd8fe6ab27ca75128919a18d757604c",
    "actions/upload-artifact": "cf430e030ddbb5b0abf93d22962f4752f3646cd9",
    "actions/download-artifact": "9000827ccba6bdab643e8b6fd33ac0654aef8333",
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


def job_text(workflow: str, job: str) -> str:
    """Return one top-level job block of a workflow (the runner image has no PyYAML)."""
    match = re.search(
        rf"^  {re.escape(job)}:\n(.*?)(?=^  [a-z0-9_-]+:\n|\Z)", workflow, re.MULTILINE | re.DOTALL
    )
    assert match, job
    return match.group(1)


def step_text(text: str, name: str) -> str:
    return text.split(f"- name: {name}\n", 1)[1].split("\n      - name:", 1)[0]


def step_script(text: str, name: str) -> str:
    """Return the dedented ``run: |`` script of one named step."""
    block = step_text(text, name).split("run: |\n", 1)[1]
    lines = []
    for line in block.splitlines():
        if line.strip() and not line.startswith(" " * 10):
            break
        lines.append(line)
    return textwrap.dedent("\n".join(lines)) + "\n"


SUPPLY_CHAIN_SCRIPT = ROOT / "scripts/supply_chain_state.py"
FAKE_GH = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_GH_LOG"
case "$1 $2" in
  "api repos/"*) cat "$FAKE_REPOSITORY_JSON" ;;
  "attestation verify")
    bundle=""
    while [ "$#" -gt 0 ]; do
      if [ "$1" = "--bundle" ]; then bundle="$2"; fi
      shift
    done
    test -s "$bundle"
    ;;
  "attestation trusted-root") echo '{}' ;;
  *) echo "unexpected gh call: $*" >&2; exit 2 ;;
esac
"""


class SupplyChainStepHarness:
    """Run a workflow step's real script with a fake ``gh`` and the real probe script.

    Repository metadata, the variable and the evidence directory are inputs, so each
    test drives one supply-chain state end to end without network access.
    """

    REPOSITORY = "baerenmarke90/eimir-pro"
    SOURCE = "c" * 40

    def __init__(self, test: unittest.TestCase) -> None:
        self.root = Path(tempfile.mkdtemp())
        test.addCleanup(shutil.rmtree, self.root, True)
        (self.root / "scripts").mkdir()
        shutil.copy(SUPPLY_CHAIN_SCRIPT, self.root / "scripts" / SUPPLY_CHAIN_SCRIPT.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        gh = self.bin / "gh"
        gh.write_text(FAKE_GH, encoding="utf-8", newline="\n")
        gh.chmod(0o755)
        python3 = self.bin / "python3"
        python3.write_text(
            f'#!/usr/bin/env bash\nexec "{Path(sys.executable).as_posix()}" "$@"\n',
            encoding="utf-8",
            newline="\n",
        )
        python3.chmod(0o755)
        self.log = self.root / "gh.log"
        self.log.touch()
        self.temp = self.root / "runner-temp"
        self.temp.mkdir()
        self.evidence = self.root / "release-evidence"
        self.attestations = self.evidence / "attestations"
        self.attestations.mkdir(parents=True)

    def repository(self, visibility: str) -> Path:
        path = self.root / f"repository-{visibility}.json"
        path.write_text(
            json.dumps(
                {
                    "full_name": self.REPOSITORY,
                    "visibility": visibility,
                    "private": visibility != "public",
                    "owner": {"login": "baerenmarke90", "type": "User"},
                }
            ),
            encoding="utf-8",
        )
        return path

    def write_record(self, visibility: str, acceptance: str) -> None:
        result = subprocess.run(
            [
                sys.executable,
                str(SUPPLY_CHAIN_SCRIPT),
                "probe",
                "--repository-json",
                str(self.repository(visibility)),
                "--source-revision",
                self.SOURCE,
                "--output",
                str(self.evidence / "supply-chain-state.json"),
            ],
            env={**os.environ, "EIMIR_SUPPLY_CHAIN_EXCEPTION": acceptance},
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr

    def write_bundles(self, *prefixes: str) -> None:
        for prefix in prefixes:
            for suffix in ("provenance", "sbom"):
                (self.attestations / f"{prefix}-{suffix}.json").write_text("{}", encoding="utf-8")

    def run(
        self, script: str, *, visibility: str, acceptance: str, **environment: str
    ) -> subprocess.CompletedProcess:
        system_path = os.environ.get("PATH", "") if os.name == "nt" else "/usr/bin:/bin"
        env = {
            **({"SYSTEMROOT": os.environ["SYSTEMROOT"]} if "SYSTEMROOT" in os.environ else {}),
            "PATH": os.pathsep.join([str(self.bin), system_path]),
            "GITHUB_REPOSITORY": self.REPOSITORY,
            "GITHUB_SHA": self.SOURCE,
            "RUNNER_TEMP": self.temp.as_posix(),
            "GITHUB_OUTPUT": (self.temp / "github-output").as_posix(),
            "FAKE_GH_LOG": self.log.as_posix(),
            "FAKE_REPOSITORY_JSON": self.repository(visibility).as_posix(),
            "EIMIR_SUPPLY_CHAIN_EXCEPTION": acceptance,
            "INCLUDE_VIDEO_MEDIA": "false",
            "INCLUDE_ANDROID": "false",
            **environment,
        }
        return subprocess.run(
            # shutil.which skips the WSL launcher that Windows would start for "bash".
            [shutil.which("bash") or "bash", "-c", script], cwd=self.root, env=env, capture_output=True, text=True, check=False
        )

    def verify_calls(self) -> list[str]:
        return [
            line
            for line in self.log.read_text(encoding="utf-8").splitlines()
            if line.startswith("attestation verify")
        ]


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

    def test_workflow_only_accepts_public_client_configuration_without_server_or_signing_keys(self) -> None:
        forbidden = (
            "EIMIR_RELEASE_KEYSTORE",
            "EIMIR_RELEASE_KEYSTORE_PASSWORD",
            "EIMIR_RELEASE_KEY_ALIAS",
            "EIMIR_RELEASE_KEY_PASSWORD",
        )
        for marker in forbidden:
            with self.subTest(marker=marker):
                self.assertNotIn(marker, self.workflow)
        self.assertEqual(
            set(re.findall(r"secrets\.([A-Za-z0-9_]+)", self.workflow)),
            {"EIMIR_ANDROID_GOOGLE_SERVICES_JSON"},
        )

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
            "Set up Node.js 26.13.1",
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
                self.assertIn(
                    "if: (inputs.include_android || github.event_name == 'pull_request')"
                    " && steps.supply_chain.outputs.attestation == 'available'",
                    step,
                )

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

    def test_live_advisories_run_separately_and_gate_media_evidence(self) -> None:
        check = "python3 tools/media/check-advisories.py"
        workflow_dir = WORKFLOW.parent
        media_ci = (workflow_dir / "media-video.yml").read_text(encoding="utf-8")
        monitor = (workflow_dir / "codec-advisories.yml").read_text(encoding="utf-8")
        # The nightly regression dispatches the complete media suite on main (#2096).
        self.assertIn("  workflow_dispatch:", media_ci)
        self.assertNotIn(check, media_ci)
        self.assertIn("  schedule:", monitor)
        self.assertIn("  workflow_dispatch:", monitor)
        self.assertIn(f"- run: {check}\n", monitor)
        self.assertNotIn("continue-on-error", monitor)

        _, media_step = self.workflow.split("- name: Build restricted video worker from the exact backend", 1)
        media_step = media_step.split("- name:", 1)[0]
        self.assertIn("if: env.INCLUDE_VIDEO_MEDIA == 'true'", media_step)
        self.assertIn(f"set -euo pipefail\n          {check}\n", media_step)
        self.assertLess(media_step.index(check), media_step.index("docker build"))

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
        self.assertIn("621008afc4f5d59357fcf06ffa644dd5aade5e091bdc363742710445f73cdaf8", self.workflow)
        self.assertIn('node-version: "26.13.1"', self.workflow)

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
        self.assertIn("package: name='de.eimir.app'", self.workflow)
        self.assertIn("scripts/android_launcher_identity.py", self.workflow)
        self.assertIn("cmdline-tools/latest/bin/apkanalyzer", self.workflow)
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


class SupplyChainStateTest(unittest.TestCase):
    """Decision 0019, D5: both attestation states and their negative cases."""

    ACCEPTANCE = "decision-0019-d5"

    @classmethod
    def setUpClass(cls) -> None:
        cls.workflow = WORKFLOW.read_text(encoding="utf-8")
        cls.build = job_text(cls.workflow, "build-evidence")
        cls.attest = job_text(cls.workflow, "attest")

    def test_state_is_probed_early_and_bound_into_the_checksummed_evidence(self) -> None:
        step = step_text(self.build, "Record supply-chain capabilities of this repository")
        self.assertIn('gh api "repos/${GITHUB_REPOSITORY}"', step)
        self.assertIn("python3 scripts/supply_chain_state.py probe", step)
        self.assertIn("--output release-evidence/supply-chain-state.json", step)
        self.assertIn("EIMIR_SUPPLY_CHAIN_EXCEPTION: ${{ vars.EIMIR_SUPPLY_CHAIN_EXCEPTION }}", step)
        self.assertNotIn("if:", step)
        self.assertLess(
            self.build.index("Record supply-chain capabilities"),
            self.build.index("Build backend runtime image archive"),
        )
        checksums = step_text(self.build, "Validate and index release evidence")
        self.assertIn("              supply-chain-state.json\n", checksums)
        self.assertIn("python3 tools/ci/test_supply_chain_state.py", self.build)

    def test_every_attestation_needs_the_confirmed_available_state(self) -> None:
        confirm = step_text(self.attest, "Confirm the recorded supply-chain state")
        self.assertIn("id: supply_chain", confirm)
        self.assertNotIn("if:", confirm)
        self.assertIn("--record release-evidence/supply-chain-state.json", confirm)
        self.assertLess(
            self.attest.index("Verify transported checksums"), self.attest.index("Confirm the recorded")
        )
        names = re.findall(r"^      - name: (.+)$", self.attest, re.MULTILINE)
        attesting = [name for name in names if "attest-release-artifact" in step_text(self.attest, name)]
        self.assertEqual(len(attesting), 5)
        for name in attesting + ["Capture current trusted roots", "Upload offline-verification bundles"]:
            with self.subTest(step=name):
                self.assertLess(self.attest.index("Confirm the recorded"), self.attest.index(f"- name: {name}"))
                self.assertRegex(
                    step_text(self.attest, name),
                    r"(?m)^        if: .*steps\.supply_chain\.outputs\.attestation == 'available'$",
                )
        self.assertNotIn("continue-on-error", self.workflow)

    def test_verification_step_runs_in_both_states(self) -> None:
        step = step_text(self.attest, "Verify retained attestations offline")
        self.assertNotRegex(step, r"(?m)^        if:")
        script = step_script(self.attest, "Verify retained attestations offline")
        self.assertLess(script.index("supply_chain_state.py verify"), script.index("exit 0"))
        self.assertLess(
            script.index("exit 0"), script.index("verify_subject release-evidence/backend-runtime.image.tar")
        )

    def run_verification(self, harness: SupplyChainStepHarness, **kwargs: str) -> subprocess.CompletedProcess:
        return harness.run(step_script(self.attest, "Verify retained attestations offline"), **kwargs)

    def test_unavailable_state_verifies_the_record_instead_of_attestations(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("private", self.ACCEPTANCE)
        result = self.run_verification(harness, visibility="private", acceptance=self.ACCEPTANCE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("verified the recorded state instead", result.stdout)
        self.assertIn("::notice title=Supply chain (attestation)::", result.stdout)
        self.assertEqual(harness.verify_calls(), [])

    def test_unavailable_state_without_the_record_fails(self) -> None:
        harness = SupplyChainStepHarness(self)
        result = self.run_verification(harness, visibility="private", acceptance=self.ACCEPTANCE)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("supply-chain-state.json", result.stderr)

    def test_unavailable_state_without_the_acceptance_fails(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("private", self.ACCEPTANCE)
        result = self.run_verification(harness, visibility="private", acceptance="")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("EIMIR_SUPPLY_CHAIN_EXCEPTION", result.stderr)

    def test_unavailable_record_on_a_public_repository_fails(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("private", self.ACCEPTANCE)
        result = self.run_verification(harness, visibility="public", acceptance="")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("attestation is 'unavailable'", result.stderr)
        self.assertEqual(harness.verify_calls(), [])

    def test_unavailable_state_next_to_bundles_fails(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("private", self.ACCEPTANCE)
        harness.write_bundles("backend-runtime")
        result = self.run_verification(harness, visibility="private", acceptance=self.ACCEPTANCE)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("bundles exist", result.stderr)

    def test_available_state_verifies_every_attestation_unchanged(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("public", "")
        harness.write_bundles("backend-runtime", "web-runtime", "media-runtime")
        result = self.run_verification(
            harness, visibility="public", acceptance="", INCLUDE_VIDEO_MEDIA="true"
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = harness.verify_calls()
        self.assertEqual(len(calls), 6)
        for prefix in ("backend-runtime", "web-runtime", "media-runtime"):
            with self.subTest(prefix=prefix):
                self.assertTrue(any(f"{prefix}-provenance.json" in call for call in calls))
                self.assertTrue(
                    any(f"{prefix}-sbom.json" in call and "spdx.dev/Document/v2.3" in call for call in calls)
                )
        self.assertTrue(all("--signer-workflow" in call for call in calls))

    def test_available_state_with_a_missing_attestation_fails(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("public", "")
        harness.write_bundles("backend-runtime")
        result = self.run_verification(harness, visibility="public", acceptance="")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("web-runtime-provenance.json", result.stderr)
        self.assertEqual(harness.verify_calls(), [])

    def test_available_state_requires_android_bundles_when_android_is_included(self) -> None:
        harness = SupplyChainStepHarness(self)
        harness.write_record("public", "")
        harness.write_bundles("backend-runtime", "web-runtime")
        result = self.run_verification(harness, visibility="public", acceptance="", INCLUDE_ANDROID="true")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("android-apk-provenance.json", result.stderr)

    def test_confirm_step_publishes_the_state_for_the_conditional_steps(self) -> None:
        for visibility, acceptance, expected in (
            ("public", "", "attestation=available"),
            ("private", self.ACCEPTANCE, "attestation=unavailable"),
        ):
            with self.subTest(visibility=visibility):
                harness = SupplyChainStepHarness(self)
                harness.write_record(visibility, acceptance)
                result = harness.run(
                    step_script(self.attest, "Confirm the recorded supply-chain state"),
                    visibility=visibility,
                    acceptance=acceptance,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn(expected, (harness.temp / "github-output").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
