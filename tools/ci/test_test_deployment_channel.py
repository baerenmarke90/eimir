#!/usr/bin/env python3
"""Exercise trust, partial publication and existing-store boundaries of #1351."""

from __future__ import annotations

import base64
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import test_deployment_channel as channel  # noqa: E402

SOURCE = "1" * 40
PREVIOUS = "2" * 40
BACKEND = "ghcr.io/baerenmarke90/eimir-backend@sha256:" + "3" * 64
WEB = "ghcr.io/baerenmarke90/eimir-web@sha256:" + "4" * 64


def successful_runs() -> list[dict]:
    return [
        {
            "id": index,
            "run_attempt": 1,
            "path": path,
            "event": "push",
            "head_branch": "main",
            "head_sha": SOURCE,
            "head_repository": {"full_name": channel.REPOSITORY},
            "status": "completed",
            "conclusion": "success",
        }
        for index, path in enumerate(sorted(channel.REQUIRED_WORKFLOWS), 1)
    ]


class MainCheckTest(unittest.TestCase):
    def test_required_workflows_run_for_every_main_push(self):
        for path in sorted(channel.REQUIRED_WORKFLOWS):
            with self.subTest(path=path):
                lines = (ROOT / path).read_text().splitlines()
                start = lines.index("  push:") + 1
                push = []
                for line in lines[start:]:
                    if line.strip() and len(line) - len(line.lstrip()) < 4:
                        break
                    push.append(line.strip())
                self.assertIn("branches: [main]", push)
                for key in ("paths:", "paths-ignore:", "tags:", "tags-ignore:"):
                    self.assertFalse(
                        any(line.startswith(key) for line in push),
                        f"{path} must not filter required main push checks",
                    )

    def test_only_every_exact_main_workflow_admits_a_candidate(self):
        self.assertTrue(channel.workflow_state(successful_runs(), SOURCE))
        self.assertFalse(channel.workflow_state(successful_runs()[:-1], SOURCE))

    def test_pr_fork_other_source_and_other_branch_success_cannot_substitute(self):
        changes = (
            {"event": "pull_request"},
            {"head_branch": "deploy/eimir-test"},
            {"head_sha": PREVIOUS},
            {"head_repository": {"full_name": "other/eimir"}},
            {"path": ".github/workflows/similar-name.yml"},
        )
        for change in changes:
            with self.subTest(change=change):
                runs = successful_runs()
                runs[0].update(change)
                self.assertFalse(channel.workflow_state(runs, SOURCE))

    def test_newest_attempt_and_newer_failed_run_override_old_success(self):
        for change in ({"run_attempt": 2}, {"id": 1000}):
            runs = successful_runs()
            failed = dict(runs[0], conclusion="failure", **change)
            with self.subTest(change=change), self.assertRaises(channel.ChannelError):
                channel.workflow_state([*runs, failed], SOURCE)
        runs = successful_runs()
        runs.append(dict(runs[0], run_attempt=2, status="in_progress", conclusion=None))
        self.assertFalse(channel.workflow_state(runs, SOURCE))

    def test_cancelled_skipped_and_timed_out_required_workflows_are_refused(self):
        for conclusion in ("cancelled", "skipped", "timed_out", None):
            runs = successful_runs()
            runs[0]["conclusion"] = conclusion
            with (
                self.subTest(conclusion=conclusion),
                self.assertRaises(channel.ChannelError),
            ):
                channel.workflow_state(runs, SOURCE)

    def test_superseded_source_stops_waiting_without_admitting_it(self):
        with (
            patch.object(channel, "latest_main", return_value=PREVIOUS),
            patch.object(channel, "candidate_ready") as ready,
        ):
            self.assertFalse(channel.wait_for_checks(SOURCE, 60))
            ready.assert_not_called()

    def test_missing_checks_have_a_bounded_wait(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=False),
            patch.object(channel.time, "monotonic", side_effect=[0, 0, 2]),
            patch.object(channel.time, "sleep"),
            self.assertRaisesRegex(channel.ChannelError, "Timed out"),
        ):
            channel.wait_for_checks(SOURCE, 1)

    def test_cli_rejects_a_fork_or_non_main_ref_before_any_api_access(self):
        for repository, ref in (
            ("other/eimir", "refs/heads/main"),
            (channel.REPOSITORY, "refs/heads/feature"),
        ):
            with (
                patch.dict(
                    os.environ, {"GITHUB_REPOSITORY": repository, "GITHUB_REF": ref}
                ),
                patch.object(channel, "wait_for_checks") as wait,
                patch.object(
                    sys,
                    "argv",
                    [
                        "channel",
                        "wait",
                        "--revision",
                        SOURCE,
                        "--github-output",
                        "/unused",
                    ],
                ),
            ):
                self.assertEqual(channel.main(), 1)
                wait.assert_not_called()


class EvidenceAndImageTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "sbom").mkdir()
        self.index = {
            "schemaVersion": 1,
            "sourceRevision": SOURCE,
            "android": {"included": False, "signing": "not-applicable"},
            "artifacts": [],
        }
        for role in ("backend", "web"):
            name = f"{role}-runtime"
            record = {
                "id": name,
                "path": f"{name}.image.tar",
                "sbom": f"sbom/{name}.spdx.json",
                "roles": ["api", "worker", "migrate"] if role == "backend" else ["web"],
            }
            for field, digest in (("path", "sha256"), ("sbom", "sbomSha256")):
                (self.root / record[field]).write_bytes(
                    f"fixture-{name}-{field}".encode()
                )
                record[digest] = channel.sha256(self.root / record[field])
            self.index["artifacts"].append(record)
        self.write_index()

    def write_index(self):
        (self.root / "evidence-index.json").write_text(json.dumps(self.index))

    def test_complete_server_only_evidence_is_required(self):
        self.assertEqual(
            set(channel.evidence_records(self.root, SOURCE)),
            {"backend-runtime", "web-runtime"},
        )
        self.index["artifacts"].pop()
        self.write_index()
        with self.assertRaises(channel.ChannelError):
            channel.evidence_records(self.root, SOURCE)

    def test_corrupt_archive_or_sbom_fails_before_registry_use(self):
        for field in ("path", "sbom"):
            record = self.index["artifacts"][0]
            target = self.root / record[field]
            original = target.read_bytes()
            target.write_bytes(b"changed")
            with self.subTest(field=field), self.assertRaises(channel.ChannelError):
                channel.evidence_records(self.root, SOURCE)
            target.write_bytes(original)

    def test_other_source_android_path_traversal_or_duplicate_role_is_refused(self):
        original = copy.deepcopy(self.index)
        for change in ("source", "android", "path", "duplicate"):
            self.index = copy.deepcopy(original)
            if change == "source":
                self.index["sourceRevision"] = PREVIOUS
            if change == "android":
                self.index["android"]["included"] = True
            if change == "path":
                self.index["artifacts"][0]["path"] = "../private.env"
            if change == "duplicate":
                self.index["artifacts"].append(self.index["artifacts"][0])
            self.write_index()
            with self.subTest(change=change), self.assertRaises(channel.ChannelError):
                channel.evidence_records(self.root, SOURCE)

    def inspect(self):
        return {
            "Id": "sha256:" + "a" * 64,
            "Os": "linux",
            "Architecture": "amd64",
            "Config": {
                "Labels": {
                    "org.opencontainers.image.revision": SOURCE,
                    "org.opencontainers.image.version": "0.0.0-test.1",
                    "org.opencontainers.image.source": "https://github.com/"
                    + channel.REPOSITORY,
                }
            },
        }

    def image_run(self, arguments, **kwargs):
        if arguments[1:3] == ["image", "inspect"]:
            return json.dumps([self.inspect()])
        if arguments[1] == "push":
            return "test: digest: sha256:" + "b" * 64 + " size: 1000\n"
        if arguments[1:3] == ["manifest", "inspect"]:
            return json.dumps(
                {"config": {"digest": self.inspect()["Id"]}, "layers": []}
            )
        return ""

    def test_registry_digest_and_pull_back_are_verified(self):
        with patch.object(channel, "run", side_effect=self.image_run) as run:
            pinned = channel.publish_image(
                self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
            )
            self.assertEqual(
                pinned, "ghcr.io/baerenmarke90/eimir-backend@sha256:" + "b" * 64
            )
            self.assertTrue(
                any(
                    call.args[0][:2] == ["docker", "pull"]
                    for call in run.call_args_list
                )
            )

    def test_wrong_image_source_fails_before_push(self):
        inspect = self.inspect()
        inspect["Config"]["Labels"]["org.opencontainers.image.revision"] = PREVIOUS
        with (
            patch.object(
                channel, "run", side_effect=["", json.dumps([inspect])]
            ) as run,
            self.assertRaises(channel.ChannelError),
        ):
            channel.publish_image(
                self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
            )
        self.assertEqual(run.call_count, 2)

    def test_registry_index_or_different_config_is_refused(self):
        for manifest in (
            {"manifests": []},
            {"config": {"digest": "sha256:" + "c" * 64}},
        ):

            def changed(arguments, *, manifest=manifest, **kwargs):
                if arguments[1:3] == ["manifest", "inspect"]:
                    return json.dumps(manifest)
                return self.image_run(arguments, **kwargs)

            with (
                patch.object(channel, "run", side_effect=changed),
                self.subTest(manifest=manifest),
                self.assertRaises(channel.ChannelError),
            ):
                channel.publish_image(
                    self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
                )

    def test_partial_publication_never_advances_the_branch(self):
        with (
            patch.dict(os.environ, {"GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"}),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(
                channel,
                "publish_image",
                side_effect=[BACKEND, channel.ChannelError("web failed")],
            ),
            patch.object(channel, "advance_channel") as advance,
            self.assertRaises(channel.ChannelError),
        ):
            channel.publish(SOURCE, self.root, self.root / "out")
        advance.assert_not_called()


class BranchPromotionTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.files = {
            "compose.yaml": "{}",
            "channel.json": "{}",
            "README.md": "generated",
        }
        self.current_source = PREVIOUS

    def api(self, endpoint, *, payload=None, **kwargs):
        self.calls.append((endpoint, payload, kwargs))
        if "/git/ref/heads/" in endpoint:
            return {"object": {"sha": PREVIOUS}}
        if "/contents/" in endpoint:
            return {
                "content": base64.b64encode(
                    json.dumps(
                        {
                            "schemaVersion": 1,
                            "kind": channel.CHANNEL_KIND,
                            "sourceRevision": self.current_source,
                        }
                    ).encode()
                ).decode()
            }
        return {"sha": "a" * 40}

    def test_existing_channel_moves_once_after_all_files_are_in_one_commit(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "gh_api", side_effect=self.api),
        ):
            self.assertTrue(channel.advance_channel(self.files, SOURCE))
        endpoint, payload, options = self.calls[-1]
        self.assertTrue(endpoint.endswith("/git/refs/heads/deploy/eimir-test"))
        self.assertEqual(options["method"], "PATCH")
        self.assertIs(payload["force"], False)
        tree = next(
            payload
            for endpoint, payload, _ in self.calls
            if endpoint.endswith("/git/trees")
        )
        self.assertEqual({row["path"] for row in tree["tree"]}, set(self.files))

    def test_stale_main_or_failed_checks_never_write_a_ref(self):
        for stale in (True, False):
            with (
                patch.object(
                    channel, "latest_main", return_value=PREVIOUS if stale else SOURCE
                ),
                patch.object(channel, "candidate_ready", return_value=False),
                patch.object(channel, "gh_api") as api,
                self.assertRaises(channel.ChannelError),
            ):
                channel.advance_channel(self.files, SOURCE)
            api.assert_not_called()

    def test_main_advancing_during_commit_creation_keeps_old_branch(self):
        with (
            patch.object(channel, "latest_main", side_effect=[SOURCE, PREVIOUS]),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "gh_api", side_effect=self.api),
            self.assertRaises(channel.ChannelError),
        ):
            channel.advance_channel(self.files, SOURCE)
        self.assertFalse(any("/git/refs" in endpoint for endpoint, _, _ in self.calls))

    def test_same_source_is_idempotent_and_local_env_cannot_enter_tree(self):
        self.current_source = SOURCE
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "gh_api", side_effect=self.api),
        ):
            self.assertFalse(channel.advance_channel(self.files, SOURCE))
        self.assertFalse(any(payload for _, payload, _ in self.calls))
        with self.assertRaises(channel.ChannelError):
            channel.advance_channel(dict(self.files, **{".env": "private"}), SOURCE)

    def test_network_failure_does_not_masquerade_as_a_missing_branch(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "gh_api", side_effect=channel.GitHubError("network")),
            self.assertRaises(channel.GitHubError),
        ):
            channel.advance_channel(self.files, SOURCE)

    def test_checks_becoming_pending_during_promotion_keep_the_old_branch(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", side_effect=[True, False]),
            patch.object(channel, "gh_api", side_effect=self.api),
            self.assertRaises(channel.ChannelError),
        ):
            channel.advance_channel(self.files, SOURCE)
        self.assertFalse(any("/git/refs" in endpoint for endpoint, _, _ in self.calls))

    def test_first_publication_creates_an_orphan_channel_after_a_real_404(self):
        def api(endpoint, **kwargs):
            if "/git/ref/heads/" in endpoint:
                raise channel.GitHubError(endpoint, missing=True)
            return self.api(endpoint, **kwargs)

        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "gh_api", side_effect=api),
        ):
            self.assertTrue(channel.advance_channel(self.files, SOURCE))
        commits = [
            payload
            for endpoint, payload, _ in self.calls
            if endpoint.endswith("/git/commits")
        ]
        self.assertEqual(commits[0]["parents"], [])
        self.assertEqual(self.calls[-1][1]["ref"], "refs/heads/deploy/eimir-test")


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required")
class CanonicalWiringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.canonical = channel.canonical_compose()

    def test_operator_process_values_cannot_be_resolved_into_the_git_export(self):
        with patch.dict(
            os.environ,
            {
                "EIMIR_ENCRYPTION_KEYS": "private-value-must-not-enter-git",
                "SBS_SMTP_PASSWORD": "private-value-must-not-enter-git",
            },
        ):
            resolved = channel.canonical_compose()
        self.assertNotIn("private-value-must-not-enter-git", json.dumps(resolved))

    def test_export_keeps_canonical_commands_readiness_and_migration_dependencies(self):
        exported = channel.export_compose(self.canonical, BACKEND, WEB)
        for name in channel.CLOUD_SERVICES:
            for key in ("command", "healthcheck", "depends_on", "restart"):
                self.assertEqual(
                    exported["services"][name].get(key),
                    self.canonical["services"][name].get(key),
                )
        self.assertEqual(set(exported["services"]), set(channel.CLOUD_SERVICES))
        for name in channel.CLOUD_SERVICES:
            service = exported["services"][name]
            self.assertNotIn("build", service)
            self.assertNotIn("ports", service)
            self.assertEqual(service["pull_policy"], "always")

    def test_both_stores_and_database_are_existing_external_resources(self):
        exported = channel.export_compose(self.canonical, BACKEND, WEB)
        self.assertEqual(exported["name"], "eimir-test")
        for name, volume in exported["volumes"].items():
            self.assertEqual(volume, {"external": True, "name": "eimir-test_" + name})
        self.assertEqual(
            exported["networks"]["app"], {"external": True, "name": "eimir-test-data"}
        )
        self.assertIn(
            "@eimir-test-postgres:5432/sidebyside",
            exported["services"]["cloud-migrate"]["environment"]["EIMIR_DATABASE_URL"],
        )
        for name in ("cloud-api", "cloud-worker"):
            env = exported["services"][name]["environment"]
            self.assertEqual(env["EIMIR_ENVIRONMENT"], "production")
            self.assertEqual(env["EIMIR_DEPLOYMENT"], "cloud")
            self.assertEqual(env["EIMIR_DEMO_MODE"], "false")
            self.assertEqual(env["EIMIR_DEMO_MODE_RESET_TIMER"], "false")
            for key in (
                "EIMIR_ENCRYPTION_KEYS",
                "EIMIR_CURSOR_SIGNING_KEY",
                "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
            ):
                self.assertEqual(env[key], channel.required(key))

    def test_source_builds_extra_processes_and_mutable_or_mixed_images_fail_closed(
        self,
    ):
        for mutation in ("build", "service", "ports"):
            config = copy.deepcopy(self.canonical)
            if mutation == "build":
                config["services"]["cloud-api"]["build"] = "."
            if mutation == "service":
                config["services"]["bootstrap"] = {}
            if mutation == "ports":
                config["services"]["cloud-api"]["ports"] = ["8000:8000"]
            with (
                self.subTest(mutation=mutation),
                self.assertRaises(channel.ChannelError),
            ):
                channel.export_compose(config, BACKEND, WEB)
        for backend, web in (
            ("eimir-backend:latest", WEB),
            (BACKEND, "eimir-web:main"),
        ):
            with self.assertRaises(ValueError):
                channel.export_compose(self.canonical, backend, web)

    def test_generated_json_compose_resolves_only_with_required_local_settings(self):
        config = channel.export_compose(self.canonical, BACKEND, WEB)
        needed = set()
        import re

        for key in re.findall(r"\$\{([A-Z_]+):\?", json.dumps(config)):
            needed.add(key)
        with tempfile.TemporaryDirectory() as temporary:
            compose = Path(temporary) / "compose.yaml"
            compose.write_text(json.dumps(config))
            env = {key: "fixture" for key in needed}
            command = [
                "docker",
                "compose",
                "-f",
                str(compose),
                "config",
                "--format",
                "json",
            ]
            result = subprocess.run(
                command, env=dict(os.environ, **env), text=True, capture_output=True
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            resolved = json.loads(result.stdout)
            self.assertEqual(
                resolved["services"]["cloud-api"]["environment"]["FORWARDED_ALLOW_IPS"],
                "fixture",
            )
            del env["EIMIR_ACCOUNT_DELETION_INSTANCE_ID"]
            result = subprocess.run(
                command,
                env={
                    key: value
                    for key, value in dict(os.environ, **env).items()
                    if key != "EIMIR_ACCOUNT_DELETION_INSTANCE_ID"
                },
                text=True,
                capture_output=True,
            )
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
