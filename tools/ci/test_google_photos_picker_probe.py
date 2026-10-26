#!/usr/bin/env python3
"""Deterministic security and cleanup tests for the manual Google Picker probe."""

from __future__ import annotations

import io
import json
import sys
import tempfile
import types
import unittest
import urllib.parse
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import google_photos_picker_probe as probe  # noqa: E402


class PickerProbeTest(unittest.TestCase):
    def test_oauth_requires_credentials_outside_repo(self) -> None:
        with self.assertRaisesRegex(probe.ProbeError, "outside this repository"):
            probe.authorize_desktop(str(Path(__file__).resolve()))

    def test_official_google_oauth_flow_is_scoped_pkce_and_online_only(self) -> None:
        config = {
            "installed": {
                "client_id": "desktop-test",
                "client_secret": "test-only-secret",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        fake_flow = SimpleNamespace(
            run_local_server=Mock(return_value=SimpleNamespace(token="test-access-token"))
        )
        fake_sdk = SimpleNamespace(
            from_client_config=Mock(return_value=fake_flow)
        )
        fake_package = types.ModuleType("google_auth_oauthlib")
        fake_module = types.ModuleType("google_auth_oauthlib.flow")
        fake_module.InstalledAppFlow = fake_sdk

        with tempfile.TemporaryDirectory() as folder:
            client_file = Path(folder) / "desktop.json"
            client_file.write_text(json.dumps(config), encoding="utf-8")
            with patch.dict(
                sys.modules,
                {"google_auth_oauthlib": fake_package,
                 "google_auth_oauthlib.flow": fake_module},
            ):
                self.assertEqual(
                    probe.authorize_desktop(str(client_file)), "test-access-token"
                )
        fake_sdk.from_client_config.assert_called_once_with(
            config, scopes=[probe.SCOPE], autogenerate_code_verifier=True
        )
        self.assertEqual(
            fake_flow.run_local_server.call_args.kwargs,
            {
                "host": "127.0.0.1",
                "port": 0,
                "open_browser": True,
                "timeout_seconds": probe.MAX_WAIT_SECONDS,
                "access_type": "online",
                "authorization_prompt_message": None,
            },
        )

    def test_oauth_rejects_non_google_token_endpoint(self) -> None:
        config = {
            "installed": {
                "client_id": "desktop-test",
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://attacker.invalid/token",
            }
        }
        with tempfile.TemporaryDirectory() as folder:
            client_file = Path(folder) / "desktop.json"
            client_file.write_text(json.dumps(config), encoding="utf-8")
            with self.assertRaisesRegex(probe.ProbeError, "official endpoints"):
                probe.authorize_desktop(str(client_file))

    def test_external_uri_must_be_exact_google_photos_host(self) -> None:
        self.assertTrue(probe.valid_picker_uri("https://photos.google.com/photo-picker/test"))
        for value in (
            "http://photos.google.com/pick",
            "https://photos.google.com.evil.invalid/pick",
            "https://photos.google.com@evil.invalid/pick",
            "https://evil.invalid@photos.google.com/pick",
            "https://photos.google.com:444/pick",
            "https://photos.google.com:invalid/pick",
        ):
            with self.subTest(uri=value):
                self.assertFalse(probe.valid_picker_uri(value))

    def test_provider_host_rejected_before_oauth_header_is_sent(self) -> None:
        with patch.object(probe.OPENER, "open") as open_request:
            with self.assertRaisesRegex(probe.ProbeError, "Unrecognized"):
                probe.request_json(
                    "https://attack.invalid/v1/sessions", token="secret-token"
                )
            open_request.assert_not_called()

    def test_media_host_is_allowlisted_before_token_transfer(self) -> None:
        bad_item = {
            "type": "PHOTO",
            "mediaFile": {
                "mimeType": "image/jpeg",
                "baseUrl": "https://lh3.googleusercontent.com.attacker.invalid/photo",
            },
        }
        with patch.object(probe.OPENER, "open") as open_request:
            with self.assertRaisesRegex(probe.ProbeError, "trusted Google CDN"):
                probe.download_discarded_test_photo(bad_item, "secret-token")
            open_request.assert_not_called()

    def test_media_download_discards_bytes_without_persisting(self) -> None:
        item = {
            "type": "PHOTO",
            "mediaFile": {
                "mimeType": "image/jpeg",
                "baseUrl": "https://lh3.googleusercontent.com/p/synthetic",
            },
        }
        with patch.object(probe.OPENER, "open", return_value=io.BytesIO(b"photo")) as call:
            self.assertEqual(probe.download_discarded_test_photo(item, "token"), 5)
            request = call.call_args.args[0]
            self.assertEqual(request.full_url, item["mediaFile"]["baseUrl"] + "=d")
            self.assertEqual(request.get_header("Authorization"), "Bearer token")

    def test_picker_calls_delete_after_success_and_partial_failure(self) -> None:
        created = {
            "id": "test-session",
            "pickerUri": "https://photos.google.com/picker/session",
            "pollingConfig": {"pollInterval": "1s", "timeoutIn": "20s"},
        }
        chosen = {"id": "test-session", "mediaItemsSet": True}
        selected = {
            "mediaItems": [{
                "type": "PHOTO",
                "mediaFile": {
                    "mimeType": "image/jpeg",
                    "baseUrl": "https://lh3.googleusercontent.com/p/synthetic",
                },
            }],
        }

        for failure in (False, True):
            with self.subTest(failure=failure):
                calls = []

                def fake_request(url, *, method="GET", **kwargs):
                    calls.append((method, url))
                    if method == "POST":
                        return created
                    if method == "DELETE":
                        return {}
                    if "/mediaItems?" in url:
                        return selected
                    return chosen

                with (
                    patch.object(probe, "request_json", side_effect=fake_request),
                    patch.object(probe.webbrowser, "open", return_value=True),
                    patch.object(probe.time, "sleep"),
                    patch.object(
                        probe,
                        "download_discarded_test_photo",
                        side_effect=probe.ProbeError("byte transfer failed") if failure else None,
                        return_value=12,
                    ),
                ):
                    if failure:
                        with self.assertRaises(probe.ProbeError):
                            probe.run_picker("secret-token")
                    else:
                        self.assertEqual(probe.run_picker("secret-token"), 0)
                self.assertEqual(calls[-1], ("DELETE", probe.API + "/sessions/test-session"))

    def test_invalid_picker_url_also_cleans_up_session(self) -> None:
        calls = []

        def fake_request(url, *, method="GET", **kwargs):
            calls.append(method)
            if method == "POST":
                return {"id": "session", "pickerUri": "https://attacker.invalid/pick"}
            return {}

        with (
            patch.object(probe, "request_json", side_effect=fake_request),
            patch.object(probe.webbrowser, "open") as browser,
            self.assertRaisesRegex(probe.ProbeError, "unexpected selection URL"),
        ):
            probe.run_picker("token")
        self.assertEqual(calls, ["POST", "DELETE"])
        browser.assert_not_called()

    def test_poll_duration_validation(self) -> None:
        self.assertEqual(probe.seconds("3.5s"), 3.5)
        for value in (0, "4", "3ms", "-1s", "abc"):
            with self.subTest(value=value), self.assertRaises(probe.ProbeError):
                probe.seconds(value)


if __name__ == "__main__":
    unittest.main()
