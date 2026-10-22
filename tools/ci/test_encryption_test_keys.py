#!/usr/bin/env python3
"""Tests for the CI encryption key generator (issue #797)."""

from __future__ import annotations

import base64
import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import encryption_test_keys


class EncryptionTestKeysTest(unittest.TestCase):
    def run_main(self) -> tuple[int, str, dict[str, str]]:
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / "github_env"
            env_file.write_text("EXISTING=1\n", encoding="utf-8")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = encryption_test_keys.main([str(env_file)])
            pairs = dict(
                line.split("=", 1)
                for line in env_file.read_text(encoding="utf-8").splitlines()
            )
        return code, stdout.getvalue(), pairs

    def test_writes_a_usable_key_ring_and_keeps_existing_entries(self) -> None:
        code, _, env = self.run_main()
        self.assertEqual(code, 0)
        self.assertEqual(env["EXISTING"], "1")
        keys = json.loads(env["EIMIR_ENCRYPTION_KEYS"])
        self.assertEqual(list(keys), [env["EIMIR_ENCRYPTION_ACTIVE_KEY_ID"]])
        raw = base64.b64decode(keys[env["EIMIR_ENCRYPTION_ACTIVE_KEY_ID"]], validate=True)
        self.assertEqual(len(raw), 32)
        self.assertGreater(len(set(raw)), 1, "a repeated-byte placeholder would be refused")

    def test_masks_the_key_before_anything_else_can_print_it(self) -> None:
        _, stdout, env = self.run_main()
        encoded = next(iter(json.loads(env["EIMIR_ENCRYPTION_KEYS"]).values()))
        self.assertEqual(stdout, f"::add-mask::{encoded}\n")

    def test_every_run_gets_a_different_key(self) -> None:
        first = self.run_main()[2]["EIMIR_ENCRYPTION_KEYS"]
        second = self.run_main()[2]["EIMIR_ENCRYPTION_KEYS"]
        self.assertNotEqual(first, second)

    def test_rejects_a_wrong_key_length(self) -> None:
        with self.assertRaises(ValueError):
            encryption_test_keys.render(b"short")

    def test_requires_exactly_one_argument(self) -> None:
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(encryption_test_keys.main([]), 2)


if __name__ == "__main__":
    unittest.main()
