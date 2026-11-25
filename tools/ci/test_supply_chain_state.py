#!/usr/bin/env python3
"""Both supply-chain states of the publishing repository and their negative cases.

Decision 0019, cut-over runbook decision D5: a private personal repository has no
artifact attestations and no CodeQL; the evidence records that state instead of
skipping silently. A public repository keeps both, unchanged.
"""

from __future__ import annotations

import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import supply_chain_state as state  # noqa: E402

SOURCE = "a" * 40
OTHER_SOURCE = "b" * 40
SUBJECTS = ["backend-runtime", "web-runtime"]


def repository(
    name: str = "baerenmarke90/eimir-pro",
    *,
    visibility: str = "private",
    owner_type: str = "User",
) -> dict:
    return {
        "full_name": name,
        "visibility": visibility,
        "private": visibility != "public",
        "owner": {"login": name.split("/")[0], "type": owner_type},
    }


PUBLIC = repository("baerenmarke90/eimir-core", visibility="public")
PRIVATE = repository()


def write_bundles(directory: Path, subjects: list[str]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for subject in subjects:
        for suffix in state.BUNDLE_SUFFIXES:
            (directory / f"{subject}{suffix}").write_text("{}", encoding="utf-8")


class AssessTest(unittest.TestCase):
    def test_public_repository_keeps_attestations_and_codeql(self) -> None:
        result = state.assess(PUBLIC, "")
        self.assertEqual(result["attestation"], {"state": "available"})
        self.assertEqual(result["codeScanning"], {"state": "available"})
        self.assertNotIn("acceptedBy", result)

    def test_organization_repository_is_assumed_to_have_the_products(self) -> None:
        # Option (b) of D5: an organization plan with the security products.
        for visibility in ("private", "internal"):
            with self.subTest(visibility=visibility):
                result = state.assess(
                    repository("eimir-org/eimir-pro", visibility=visibility, owner_type="Organization"),
                    "",
                )
                self.assertEqual(result["attestation"]["state"], "available")
                self.assertEqual(result["codeScanning"]["state"], "available")

    def test_private_personal_repository_is_unavailable_only_with_the_acceptance(self) -> None:
        result = state.assess(PRIVATE, state.ACCEPTANCE)
        for capability in state.CAPABILITIES:
            with self.subTest(capability=capability):
                self.assertEqual(result[capability]["state"], "unavailable")
                self.assertIn("baerenmarke90/eimir-pro", result[capability]["reason"])
                self.assertIn("personal account", result[capability]["reason"])
        self.assertIn("D5", result["acceptedBy"])
        self.assertIn("Enterprise Cloud", result["attestation"]["reason"])
        self.assertIn("Code Security", result["codeScanning"]["reason"])

    def test_private_personal_repository_without_the_acceptance_is_refused(self) -> None:
        for acceptance in ("", "  ", "yes", "decision-0019-d4", "DECISION-0019-D5"):
            with self.subTest(acceptance=acceptance):
                with self.assertRaisesRegex(state.CapabilityError, state.ACCEPTANCE_ENV):
                    state.assess(PRIVATE, acceptance)

    def test_acceptance_never_waives_an_available_capability(self) -> None:
        for metadata in (
            PUBLIC,
            repository("eimir-org/eimir-pro", owner_type="Organization"),
        ):
            with self.subTest(repository=metadata["full_name"]):
                with self.assertRaisesRegex(state.CapabilityError, "Remove the variable"):
                    state.assess(metadata, state.ACCEPTANCE)

    def test_unknown_or_inconsistent_metadata_is_refused(self) -> None:
        broken = []
        for key, value in (
            ("full_name", None),
            ("full_name", "eimir"),
            ("visibility", None),
            ("visibility", "secret"),
            ("private", None),
            ("private", False),
            ("owner", None),
            ("owner", {"type": "Bot"}),
        ):
            metadata = repository()
            metadata[key] = value
            broken.append(metadata)
        public_but_private = dict(PUBLIC, private=True)
        for metadata in [*broken, public_but_private, [], "baerenmarke90/eimir-pro"]:
            with self.subTest(metadata=metadata):
                with self.assertRaises(state.CapabilityError):
                    state.assess(metadata, state.ACCEPTANCE)


class RecordTest(unittest.TestCase):
    def expected(self, metadata: dict = PRIVATE, acceptance: str = state.ACCEPTANCE) -> dict:
        return state.build_record(state.assess(metadata, acceptance), SOURCE)

    def test_unavailable_record_names_state_reason_repository_and_revision(self) -> None:
        record = self.expected()
        self.assertEqual(record["kind"], state.RECORD_KIND)
        self.assertEqual(record["repository"], "baerenmarke90/eimir-pro")
        self.assertEqual(record["sourceRevision"], SOURCE)
        self.assertEqual(record["attestation"]["state"], "unavailable")
        self.assertTrue(record["attestation"]["reason"])
        state.verify_record(json.loads(json.dumps(record)), record)

    def test_record_requires_a_full_source_revision(self) -> None:
        for revision in ("", "a" * 39, "A" * 40, "main"):
            with self.subTest(revision=revision), self.assertRaises(state.CapabilityError):
                state.build_record(state.assess(PUBLIC, ""), revision)

    def test_any_drift_from_the_probed_state_fails(self) -> None:
        record = self.expected()
        mutations = {
            "other repository": {"repository": "baerenmarke90/eimir-core"},
            "other revision": {"sourceRevision": OTHER_SOURCE},
            "other kind": {"kind": "something-else"},
            "other schema": {"schemaVersion": 2},
            "attestation claimed available": {"attestation": {"state": "available"}},
            "codeql claimed available": {"codeScanning": {"state": "available"}},
            "reason edited": {"attestation": {"state": "unavailable", "reason": "ok"}},
            "acceptance removed": {"acceptedBy": None},
        }
        for name, change in mutations.items():
            with self.subTest(mutation=name):
                with self.assertRaises(state.CapabilityError):
                    state.verify_record({**record, **change}, record)
        for value in (None, [], "unavailable"):
            with self.subTest(record=value), self.assertRaises(state.CapabilityError):
                state.verify_record(value, record)

    def test_unavailable_record_on_a_repository_with_attestations_fails(self) -> None:
        # A stale or copied record must not switch attestations off in eimir-core.
        unavailable = self.expected()
        available = state.build_record(state.assess(
            repository("baerenmarke90/eimir-pro", visibility="public"), ""), SOURCE)
        with self.assertRaisesRegex(state.CapabilityError, "attestation is 'unavailable'"):
            state.verify_record(unavailable, available)


class BundleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.directory))
        self.available = state.build_record(state.assess(PUBLIC, ""), SOURCE)
        self.unavailable = state.build_record(state.assess(PRIVATE, state.ACCEPTANCE), SOURCE)

    def test_available_state_with_every_bundle_passes(self) -> None:
        write_bundles(self.directory, SUBJECTS)
        (self.directory / "trusted_root.jsonl").write_text("{}", encoding="utf-8")
        state.verify_bundles(self.available, self.directory, SUBJECTS)

    def test_available_state_with_a_missing_attestation_fails(self) -> None:
        write_bundles(self.directory, SUBJECTS)
        for missing in ("web-runtime-sbom.json", "backend-runtime-provenance.json"):
            with self.subTest(missing=missing):
                path = self.directory / missing
                path.unlink()
                with self.assertRaisesRegex(state.CapabilityError, missing):
                    state.verify_bundles(self.available, self.directory, SUBJECTS)
                path.write_text("", encoding="utf-8")
                with self.assertRaisesRegex(state.CapabilityError, missing):
                    state.verify_bundles(self.available, self.directory, SUBJECTS)
                path.write_text("{}", encoding="utf-8")

    def test_available_state_without_any_bundle_directory_fails(self) -> None:
        with self.assertRaisesRegex(state.CapabilityError, "missing"):
            state.verify_bundles(self.available, self.directory / "absent", SUBJECTS)

    def test_unavailable_state_requires_that_no_bundle_exists(self) -> None:
        state.verify_bundles(self.unavailable, self.directory / "absent", SUBJECTS)
        state.verify_bundles(self.unavailable, self.directory, SUBJECTS)
        write_bundles(self.directory, ["web-runtime"])
        with self.assertRaisesRegex(state.CapabilityError, "bundles exist"):
            state.verify_bundles(self.unavailable, self.directory, SUBJECTS)

    def test_subjects_are_required_and_well_formed(self) -> None:
        for subjects in ([], ["../web"], ["Web-Runtime"], [""]):
            with self.subTest(subjects=subjects), self.assertRaises(state.CapabilityError):
                state.verify_bundles(self.available, self.directory, subjects)


class CommandLineTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: __import__("shutil").rmtree(self.directory))
        self.output = self.directory / "github-output"
        self.summary = self.directory / "summary.md"

    def run_cli(self, metadata: dict, acceptance: str, *arguments: str) -> tuple[int, str, str]:
        metadata_path = self.directory / "repository.json"
        metadata_path.write_text(json.dumps(metadata), encoding="utf-8")
        environment = {state.ACCEPTANCE_ENV: acceptance, "GITHUB_STEP_SUMMARY": str(self.summary)}
        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            patch.dict(os.environ, environment),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            code = state.main([
                arguments[0],
                "--repository-json",
                str(metadata_path),
                "--github-output",
                str(self.output),
                *arguments[1:],
            ])
        return code, stdout.getvalue(), stderr.getvalue()

    def outputs(self) -> dict[str, str]:
        lines = self.output.read_text(encoding="utf-8").splitlines()
        return dict(line.split("=", 1) for line in lines)

    def test_unavailable_state_is_recorded_announced_and_verified(self) -> None:
        record = self.directory / "evidence" / state.RECORD_NAME
        code, stdout, _ = self.run_cli(
            PRIVATE, state.ACCEPTANCE, "probe", "--source-revision", SOURCE, "--output", str(record)
        )
        self.assertEqual(code, 0)
        self.assertEqual(self.outputs(), {"attestation": "unavailable", "code_scanning": "unavailable"})
        self.assertIn("::notice title=Supply chain (attestation)::", stdout)
        self.assertIn("baerenmarke90/eimir-pro", self.summary.read_text(encoding="utf-8"))
        written = json.loads(record.read_text(encoding="utf-8"))
        self.assertEqual(written["attestation"]["state"], "unavailable")
        self.assertEqual(written["repository"], "baerenmarke90/eimir-pro")

        code, _, stderr = self.run_cli(
            PRIVATE, state.ACCEPTANCE, "verify", "--source-revision", SOURCE, "--record", str(record),
            "--attestation-dir", str(self.directory / "attestations"),
            "--subject", "backend-runtime", "--subject", "web-runtime",
        )
        self.assertEqual((code, stderr), (0, ""))

    def test_unavailable_state_without_the_record_fails(self) -> None:
        code, _, stderr = self.run_cli(
            PRIVATE, state.ACCEPTANCE, "verify", "--source-revision", SOURCE,
            "--record", str(self.directory / "absent.json"),
        )
        self.assertEqual(code, 1)
        self.assertIn("Cannot read", stderr)
        self.assertFalse(self.output.exists())

    def test_available_state_with_a_missing_attestation_fails(self) -> None:
        record = self.directory / state.RECORD_NAME
        self.assertEqual(
            self.run_cli(PUBLIC, "", "probe", "--source-revision", SOURCE, "--output", str(record))[0], 0
        )
        attestations = self.directory / "attestations"
        write_bundles(attestations, ["backend-runtime"])
        code, _, stderr = self.run_cli(
            PUBLIC, "", "verify", "--source-revision", SOURCE, "--record", str(record),
            "--attestation-dir", str(attestations),
            "--subject", "backend-runtime", "--subject", "web-runtime",
        )
        self.assertEqual(code, 1)
        self.assertIn("web-runtime-provenance.json", stderr)

    def test_available_state_with_every_attestation_passes_unchanged(self) -> None:
        record = self.directory / state.RECORD_NAME
        code, stdout, _ = self.run_cli(PUBLIC, "", "probe", "--source-revision", SOURCE, "--output", str(record))
        self.assertEqual(code, 0)
        self.assertNotIn("::notice", stdout)
        self.assertFalse(self.summary.exists())
        attestations = self.directory / "attestations"
        write_bundles(attestations, SUBJECTS)
        self.output.unlink()
        code, _, _ = self.run_cli(
            PUBLIC, "", "verify", "--source-revision", SOURCE, "--record", str(record),
            "--attestation-dir", str(attestations), "--subject", "backend-runtime", "--subject", "web-runtime",
        )
        self.assertEqual(code, 0)
        self.assertEqual(self.outputs(), {"attestation": "available", "code_scanning": "available"})

    def test_missing_acceptance_refuses_before_any_output(self) -> None:
        code, _, stderr = self.run_cli(
            PRIVATE, "", "probe", "--source-revision", SOURCE, "--output", str(self.directory / "r.json")
        )
        self.assertEqual(code, 1)
        self.assertIn(f"{state.ACCEPTANCE_ENV}={state.ACCEPTANCE}", stderr)
        self.assertFalse(self.output.exists())
        self.assertFalse((self.directory / "r.json").exists())

    def test_record_from_another_revision_fails(self) -> None:
        record = self.directory / state.RECORD_NAME
        self.run_cli(PRIVATE, state.ACCEPTANCE, "probe", "--source-revision", SOURCE, "--output", str(record))
        code, _, stderr = self.run_cli(
            PRIVATE, state.ACCEPTANCE, "verify", "--source-revision", OTHER_SOURCE, "--record", str(record)
        )
        self.assertEqual(code, 1)
        self.assertIn("sourceRevision", stderr)

    def test_assess_reports_code_scanning_without_a_record(self) -> None:
        code, _, _ = self.run_cli(PRIVATE, state.ACCEPTANCE, "assess")
        self.assertEqual(code, 0)
        self.assertEqual(self.outputs()["code_scanning"], "unavailable")

    def test_subject_without_an_attestation_directory_is_refused(self) -> None:
        record = self.directory / state.RECORD_NAME
        self.run_cli(PUBLIC, "", "probe", "--source-revision", SOURCE, "--output", str(record))
        code, _, stderr = self.run_cli(
            PUBLIC, "", "verify", "--source-revision", SOURCE, "--record", str(record), "--subject", "web-runtime"
        )
        self.assertEqual(code, 1)
        self.assertIn("--attestation-dir", stderr)


if __name__ == "__main__":
    unittest.main()
