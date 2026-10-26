#!/usr/bin/env python3
"""Protect optional public Android Firebase input at the release boundary."""

from __future__ import annotations

import copy
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import android_firebase_configuration as firebase


def configuration() -> dict:
    return {
        "project_info": {
            "project_id": "firebase-example",
            "project_number": "123456789012",
        },
        "client": [
            {
                "client_info": {
                    "mobilesdk_app_id": "1:123456789012:android:0123456789abcdef",
                    "android_client_info": {"package_name": "de.eimir.app"},
                },
                "api_key": [{"current_key": "AIza" + "A" * 35}],
            }
        ],
        "configuration_version": "1",
    }


class AndroidFirebaseConfigurationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name) / "google-services.json"

    def prepare(self, value: dict) -> None:
        firebase.prepare_configuration(
            "firebase-example", json.dumps(value), self.output
        )

    def test_valid_public_client_input_is_written_with_private_file_permissions(
        self,
    ) -> None:
        value = configuration()
        self.prepare(value)
        self.assertEqual(json.loads(self.output.read_text()), value)
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o600)

    def test_unconfigured_build_does_not_parse_or_write_the_optional_input(
        self,
    ) -> None:
        self.assertFalse(firebase.prepare_configuration("", "not JSON", self.output))
        self.assertFalse(self.output.exists())

    def test_unconfigured_build_refuses_an_existing_firebase_configuration(
        self,
    ) -> None:
        self.output.write_text("existing")
        with self.assertRaises(firebase.ConfigurationError):
            firebase.prepare_configuration("", "", self.output)
        self.assertEqual(self.output.read_text(), "existing")

    def test_selected_fcm_project_requires_client_configuration(self) -> None:
        with self.assertRaises(firebase.ConfigurationError):
            firebase.prepare_configuration("firebase-example", "", self.output)
        self.assertFalse(self.output.exists())

    def test_mismatched_project_or_android_package_is_rejected_before_writing(
        self,
    ) -> None:
        for field in ("project", "package"):
            with self.subTest(field=field):
                value = configuration()
                if field == "project":
                    value["project_info"]["project_id"] = "another-project"
                else:
                    value["client"][0]["client_info"]["android_client_info"][
                        "package_name"
                    ] = "de.eimir.app.debug"
                with self.assertRaises(firebase.ConfigurationError):
                    self.prepare(value)
                self.assertFalse(self.output.exists())

    def test_project_number_app_id_api_key_and_config_version_are_required(
        self,
    ) -> None:
        invalid = []
        value = configuration()
        value["project_info"]["project_number"] = "not-a-number"
        invalid.append(value)
        value = configuration()
        value["client"][0]["client_info"]["mobilesdk_app_id"] = (
            "1:999999999999:android:0123456789abcdef"
        )
        invalid.append(value)
        value = configuration()
        value["client"][0]["api_key"] = []
        invalid.append(value)
        value = configuration()
        value["configuration_version"] = "2"
        invalid.append(value)
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(firebase.ConfigurationError):
                    self.prepare(value)
                self.assertFalse(self.output.exists())

    def test_duplicate_matching_client_is_rejected(self) -> None:
        value = configuration()
        value["client"].append(copy.deepcopy(value["client"][0]))
        with self.assertRaises(firebase.ConfigurationError):
            self.prepare(value)

    def test_service_account_and_embedded_private_material_are_rejected(self) -> None:
        for addition in (
            {"type": "service_account"},
            {"private_key_id": "server-key-id"},
            {"client_email": "sender@example.invalid"},
            {"unexpected": {"refresh_token": "server material"}},
            {"unexpected": {"private_key": "server material"}},
            {"unexpected": ["-----BEGIN RSA PRIVATE KEY-----"]},
        ):
            with self.subTest(addition=addition):
                value = configuration() | addition
                with self.assertRaises(firebase.ConfigurationError):
                    self.prepare(value)
                self.assertFalse(self.output.exists())

    def test_configured_build_never_overwrites_an_existing_file_or_symlink(
        self,
    ) -> None:
        target = Path(self.directory.name) / "operator-owned"
        target.write_text("preserve")
        self.output.symlink_to(target)
        with self.assertRaises(firebase.ConfigurationError):
            self.prepare(configuration())
        self.assertTrue(self.output.is_symlink())
        self.assertEqual(target.read_text(), "preserve")

    def test_cli_failure_does_not_echo_json_or_private_material(self) -> None:
        sentinel = "PRIVATE-MATERIAL-MUST-NOT-APPEAR"
        result = subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts/android_firebase_configuration.py"),
                "prepare",
            ],
            cwd=self.directory.name,
            env=os.environ
            | {
                "ANDROID_FIREBASE_PROJECT_ID": "firebase-example",
                "EIMIR_ANDROID_GOOGLE_SERVICES_JSON": json.dumps(
                    {"private_key": sentinel}
                ),
            },
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(sentinel, result.stdout + result.stderr)

    def test_packaged_apk_must_match_all_four_compiled_firebase_resources(self) -> None:
        self.prepare(configuration())
        _, expected = firebase.validate_configuration(
            "firebase-example", self.output.read_text()
        )

        def resource(command, **_kwargs):
            return subprocess.CompletedProcess(
                command, 0, expected[command[-2]] + "\n", ""
            )

        with patch.object(firebase.subprocess, "run", side_effect=resource) as run:
            firebase.verify_apk_configuration(
                "firebase-example", Path("app.apk"), Path("apkanalyzer"), self.output
            )
        self.assertEqual(run.call_count, 4)

        for missing in (False, True):
            with (
                self.subTest(missing=missing),
                patch.object(
                    firebase.subprocess,
                    "run",
                    return_value=subprocess.CompletedProcess(
                        [], 1 if missing else 0, "wrong resource", ""
                    ),
                ),
                self.assertRaises(firebase.ConfigurationError),
            ):
                firebase.verify_apk_configuration(
                    "firebase-example",
                    Path("app.apk"),
                    Path("apkanalyzer"),
                    self.output,
                )

    def test_unconfigured_build_does_not_inspect_firebase_resources_or_read_configuration(
        self,
    ) -> None:
        with patch.object(firebase.subprocess, "run") as run:
            firebase.verify_apk_configuration(
                "", Path("app.apk"), Path("apkanalyzer"), self.output
            )
        run.assert_not_called()

    def test_both_release_builds_use_the_same_preparation_verification_and_cleanup(
        self,
    ) -> None:
        for filename, build, artifact, condition in (
            (
                "release-evidence.yml",
                "Build unsigned Android release artifacts",
                "eimir-release-unsigned.apk",
                "env.INCLUDE_ANDROID == 'true'",
            ),
            (
                "release-publish.yml",
                "Build and verify final signed Android artifacts",
                "eimir-release.apk",
                "inputs.include_android",
            ),
        ):
            with self.subTest(workflow=filename):
                workflow = (ROOT / ".github/workflows" / filename).read_text()
                prepare = workflow.split(
                    "- name: Prepare Firebase Android build configuration", 1
                )[1].split("- name:", 1)[0]
                verify = workflow.split(
                    "- name: Verify packaged Firebase Android configuration", 1
                )[1].split("- name:", 1)[0]
                cleanup = workflow.split(
                    "- name: Remove Firebase Android build configuration", 1
                )[1].split("- name:", 1)[0]
                self.assertIn(f"if: {condition}", prepare)
                self.assertIn(
                    "inputs.android_firebase_project_id != '' && secrets.EIMIR_ANDROID_GOOGLE_SERVICES_JSON || ''",
                    prepare,
                )
                self.assertIn(
                    "python3 scripts/android_firebase_configuration.py prepare", prepare
                )
                self.assertLess(
                    workflow.index("Prepare Firebase Android build configuration"),
                    workflow.index(build),
                )
                self.assertLess(
                    workflow.index(build),
                    workflow.index("Verify packaged Firebase Android configuration"),
                )
                self.assertIn(
                    "python3 scripts/android_firebase_configuration.py verify-apk",
                    verify,
                )
                self.assertIn(artifact, verify)
                self.assertIn("--analyzer", verify)
                self.assertIn("if: always()", cleanup)
                self.assertIn("rm -f -- android/app/google-services.json", cleanup)
                self.assertIn('"scripts/android_firebase_configuration.py"', workflow)
                self.assertIn(
                    "python3 tools/ci/test_android_firebase_configuration.py", workflow
                )

    def test_publish_explicitly_forwards_only_the_public_client_configuration(
        self,
    ) -> None:
        workflow = (ROOT / ".github/workflows/release-publish.yml").read_text()
        call = workflow.split("\n  evidence:\n", 1)[1].split("\n  preflight:\n", 1)[0]
        self.assertIn(
            "android_firebase_project_id: ${{ inputs.android_firebase_project_id }}",
            call,
        )
        self.assertIn(
            "EIMIR_ANDROID_GOOGLE_SERVICES_JSON: ${{ inputs.include_android && inputs.android_firebase_project_id != '' && secrets.EIMIR_ANDROID_GOOGLE_SERVICES_JSON || '' }}",
            call,
        )
        self.assertNotIn("secrets: inherit", call)
        evidence = (ROOT / ".github/workflows/release-evidence.yml").read_text()
        declaration = evidence.split("  workflow_call:", 1)[1].split(
            "\npermissions:", 1
        )[0]
        self.assertIn(
            "secrets:\n      EIMIR_ANDROID_GOOGLE_SERVICES_JSON:", declaration
        )
        self.assertIn(
            "github.event_name != 'pull_request' && inputs.android_firebase_project_id != ''",
            evidence,
        )


if __name__ == "__main__":
    unittest.main()
