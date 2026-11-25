#!/usr/bin/env python3
"""Exercise trust, partial publication and existing-store boundaries of #1351."""

from __future__ import annotations

import base64
import copy
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import MagicMock, patch

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
            "event": channel.FULL_REGRESSION_EVENT,
            "head_branch": "main",
            "head_sha": SOURCE,
            "head_repository": {"full_name": channel.DEFAULT_REPOSITORY},
            "status": "completed",
            "conclusion": "success",
        }
        for index, path in enumerate(sorted(channel.REQUIRED_WORKFLOWS), 1)
    ]


def completion_event() -> dict:
    return {"action": "completed", "workflow_run": successful_runs()[0]}


class FullRegressionGateTest(unittest.TestCase):
    def test_green_full_regression_admits_the_release(self):
        with patch.object(channel, "candidate_ready", return_value=True), patch.object(channel, "run") as command:
            channel.require_full_regression(SOURCE, dispatch=True)
        command.assert_not_called()

    def test_missing_regression_on_current_main_starts_the_dispatcher_and_refuses(self):
        with (
            patch.object(channel, "candidate_ready", return_value=False),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "run") as command,
            self.assertRaises(channel.ChannelError),
        ):
            channel.require_full_regression(SOURCE, dispatch=True)
        command.assert_called_once_with(
            ["gh", "workflow", "run", channel.FULL_REGRESSION_DISPATCHER, "--repo", channel.DEFAULT_REPOSITORY, "--ref", "main"]
        )

    def test_missing_regression_on_an_older_revision_refuses_without_dispatch(self):
        with (
            patch.object(channel, "candidate_ready", return_value=False),
            patch.object(channel, "latest_main", return_value=PREVIOUS),
            patch.object(channel, "run") as command,
            self.assertRaises(channel.ChannelError),
        ):
            channel.require_full_regression(SOURCE, dispatch=True)
        command.assert_not_called()

    def test_failed_regression_refuses(self):
        with (
            patch.object(channel, "candidate_ready", side_effect=channel.ChannelError("failed")),
            self.assertRaises(channel.ChannelError),
        ):
            channel.require_full_regression(SOURCE, dispatch=True)

    def test_dispatcher_exists(self):
        self.assertTrue((ROOT / ".github/workflows" / channel.FULL_REGRESSION_DISPATCHER).is_file())


class CompletionAdmissionTest(unittest.TestCase):
    def test_every_required_main_completion_can_retry_the_exact_source(self):
        for completed in successful_runs():
            with self.subTest(path=completed["path"]):
                self.assertTrue(
                    channel.completion_matches_source(
                        {"action": "completed", "workflow_run": completed}, SOURCE
                    )
                )

    def test_untrusted_or_unrelated_completions_never_query_github(self):
        for mutation in (
            {"event": "pull_request"},
            # Pushes to main no longer run the required workflows (#2096).
            {"event": "push"},
            {"event": "schedule"},
            {"head_branch": "feature"},
            {"head_sha": PREVIOUS},
            {"head_repository": {"full_name": "other/eimir"}},
            {"head_repository": None},
            {"head_repository": "not-a-repository"},
            {"path": ".github/workflows/same-name.yml"},
            {"status": "in_progress"},
            {"conclusion": "failure"},
            {"conclusion": "cancelled"},
            {"conclusion": "skipped"},
        ):
            event = completion_event()
            event["workflow_run"].update(mutation)
            with self.subTest(mutation=mutation), patch.object(channel, "gh_api") as api:
                self.assertFalse(channel.check_for_publication(SOURCE, "workflow_run", event))
                api.assert_not_called()
        for event in ({}, [], {"action": "requested", "workflow_run": successful_runs()[0]}):
            with self.subTest(event=event), patch.object(channel, "gh_api") as api:
                self.assertFalse(channel.check_for_publication(SOURCE, "workflow_run", event))
                api.assert_not_called()

    def test_missing_checks_return_immediately_without_polling(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=False) as ready,
            patch.object(channel, "channel_already_selected") as selected,
            patch.object(channel.time, "sleep") as sleep,
        ):
            self.assertFalse(channel.check_for_publication(SOURCE, "workflow_run", completion_event()))
            ready.assert_called_once_with(SOURCE)
            selected.assert_not_called()
            sleep.assert_not_called()

    def test_current_checked_source_is_admitted_once_and_manual_retry_is_available(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "channel_already_selected", side_effect=[False, True, False]),
        ):
            self.assertTrue(channel.check_for_publication(SOURCE, "workflow_run", completion_event()))
            self.assertFalse(channel.check_for_publication(SOURCE, "workflow_run", completion_event()))
            self.assertTrue(channel.check_for_publication(SOURCE, "workflow_dispatch", {}))

    def test_superseded_source_and_failed_checks_cannot_admit_a_build(self):
        with (
            patch.object(channel, "latest_main", return_value=PREVIOUS),
            patch.object(channel, "candidate_ready") as ready,
        ):
            self.assertFalse(channel.check_for_publication(SOURCE, "workflow_run", completion_event()))
            ready.assert_not_called()
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", side_effect=channel.ChannelError("failed checks")),
            self.assertRaises(channel.ChannelError),
        ):
            channel.check_for_publication(SOURCE, "workflow_run", completion_event())

    def test_every_merge_admits_the_current_main_without_full_regression(self):
        # #2096: the private test channel follows every merge to main.
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready") as ready,
            patch.object(channel, "channel_already_selected", side_effect=[False, True]),
        ):
            self.assertTrue(channel.check_for_publication(SOURCE, "push", {}))
            self.assertFalse(channel.check_for_publication(SOURCE, "push", {}))
            ready.assert_not_called()

    def test_merge_superseded_by_a_newer_merge_is_not_built(self):
        with (
            patch.object(channel, "latest_main", return_value=PREVIOUS),
            patch.object(channel, "candidate_ready") as ready,
            patch.object(channel, "channel_already_selected") as selected,
        ):
            self.assertFalse(channel.check_for_publication(SOURCE, "push", {}))
            ready.assert_not_called()
            selected.assert_not_called()

    def test_only_the_fast_lane_skips_the_full_regression(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=False) as ready,
        ):
            self.assertTrue(channel.source_admitted(SOURCE, full_regression=False))
            ready.assert_not_called()
            self.assertFalse(channel.source_admitted(SOURCE, full_regression=True))
            ready.assert_called_once_with(SOURCE)
        with patch.object(channel, "latest_main", return_value=PREVIOUS):
            self.assertFalse(channel.source_admitted(SOURCE, full_regression=False))

    def test_other_trigger_types_cannot_admit_a_build(self):
        for event_name in ("pull_request", "schedule", ""):
            with (
                self.subTest(event_name=event_name),
                patch.object(channel, "gh_api") as api,
                self.assertRaises(channel.ChannelError),
            ):
                channel.check_for_publication(SOURCE, event_name, {})
            api.assert_not_called()

    def test_selected_channel_requires_owned_metadata_and_real_missing_branch(self):
        identity = {"kind": channel.CHANNEL_KIND, "schemaVersion": 1, "sourceRevision": SOURCE}
        for current, expected in ((SOURCE, True), (PREVIOUS, False)):
            identity["sourceRevision"] = current
            with patch.object(channel, "gh_api", side_effect=[
                {"object": {"sha": PREVIOUS}},
                {"content": base64.b64encode(json.dumps(identity).encode()).decode()},
            ]):
                self.assertEqual(channel.channel_already_selected(SOURCE), expected)
        with patch.object(channel, "gh_api", side_effect=channel.GitHubError("missing", missing=True)):
            self.assertFalse(channel.channel_already_selected(SOURCE))
        with (
            patch.object(channel, "gh_api", side_effect=channel.GitHubError("network")),
            self.assertRaises(channel.GitHubError),
        ):
            channel.channel_already_selected(SOURCE)
        identity["kind"] = "unowned"
        with (
            patch.object(channel, "gh_api", side_effect=[
                {"object": {"sha": PREVIOUS}},
                {"content": base64.b64encode(json.dumps(identity).encode()).decode()},
            ]),
            self.assertRaises(channel.ChannelError),
        ):
            channel.channel_already_selected(SOURCE)

    def test_cli_reads_completion_payload_and_writes_readiness(self):
        with tempfile.TemporaryDirectory() as temporary:
            event_path = Path(temporary) / "event.json"
            output = Path(temporary) / "output"
            event_path.write_text(json.dumps(completion_event()))
            environment = {
                "GITHUB_REPOSITORY": channel.DEFAULT_REPOSITORY,
                "GITHUB_REF": "refs/heads/main",
                "GITHUB_EVENT_NAME": "workflow_run",
                "GITHUB_EVENT_PATH": str(event_path),
            }
            with (
                patch.dict(os.environ, environment),
                patch.object(channel, "latest_main", return_value=SOURCE),
                patch.object(channel, "candidate_ready", return_value=True),
                patch.object(channel, "channel_already_selected", return_value=False),
                patch.object(sys, "argv", ["channel", "check", "--revision", SOURCE, "--github-output", str(output)]),
            ):
                self.assertEqual(channel.main(), 0)
            self.assertEqual(output.read_text(), "ready=true\n")


class MainCheckTest(unittest.TestCase):
    def test_required_workflows_are_dispatched_by_the_full_regression(self):
        # Pushes to main start no workflows (#2096). Every required workflow is
        # dispatched unfiltered by the nightly regression instead.
        dispatcher = (ROOT / ".github/workflows" / channel.FULL_REGRESSION_DISPATCHER).read_text()
        for path in sorted(channel.REQUIRED_WORKFLOWS):
            with self.subTest(path=path):
                text = (ROOT / path).read_text()
                self.assertIn("\n  workflow_dispatch:", text)
                self.assertNotIn("\n  push:", text)
                self.assertIn(f"\n            {Path(path).name}\n", dispatcher)

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
            (channel.DEFAULT_REPOSITORY, "refs/heads/feature"),
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

    def write_image_archive(self, path, *, legacy=False, config=None, tag=None):
        if config is None:
            config = json.dumps(self.inspect()["Config"]).encode()
        digest = hashlib.sha256(config).hexdigest()
        config_path = digest + ".json" if legacy else "blobs/sha256/" + digest
        manifest = [{"Config": config_path, "RepoTags": [tag] if tag else None}]
        with tarfile.open(path, mode="w") as archive:
            for name, content in (
                ("manifest.json", json.dumps(manifest).encode()),
                (config_path, config),
            ):
                member = tarfile.TarInfo(name)
                member.size = len(content)
                archive.addfile(member, io.BytesIO(content))
        return "sha256:" + digest

    def prepare_image_archive(self, *, legacy=False):
        self.config_digest = self.write_image_archive(
            self.root / self.index["artifacts"][0]["path"],
            legacy=legacy,
            tag=f"eimir-backend:evidence-{SOURCE}",
        )
        self.image_id = self.config_digest if legacy else "sha256:" + "a" * 64

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

    def test_media_evidence_is_separately_bound_and_tampering_or_wrong_roles_fail_closed(self):
        record = {
            "id": "media-runtime", "path": "media-runtime.image.tar",
            "sbom": "sbom/media-runtime.spdx.json", "roles": ["video-worker"],
        }
        for field, digest in (("path", "sha256"), ("sbom", "sbomSha256")):
            (self.root / record[field]).write_bytes(b"restricted-worker-evidence")
            record[digest] = channel.sha256(self.root / record[field])
        self.index["artifacts"].append(record)
        self.write_index()
        self.assertEqual(set(channel.evidence_records(self.root, SOURCE)), {"backend-runtime", "web-runtime", "media-runtime"})
        (self.root / record["path"]).write_bytes(b"different-worker")
        with self.assertRaises(channel.ChannelError):
            channel.evidence_records(self.root, SOURCE)
        (self.root / record["path"]).write_bytes(b"restricted-worker-evidence")
        record["roles"] = ["worker"]
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
            "Id": getattr(self, "image_id", "sha256:" + "a" * 64),
            "Os": "linux",
            "Architecture": "amd64",
            "Config": {
                "Labels": {
                    "org.opencontainers.image.revision": SOURCE,
                    "org.opencontainers.image.version": "0.0.0-test.1",
                    "org.opencontainers.image.source": "https://github.com/"
                    + channel.DEFAULT_REPOSITORY,
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
                {
                    "schemaVersion": 2,
                    "mediaType": "application/vnd.oci.image.manifest.v1+json",
                    "config": {"digest": self.config_digest},
                    "layers": [],
                }
            )
        if arguments[1:3] == ["image", "save"]:
            self.write_image_archive(Path(arguments[4]))
        return ""

    def test_registry_digest_and_pull_back_are_verified(self):
        for legacy in (False, True):
            self.prepare_image_archive(legacy=legacy)
            with (
                self.subTest(legacy=legacy),
                patch.object(channel, "run", side_effect=self.image_run) as run,
            ):
                pinned = channel.publish_image(
                    self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
                )
                self.assertEqual(
                    pinned, "ghcr.io/baerenmarke90/eimir-cloud-backend@sha256:" + "b" * 64
                )
                calls = [call.args[0] for call in run.call_args_list]
                self.assertIn(["docker", "pull", pinned], calls)
                self.assertTrue(
                    any(
                        args[:4] == ["docker", "push", "--platform", "linux/amd64"]
                        for args in calls
                    )
                )
                self.assertTrue(
                    any(args[:3] == ["docker", "image", "save"] for args in calls)
                )
                # Containerd IDs can identify a manifest/index instead of config.
                self.assertEqual(self.inspect()["Id"] == self.config_digest, legacy)

    def test_wrong_image_source_fails_before_push(self):
        self.prepare_image_archive()
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
        self.prepare_image_archive()
        for manifest in (
            [],
            {"manifests": []},
            {
                "schemaVersion": 2,
                "mediaType": "application/vnd.oci.image.manifest.v1+json",
                "config": {"digest": "sha256:" + "c" * 64},
                "layers": [],
            },
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

    def test_different_pull_back_config_is_refused(self):
        self.prepare_image_archive()

        def changed(arguments, **kwargs):
            if arguments[1:3] == ["image", "save"]:
                self.write_image_archive(Path(arguments[4]), config=b"different config")
                return ""
            return self.image_run(arguments, **kwargs)

        with (
            patch.object(channel, "run", side_effect=changed),
            self.assertRaisesRegex(channel.ChannelError, "pull-back differs"),
        ):
            channel.publish_image(
                self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
            )

    def test_ambiguous_corrupt_linked_or_unexpected_config_is_refused(self):
        config = b"image config"
        digest = hashlib.sha256(config).hexdigest()
        name = "blobs/sha256/" + digest
        base = {"Config": name, "RepoTags": [f"eimir-backend:evidence-{SOURCE}"]}
        for change in ("multiple", "corrupt", "link", "duplicate", "traversal", "tag"):
            record = copy.deepcopy(base)
            if change == "traversal":
                record["Config"] = "../" + name
            if change == "tag":
                record["RepoTags"] = ["unrelated:image"]
            manifest = [record, record] if change == "multiple" else [record]
            archive_path = self.root / self.index["artifacts"][0]["path"]
            with tarfile.open(archive_path, mode="w") as archive:
                for member_name, content in (
                    ("manifest.json", json.dumps(manifest).encode()),
                    (name, b"wrong bytes" if change == "corrupt" else config),
                ):
                    member = tarfile.TarInfo(member_name)
                    member.size = len(content)
                    if change == "link" and member_name == name:
                        member.type = tarfile.SYMTYPE
                        member.linkname = "/private"
                    archive.addfile(member, io.BytesIO(content))
                    if change == "duplicate" and member_name == name:
                        archive.addfile(member, io.BytesIO(content))
            with (
                self.subTest(change=change),
                patch.object(channel, "run") as run,
                self.assertRaises(channel.ChannelError),
            ):
                channel.publish_image(
                    self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
                )
            run.assert_not_called()

    def test_missing_media_evidence_refuses_private_publication_before_registry_use(
        self,
    ):
        with (
            patch.dict(os.environ, {"GITHUB_RUN_ID": "1", "GITHUB_RUN_ATTEMPT": "1"}),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(channel, "publish_image") as publish,
            self.assertRaisesRegex(channel.ChannelError, "restricted-worker evidence"),
        ):
            channel.publish(SOURCE, self.root, self.root / "out")
        publish.assert_not_called()


    def test_partial_publication_never_advances_the_branch(self):
        record = {
            "id": "media-runtime",
            "path": "media-runtime.image.tar",
            "sbom": "sbom/media-runtime.spdx.json",
            "roles": ["video-worker"],
        }
        for field, digest in (("path", "sha256"), ("sbom", "sbomSha256")):
            (self.root / record[field]).write_bytes(b"restricted-worker-evidence")
            record[digest] = channel.sha256(self.root / record[field])
        self.index["artifacts"].append(record)
        self.write_index()
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

    def channel_environment(self, **values):
        """Run with only the given channel variables set, independent of the host."""
        own = {channel.PACKAGE_PREFIX_ENV, channel.PROMOTE_ENV, "GITHUB_STEP_SUMMARY"}
        environment = {key: value for key, value in os.environ.items() if key not in own}
        environment.update(GITHUB_RUN_ID="1", GITHUB_RUN_ATTEMPT="1", **values)
        return patch.dict(os.environ, environment, clear=True)

    def add_media_record(self):
        record = {
            "id": "media-runtime",
            "path": "media-runtime.image.tar",
            "sbom": "sbom/media-runtime.spdx.json",
            "roles": ["video-worker"],
        }
        for field, digest in (("path", "sha256"), ("sbom", "sbomSha256")):
            (self.root / record[field]).write_bytes(b"restricted-worker-evidence")
            record[digest] = channel.sha256(self.root / record[field])
        self.index["artifacts"].append(record)
        self.write_index()

    def publish_staged_pair(self, anonymous_status=403, **values):
        """Publish with every registry and GitHub write replaced by a recorder."""
        self.add_media_record()
        media = "ghcr.io/baerenmarke90/eimir-media@sha256:" + "5" * 64
        with (
            self.channel_environment(**values),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(
                channel, "publish_image", side_effect=[BACKEND, WEB, media]
            ) as publish,
            patch.object(
                channel, "anonymous_manifest_status", return_value=anonymous_status
            ),
            patch.object(channel, "canonical_compose", return_value={}),
            patch.object(channel, "export_compose", return_value={"services": {}}),
            patch.object(channel, "advance_channel", return_value=True) as advance,
        ):
            channel.publish(SOURCE, self.root, self.root / "out")
        return publish, advance, media

    def test_default_package_names_are_the_private_cloud_packages(self):
        for values in ({}, {channel.PACKAGE_PREFIX_ENV: ""}, {channel.PACKAGE_PREFIX_ENV: "  "}):
            with self.subTest(values=values), self.channel_environment(**values):
                for role in ("backend", "web", "media"):
                    self.assertEqual(
                        channel.package_repository(role),
                        f"ghcr.io/baerenmarke90/eimir-cloud-{role}",
                    )

    def test_legacy_prefix_must_be_selected_explicitly_for_the_old_public_names(self):
        with self.channel_environment(**{channel.PACKAGE_PREFIX_ENV: "eimir"}):
            for role in ("backend", "web", "media"):
                self.assertEqual(
                    channel.package_repository(role),
                    f"ghcr.io/baerenmarke90/eimir-{role}",
                )

    def test_invalid_package_prefixes_are_refused(self):
        for value in (
            "other",
            "eimir-",
            "eimir--cloud",
            "Eimir-cloud",
            "eimir_cloud",
            "eimir/cloud",
            "eimir-cloud:latest",
            "eimir-cloud ghcr.io/other",
            "../eimir",
            "ghcr.io/baerenmarke90/eimir-cloud",
        ):
            with (
                self.subTest(value=value),
                self.channel_environment(**{channel.PACKAGE_PREFIX_ENV: value}),
                self.assertRaises(channel.ChannelError),
            ):
                channel.package_prefix()

    def test_promote_setting_accepts_only_empty_true_or_false(self):
        for value, expected in (("", True), ("true", True), ("false", False)):
            with self.subTest(value=value), self.channel_environment(
                **{channel.PROMOTE_ENV: value}
            ):
                self.assertIs(channel.promote_enabled(), expected)
        with self.channel_environment():
            self.assertIs(channel.promote_enabled(), True)
        for value in ("False", "FALSE", "0", "no", "yes", "stage"):
            with (
                self.subTest(value=value),
                self.channel_environment(**{channel.PROMOTE_ENV: value}),
                self.assertRaises(channel.ChannelError),
            ):
                channel.promote_enabled()

    def test_registry_push_targets_the_selected_package(self):
        self.prepare_image_archive()
        for values, package in (
            ({}, "eimir-cloud-backend"),
            ({channel.PACKAGE_PREFIX_ENV: "eimir"}, "eimir-backend"),
        ):
            with (
                self.subTest(package=package),
                self.channel_environment(**values),
                patch.object(channel, "run", side_effect=self.image_run) as run,
            ):
                pinned = channel.publish_image(
                    self.root, self.index["artifacts"][0], SOURCE, "0.0.0-test.1", "1-1"
                )
            self.assertEqual(
                pinned, f"ghcr.io/baerenmarke90/{package}@sha256:" + "b" * 64
            )
            calls = [call.args[0] for call in run.call_args_list]
            self.assertIn(
                [
                    "docker",
                    "tag",
                    f"eimir-backend:evidence-{SOURCE}",
                    f"ghcr.io/baerenmarke90/{package}:test-{SOURCE}-1-1",
                ],
                calls,
            )
            # The local evidence tag keeps its historical name; only the registry target moves.
            self.assertEqual(
                any("ghcr.io/baerenmarke90/eimir-backend" in " ".join(c) for c in calls),
                package == "eimir-backend",
            )

    def test_anonymous_manifest_status_reports_what_an_anonymous_client_sees(self):
        reference = "ghcr.io/baerenmarke90/eimir-cloud-web@sha256:" + "5" * 64
        token = json.dumps({"token": "anonymous-pull-token"}).encode()
        for name, responses, expected, requests in (
            ("public", [(200, token), (200, b"{}")], 200, 2),
            ("private manifest", [(200, token), (403, b"")], 403, 2),
            ("missing manifest", [(200, token), (404, b"")], 404, 2),
            ("no anonymous token", [(403, b"")], 403, 1),
            ("empty token body", [(200, b"{}")], 401, 1),
            ("bad token body", [(200, b"not json")], 401, 1),
        ):
            with (
                self.subTest(name=name),
                patch.object(channel, "anonymous_request", side_effect=responses) as request,
            ):
                self.assertEqual(channel.anonymous_manifest_status(reference), expected)
            self.assertEqual(request.call_count, requests)
        # The manifest request carries only the anonymous bearer token.
        with patch.object(
            channel, "anonymous_request", side_effect=[(200, token), (200, b"{}")]
        ) as request:
            channel.anonymous_manifest_status(reference)
        url, headers = request.call_args_list[1].args
        self.assertEqual(
            url,
            "https://ghcr.io/v2/baerenmarke90/eimir-cloud-web/manifests/sha256:" + "5" * 64,
        )
        self.assertEqual(headers["Authorization"], "Bearer anonymous-pull-token")

    def test_anonymous_check_rejects_unexpected_references_before_any_request(self):
        for reference in (
            "ghcr.io/baerenmarke90/eimir-cloud-web:latest",
            "ghcr.io/baerenmarke90/eimir-cloud-web@sha256:" + "5" * 63,
            "example.com/baerenmarke90/eimir-cloud-web@sha256:" + "5" * 64,
            "ghcr.io/baerenmarke90/eimir-cloud-web@sha256:" + "5" * 64 + "?x=1",
        ):
            with (
                self.subTest(reference=reference),
                patch.object(channel, "anonymous_request") as request,
                self.assertRaises(channel.ChannelError),
            ):
                channel.anonymous_manifest_status(reference)
            request.assert_not_called()

    def test_anonymous_request_retries_server_errors_and_fails_closed(self):
        ok = MagicMock()
        ok.__enter__.return_value.status = 200
        ok.__enter__.return_value.read.return_value = b"{}"
        unavailable = urllib.error.HTTPError("u", 503, "unavailable", None, None)
        with (
            patch.object(channel.time, "sleep") as sleep,
            patch.object(channel.urllib.request, "urlopen", side_effect=[unavailable, ok]),
        ):
            self.assertEqual(channel.anonymous_request("https://ghcr.io/x"), (200, b"{}"))
        sleep.assert_called_once()
        denied = urllib.error.HTTPError("u", 403, "denied", None, None)
        with patch.object(channel.urllib.request, "urlopen", side_effect=denied) as opened:
            self.assertEqual(channel.anonymous_request("https://ghcr.io/x"), (403, b""))
        opened.assert_called_once()
        for failure in (urllib.error.URLError("offline"), TimeoutError(), unavailable):
            with (
                self.subTest(failure=type(failure).__name__),
                patch.object(channel.time, "sleep"),
                patch.object(channel.urllib.request, "urlopen", side_effect=failure),
                self.assertRaisesRegex(channel.ChannelError, "unreachable"),
            ):
                channel.anonymous_request("https://ghcr.io/x")

    def test_private_packages_pass_and_public_or_unclear_ones_fail_closed(self):
        images = {"backend": BACKEND, "web": WEB}
        for status in (401, 403, 404):
            with (
                self.subTest(status=status),
                self.channel_environment(),
                patch.object(channel, "anonymous_manifest_status", return_value=status),
            ):
                channel.verify_packages_private(images)
        with (
            self.channel_environment(),
            patch.object(channel, "anonymous_manifest_status", side_effect=[200, 200]),
            self.assertRaises(channel.ChannelError) as raised,
        ):
            channel.verify_packages_private(images)
        message = str(raised.exception)
        self.assertIn("ghcr.io/baerenmarke90/eimir-backend", message)
        self.assertIn("ghcr.io/baerenmarke90/eimir-web", message)
        self.assertIn("Private", message)
        self.assertNotIn("sha256", message)
        for status in (0, 202, 301, 429, 500):
            with (
                self.subTest(status=status),
                self.channel_environment(),
                patch.object(channel, "anonymous_manifest_status", return_value=status),
                self.assertRaisesRegex(channel.ChannelError, "Cannot confirm"),
            ):
                channel.verify_packages_private(images)

    def test_legacy_public_packages_are_not_checked_for_privacy(self):
        with (
            self.channel_environment(**{channel.PACKAGE_PREFIX_ENV: "eimir"}),
            patch.object(channel, "anonymous_manifest_status") as status,
        ):
            channel.verify_packages_private({"backend": BACKEND, "web": WEB})
        status.assert_not_called()

    def test_public_package_blocks_promotion_after_the_push(self):
        self.add_media_record()
        media = "ghcr.io/baerenmarke90/eimir-cloud-media@sha256:" + "5" * 64
        with (
            self.channel_environment(),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True),
            patch.object(
                channel, "publish_image", side_effect=[BACKEND, WEB, media]
            ) as publish,
            patch.object(channel, "anonymous_manifest_status", return_value=200),
            patch.object(channel, "canonical_compose") as compose,
            patch.object(channel, "advance_channel") as advance,
            self.assertRaisesRegex(channel.ChannelError, "publicly readable"),
        ):
            channel.publish(SOURCE, self.root, self.root / "out")
        self.assertEqual(publish.call_count, 3)
        compose.assert_not_called()
        advance.assert_not_called()
        self.assertFalse((self.root / "out" / "channel.json").exists())

    def test_staged_publication_is_also_checked_for_privacy(self):
        with self.assertRaisesRegex(channel.ChannelError, "publicly readable"):
            self.publish_staged_pair(
                anonymous_status=200, **{channel.PROMOTE_ENV: "false"}
            )

    def test_invalid_settings_refuse_publication_before_any_registry_use(self):
        self.add_media_record()
        for name, value in (
            (channel.PACKAGE_PREFIX_ENV, "evil"),
            (channel.PROMOTE_ENV, "maybe"),
        ):
            with (
                self.subTest(name=name),
                self.channel_environment(**{name: value}),
                patch.object(channel, "latest_main", return_value=SOURCE),
                patch.object(channel, "candidate_ready", return_value=True),
                patch.object(channel, "publish_image") as publish,
                patch.object(channel, "advance_channel") as advance,
                self.assertRaises(channel.ChannelError),
            ):
                channel.publish(SOURCE, self.root, self.root / "out")
            publish.assert_not_called()
            advance.assert_not_called()

    def test_staged_publication_pushes_but_never_advances_the_branch(self):
        summary = self.root / "summary.md"
        publish, advance, media = self.publish_staged_pair(
            **{channel.PROMOTE_ENV: "false", "GITHUB_STEP_SUMMARY": str(summary)}
        )
        self.assertEqual(publish.call_count, 3)
        advance.assert_not_called()
        for name in ("compose.yaml", "channel.json", "README.md"):
            self.assertTrue((self.root / "out" / name).is_file(), name)
        text = summary.read_text(encoding="utf-8")
        self.assertIn("Staged only", text)
        for reference in (BACKEND, WEB, media):
            self.assertIn(reference, text)

    def test_default_publication_advances_the_branch_and_lists_the_references(self):
        summary = self.root / "summary.md"
        publish, advance, media = self.publish_staged_pair(
            **{"GITHUB_STEP_SUMMARY": str(summary)}
        )
        self.assertEqual(publish.call_count, 3)
        advance.assert_called_once()
        text = summary.read_text(encoding="utf-8")
        self.assertIn("Promoted to", text)
        self.assertNotIn("Staged only", text)
        self.assertIn(media, text)

    def test_summary_is_optional_outside_actions(self):
        publish, advance, _ = self.publish_staged_pair()
        self.assertEqual(publish.call_count, 3)
        advance.assert_called_once()


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

    def test_merge_promotes_without_the_full_regression(self):
        with (
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=False) as ready,
            patch.object(channel, "gh_api", side_effect=self.api),
        ):
            self.assertTrue(channel.advance_channel(self.files, SOURCE, full_regression=False))
        ready.assert_not_called()
        self.assertTrue(self.calls[-1][0].endswith("/git/refs/heads/deploy/eimir-test"))

    def test_cli_publish_uses_the_fast_lane_only_for_merges(self):
        for event_name, expected in (("push", False), ("workflow_dispatch", True), ("workflow_run", True)):
            environment = {
                "GITHUB_REPOSITORY": channel.DEFAULT_REPOSITORY,
                "GITHUB_REF": "refs/heads/main",
                "GITHUB_EVENT_NAME": event_name,
            }
            with (
                self.subTest(event_name=event_name),
                patch.dict(os.environ, environment),
                patch.object(channel, "publish") as publish,
                patch.object(
                    sys,
                    "argv",
                    ["channel", "publish", "--revision", SOURCE, "--artifact-root", "/a", "--output", "/o"],
                ),
            ):
                self.assertEqual(channel.main(), 0)
                self.assertIs(publish.call_args.kwargs["full_regression"], expected)

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


class OptionalPhotoConfigurationTest(unittest.TestCase):
    def test_photo_settings_are_instance_expressions_and_never_runner_values(self):
        canonical = {
            "services": {
                name: {
                    "environment": {
                        "EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET": "source-placeholder"
                    }
                }
                for name in channel.CLOUD_SERVICES
            }
        }
        with patch.dict(
            os.environ,
            {
                "EIMIR_PHOTO_SOURCES_ENABLED": "false",
                "EIMIR_GOOGLE_PHOTOS_CLIENT_ID": "runner-client",
                "EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET": "runner-secret",
            },
        ):
            exported = channel.export_compose(canonical, BACKEND, WEB)
        for name in ("cloud-api", "cloud-worker"):
            env = exported["services"][name]["environment"]
            self.assertEqual(
                env["EIMIR_PHOTO_SOURCES_ENABLED"],
                "${EIMIR_PHOTO_SOURCES_ENABLED:-true}",
            )
            self.assertEqual(
                env["EIMIR_GOOGLE_PHOTOS_CLIENT_ID"],
                "${EIMIR_GOOGLE_PHOTOS_CLIENT_ID:-}",
            )
            self.assertEqual(
                env["EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET"],
                "${EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET:-}",
            )
            self.assertEqual(
                env["EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS"],
                "${EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS:-[]}",
            )
        self.assertNotIn("runner-client", json.dumps(exported))
        self.assertNotIn("runner-secret", json.dumps(exported))
        self.assertNotIn(
            "EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET",
            exported["services"]["cloud-migrate"]["environment"],
        )

    def test_calendar_settings_are_instance_expressions_and_never_runner_values(self):
        canonical = {"services": {name: {"environment": {}} for name in channel.CLOUD_SERVICES}}
        with patch.dict(
            os.environ,
            {
                "EIMIR_CALENDAR_SYNC_ENABLED": "false",
                "EIMIR_GOOGLE_CALENDAR_CLIENT_ID": "runner-calendar-client",
                "EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET": "runner-calendar-secret",
            },
        ):
            exported = channel.export_compose(canonical, BACKEND, WEB)
        for name in ("cloud-api", "cloud-worker"):
            env = exported["services"][name]["environment"]
            self.assertEqual(
                env["EIMIR_CALENDAR_SYNC_ENABLED"], "${EIMIR_CALENDAR_SYNC_ENABLED:-true}"
            )
            self.assertEqual(
                env["EIMIR_GOOGLE_CALENDAR_CLIENT_ID"],
                "${EIMIR_GOOGLE_CALENDAR_CLIENT_ID:-}",
            )
            self.assertEqual(
                env["EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET"],
                "${EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET:-}",
            )
            # Cloud never admits private CalDAV targets.
            self.assertNotIn("EIMIR_CALENDAR_CALDAV_PRIVATE_HOSTS", env)
        self.assertNotIn("runner-calendar", json.dumps(exported))
        self.assertNotIn(
            "EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET",
            exported["services"]["cloud-migrate"]["environment"],
        )
    def test_support_reports_switch_is_an_instance_expression_defaulting_off(self):
        canonical = {"services": {name: {"environment": {}} for name in channel.CLOUD_SERVICES}}
        with patch.dict(os.environ, {"EIMIR_SUPPORT_REPORTS_ENABLED": "true"}):
            exported = channel.export_compose(canonical, BACKEND, WEB)
        for name in ("cloud-api", "cloud-worker"):
            self.assertEqual(
                exported["services"][name]["environment"]["EIMIR_SUPPORT_REPORTS_ENABLED"],
                "${EIMIR_SUPPORT_REPORTS_ENABLED:-false}",
            )

    def test_operator_plugin_settings_are_instance_expressions(self):
        canonical = {"services": {name: {"environment": {}} for name in channel.CLOUD_SERVICES}}
        with patch.dict(
            os.environ,
            {"EIMIR_PLUGINS": "pro,admin", "EIMIR_ADMIN_GITHUB_TOKEN": "runner-secret"},
        ):
            exported = channel.export_compose(canonical, BACKEND, WEB)
        expected = {
            "EIMIR_PLUGINS": "${EIMIR_PLUGINS:-pro}",
            "EIMIR_ADMIN_TRACKER": "${EIMIR_ADMIN_TRACKER:-}",
            "EIMIR_ADMIN_GITHUB_REPOSITORY": "${EIMIR_ADMIN_GITHUB_REPOSITORY:-}",
            "EIMIR_ADMIN_GITHUB_TOKEN": "${EIMIR_ADMIN_GITHUB_TOKEN:-}",
        }
        for name in ("cloud-api", "cloud-worker"):
            environment = exported["services"][name]["environment"]
            for key, value in expected.items():
                self.assertEqual(environment[key], value)
        self.assertEqual(
            exported["services"]["cloud-migrate"]["environment"]["EIMIR_PLUGINS"],
            "${EIMIR_PLUGINS:-pro}",
        )
        self.assertNotIn("runner-secret", repr(exported))

class FCMSenderMountContractTest(unittest.TestCase):
    def setUp(self):
        channel.fcm_sender_mount.cache_clear()
        self.addCleanup(channel.fcm_sender_mount.cache_clear)
        self.mount = {
            "type": "bind",
            "source": channel._FCM_SOURCE_PLACEHOLDER,
            "target": channel.FCM_CREDENTIAL_TARGET,
            "read_only": True,
            "bind": {"create_host_path": False},
        }

    def _config(self, mount):
        return {"services": {
            name: {"volumes": [copy.deepcopy(mount)]}
            for name in ("cloud-api", "cloud-worker")
        }}

    def test_supported_compose_serializers_export_the_same_explicit_safe_mount(self):
        expected = dict(self.mount, source=channel.required(
            "EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE"
        ))
        for bind in ({"create_host_path": False}, {}):
            config = self._config(dict(self.mount, bind=bind))
            original = copy.deepcopy(config)
            channel.fcm_sender_mount.cache_clear()
            with self.subTest(bind=bind), patch.object(
                channel, "canonical_compose", return_value=config
            ):
                self.assertEqual(channel.fcm_sender_mount(), expected)
                self.assertEqual(config, original)

    def test_changed_mount_security_or_identity_is_rejected_for_either_runtime(self):
        changes = (
            {"type": "volume"},
            {"source": "/different-sender.json"},
            {"target": "/different-target.json"},
            {"read_only": False},
            {"bind": {"create_host_path": True}},
            {"bind": {"create_host_path": False, "propagation": "shared"}},
            {"bind": None},
            {"consistency": "cached"},
        )
        for name in ("cloud-api", "cloud-worker"):
            for change in changes:
                config = self._config(self.mount)
                config["services"][name]["volumes"][0].update(change)
                with self.subTest(name=name, change=change), patch.object(
                    channel, "canonical_compose", return_value=config
                ), self.assertRaises(channel.ChannelError):
                    channel.fcm_sender_mount()
            for missing in ("read_only", "bind"):
                config = self._config(self.mount)
                del config["services"][name]["volumes"][0][missing]
                with self.subTest(name=name, missing=missing), patch.object(
                    channel, "canonical_compose", return_value=config
                ), self.assertRaises(channel.ChannelError):
                    channel.fcm_sender_mount()
            for mounts in ([], [self.mount, self.mount]):
                config = self._config(self.mount)
                config["services"][name]["volumes"] = mounts
                with self.subTest(name=name, mounts=len(mounts)), patch.object(
                    channel, "canonical_compose", return_value=config
                ), self.assertRaises(channel.ChannelError):
                    channel.fcm_sender_mount()


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required")
class CanonicalWiringTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.canonical = channel.canonical_compose()

    def test_audio_opt_in_resolves_from_instance_settings_with_verified_media(self):
        import re

        media = "ghcr.io/baerenmarke90/eimir-media@sha256:" + "5" * 64
        with patch.dict(os.environ, {"EIMIR_AUDIO_UPLOAD_ENABLED": "publisher-value"}):
            config = channel.export_compose(
                channel.canonical_compose(video=True), BACKEND, WEB, media
            )
        roles = ("cloud-api", "cloud-worker", "cloud-video-worker")
        for name in roles:
            self.assertEqual(
                config["services"][name]["environment"]["EIMIR_AUDIO_UPLOAD_ENABLED"],
                "${EIMIR_AUDIO_UPLOAD_ENABLED:-false}",
            )
        self.assertNotIn("publisher-value", json.dumps(config))
        required = set(re.findall(r"\$\{([A-Z_]+):\?", json.dumps(config)))
        environment = {key: os.environ[key] for key in ("PATH", "HOME") if key in os.environ}
        environment.update({key: "fixture" for key in required})
        with tempfile.TemporaryDirectory() as temporary:
            compose = Path(temporary) / "compose.yaml"
            compose.write_text(json.dumps(config))
            for setting, expected in ((None, "false"), ("", "false"), ("true", "true"), ("false", "false")):
                local = dict(environment)
                if setting is not None:
                    local["EIMIR_AUDIO_UPLOAD_ENABLED"] = setting
                with self.subTest(setting=setting):
                    result = subprocess.run(
                        ["docker", "compose", "--env-file", os.devnull,
                         "--file", str(compose), "config", "--format", "json"],
                        env=local, text=True, capture_output=True,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    resolved = json.loads(result.stdout)
                    for name in roles:
                        self.assertEqual(
                            resolved["services"][name]["environment"]["EIMIR_AUDIO_UPLOAD_ENABLED"],
                            expected,
                        )
                    self.assertNotIn(
                        "EIMIR_AUDIO_UPLOAD_ENABLED",
                        resolved["services"]["cloud-migrate"]["environment"],
                    )

    def test_audio_cannot_be_enabled_without_the_verified_media_role(self):
        canonical = copy.deepcopy(self.canonical)
        for name in ("cloud-api", "cloud-worker"):
            canonical["services"][name]["environment"]["EIMIR_AUDIO_UPLOAD_ENABLED"] = "true"
        with patch.dict(os.environ, {"EIMIR_AUDIO_UPLOAD_ENABLED": "true"}):
            config = channel.export_compose(canonical, BACKEND, WEB)
        self.assertNotIn("cloud-video-worker", config["services"])
        for name in ("cloud-api", "cloud-worker"):
            self.assertEqual(
                config["services"][name]["environment"]["EIMIR_AUDIO_UPLOAD_ENABLED"],
                "false",
            )

    def test_private_video_worker_is_exact_source_bounded_and_receives_only_its_credentials(
        self,
    ):
        media = "ghcr.io/baerenmarke90/eimir-media@sha256:" + "5" * 64
        exported = channel.export_compose(
            channel.canonical_compose(video=True), BACKEND, WEB, media
        )
        worker = exported["services"]["cloud-video-worker"]
        self.assertEqual(worker["image"], media)
        self.assertTrue(worker["read_only"])
        self.assertEqual(worker["pids_limit"], 64)
        self.assertEqual(worker["cap_drop"], ["ALL"])
        self.assertEqual(worker["security_opt"], ["no-new-privileges:true"])
        self.assertFalse(worker.get("ports"))
        self.assertEqual(worker["networks"], {"app": None})
        self.assertEqual(
            worker["depends_on"]["cloud-migrate"]["condition"],
            "service_completed_successfully",
        )
        self.assertEqual(
            worker["environment"]["EIMIR_DATABASE_URL"],
            exported["services"]["cloud-api"]["environment"]["EIMIR_DATABASE_URL"],
        )
        for name in ("cloud-api", "cloud-worker", "cloud-video-worker"):
            self.assertEqual(
                exported["services"][name]["environment"]["EIMIR_VIDEO_UPLOAD_ENABLED"],
                "true",
            )
        for key in worker["environment"]:
            self.assertFalse(
                any(value in key for value in ("SMTP", "FCM", "GOOGLE_PHOTOS")), key
            )
        self.assertFalse(
            any(
                mount.get("target") == channel.FCM_CREDENTIAL_TARGET
                for mount in worker["volumes"]
            )
        )
        self.assertTrue(exported["volumes"]["cloud_media_data"]["external"])
        with self.assertRaises(channel.ChannelError):
            channel.export_compose(self.canonical, BACKEND, WEB, media)
        with self.assertRaises(channel.release_manifest.ManifestError):
            channel.export_compose(
                channel.canonical_compose(video=True), BACKEND, WEB, "media:mutable"
            )


    def test_operator_process_values_cannot_be_resolved_into_the_git_export(self):
        with patch.dict(
            os.environ,
            {
                "EIMIR_ENCRYPTION_KEYS": "private-value-must-not-enter-git",
                "SBS_SMTP_PASSWORD": "private-value-must-not-enter-git",
                "EIMIR_PUSH_VAPID_PRIVATE_KEY": "private-value-must-not-enter-git",
                "EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE": "/private-value-must-not-enter-git",
            },
        ):
            resolved = channel.canonical_compose()
            enabled = channel.canonical_compose(fcm=True)
        self.assertNotIn("private-value-must-not-enter-git", json.dumps(resolved))
        self.assertNotIn("private-value-must-not-enter-git", json.dumps(enabled))

    def test_default_cloud_requires_no_fcm_file_and_private_channel_mount_is_shared(self):
        for service in self.canonical["services"].values():
            self.assertFalse(any(
                mount.get("target") == channel.FCM_CREDENTIAL_TARGET
                for mount in service.get("volumes", [])
            ))
        exported = channel.export_compose(self.canonical, BACKEND, WEB)
        for name, service in exported["services"].items():
            mounts = [
                mount for mount in service.get("volumes", [])
                if mount.get("target") == channel.FCM_CREDENTIAL_TARGET
            ]
            if name in ("cloud-api", "cloud-worker"):
                self.assertEqual(mounts, [channel.fcm_sender_mount()])
                self.assertEqual(mounts[0]["source"], channel.required(
                    "EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE"
                ))
                self.assertTrue(mounts[0]["read_only"])
                self.assertFalse(mounts[0]["bind"]["create_host_path"])
                self.assertEqual(
                    service["environment"]["EIMIR_PUSH_FCM_CREDENTIALS_FILE"],
                    channel.FCM_CREDENTIAL_TARGET,
                )
                self.assertNotIn("EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE", service["environment"])
                for key in (
                    "EIMIR_PUSH_FCM_PROJECT_ID", "EIMIR_PUSH_FCM_ANDROID_PACKAGE",
                ):
                    self.assertEqual(service["environment"][key], channel.required(key))
                # The selected target is FCM-only (PO 2026-11-01).
                self.assertEqual(service["environment"]["EIMIR_PUSH_VAPID_PRIVATE_KEY"],
                                 "")
                self.assertEqual(service["environment"]["EIMIR_PUSH_VAPID_SUBJECT"],
                                 "")
                self.assertEqual(service["environment"]["EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS"],
                                 "[]")
            else:
                self.assertEqual(mounts, [])
                self.assertFalse(any(key.startswith("EIMIR_PUSH_") for key in service["environment"]))

    def test_optional_fragment_preserves_topology_and_requires_operator_values(self):
        settings = {
            "EIMIR_PUSH_FCM_PROJECT_ID": "fixture-project",
            "EIMIR_PUSH_FCM_ANDROID_PACKAGE": "de.example.fixture",
            "EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE": "/private/fixture-not-opened.json",
        }
        base_environment = {key: os.environ[key] for key in ("PATH", "HOME") if key in os.environ}
        base = [
            "docker", "compose", "--file", str(ROOT / "compose.yaml"),
            "--env-file", os.devnull,
        ]
        fragment = ["--file", str(ROOT / "deploy/push-fcm.compose.yaml")]
        for profile, runtimes in (
            ("self-hosted", {"api", "worker"}),
            ("cloud", {"cloud-api", "cloud-worker"}),
        ):
            suffix = ["--profile", profile, "config", "--format", "json"]
            disabled = subprocess.run(base + suffix, env=base_environment, text=True, capture_output=True)
            self.assertEqual(disabled.returncode, 0, disabled.stderr)
            enabled = subprocess.run(
                base + fragment + suffix, env={**base_environment, **settings},
                text=True, capture_output=True,
            )
            self.assertEqual(enabled.returncode, 0, enabled.stderr)
            normal, opt_in = json.loads(disabled.stdout), json.loads(enabled.stdout)
            self.assertEqual(set(normal["services"]), set(opt_in["services"]))
            self.assertEqual(normal["networks"], opt_in["networks"])
            self.assertEqual(normal["volumes"], opt_in["volumes"])
            for name, service in normal["services"].items():
                self.assertFalse(any(
                    mount.get("target") == channel.FCM_CREDENTIAL_TARGET
                    for mount in service.get("volumes", [])
                ))
                mounts = [
                    mount for mount in opt_in["services"][name].get("volumes", [])
                    if mount.get("target") == channel.FCM_CREDENTIAL_TARGET
                ]
                self.assertEqual(len(mounts), 1 if name in runtimes else 0)
                if name not in runtimes:
                    self.assertFalse(any(
                        key.startswith("EIMIR_PUSH_") for key in service.get("environment", {})
                    ))
            for missing in settings:
                partial = {key: value for key, value in settings.items() if key != missing}
                refused = subprocess.run(
                    base + fragment + suffix, env={**base_environment, **partial},
                    text=True, capture_output=True,
                )
                self.assertNotEqual(refused.returncode, 0, missing)

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
            for missing in (
                "EIMIR_ACCOUNT_DELETION_INSTANCE_ID", "EIMIR_PUSH_FCM_PROJECT_ID",
                "EIMIR_PUSH_FCM_ANDROID_PACKAGE", "EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE",
            ):
                result = subprocess.run(
                    command,
                    env={
                        key: value for key, value in dict(os.environ, **env).items()
                        if key != missing
                    },
                    text=True, capture_output=True,
                )
                self.assertNotEqual(result.returncode, 0, missing)


CORE = "c" * 40
CORE_NEXT = "d" * 40
PRO_REPOSITORY = "baerenmarke90/eimir-pro"
CORE_REPOSITORY = "baerenmarke90/eimir-core"
CHANNEL_SETTINGS = (
    "EIMIR_TEST_CHANNEL_REPOSITORY",
    "EIMIR_TEST_CHANNEL_INSTANCE",
    "EIMIR_CORE_REPOSITORY",
    "EIMIR_CORE_READ_TOKEN",
    "EIMIR_CORE_REVISION",
    "EIMIR_CORE_ADVANCE_RUN",
    "EIMIR_CORE_ADVANCE_RETEST",
)


def settings(**values):
    """Only the given Decision 0019 settings, independent of the host environment."""
    environment = {
        key: value for key, value in os.environ.items() if key not in CHANNEL_SETTINGS
    }
    environment.update(values)
    return patch.dict(os.environ, environment, clear=True)


def split_settings(**values):
    return settings(
        EIMIR_TEST_CHANNEL_REPOSITORY=PRO_REPOSITORY,
        EIMIR_CORE_REPOSITORY=CORE_REPOSITORY,
        **values,
    )


def channel_content(source=PREVIOUS, core=None, core_repository=CORE_REPOSITORY):
    identity = {"schemaVersion": 1, "kind": channel.CHANNEL_KIND, "sourceRevision": source}
    if core is not None:
        identity["coreSource"] = {"repository": core_repository, "revision": core}
    return {"content": base64.b64encode(json.dumps(identity).encode()).decode()}


class RepositorySettingsTest(unittest.TestCase):
    def test_unset_or_empty_settings_reproduce_the_monorepo_exactly(self):
        for value in (None, "", "  "):
            values = {} if value is None else {
                "EIMIR_TEST_CHANNEL_REPOSITORY": value,
                "EIMIR_TEST_CHANNEL_INSTANCE": value,
                "EIMIR_CORE_REPOSITORY": value,
            }
            with self.subTest(value=value), settings(**values):
                self.assertEqual(channel.publishing_repository(), "baerenmarke90/eimir")
                self.assertEqual(channel.instance(), "eimir-test")
                self.assertEqual(channel.channel_branch(), "deploy/eimir-test")
                self.assertIsNone(channel.core_repository())
                self.assertEqual(
                    channel.package_repository("web"), "ghcr.io/baerenmarke90/eimir-cloud-web"
                )

    def test_pro_and_rehearsal_repositories_are_parameters(self):
        for publisher, core in (
            (PRO_REPOSITORY, CORE_REPOSITORY),
            ("baerenmarke90/eimir-rehearsal-pro", "baerenmarke90/eimir-rehearsal-core"),
            ("Some-Owner9/eimir-pro", "Some-Owner9/eimir"),
        ):
            with self.subTest(publisher=publisher), settings(
                EIMIR_TEST_CHANNEL_REPOSITORY=publisher, EIMIR_CORE_REPOSITORY=core
            ):
                self.assertEqual(channel.publishing_repository(), publisher)
                self.assertEqual(channel.core_repository(), core)
                owner = publisher.partition("/")[0]
                self.assertEqual(
                    channel.package_repository("backend"),
                    f"ghcr.io/{owner}/eimir-cloud-backend",
                )

    def test_malformed_repository_names_are_refused(self):
        for value in (
            "baerenmarke90/other",
            "baerenmarke90/eimir/",
            "baerenmarke90/eimir/pro",
            "/eimir",
            "-owner/eimir",
            "owner-/eimir",
            "own--er/eimir",
            "own_er/eimir",
            "o" * 40 + "/eimir",
            "baerenmarke90/Eimir-pro",
            "baerenmarke90/eimir--pro",
            "baerenmarke90/eimir-",
            "baerenmarke90/eimir.pro",
            "baerenmarke90/eimir-pro.git",
            "github.com/baerenmarke90/eimir",
            "https://github.com/baerenmarke90/eimir",
            "baerenmarke90/eimir pro",
        ):
            for name in ("EIMIR_TEST_CHANNEL_REPOSITORY", "EIMIR_CORE_REPOSITORY"):
                with (
                    self.subTest(name=name, value=value),
                    settings(**{name: value}),
                    self.assertRaisesRegex(channel.ChannelError, name),
                ):
                    channel.publishing_repository()
                    channel.core_repository()

    def test_core_repository_must_be_another_repository_of_the_same_owner(self):
        for publisher, core, message in (
            (PRO_REPOSITORY, PRO_REPOSITORY, "not the publisher"),
            ("baerenmarke90/eimir", "baerenmarke90/eimir", "not the publisher"),
            (PRO_REPOSITORY, "someone/eimir-core", "same owner"),
        ):
            with (
                self.subTest(core=core),
                settings(EIMIR_TEST_CHANNEL_REPOSITORY=publisher, EIMIR_CORE_REPOSITORY=core),
                self.assertRaisesRegex(channel.ChannelError, message),
            ):
                channel.core_repository()

    def test_instance_names_derive_the_branch_and_are_validated(self):
        with settings(EIMIR_TEST_CHANNEL_INSTANCE="eimir-rehearsal"):
            self.assertEqual(channel.channel_branch(), "deploy/eimir-rehearsal")
        for value in (
            "eimir",
            "eimir-",
            "Eimir-test",
            "eimir_test",
            "eimir--test",
            "deploy/eimir-test",
            "eimir-test/../main",
            "eimir-test main",
        ):
            with (
                self.subTest(value=value),
                settings(EIMIR_TEST_CHANNEL_INSTANCE=value),
                self.assertRaisesRegex(channel.ChannelError, "EIMIR_TEST_CHANNEL_INSTANCE"),
            ):
                channel.instance()

    def test_every_github_endpoint_uses_the_configured_publisher(self):
        with split_settings(), patch.object(
            channel, "gh_api", return_value={"object": {"sha": SOURCE}}
        ) as api:
            self.assertEqual(channel.latest_main(), SOURCE)
            self.assertEqual(
                api.call_args.args[0], f"repos/{PRO_REPOSITORY}/git/ref/heads/main"
            )
        with split_settings(EIMIR_TEST_CHANNEL_INSTANCE="eimir-rehearsal"), patch.object(
            channel,
            "gh_api",
            side_effect=[{"object": {"sha": PREVIOUS}}, channel_content(SOURCE, CORE)],
        ) as api:
            self.assertTrue(channel.channel_already_selected(SOURCE, CORE))
            self.assertEqual(
                api.call_args_list[0].args[0],
                f"repos/{PRO_REPOSITORY}/git/ref/heads/deploy/eimir-rehearsal",
            )

    def test_cli_accepts_only_the_configured_publisher(self):
        for configured, actual, expected in (
            ("", "baerenmarke90/eimir", 0),
            (PRO_REPOSITORY, PRO_REPOSITORY, 0),
            (PRO_REPOSITORY, "baerenmarke90/eimir", 1),
            ("", PRO_REPOSITORY, 1),
            ("baerenmarke90/not-eimir", "baerenmarke90/not-eimir", 1),
        ):
            with (
                self.subTest(configured=configured, actual=actual),
                tempfile.TemporaryDirectory() as temporary,
                settings(
                    EIMIR_TEST_CHANNEL_REPOSITORY=configured,
                    GITHUB_REPOSITORY=actual,
                    GITHUB_REF="refs/heads/main",
                ),
                patch.object(channel, "wait_for_checks", return_value=False) as wait,
                patch.object(
                    sys,
                    "argv",
                    [
                        "channel",
                        "wait",
                        "--revision",
                        SOURCE,
                        "--github-output",
                        str(Path(temporary) / "out"),
                    ],
                ),
            ):
                self.assertEqual(channel.main(), expected)
                self.assertEqual(wait.called, expected == 0)

    def test_core_reads_use_the_core_token_only_when_one_is_configured(self):
        with split_settings(), patch.object(
            channel, "gh_api", return_value={"object": {"sha": CORE}}
        ) as api:
            self.assertEqual(channel.core_main(), CORE)
            self.assertEqual(api.call_args.args[0], f"repos/{CORE_REPOSITORY}/git/ref/heads/main")
            self.assertIsNone(api.call_args.kwargs["environment"])
        with split_settings(EIMIR_CORE_READ_TOKEN="read-only"), patch.object(
            channel, "gh_api", return_value={"status": "ahead"}
        ) as api:
            self.assertTrue(channel.core_contains(CORE, CORE_NEXT))
            self.assertEqual(api.call_args.kwargs["environment"]["GH_TOKEN"], "read-only")
            self.assertEqual(
                api.call_args.args[0], f"repos/{CORE_REPOSITORY}/compare/{CORE}...{CORE_NEXT}"
            )
        for status, expected in (("identical", True), ("behind", False), ("diverged", False)):
            with split_settings(), patch.object(
                channel, "gh_api", return_value={"status": status}
            ):
                self.assertEqual(channel.core_contains(CORE, CORE_NEXT), expected)
        with split_settings(), patch.object(channel, "gh_api") as api:
            self.assertTrue(channel.core_contains(CORE, CORE))
            api.assert_not_called()


class SplitPublicationCheckTest(unittest.TestCase):
    def advance_run(self, **changes):
        tested = {
            "path": channel.CORE_ADVANCE_WORKFLOW,
            "event": "schedule",
            "head_branch": "main",
            "head_sha": SOURCE,
            "head_repository": {"full_name": PRO_REPOSITORY},
        }
        tested.update(changes)
        return tested

    def jobs(self, core=CORE_NEXT, conclusion="success", count=1):
        job = {
            "name": channel.PRO_TESTS_JOB.format(revision=core),
            "status": "completed",
            "conclusion": conclusion,
        }
        return [{"jobs": [dict(job) for _ in range(count)]}]

    def api(self, *, selected=CORE, source=PREVIOUS, run=None, jobs=None, statuses=None):
        statuses = dict(statuses or {})

        def answer(endpoint, **_):
            if endpoint.endswith("/git/ref/heads/deploy/eimir-test"):
                return {"object": {"sha": PREVIOUS}}
            if "/contents/channel.json" in endpoint:
                return channel_content(source, selected)
            if endpoint == f"repos/{CORE_REPOSITORY}/git/ref/heads/main":
                return {"object": {"sha": CORE_NEXT}}
            if "/compare/" in endpoint:
                return {"status": statuses.get(endpoint.rsplit("/", 1)[1], "ahead")}
            if endpoint.endswith("/jobs?filter=latest&per_page=100"):
                return self.jobs() if jobs is None else jobs
            if "/actions/runs/" in endpoint:
                return self.advance_run() if run is None else run
            raise AssertionError(endpoint)

        return answer

    def check(self, event_name, api, **values):
        environment = {"EIMIR_CORE_REVISION": CORE_NEXT, "EIMIR_CORE_ADVANCE_RUN": "77"}
        if event_name != "workflow_dispatch":
            environment = {}
        environment.update(values)
        with (
            split_settings(**environment),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready") as regression,
            patch.object(channel, "gh_api", side_effect=api),
        ):
            result = channel.check_split_publication(SOURCE, event_name)
        regression.assert_not_called()
        return result

    def test_pro_merge_rebuilds_with_the_selected_core(self):
        self.assertEqual(self.check("push", self.api()), CORE)

    def test_pro_merge_without_a_selected_core_fails_visibly(self):
        for selected in (None,):
            with self.assertRaisesRegex(channel.ChannelError, "run Core Advance"):
                self.check("push", self.api(selected=selected))

        def missing(endpoint, **_):
            raise channel.GitHubError(endpoint, missing=True)

        with self.assertRaisesRegex(channel.ChannelError, "run Core Advance"):
            self.check("push", missing)

    def test_a_pro_merge_cannot_carry_core_inputs(self):
        with self.assertRaisesRegex(channel.ChannelError, "monorepo builds its own Core"):
            self.check("push", self.api(), EIMIR_CORE_REVISION=CORE_NEXT)

    def test_selected_channel_from_another_core_repository_is_refused(self):
        def foreign(endpoint, **kwargs):
            if "/contents/channel.json" in endpoint:
                return channel_content(PREVIOUS, CORE, "baerenmarke90/eimir-other")
            return self.api()(endpoint, **kwargs)

        with self.assertRaisesRegex(channel.ChannelError, "another Core repository"):
            self.check("push", foreign)

    def test_core_advance_dispatch_admits_exactly_the_tested_pair(self):
        for event in sorted(channel.CORE_ADVANCE_EVENTS):
            with self.subTest(event=event):
                api = self.api(run=self.advance_run(event=event))
                self.assertEqual(self.check("workflow_dispatch", api), CORE_NEXT)

    def test_first_core_pin_needs_no_selected_core(self):
        self.assertEqual(self.check("workflow_dispatch", self.api(selected=None)), CORE_NEXT)

    def test_untrusted_or_failed_core_advance_runs_cannot_admit_a_build(self):
        for name, run, jobs in (
            ("other workflow", self.advance_run(path=".github/workflows/other.yml"), None),
            ("pull request", self.advance_run(event="pull_request"), None),
            ("push", self.advance_run(event="push"), None),
            ("other branch", self.advance_run(head_branch="feature"), None),
            ("malformed Pro revision", self.advance_run(head_sha="main"), None),
            ("fork", self.advance_run(head_repository={"full_name": "fork/eimir-pro"}), None),
            ("no origin", self.advance_run(head_repository=None), None),
            ("failed tests", None, self.jobs(conclusion="failure")),
            ("cancelled tests", None, self.jobs(conclusion="cancelled")),
            ("skipped tests", None, self.jobs(conclusion="skipped")),
            ("other Core tested", None, self.jobs(core=CORE)),
            ("ambiguous jobs", None, self.jobs(count=2)),
            ("no tests", None, [{"jobs": []}]),
        ):
            with (
                self.subTest(name=name),
                self.assertRaisesRegex(channel.ChannelError, "did not pass the Pro tests"),
            ):
                self.check("workflow_dispatch", self.api(run=run, jobs=jobs))

    def test_pro_merge_during_the_tests_skips_without_reporting_a_failure(self):
        self.assertIsNone(
            self.check("workflow_dispatch", self.api(run=self.advance_run(head_sha=PREVIOUS)))
        )
        # A stale run whose tests failed is still a failure.
        with self.assertRaisesRegex(channel.ChannelError, "did not pass the Pro tests"):
            self.check(
                "workflow_dispatch",
                self.api(run=self.advance_run(head_sha=PREVIOUS), jobs=self.jobs(conclusion="failure")),
            )

    def test_unfinished_tests_cannot_admit_a_build(self):
        jobs = [{"jobs": [{"name": channel.PRO_TESTS_JOB.format(revision=CORE_NEXT), "status": "in_progress"}]}]
        with self.assertRaisesRegex(channel.ChannelError, "did not pass the Pro tests"):
            self.check("workflow_dispatch", self.api(jobs=jobs))

    def test_malformed_dispatch_inputs_are_refused_before_any_run_lookup(self):
        for values, message in (
            ({"EIMIR_CORE_REVISION": ""}, "full Core commit SHA"),
            ({"EIMIR_CORE_REVISION": CORE_NEXT[:12]}, "full Core commit SHA"),
            ({"EIMIR_CORE_REVISION": CORE_NEXT.upper()}, "full Core commit SHA"),
            ({"EIMIR_CORE_ADVANCE_RUN": ""}, "Core Advance run id"),
            ({"EIMIR_CORE_ADVANCE_RUN": "0"}, "Core Advance run id"),
            ({"EIMIR_CORE_ADVANCE_RUN": "77/../1"}, "Core Advance run id"),
        ):
            def answer(endpoint, **kwargs):
                if "/actions/runs/" in endpoint:
                    raise AssertionError("run lookup with malformed inputs")
                return self.api()(endpoint, **kwargs)

            with (
                self.subTest(values=values),
                self.assertRaisesRegex(channel.ChannelError, message),
            ):
                self.check("workflow_dispatch", answer, **values)

    def test_core_revision_must_be_on_core_main_and_only_move_forward(self):
        def off_main(endpoint, **kwargs):
            if endpoint == f"repos/{CORE_REPOSITORY}/git/ref/heads/main":
                return {"object": {"sha": "e" * 40}}
            if endpoint.endswith(f"/compare/{CORE_NEXT}...{'e' * 40}"):
                return {"status": "diverged"}
            return self.api()(endpoint, **kwargs)

        with self.assertRaisesRegex(channel.ChannelError, "not on the Core main branch"):
            self.check("workflow_dispatch", off_main)
        for status in ("behind", "diverged"):
            with (
                self.subTest(status=status),
                self.assertRaisesRegex(channel.ChannelError, "only moves forward"),
            ):
                self.check(
                    "workflow_dispatch", self.api(statuses={f"{CORE}...{CORE_NEXT}": status})
                )

    def test_already_selected_pair_and_superseded_pro_are_not_rebuilt(self):
        self.assertIsNone(self.check("push", self.api(source=SOURCE)))
        self.assertIsNone(
            self.check("workflow_dispatch", self.api(source=SOURCE, selected=CORE_NEXT))
        )
        # Same Pro revision, newer Core: a real advance.
        self.assertEqual(self.check("workflow_dispatch", self.api(source=SOURCE)), CORE_NEXT)
        with (
            split_settings(),
            patch.object(channel, "latest_main", return_value=PREVIOUS),
            patch.object(channel, "gh_api") as api,
        ):
            self.assertIsNone(channel.check_split_publication(SOURCE, "push"))
        api.assert_not_called()

    def test_full_regression_completions_and_other_events_never_admit_split_builds(self):
        with split_settings(), patch.object(channel, "gh_api") as api:
            self.assertIsNone(channel.check_split_publication(SOURCE, "workflow_run"))
            for event_name in ("pull_request", "schedule", ""):
                with self.subTest(event_name=event_name), self.assertRaises(channel.ChannelError):
                    channel.check_split_publication(SOURCE, event_name)
        api.assert_not_called()

    def test_monorepo_check_refuses_core_inputs(self):
        for name in ("EIMIR_CORE_REVISION", "EIMIR_CORE_ADVANCE_RUN"):
            with (
                self.subTest(name=name),
                settings(**{name: "1"}),
                patch.object(channel, "gh_api") as api,
                self.assertRaisesRegex(channel.ChannelError, "EIMIR_CORE_REPOSITORY"),
            ):
                channel.check_for_publication(SOURCE, "workflow_dispatch", {})
            api.assert_not_called()

    def test_cli_check_writes_the_pinned_core_revision(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "output"
            with (
                split_settings(
                    GITHUB_REPOSITORY=PRO_REPOSITORY,
                    GITHUB_REF="refs/heads/main",
                    GITHUB_EVENT_NAME="push",
                ),
                patch.object(channel, "check_split_publication", return_value=CORE) as check,
                patch.object(sys, "argv", ["channel", "check", "--revision", SOURCE, "--github-output", str(output)]),
            ):
                self.assertEqual(channel.main(), 0)
            check.assert_called_once_with(SOURCE, "push")
            self.assertEqual(output.read_text(), f"ready=true\ncore_revision={CORE}\n")
            output.unlink()
            with (
                split_settings(
                    GITHUB_REPOSITORY=PRO_REPOSITORY,
                    GITHUB_REF="refs/heads/main",
                    GITHUB_EVENT_NAME="push",
                ),
                patch.object(channel, "check_split_publication", return_value=None),
                patch.object(sys, "argv", ["channel", "check", "--revision", SOURCE, "--github-output", str(output)]),
            ):
                self.assertEqual(channel.main(), 0)
            self.assertEqual(output.read_text(), "ready=false\ncore_revision=\n")


class CoreAdvanceTest(unittest.TestCase):
    def setUp(self):
        self.writes = []
        self.issues = []
        self.comments = {}
        self.publications = []
        self.selected = CORE
        self.head = CORE_NEXT
        self.status = "ahead"

    def api(self, endpoint, *, payload=None, paginate=False, **_):
        if payload is not None:
            self.writes.append((endpoint, payload))
            return {}
        if endpoint == f"repos/{CORE_REPOSITORY}/git/ref/heads/main":
            return {"object": {"sha": self.head}}
        if endpoint.endswith("/git/ref/heads/deploy/eimir-test"):
            if self.selected is None:
                raise channel.GitHubError(endpoint, missing=True)
            return {"object": {"sha": PREVIOUS}}
        if "/contents/channel.json" in endpoint:
            return channel_content(PREVIOUS, self.selected)
        if "/compare/" in endpoint:
            return {"status": self.status}
        if endpoint.startswith(f"repos/{PRO_REPOSITORY}/issues?state=open"):
            return [self.issues]
        if "/comments?" in endpoint:
            number = int(endpoint.split("/issues/", 1)[1].split("/", 1)[0])
            return [[{"body": body} for body in self.comments.get(number, [])]]
        if "/actions/workflows/release-publish.yml/runs" in endpoint:
            return {"workflow_runs": [run for run, _ in self.publications]}
        if endpoint.endswith("/jobs?filter=latest&per_page=100"):
            run_id = int(endpoint.split("/runs/", 1)[1].split("/", 1)[0])
            names = next(jobs for run, jobs in self.publications if run["id"] == run_id)
            return [{"jobs": [{"name": name} for name in names]}]
        raise AssertionError(endpoint)

    def plan(self, retest=False):
        with split_settings(), patch.object(channel, "gh_api", side_effect=self.api):
            return channel.plan_core_advance(retest=retest)

    def publication(self, run_id, core, status="completed", conclusion="success"):
        self.publications.append(
            (
                {"id": run_id, "status": status, "conclusion": conclusion, "html_url": f"run/{run_id}"},
                [channel.PUBLISHER_CHECK_JOB.format(revision=core), "Private test channel contract"],
            )
        )

    def blocked(self, number=5, body=None, comments=()):
        self.issues.append(
            {"number": number, "title": channel.BLOCKED_ISSUE_TITLE, "body": body or ""}
        )
        self.comments[number] = list(comments)

    def test_new_core_main_is_planned_for_the_pro_tests(self):
        self.assertEqual(self.plan(), CORE_NEXT)
        self.assertEqual(self.writes, [])

    def test_first_pin_and_seeded_monorepo_channel_plan_core_main(self):
        self.selected = None
        self.assertEqual(self.plan(), CORE_NEXT)

    def test_current_pin_needs_nothing(self):
        self.head = CORE
        self.assertIsNone(self.plan())

    def test_core_history_reset_needs_a_manual_decision(self):
        for status in ("behind", "diverged"):
            self.status = status
            with self.subTest(status=status), self.assertRaisesRegex(channel.ChannelError, "manual decision"):
                self.plan()

    def test_blocked_revision_is_not_tested_again_until_retest_or_closed_issue(self):
        self.blocked(body="Core revision " + CORE, comments=["Core revision " + CORE_NEXT])
        with patch("builtins.print") as printed:
            self.assertIsNone(self.plan())
        self.assertIn("::warning::", printed.call_args.args[0])
        self.assertEqual(self.plan(retest=True), CORE_NEXT)
        self.issues.clear()
        self.assertEqual(self.plan(), CORE_NEXT)

    def test_other_titles_pull_requests_and_other_revisions_do_not_block(self):
        self.issues.append({"number": 1, "title": "Core advance blocked?", "body": "Core revision " + CORE_NEXT})
        self.issues.append(
            {"number": 2, "title": channel.BLOCKED_ISSUE_TITLE, "body": "Core revision " + CORE_NEXT, "pull_request": {}}
        )
        self.blocked(number=3, body="Core revision " + CORE)
        self.assertEqual(self.plan(), CORE_NEXT)

    def test_running_publication_waits_and_successful_one_may_be_retried(self):
        self.publication(10, CORE_NEXT, status="in_progress", conclusion=None)
        self.assertIsNone(self.plan())
        self.publications.clear()
        self.publication(10, CORE_NEXT)
        self.publication(11, CORE)
        self.assertEqual(self.plan(), CORE_NEXT)

    def test_failed_publication_is_reported_once_and_fails_the_run(self):
        self.publication(10, CORE_NEXT, conclusion="failure")
        self.publication(12, CORE)
        with self.assertRaisesRegex(channel.ChannelError, "publisher failed"):
            self.plan()
        self.assertEqual(len(self.writes), 1)
        endpoint, payload = self.writes[0]
        self.assertEqual(endpoint, f"repos/{PRO_REPOSITORY}/issues")
        self.assertEqual(payload["title"], channel.BLOCKED_ISSUE_TITLE)
        self.assertIn("Core revision " + CORE_NEXT, payload["body"])
        self.assertIn("run/10", payload["body"])

    def test_newest_publication_for_the_revision_decides(self):
        self.publication(10, CORE_NEXT, conclusion="failure")
        self.publication(20, CORE_NEXT)
        self.assertEqual(self.plan(), CORE_NEXT)

    def test_reports_comment_on_the_open_issue_and_never_duplicate(self):
        self.blocked(body="Core revision " + CORE)
        with split_settings(), patch.object(channel, "gh_api", side_effect=self.api):
            channel.report_blocked(CORE_NEXT, "reason")
            self.assertEqual(self.writes, [(f"repos/{PRO_REPOSITORY}/issues/5/comments", self.writes[0][1])])
            self.comments[5].append(self.writes[0][1]["body"])
            channel.report_blocked(CORE_NEXT, "reason")
        self.assertEqual(len(self.writes), 1)

    def test_green_tests_dispatch_the_publisher_with_both_identities(self):
        with split_settings(), patch.object(channel, "run") as command, patch.object(channel, "gh_api") as api:
            channel.report_core_advance(CORE_NEXT, "success", "77")
        api.assert_not_called()
        command.assert_called_once_with(
            [
                "gh", "workflow", "run", "release-publish.yml", "--repo", PRO_REPOSITORY,
                "--ref", "main", "-f", "private_test_channel=true", "-f", "release_version=0.0.0",
                "-f", f"core_revision={CORE_NEXT}", "-f", "core_advance_run=77",
            ]
        )

    def test_failed_cancelled_or_skipped_tests_report_and_never_dispatch(self):
        for result in ("failure", "cancelled", "skipped", ""):
            self.writes.clear()
            with (
                self.subTest(result=result),
                split_settings(),
                patch.object(channel, "run") as command,
                patch.object(channel, "gh_api", side_effect=self.api),
                self.assertRaisesRegex(channel.ChannelError, "did not pass"),
            ):
                channel.report_core_advance(CORE_NEXT, result, "77")
            command.assert_not_called()
            self.assertIn("actions/runs/77", self.writes[0][1]["body"])

    def test_malformed_report_inputs_are_refused(self):
        for core, run_id in ((CORE_NEXT[:7], "77"), (CORE_NEXT, "x"), (CORE_NEXT, "0")):
            with (
                self.subTest(core=core, run_id=run_id),
                split_settings(),
                patch.object(channel, "run") as command,
                self.assertRaises(channel.ChannelError),
            ):
                channel.report_core_advance(core, "success", run_id)
            command.assert_not_called()

    def test_plan_needs_a_core_repository(self):
        with settings(), patch.object(channel, "gh_api") as api, self.assertRaises(channel.ChannelError):
            channel.plan_core_advance(retest=False)
        api.assert_not_called()

    def test_cli_plan_writes_outputs_and_skips_a_moved_pro_main(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "output"
            for latest, planned, expected in (
                (SOURCE, CORE_NEXT, f"needed=true\ncore_revision={CORE_NEXT}\n"),
                (SOURCE, None, "needed=false\ncore_revision=\n"),
                (PREVIOUS, CORE_NEXT, "needed=false\ncore_revision=\n"),
            ):
                with (
                    self.subTest(latest=latest, planned=planned),
                    split_settings(
                        GITHUB_REPOSITORY=PRO_REPOSITORY,
                        GITHUB_REF="refs/heads/main",
                        EIMIR_CORE_ADVANCE_RETEST="true",
                    ),
                    patch.object(channel, "latest_main", return_value=latest),
                    patch.object(channel, "plan_core_advance", return_value=planned) as plan,
                    patch.object(
                        sys,
                        "argv",
                        ["channel", "advance-plan", "--revision", SOURCE, "--github-output", str(output)],
                    ),
                ):
                    self.assertEqual(channel.main(), 0)
                    self.assertEqual(output.read_text(), expected)
                    if latest == SOURCE:
                        plan.assert_called_once_with(retest=True)
                    else:
                        plan.assert_not_called()
                output.unlink()

    def test_cli_report_needs_split_mode_and_the_owning_main(self):
        for values, expected in (
            ({"GITHUB_REPOSITORY": PRO_REPOSITORY, "GITHUB_REF": "refs/heads/main"}, 0),
            ({"GITHUB_REPOSITORY": PRO_REPOSITORY, "GITHUB_REF": "refs/heads/feature"}, 1),
            ({"GITHUB_REPOSITORY": "fork/eimir-pro", "GITHUB_REF": "refs/heads/main"}, 1),
        ):
            with (
                self.subTest(values=values),
                split_settings(GITHUB_RUN_ID="77", **values),
                patch.object(channel, "report_core_advance") as report,
                patch.object(
                    sys,
                    "argv",
                    ["channel", "advance-report", "--revision", SOURCE, "--core-revision", CORE, "--tests-result", "success"],
                ),
            ):
                self.assertEqual(channel.main(), expected)
                self.assertEqual(report.called, expected == 0)
        with (
            settings(GITHUB_REPOSITORY="baerenmarke90/eimir", GITHUB_REF="refs/heads/main", GITHUB_RUN_ID="77"),
            patch.object(channel, "report_core_advance") as report,
            patch.object(
                sys,
                "argv",
                ["channel", "advance-report", "--revision", SOURCE, "--core-revision", CORE, "--tests-result", "success"],
            ),
        ):
            self.assertEqual(channel.main(), 1)
        report.assert_not_called()


@unittest.skipUnless(shutil.which("git"), "git is required")
class ComposeSourceTest(unittest.TestCase):
    PROJECT = '[project]\nname = "eimir"\nversion = "0.1.0"\ndependencies = ["fastapi==1"]\n'

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        base = Path(self.temp.name)
        self.core = base / "core"
        self.pro = base / "pro"
        self.write(self.core, {
            "README.md": "Core readme\n",
            "LICENSE": "PolyForm\n",
            ".github/workflows/ci.yml": "name: CI\n",
            "backend/pyproject.toml": self.PROJECT,
            "backend/uv.lock": "core lock\n",
            "backend/src/eimir/main.py": "app = 1\n",
            "web/package.json": "{}\n",
            "tools/ci/pro_extraction_dry_run.sh": "echo dry run\n",
        })
        self.write(self.pro, {
            "README.md": "Pro readme\n",
            "LICENSE": "All rights reserved\n",
            ".github/workflows/release-publish.yml": "name: Publish\n",
            "backend/pyproject.toml": self.PROJECT
            + '\n[tool.uv.workspace]\nmembers = ["pro", "admin"]\n',
            "backend/uv.lock": "official lock\n",
            "backend/pro/pyproject.toml": "[project]\nname = 'eimir-pro'\n",
            "backend/pro/src/eimir_pro/plugin.py": "pro = 1\n",
            "backend/admin/pyproject.toml": "[project]\nname = 'eimir-admin'\n",
            "scripts/test_deployment_channel.py": "# publisher\n",
            "tools/ci/pro_extraction_dry_run.sh": "echo dry run\n",
        })
        self.revision = self.commit(self.core)

    def write(self, root, files):
        for path, content in files.items():
            (root / path).parent.mkdir(parents=True, exist_ok=True)
            (root / path).write_text(content, encoding="utf-8")

    def commit(self, root):
        identity = ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false"]
        if not (root / ".git").exists():
            subprocess.run(["git", "init", "-q", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "add", "-A"], check=True)
        subprocess.run(["git", "-C", str(root), *identity, "commit", "-q", "-m", "snapshot"], check=True)
        return subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, capture_output=True, text=True
        ).stdout.strip()

    def compose(self):
        with split_settings():
            return channel.compose_source(self.core, self.pro, self.revision)

    def test_core_tree_is_laid_under_the_pro_tree(self):
        self.assertEqual(self.compose(), 2)
        read = lambda path: (self.pro / path).read_text(encoding="utf-8")  # noqa: E731
        self.assertEqual(read("backend/src/eimir/main.py"), "app = 1\n")
        self.assertEqual(read("web/package.json"), "{}\n")
        # The Pro tree keeps the official workspace, its plugins, its pipeline
        # and its own repository documents; Core CI is never copied.
        self.assertEqual(read("backend/uv.lock"), "official lock\n")
        self.assertIn("[tool.uv.workspace]", read("backend/pyproject.toml"))
        self.assertEqual(read("backend/pro/src/eimir_pro/plugin.py"), "pro = 1\n")
        self.assertEqual(read("README.md"), "Pro readme\n")
        self.assertEqual(read("LICENSE"), "All rights reserved\n")
        self.assertFalse((self.pro / ".github/workflows/ci.yml").exists())
        self.assertEqual(read("scripts/test_deployment_channel.py"), "# publisher\n")

    def test_only_tracked_core_files_are_copied(self):
        (self.core / "backend/.env").write_text("SECRET=1\n", encoding="utf-8")
        self.compose()
        self.assertFalse((self.pro / "backend/.env").exists())

    def test_core_checkout_must_be_the_pinned_revision(self):
        with split_settings(), self.assertRaisesRegex(channel.ChannelError, "pinned Core revision"):
            channel.compose_source(self.core, self.pro, "e" * 40)
        with split_settings(), self.assertRaises(channel.ChannelError):
            channel.compose_source(self.core, self.pro, self.revision[:12])

    def test_core_revision_with_pro_code_is_refused(self):
        for path in ("backend/pro/leak.py", "backend/admin/leak.py"):
            with self.subTest(path=path):
                self.write(self.core, {path: "pro = 1\n"})
                self.revision = self.commit(self.core)
                with self.assertRaisesRegex(channel.ChannelError, "Pro-owned code"):
                    self.compose()
                subprocess.run(["git", "-C", str(self.core), "rm", "-q", path], check=True)
                self.revision = self.commit(self.core)

    def test_pro_tree_cannot_replace_a_core_file_and_nothing_is_copied(self):
        self.write(self.pro, {"backend/src/eimir/main.py": "app = 'shadowed'\n"})
        with self.assertRaisesRegex(channel.ChannelError, "backend/src/eimir/main.py"):
            self.compose()
        self.assertFalse((self.pro / "web/package.json").exists())
        self.assertEqual(
            (self.pro / "backend/src/eimir/main.py").read_text(encoding="utf-8"),
            "app = 'shadowed'\n",
        )

    def test_missing_official_workspace_or_plugin_project_is_refused(self):
        for path in (*channel.PRO_WORKSPACE_FILES, *channel.PRO_REQUIRED_FILES):
            with self.subTest(path=path):
                content = (self.pro / path).read_text(encoding="utf-8")
                (self.pro / path).unlink()
                with self.assertRaisesRegex(channel.ChannelError, "must provide"):
                    self.compose()
                (self.pro / path).write_text(content, encoding="utf-8")

    def test_core_project_change_requires_updated_pro_workspace_files(self):
        self.write(self.core, {"backend/pyproject.toml": self.PROJECT.replace("fastapi==1", "fastapi==2")})
        self.revision = self.commit(self.core)
        with self.assertRaisesRegex(channel.ChannelError, r"\[project\] differs"):
            self.compose()

    @unittest.skipIf(os.name == "nt", "symbolic links need privileges on Windows")
    def test_core_symbolic_links_are_refused(self):
        (self.core / "web/link").symlink_to("/etc/passwd")
        self.revision = self.commit(self.core)
        with self.assertRaisesRegex(channel.ChannelError, "regular files"):
            self.compose()

    def test_cli_compose_needs_a_core_repository(self):
        argv = [
            "channel", "compose-source", "--core", str(self.core),
            "--core-revision", self.revision, "--target", str(self.pro),
        ]
        with settings(), patch.object(sys, "argv", argv):
            self.assertEqual(channel.main(), 1)
        self.assertFalse((self.pro / "web/package.json").exists())
        with split_settings(), patch.object(sys, "argv", argv):
            self.assertEqual(channel.main(), 0)
        self.assertTrue((self.pro / "web/package.json").is_file())


class SplitEvidenceAndPublicationTest(unittest.TestCase):
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
        for name, roles in (
            ("backend-runtime", ["api", "worker", "migrate"]),
            ("web-runtime", ["web"]),
            ("media-runtime", ["video-worker"]),
        ):
            record = {"id": name, "path": f"{name}.image.tar", "sbom": f"sbom/{name}.spdx.json", "roles": roles}
            for field, digest in (("path", "sha256"), ("sbom", "sbomSha256")):
                (self.root / record[field]).write_bytes(f"{name}-{field}".encode())
                record[digest] = channel.sha256(self.root / record[field])
            self.index["artifacts"].append(record)

    def write_index(self, core_source=None):
        index = dict(self.index)
        if core_source is not None:
            index["coreSource"] = core_source
        (self.root / "evidence-index.json").write_text(json.dumps(index))

    def test_split_evidence_must_name_exactly_the_pinned_core(self):
        self.write_index({"repository": CORE_REPOSITORY, "revision": CORE})
        with split_settings():
            self.assertEqual(len(channel.evidence_records(self.root, SOURCE, CORE)), 3)
            for core_source, core in (
                ({"repository": CORE_REPOSITORY, "revision": CORE}, CORE_NEXT),
                ({"repository": "baerenmarke90/eimir-other", "revision": CORE}, CORE),
                ({"repository": CORE_REPOSITORY}, CORE),
                (None, CORE),
            ):
                self.write_index(core_source)
                with (
                    self.subTest(core_source=core_source),
                    self.assertRaisesRegex(channel.ChannelError, "Core identity"),
                ):
                    channel.evidence_records(self.root, SOURCE, core)

    def test_monorepo_evidence_must_not_name_a_separate_core(self):
        self.write_index()
        with settings():
            self.assertEqual(len(channel.evidence_records(self.root, SOURCE)), 3)
        self.write_index({"repository": CORE_REPOSITORY, "revision": CORE})
        with settings(), self.assertRaisesRegex(channel.ChannelError, "Core identity"):
            channel.evidence_records(self.root, SOURCE)

    def publish(self, core, **values):
        media = "ghcr.io/baerenmarke90/eimir-cloud-media@sha256:" + "5" * 64
        with (
            values.pop("environment"),
            patch.dict(os.environ, {"GITHUB_RUN_ID": "9", "GITHUB_RUN_ATTEMPT": "1"}),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready", return_value=True) as regression,
            patch.object(channel, "publish_image", side_effect=[BACKEND, WEB, media]),
            patch.object(channel, "anonymous_manifest_status", return_value=404),
            patch.object(channel, "canonical_compose", return_value={}),
            patch.object(channel, "export_compose", return_value={"services": {}}),
            patch.object(channel, "advance_channel", return_value=True) as advance,
        ):
            channel.publish(SOURCE, self.root, self.root / "out", core=core)
        return regression, advance

    def test_split_channel_binds_both_revisions(self):
        self.write_index({"repository": CORE_REPOSITORY, "revision": CORE})
        regression, advance = self.publish(CORE, environment=split_settings())
        regression.assert_not_called()
        self.assertEqual(advance.call_args.kwargs["core"], CORE)
        identity = json.loads((self.root / "out/channel.json").read_text())
        self.assertEqual(identity["sourceRevision"], SOURCE)
        self.assertEqual(identity["coreSource"], {"repository": CORE_REPOSITORY, "revision": CORE})
        self.assertEqual(identity["evidenceRun"], f"https://github.com/{PRO_REPOSITORY}/actions/runs/9")
        readme = (self.root / "out/README.md").read_text()
        self.assertIn(f"Source: `{SOURCE}`", readme)
        self.assertIn(f"Core: `{CORE}` from `{CORE_REPOSITORY}`", readme)
        self.assertIn(f"https://github.com/{CORE_REPOSITORY}/blob/main/docs/PRIVATE-TEST-CHANNEL.md", readme)

    def test_monorepo_channel_files_are_unchanged(self):
        self.write_index()
        self.publish(None, environment=settings())
        identity = json.loads((self.root / "out/channel.json").read_text())
        self.assertNotIn("coreSource", identity)
        self.assertEqual(identity["evidenceRun"], "https://github.com/baerenmarke90/eimir/actions/runs/9")
        self.assertEqual(
            (self.root / "out/README.md").read_text(),
            "# Generated private test deployment\n\n"
            "Prerelease operator channel, not a supported product release.\n"
            f"Source: `{SOURCE}`. All three images are pinned by OCI digest.\n\n"
            "Use Arcane Git Sync with the existing eimir-test project. Keep its local .env, "
            "database, media, deletion journal and keys. Never run bootstrap again.\n\n"
            "Setup and recovery: https://github.com/baerenmarke90/eimir/blob/main/"
            "docs/PRIVATE-TEST-CHANNEL.md\n",
        )

    def test_core_revision_is_required_exactly_in_split_mode(self):
        self.write_index()
        for environment, core in ((settings(), CORE), (split_settings(), None)):
            with (
                self.subTest(core=core),
                self.assertRaisesRegex(channel.ChannelError, "exactly when"),
            ):
                self.publish(core, environment=environment)

    def test_cli_publish_passes_the_core_revision_only_in_split_mode(self):
        argv = ["channel", "publish", "--revision", SOURCE, "--artifact-root", "/a", "--output", "/o"]
        base = {"GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "push"}
        with (
            split_settings(GITHUB_REPOSITORY=PRO_REPOSITORY, **base),
            patch.object(channel, "publish") as publish,
            patch.object(sys, "argv", [*argv, "--core-revision", CORE]),
        ):
            self.assertEqual(channel.main(), 0)
        self.assertEqual(publish.call_args.kwargs["core"], CORE)
        with (
            settings(GITHUB_REPOSITORY="baerenmarke90/eimir", **base),
            patch.object(channel, "publish") as publish,
            patch.object(sys, "argv", [*argv, "--core-revision", ""]),
        ):
            self.assertEqual(channel.main(), 0)
        self.assertIsNone(publish.call_args.kwargs["core"])
        for environment, extra in (
            (settings(GITHUB_REPOSITORY="baerenmarke90/eimir", **base), ["--core-revision", CORE]),
            (split_settings(GITHUB_REPOSITORY=PRO_REPOSITORY, **base), ["--core-revision", ""]),
        ):
            with (
                environment,
                patch.object(channel, "publish") as publish,
                patch.object(sys, "argv", [*argv, *extra]),
            ):
                self.assertEqual(channel.main(), 1)
            publish.assert_not_called()


class SplitBranchPromotionTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.files = {"compose.yaml": "{}", "channel.json": "{}", "README.md": "generated"}
        self.source = PREVIOUS
        self.core = CORE
        self.status = "ahead"

    def api(self, endpoint, *, payload=None, **kwargs):
        self.calls.append((endpoint, payload, kwargs))
        if "/git/ref/heads/" in endpoint:
            return {"object": {"sha": PREVIOUS}}
        if "/contents/" in endpoint:
            return channel_content(self.source, self.core)
        if "/compare/" in endpoint:
            return {"status": self.status}
        return {"sha": "a" * 40}

    def advance(self, core=CORE_NEXT):
        with (
            split_settings(),
            patch.object(channel, "latest_main", return_value=SOURCE),
            patch.object(channel, "candidate_ready") as regression,
            patch.object(channel, "gh_api", side_effect=self.api),
        ):
            result = channel.advance_channel(self.files, SOURCE, core=core)
        regression.assert_not_called()
        return result

    def test_newer_core_with_the_same_pro_revision_advances(self):
        self.source = SOURCE
        self.assertTrue(self.advance())
        self.assertTrue(self.calls[-1][0].endswith("/git/refs/heads/deploy/eimir-test"))

    def test_same_pair_is_idempotent(self):
        self.source, self.core = SOURCE, CORE_NEXT
        self.assertFalse(self.advance())
        self.assertFalse(any(endpoint.endswith("/git/trees") for endpoint, _, _ in self.calls))

    def test_a_concurrently_selected_newer_core_is_never_replaced(self):
        for status in ("behind", "diverged"):
            self.calls.clear()
            self.status = status
            with self.subTest(status=status), self.assertRaisesRegex(channel.ChannelError, "keeping the current channel"):
                self.advance()
            self.assertFalse(any(endpoint.endswith("/git/trees") for endpoint, _, _ in self.calls))


class InstanceExportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.canonical = channel.canonical_compose()

    def test_rehearsal_instance_never_names_the_eimir_test_resources(self):
        with settings(EIMIR_TEST_CHANNEL_INSTANCE="eimir-rehearsal"):
            exported = channel.export_compose(self.canonical, BACKEND, WEB)
        self.assertEqual(exported["name"], "eimir-rehearsal")
        self.assertEqual(exported["networks"]["app"], {"external": True, "name": "eimir-rehearsal-data"})
        # The shared proxy network stays; only the instance aliases change.
        self.assertEqual(exported["networks"]["proxy"], {"external": True, "name": "mailcow-proxy"})
        for name, volume in exported["volumes"].items():
            self.assertEqual(volume, {"external": True, "name": "eimir-rehearsal_" + name})
        self.assertIn(
            "@eimir-rehearsal-postgres:5432/sidebyside",
            exported["services"]["cloud-migrate"]["environment"]["EIMIR_DATABASE_URL"],
        )
        self.assertEqual(
            exported["services"]["cloud-api"]["networks"]["proxy"], {"aliases": ["eimir-rehearsal-api"]}
        )
        self.assertEqual(
            exported["services"]["cloud-web"]["networks"]["proxy"], {"aliases": ["eimir-rehearsal-web"]}
        )
        self.assertNotIn("eimir-test", json.dumps(exported))

    def test_default_instance_export_is_unchanged(self):
        with settings():
            default = channel.export_compose(self.canonical, BACKEND, WEB)
        with settings(EIMIR_TEST_CHANNEL_INSTANCE="eimir-test"):
            explicit = channel.export_compose(self.canonical, BACKEND, WEB)
        self.assertEqual(default, explicit)
        self.assertEqual(default["name"], "eimir-test")


class CodeScanningStateTest(unittest.TestCase):
    """Decision 0019, D5: CodeQL leaves the required set only where it is recorded unavailable."""

    def setUp(self):
        # The monorepo defaults, whatever Decision 0019 variables the host sets.
        self.enterContext(settings())

    def metadata(self, visibility: str) -> dict:
        return {
            "full_name": channel.DEFAULT_REPOSITORY,
            "visibility": visibility,
            "private": visibility != "public",
            "owner": {"login": channel.DEFAULT_REPOSITORY.split("/")[0], "type": "User"},
        }

    def api(self, visibility: str, runs: list[dict]):
        def respond(endpoint: str, **_: object):
            if endpoint == f"repos/{channel.DEFAULT_REPOSITORY}":
                return self.metadata(visibility)
            if endpoint.startswith(f"repos/{channel.DEFAULT_REPOSITORY}/actions/runs?head_sha={SOURCE}"):
                return [{"workflow_runs": runs}]
            raise AssertionError(endpoint)

        return respond

    def ready(self, visibility: str, acceptance: str, runs: list[dict]) -> bool:
        with (
            patch.dict(os.environ, {"EIMIR_SUPPLY_CHAIN_EXCEPTION": acceptance}),
            patch.object(channel, "gh_api", side_effect=self.api(visibility, runs)),
            patch("sys.stdout", new_callable=io.StringIO),
        ):
            return channel.candidate_ready(SOURCE)

    def without_codeql(self) -> list[dict]:
        return [run for run in successful_runs() if run["path"] != channel.CODE_SCANNING_WORKFLOW]

    def test_codeql_is_one_of_the_required_workflows(self):
        self.assertIn(channel.CODE_SCANNING_WORKFLOW, channel.REQUIRED_WORKFLOWS)

    def test_available_state_keeps_codeql_required_unchanged(self):
        self.assertTrue(self.ready("public", "", successful_runs()))
        self.assertFalse(self.ready("public", "", self.without_codeql()))
        runs = successful_runs()
        next(run for run in runs if run["path"] == channel.CODE_SCANNING_WORKFLOW)["conclusion"] = "failure"
        with self.assertRaisesRegex(channel.ChannelError, "codeql.yml"):
            self.ready("public", "", runs)

    def test_unavailable_state_admits_the_regression_without_codeql(self):
        output = io.StringIO()
        with (
            patch.dict(os.environ, {"EIMIR_SUPPLY_CHAIN_EXCEPTION": "decision-0019-d5"}),
            patch.object(channel, "gh_api", side_effect=self.api("private", self.without_codeql())),
            patch("sys.stdout", output),
        ):
            self.assertTrue(channel.candidate_ready(SOURCE))
        self.assertIn("CodeQL is not a required workflow here", output.getvalue())
        self.assertIn(channel.DEFAULT_REPOSITORY, output.getvalue())

    def test_unavailable_state_keeps_every_other_guarantee(self):
        # Missing, failed, cancelled or skipped required work is still refused.
        runs = self.without_codeql()
        self.assertFalse(self.ready("private", "decision-0019-d5", runs[:-1]))
        for conclusion in ("failure", "cancelled", "skipped"):
            changed = [dict(run) for run in runs]
            changed[0]["conclusion"] = conclusion
            with self.subTest(conclusion=conclusion), self.assertRaises(channel.ChannelError):
                self.ready("private", "decision-0019-d5", changed)

    def test_unavailable_state_without_the_acceptance_is_refused(self):
        for acceptance in ("", "yes"):
            with self.subTest(acceptance=acceptance), self.assertRaisesRegex(
                channel.ChannelError, "EIMIR_SUPPLY_CHAIN_EXCEPTION"
            ):
                self.ready("private", acceptance, self.without_codeql())

    def test_acceptance_on_a_repository_with_code_scanning_is_refused(self):
        with self.assertRaisesRegex(channel.ChannelError, "Remove the variable"):
            self.ready("public", "decision-0019-d5", successful_runs())

    def test_full_regression_gate_reads_the_same_state(self):
        with (
            patch.dict(os.environ, {"EIMIR_SUPPLY_CHAIN_EXCEPTION": "decision-0019-d5"}),
            patch.object(channel, "gh_api", side_effect=self.api("private", self.without_codeql())),
            patch.object(channel, "run") as command,
            patch("sys.stdout", new_callable=io.StringIO),
        ):
            channel.require_full_regression(SOURCE, dispatch=True)
        command.assert_not_called()


if __name__ == "__main__":
    unittest.main()

