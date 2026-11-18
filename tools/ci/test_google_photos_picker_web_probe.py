#!/usr/bin/env python3
"""Offline security tests for the optional HTTPS Google Photos callback service."""

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
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import google_photos_picker_web_probe as cloud  # noqa: E402

ORIGIN = "https://photos-probe.example.org"
ADMIN_KEY = "operator-only-random-high-entropy-secret-123456789"
GOOGLE_PICKER = "https://photos.google.com/photo-picker/test"
OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


class FakeFlow:
    credentials = SimpleNamespace(token="temporary-provider-bearer")

    def __init__(self) -> None:
        self.fetch_token = Mock()
        self.authorization_url = Mock(return_value=(OAUTH_URL, "expected-state"))


def header(headers, key):
    return next((v for k, v in headers if k.lower() == key.lower()), None)


def extract_cookie(headers):
    value = header(headers, "Set-Cookie")
    if not value:
        return ""
    return value.split(";", 1)[0]


class CloudPickerProbeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.flow = FakeFlow()
        self.now = 123.0
        self.app = cloud.CloudProbe(
            ORIGIN, {"web": {"client_id": "example"}},
            ADMIN_KEY, flow_factory=lambda *_: self.flow,
            clock=lambda: self.now,
        )

    def request(self, method, path, **kwargs):
        return self.app.handle(method, path, **kwargs)

    def http_request(self, method, path, *, body=b"", **headers):
        env = {
            "HTTP_HOST": urllib.parse.urlsplit(ORIGIN).netloc,
            "REQUEST_METHOD": method,
            "PATH_INFO": path,
            "CONTENT_LENGTH": str(len(body)),
            "wsgi.input": io.BytesIO(body),
            **headers,
        }
        sent = []
        chunks = self.app(env, lambda status, response_headers: sent.append(
            (status, response_headers)
        ))
        return *sent[0], b"".join(chunks)

    def begin(self):
        result = self.request(
            "POST", "/start",
            body=urllib.parse.urlencode({"operator_key": ADMIN_KEY}).encode(),
            request_origin=ORIGIN,
        )
        self.assertEqual(result[0], "303 See Other")
        self.assertEqual(header(result[1], "Location"), OAUTH_URL)
        self.assertEqual(header(result[1], "Referrer-Policy"), "no-referrer")
        self.assertIn("SameSite=Lax", header(result[1], "Set-Cookie"))
        self.assertIn("Secure", header(result[1], "Set-Cookie"))
        self.assertIn("HttpOnly", header(result[1], "Set-Cookie"))
        self.assertNotIn("temporary-provider-bearer", result[2].decode())
        return extract_cookie(result[1])

    def callback(self, cookie, query="state=expected-state&code=opaque-auth-code"):
        return self.request(
            "GET", "/oauth/callback", query=query, cookie=cookie
        )

    def test_https_origin_and_web_client_validation(self):
        self.assertEqual(cloud.validate_origin(ORIGIN), ORIGIN)
        for url in ("http://example.org", "https://localhost",
                    "https://example.org/path", "https://evil@example.org",
                    "https://example.org:1234", "https://example.org?bad=1"):
            with self.subTest(url=url), self.assertRaises(cloud.CloudProbeError):
                cloud.validate_origin(url)
        config = {
            "web": {
                "client_id": "test-id",
                "client_secret": "do-not-log",
                "auth_uri": "https://accounts.google.com/o/oauth2/v2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [ORIGIN + "/oauth/callback"],
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            filename = Path(directory) / "web.json"
            filename.write_text(json.dumps(config))
            self.assertEqual(cloud.load_config(str(filename), ORIGIN), config)
            config["web"]["redirect_uris"] = ["https://other.example.org/cb"]
            filename.write_text(json.dumps(config))
            with self.assertRaisesRegex(cloud.CloudProbeError, "exact HTTPS callback"):
                cloud.load_config(str(filename), ORIGIN)

    def test_production_feature_is_disabled_without_operator_configuration(self):
        with self.assertRaisesRegex(cloud.CloudProbeError, "high-entropy"):
            cloud.CloudProbe(ORIGIN, {}, "short")
        no_cookie = self.request("GET", "/")
        self.assertEqual(no_cookie[0], "200 OK")
        self.assertNotIn("client_secret", no_cookie[2].decode())

    def test_rejected_operator_secret_does_not_start_google_oauth(self):
        for attempt in range(5):
            response = self.request(
                "POST", "/start",
                body=b"operator_key=wrong",
                request_origin=ORIGIN,
            )
            self.assertEqual(response[0], "403 Forbidden")
        locked = self.request(
            "POST", "/start",
            body=urllib.parse.urlencode({"operator_key": ADMIN_KEY}).encode(),
        )
        self.assertEqual(locked[0], "429 Too Many Requests")
        self.flow.authorization_url.assert_not_called()

    def test_form_pages_preserve_origin_without_exposing_callback_referrers(self):
        home = self.request("GET", "/")
        self.assertEqual(header(home[1], "Referrer-Policy"), "same-origin")
        self.assertEqual(
            header(home[1], "Content-Security-Policy"),
            "default-src 'none'; form-action 'self' " + OAUTH_URL
            + "; base-uri 'none'; frame-ancestors 'none'",
        )
        cookie = self.begin()
        mismatch = self.callback(cookie, "state=foreign&code=opaque-auth-code")
        self.assertEqual(header(mismatch[1], "Referrer-Policy"), "no-referrer")
        with patch.object(
            cloud, "request_json",
            side_effect=[
                {"id": "session", "pickerUri": GOOGLE_PICKER},
                {"mediaItemsSet": False},
            ],
        ):
            callback = self.callback(cookie)
            self.assertEqual(callback[0], "303 See Other")
            self.assertEqual(header(callback[1], "Referrer-Policy"), "no-referrer")
            self.assertNotIn(OAUTH_URL, header(callback[1], "Content-Security-Policy"))
            for path in ("/", "/select"):
                page = self.request("GET", path, cookie=cookie)
                self.assertEqual(header(page[1], "Referrer-Policy"), "same-origin")
                self.assertNotIn(OAUTH_URL, header(page[1], "Content-Security-Policy"))
            pending = self.request(
                "POST", "/check", cookie=cookie, request_origin=ORIGIN,
                body=urllib.parse.urlencode({"csrf": self.app.active.csrf}).encode(),
            )
            self.assertIn("not complete", pending[2].decode())
            self.assertEqual(header(pending[1], "Referrer-Policy"), "same-origin")

    def test_opaque_and_foreign_origins_cannot_start_oauth(self):
        body = urllib.parse.urlencode({"operator_key": ADMIN_KEY}).encode()
        for origin in ("null", "https://attacker.invalid", ORIGIN.replace("https:", "http:")):
            with self.subTest(origin=origin):
                rejected = self.http_request(
                    "POST", "/start", body=body, HTTP_ORIGIN=origin,
                    HTTP_REFERER=ORIGIN + "/",
                    HTTP_X_FORWARDED_HOST=urllib.parse.urlsplit(ORIGIN).netloc,
                    HTTP_X_FORWARDED_PROTO="https",
                )
                self.assertEqual(rejected[0], "403 Forbidden")
                self.assertIn("Cross-origin request rejected.", rejected[2].decode())
                self.assertIsNone(self.app.active)
        self.flow.authorization_url.assert_not_called()
        self.assertEqual(self.app.failed_logins, 0)
        accepted = self.http_request("POST", "/start", body=body, HTTP_ORIGIN=ORIGIN)
        self.assertEqual(accepted[0], "303 See Other")
        self.flow.authorization_url.assert_called_once()

    def test_cross_origin_session_forms_cannot_use_valid_cookie_and_csrf(self):
        cookie = self.begin()
        with patch.object(
            cloud, "request_json", return_value={"id": "session", "pickerUri": GOOGLE_PICKER}
        ):
            self.callback(cookie)
        active = self.app.active
        body = urllib.parse.urlencode({"csrf": active.csrf}).encode()
        with patch.object(cloud, "request_json") as upstream:
            for path in ("/check", "/cancel"):
                for origin in ("null", "https://attacker.invalid"):
                    with self.subTest(path=path, origin=origin):
                        rejected = self.http_request(
                            "POST", path, body=body,
                            HTTP_COOKIE=cookie, HTTP_ORIGIN=origin,
                        )
                        self.assertEqual(rejected[0], "403 Forbidden")
                        self.assertIs(self.app.active, active)
            upstream.assert_not_called()

    def test_proxy_headers_and_google_referrer_do_not_replace_host_or_oauth_binding(self):
        invalid_host = self.http_request(
            "GET", "/", HTTP_HOST="attacker.invalid",
            HTTP_X_FORWARDED_HOST=urllib.parse.urlsplit(ORIGIN).netloc,
            HTTP_X_FORWARDED_PROTO="https", HTTP_ORIGIN=ORIGIN,
        )
        self.assertEqual(invalid_host[0], "400 Bad Request")
        cookie = self.begin()
        callback_headers = {
            "QUERY_STRING": "state=expected-state&code=opaque-auth-code",
            "HTTP_REFERER": "https://accounts.google.com/",
        }
        no_cookie = self.http_request("GET", "/oauth/callback", **callback_headers)
        self.assertEqual(no_cookie[0], "403 Forbidden")
        mismatch = self.http_request(
            "GET", "/oauth/callback", **{**callback_headers,
                "HTTP_COOKIE": cookie, "QUERY_STRING": "state=foreign&code=opaque"},
        )
        self.assertEqual(mismatch[0], "403 Forbidden")
        self.flow.fetch_token.assert_not_called()
        with patch.object(
            cloud, "request_json", return_value={"id": "session", "pickerUri": GOOGLE_PICKER}
        ):
            callback = self.http_request(
                "GET", "/oauth/callback", HTTP_COOKIE=cookie, **callback_headers
            )
        self.assertEqual(callback[0], "303 See Other")
        self.assertEqual(header(callback[1], "Referrer-Policy"), "no-referrer")
        self.flow.fetch_token.assert_called_once()

    def test_google_sdk_owns_web_oauth_pkce(self):
        fake_sdk = SimpleNamespace(
            from_client_config=Mock(return_value=SimpleNamespace(redirect_uri=None))
        )
        fake_package = types.ModuleType("google_auth_oauthlib")
        fake_module = types.ModuleType("google_auth_oauthlib.flow")
        fake_module.Flow = fake_sdk
        with patch.dict(
            sys.modules,
            {"google_auth_oauthlib": fake_package,
             "google_auth_oauthlib.flow": fake_module},
        ):
            flow = cloud.new_google_flow({"web": {}}, ORIGIN + "/oauth/callback")
        self.assertEqual(flow.redirect_uri, ORIGIN + "/oauth/callback")
        fake_sdk.from_client_config.assert_called_once_with(
            {"web": {}}, scopes=[cloud.SCOPE], autogenerate_code_verifier=True
        )

    def test_cookie_origin_and_state_bind_the_callback(self):
        cookie = self.begin()
        self.assertEqual(self.callback("",)[0], "403 Forbidden")
        mismatch = self.callback(cookie, "state=foreign&code=not-authorized")
        self.assertEqual(mismatch[0], "403 Forbidden")
        self.flow.fetch_token.assert_not_called()
        self.assertIsNotNone(self.app.active)
        cross = self.request(
            "GET", "/oauth/callback",
            query="state=expected-state&code=opaque",
            cookie=cookie, request_origin="https://attacker.invalid",
        )
        self.assertEqual(cross[0], "403 Forbidden")
        self.flow.fetch_token.assert_not_called()

    def test_token_exchange_timeout_clears_session_and_redacts_failure(self):
        cookie = self.begin()
        sensitive = "https://oauth2.googleapis.com/token?code=private-code"
        self.flow.fetch_token.side_effect = TimeoutError(sensitive)
        with patch.object(cloud, "request_json") as upstream:
            failed = self.callback(cookie)
        self.assertEqual(failed[0], "303 See Other")
        self.assertEqual(header(failed[1], "Location"), "/")
        self.assertIn("Max-Age=0", header(failed[1], "Set-Cookie"))
        self.assertEqual(self.flow.fetch_token.call_args.kwargs["timeout"], 20)
        self.assertIsNone(self.app.active)
        self.assertNotIn(sensitive, failed[2].decode())
        self.assertNotIn("temporary-provider-bearer", failed[2].decode())
        upstream.assert_not_called()

    def test_one_selected_photo_succeeds_and_cleans_remote_session(self):
        cookie = self.begin()
        calls = []

        def upstream(url, *, method="GET", **kwargs):
            calls.append((method, url))
            if method == "POST":
                return {"id": "test-session", "pickerUri": GOOGLE_PICKER}
            if method == "DELETE":
                return {}
            if "/mediaItems?" in url:
                return {
                    "mediaItems": [{
                        "type": "PHOTO", "mediaFile": {
                            "mimeType": "image/jpeg",
                            "baseUrl": "https://lh3.googleusercontent.com/p/synthetic",
                        }
                    }],
                }
            return {"mediaItemsSet": True}

        with (
            patch.object(cloud, "request_json", side_effect=upstream),
            patch.object(cloud, "download_discarded_test_photo", return_value=42) as read,
        ):
            callback = self.callback(cookie)
            self.assertEqual(callback[0], "303 See Other")
            self.assertEqual(header(callback[1], "Location"), "/select")
            self.assertNotIn("opaque-auth-code", callback[2].decode())
            self.flow.fetch_token.assert_called_once()
            picker = self.request("GET", "/select", cookie=cookie)
            self.assertIn(GOOGLE_PICKER, picker[2].decode())
            self.assertNotIn("temporary-provider-bearer", picker[2].decode())
            csrf = self.app.active.csrf
            form_body = urllib.parse.urlencode({"csrf": csrf}).encode()
            result = self.request(
                "POST", "/check", cookie=cookie, body=form_body
            )
            self.assertEqual(result[0], "200 OK")
            self.assertIn("Success:", result[2].decode())
            self.assertIn("42 bytes", result[2].decode())
            self.assertNotIn("test-session", result[2].decode())
            self.assertIsNone(self.app.active)
            self.assertIn(("DELETE", cloud.API + "/sessions/test-session"), calls)
            read.assert_called_once()

    def test_incomplete_selection_retains_session_until_deliberate_finish(self):
        cookie = self.begin()
        with patch.object(
            cloud, "request_json",
            side_effect=[
                {"id": "live-session", "pickerUri": GOOGLE_PICKER},
                {"mediaItemsSet": False},
                {},
            ],
        ) as upstream:
            self.callback(cookie)
            csrf = self.app.active.csrf
            pending = self.request(
                "POST", "/check", cookie=cookie,
                body=urllib.parse.urlencode({"csrf": csrf}).encode(),
            )
            self.assertIn("not complete", pending[2].decode())
            self.assertIsNotNone(self.app.active)
            self.request(
                "POST", "/cancel", cookie=cookie,
                body=urllib.parse.urlencode({"csrf": csrf}).encode(),
            )
            self.assertIsNone(self.app.active)
            self.assertEqual(upstream.call_args.kwargs["method"], "DELETE")

    def test_callback_replay_and_form_csrf_are_rejected(self):
        cookie = self.begin()
        with patch.object(
            cloud, "request_json",
            return_value={"id": "session", "pickerUri": GOOGLE_PICKER},
        ):
            self.callback(cookie)
        self.assertEqual(self.callback(cookie)[0], "409 Conflict")
        bad_form = self.request(
            "POST", "/check", cookie=cookie, body=b"csrf=wrong"
        )
        self.assertEqual(bad_form[0], "403 Forbidden")

    def test_expiration_deletes_google_session_and_rejects_stale_cookie(self):
        cookie = self.begin()
        with patch.object(
            cloud, "request_json",
            return_value={"id": "session", "pickerUri": GOOGLE_PICKER},
        ) as upstream:
            self.callback(cookie)
            self.now += cloud.LIFETIME + 1
            expired = self.request("GET", "/select", cookie=cookie)
            self.assertEqual(expired[0], "403 Forbidden")
            self.assertIsNone(self.app.active)
            self.assertEqual(upstream.call_args.kwargs["method"], "DELETE")

    def test_invalid_picker_does_not_store_token_or_session(self):
        cookie = self.begin()
        with patch.object(
            cloud, "request_json", return_value={
                "id": "session", "pickerUri": "https://attacker.invalid/pick"
            },
        ):
            failed = self.callback(cookie)
        self.assertEqual(failed[0], "303 See Other")
        self.assertIsNone(self.app.active)
        self.assertNotIn("temporary-provider-bearer", failed[2].decode())

    def test_http_entrypoint_bounds_body_host_and_origin(self):
        env = {
            "HTTP_HOST": "attacker.invalid",
            "REQUEST_METHOD": "GET",
            "PATH_INFO": "/",
            "wsgi.input": io.BytesIO(b""),
        }
        sent = []
        self.app(env, lambda status, headers: sent.append((status, headers)))
        self.assertEqual(sent[0][0], "400 Bad Request")

        env.update({
            "HTTP_HOST": "photos-probe.example.org",
            "REQUEST_METHOD": "POST",
            "PATH_INFO": "/start",
            "CONTENT_LENGTH": str(cloud.MAX_POST_BYTES + 1),
        })
        self.app(env, lambda status, headers: sent.append((status, headers)))
        self.assertEqual(sent[-1][0], "413 Request Entity Too Large")


if __name__ == "__main__":
    unittest.main()
