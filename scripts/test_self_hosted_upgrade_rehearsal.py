#!/usr/bin/env python3
"""Unit tests for the Self-Hosted rehearsal helpers (no Docker required)."""

from __future__ import annotations

import io
import unittest
from contextlib import redirect_stderr
from unittest import mock

from scripts import self_hosted_upgrade_rehearsal as rehearsal
from scripts.self_hosted_release import DEPLOY_SEQUENCE


class ReleaseMigrationTest(unittest.TestCase):
    def test_rendered_migration_is_valid_python_chained_to_the_current_head(self) -> None:
        source = rehearsal.render_release_migration("zz9001", "0058")
        namespace: dict[str, object] = {}
        # The module imports alembic/sqlalchemy lazily at exec time; only the
        # revision chain and the two entry points matter here.
        compile(source, "release_migration.py", "exec")
        for line in source.splitlines():
            if line.startswith(("revision =", "down_revision =")):
                exec(line, namespace)  # noqa: S102 - literal assignments rendered above
        self.assertEqual(namespace["revision"], "zz9001")
        self.assertEqual(namespace["down_revision"], "0058")
        self.assertIn("def upgrade()", source)
        self.assertIn("def downgrade()", source)

    def test_revision_identifiers_cannot_inject_code(self) -> None:
        hostile = (('x"; import os', "0058"), ("zz9001", "0058\nimport os"), ("", "0058"))
        for revision, down in hostile:
            with (
                self.subTest(revision=revision, down=down),
                self.assertRaises(rehearsal.RehearsalError),
            ):
                rehearsal.render_release_migration(revision, down)


class DeploySequenceReuseTest(unittest.TestCase):
    """The rehearsal must exercise exactly the launcher's deploy sequence."""

    def test_rehearsal_runs_every_launcher_step_except_the_registry_pull(self) -> None:
        stack = rehearsal.Stack.__new__(rehearsal.Stack)
        calls: list[tuple[str, ...]] = []

        def fake_compose(*arguments: str, **_: object):
            calls.append(arguments)
            return mock.Mock(returncode=0, stdout="", stderr="")

        stack.compose = fake_compose  # type: ignore[method-assign]
        stack.deploy()
        self.assertEqual(
            calls, [arguments for _, arguments in DEPLOY_SEQUENCE if arguments[0] != "pull"]
        )

    def test_a_failing_step_stops_the_sequence_and_reports_it(self) -> None:
        stack = rehearsal.Stack.__new__(rehearsal.Stack)
        calls: list[tuple[str, ...]] = []

        def fake_compose(*arguments: str, **_: object):
            calls.append(arguments)
            code = 255 if arguments[0] == "run" else 0
            return mock.Mock(returncode=code, stdout="", stderr="")

        stack.compose = fake_compose  # type: ignore[method-assign]
        refused = stack.deploy(check=False)
        self.assertEqual(refused.returncode, 255)
        self.assertEqual([c[0] for c in calls], ["up", "run"])
        with self.assertRaises(rehearsal.RehearsalError):
            stack.deploy()


class SafetyBoundaryTest(unittest.TestCase):
    def test_registry_images_are_refused_before_docker_is_used(self) -> None:
        with (
            mock.patch.object(rehearsal.subprocess, "run") as run,
            redirect_stderr(io.StringIO()),
        ):
            status = rehearsal.main(
                ["--backend-image", "ghcr.io/baerenmarke90/eimir-backend:v0.1.0"]
            )
        self.assertEqual(status, 1)
        run.assert_not_called()

    def test_rehearsal_environment_never_inherits_deployment_variables(self) -> None:
        with mock.patch.dict(
            rehearsal.os.environ,
            {"EIMIR_ENVIRONMENT": "production", "COMPOSE_PROFILES": "cloud", "HOME": "/h"},
        ):
            environment = rehearsal.clean_environment()
        self.assertNotIn("EIMIR_ENVIRONMENT", environment)
        self.assertNotIn("COMPOSE_PROFILES", environment)
        self.assertEqual(environment["HOME"], "/h")


if __name__ == "__main__":
    unittest.main()
