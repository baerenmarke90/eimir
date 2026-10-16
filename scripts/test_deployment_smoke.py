"""Focused regression tests for the deployment smoke helper."""

from __future__ import annotations

import argparse
import json
import os
import unittest
from unittest.mock import patch

from scripts import deployment_smoke


class RevisionEvidenceTest(unittest.TestCase):
    def test_release_evidence_requires_exact_commit_sha(self) -> None:
        args = argparse.Namespace(allow_unverified_local=False, expected_revision="main")

        with self.assertRaisesRegex(RuntimeError, "40-character Git commit SHA"):
            deployment_smoke.expected_revision(args)

    def test_explicit_local_mode_uses_only_unverified_sentinel(self) -> None:
        args = argparse.Namespace(allow_unverified_local=True, expected_revision=None)

        self.assertEqual(
            deployment_smoke.expected_revision(args),
            deployment_smoke.UNVERIFIED_REVISION,
        )


class SmokeSessionCleanupTest(unittest.TestCase):
    def test_membership_failure_still_revokes_smoke_session(self) -> None:
        origin = "https://smoke.example.invalid"
        access_token = "test-access-token"
        sign_out_calls: list[str] = []

        def fake_request(
            url: str,
            *,
            method: str = "GET",
            payload: dict[str, object] | None = None,
            bearer: str | None = None,
        ) -> deployment_smoke.HttpResult:
            if url == f"{origin}/healthz":
                return deployment_smoke.HttpResult(200, b"ok\n", None)
            if url == f"{origin}/.well-known/eimir-revision":
                return deployment_smoke.HttpResult(
                    200,
                    deployment_smoke.UNVERIFIED_REVISION.encode("utf-8"),
                    None,
                )
            if url == f"{origin}/api/v1/health/ready":
                return deployment_smoke.HttpResult(
                    200,
                    b'{"status":"ok","database":"ok"}',
                    deployment_smoke.UNVERIFIED_REVISION,
                )
            if url == f"{origin}/api/v1/auth/sign-in":
                self.assertEqual(method, "POST")
                self.assertIsNotNone(payload)
                body = json.dumps({"tokens": {"accessToken": access_token}}).encode("utf-8")
                return deployment_smoke.HttpResult(200, body, None)
            if url == f"{origin}/api/v1/auth/memberships":
                self.assertEqual(bearer, access_token)
                raise RuntimeError("membership read failed")
            if url == f"{origin}/api/v1/auth/sign-out":
                self.assertEqual(method, "POST")
                self.assertEqual(bearer, access_token)
                sign_out_calls.append(url)
                return deployment_smoke.HttpResult(204, b"", None)
            self.fail(f"unexpected smoke request: {url}")

        environment = {
            "EIMIR_SMOKE_EMAIL": "smoke@example.invalid",
            "EIMIR_SMOKE_PASSWORD": "not-a-real-secret",
        }
        with (
            patch.object(deployment_smoke, "request", side_effect=fake_request),
            patch.dict(os.environ, environment, clear=False),
        ):
            with self.assertRaisesRegex(RuntimeError, "membership read failed"):
                deployment_smoke.check(origin, deployment_smoke.UNVERIFIED_REVISION)

        self.assertEqual(sign_out_calls, [f"{origin}/api/v1/auth/sign-out"])


if __name__ == "__main__":
    unittest.main()
