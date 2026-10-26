#!/usr/bin/env python3
"""One-off, consented Google Photos Picker smoke; never stores selected media.

Run from a trusted desktop with an owner-controlled OAuth Desktop client and
a dedicated Google account containing synthetic test photos. Not production
OAuth, not an eimir. media importer and not a policy approval.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
import re
import secrets
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

API = "https://photospicker.googleapis.com/v1"
AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
MAX_WAIT_SECONDS = 180
MAX_PHOTO_BYTES = 25 * 1024 * 1024
JSON_LIMIT = 64 * 1024
ALLOWED_TYPES = frozenset(
    {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
)


class ProbeError(Exception):
    """A deliberately redacted failure: never embed provider response bodies."""


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ProbeError("Provider redirected an authenticated request; stopped safely.")


OPENER = urllib.request.build_opener(NoRedirects)


def request_json(
    url: str,
    *,
    token: str | None = None,
    method: str = "GET",
    body: bytes | None = None,
    content_type: str | None = None,
) -> dict:
    """Call a fixed trusted API endpoint; never print remote errors or secrets."""
    parts = urllib.parse.urlsplit(url)
    if (
        parts.scheme != "https"
        or parts.hostname not in {"photospicker.googleapis.com", "oauth2.googleapis.com"}
        or parts.port is not None
        or parts.username is not None
        or parts.password is not None
        or parts.fragment
    ):
        raise ProbeError("Unrecognized API endpoint; request blocked.")
    headers = {"Accept": "application/json", "Cache-Control": "no-store"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if content_type:
        headers["Content-Type"] = content_type
    request = urllib.request.Request(
        url, headers=headers, data=body, method=method
    )
    try:
        with OPENER.open(request, timeout=20) as response:
            data = response.read(JSON_LIMIT + 1)
            if len(data) > JSON_LIMIT:
                raise ProbeError("Provider JSON response exceeds test bound.")
            if not data:
                return {}
            result = json.loads(data)
            if not isinstance(result, dict):
                raise ProbeError("Unexpected provider JSON structure.")
            return result
    except urllib.error.HTTPError as exc:
        raise ProbeError(f"Provider {method} failed: HTTP {exc.code}.") from None
    except (urllib.error.URLError, TimeoutError) as exc:
        raise ProbeError("Provider connection failed or timed out.") from None
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProbeError("Provider returned invalid JSON.") from None


def authorization_url(
    client_id: str, redirect_uri: str, state: str, verifier: str
) -> str:
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    return AUTH + "?" + urllib.parse.urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "online",
        }
    )


def parse_callback(query: str, expected_state: str) -> str:
    values = urllib.parse.parse_qs(query, keep_blank_values=True)
    if values.get("state") != [expected_state]:
        raise ProbeError("OAuth callback state mismatch.")
    if "error" in values:
        raise ProbeError("Google access was denied or cancelled.")
    codes = values.get("code")
    if not codes or len(codes) != 1 or not codes[0] or len(codes[0]) > 4096:
        raise ProbeError("OAuth callback did not supply one valid code.")
    return codes[0]


def authorize_desktop(client_id: str, client_secret: str | None = None) -> str:
    """Use the approved desktop-app loopback/PKCE flow, not a Capacitor WebView."""
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    callback: dict[str, str] = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            location = urllib.parse.urlsplit(self.path)
            try:
                if location.path != "/auth/callback":
                    raise ProbeError("Unknown callback path.")
                callback["code"] = parse_callback(location.query, state)
                message = b"Authorization received. Return to the terminal."
                status = 200
            except ProbeError as exc:
                if location.path == "/auth/callback" and "state mismatch" not in str(exc):
                    callback["error"] = str(exc)
                message = b"Authorization was not accepted. Return to the terminal."
                status = 400
            self.send_response(status)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(message)

        def log_message(self, format, *args):
            pass  # Never log OAuth query parameters.

    with http.server.HTTPServer(("127.0.0.1", 0), Handler) as server:
        server.timeout = 1
        redirect_uri = f"http://127.0.0.1:{server.server_port}/auth/callback"
        if not webbrowser.open(authorization_url(client_id, redirect_uri, state, verifier)):
            raise ProbeError("No desktop browser could be opened for consent.")
        deadline = time.monotonic() + MAX_WAIT_SECONDS
        while time.monotonic() < deadline and not callback:
            server.handle_request()

    if callback.get("error"):
        raise ProbeError(callback["error"])
    if not callback.get("code"):
        raise ProbeError("OAuth browser consent timed out.")

    payload = {
        "client_id": client_id,
        "code": callback["code"],
        "code_verifier": verifier,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    if client_secret:
        payload["client_secret"] = client_secret
    response = request_json(
        TOKEN,
        method="POST",
        body=urllib.parse.urlencode(payload).encode("ascii"),
        content_type="application/x-www-form-urlencoded",
    )
    access_token = response.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise ProbeError("Google did not return an OAuth access token.")
    # Never request offline access, persist refresh tokens or print access tokens.
    return access_token


def valid_picker_uri(uri: object) -> bool:
    if not isinstance(uri, str):
        return False
    parts = urllib.parse.urlsplit(uri)
    return (
        parts.scheme == "https"
        and parts.hostname == "photos.google.com"
        and parts.port is None
        and parts.username is None
        and parts.password is None
        and parts.fragment == ""
    )


def seconds(value: object) -> float:
    if not isinstance(value, str) or not re.fullmatch(r"\d+(?:\.\d+)?s", value):
        raise ProbeError("Invalid provider polling interval.")
    return float(value[:-1])


def download_discarded_test_photo(item: dict, token: str) -> int:
    """Check actual bytes without writing files or forwarding them to eimir."""
    if item.get("type") != "PHOTO":
        raise ProbeError("Selection was not a photo.")
    media = item.get("mediaFile")
    if not isinstance(media, dict) or media.get("mimeType") not in ALLOWED_TYPES:
        raise ProbeError("Selected photo has an unsupported MIME type.")
    base_url = media.get("baseUrl")
    if not isinstance(base_url, str):
        raise ProbeError("Selected photo lacks a media URL.")
    parsed = urllib.parse.urlsplit(base_url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not re.fullmatch(r"lh\d+\.googleusercontent\.com", parsed.hostname)
        or parsed.port is not None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ProbeError("Media URL host differs from the documented trusted Google CDN.")
    request = urllib.request.Request(
        base_url + "=d",
        headers={"Authorization": f"Bearer {token}", "Cache-Control": "no-store"},
    )
    try:
        with OPENER.open(request, timeout=30) as response:
            count = 0
            while True:
                chunk = response.read(min(64 * 1024, MAX_PHOTO_BYTES + 1 - count))
                if not chunk:
                    break
                count += len(chunk)
                if count > MAX_PHOTO_BYTES:
                    raise ProbeError("Selected image exceeds the 25 MiB limit.")
            if count == 0:
                raise ProbeError("Selected image had no bytes.")
            return count
    except urllib.error.HTTPError as exc:
        raise ProbeError(f"Google photo byte request failed: HTTP {exc.code}.") from None
    except (urllib.error.URLError, TimeoutError):
        raise ProbeError("Google photo byte request failed or timed out.") from None


def run_picker(token: str) -> int:
    created = request_json(
        f"{API}/sessions",
        method="POST",
        token=token,
        content_type="application/json",
        body=b'{"pickingConfig":{"maxItemCount":"1"}}',
    )
    session_id = created.get("id")
    if not isinstance(session_id, str) or not session_id or len(session_id) > 1000:
        raise ProbeError("Google did not create a usable Picker session.")
    session_url = f"{API}/sessions/{urllib.parse.quote(session_id, safe='')}"
    try:
        picker_uri = created.get("pickerUri")
        if not valid_picker_uri(picker_uri):
            raise ProbeError("Google Picker returned an unexpected selection URL.")
        if not webbrowser.open(picker_uri):
            raise ProbeError("Could not open the Google Photos selection page.")
        print("Google Photos picker opened. Select ONE synthetic test photo.")
        deadline = time.monotonic() + MAX_WAIT_SECONDS
        selected = created
        while not selected.get("mediaItemsSet"):
            if time.monotonic() >= deadline:
                raise ProbeError("Photo selection timed out.")
            config = selected.get("pollingConfig")
            if not isinstance(config, dict):
                raise ProbeError("Google did not provide polling instructions.")
            timeout = seconds(config.get("timeoutIn"))
            if timeout <= 0:
                raise ProbeError("Google ended the selection polling window.")
            interval = seconds(config.get("pollInterval"))
            if interval <= 0:
                raise ProbeError("Google returned a non-positive polling interval.")
            time.sleep(min(interval, timeout, max(0, deadline - time.monotonic())))
            selected = request_json(session_url, token=token)

        items = request_json(
            f"{API}/mediaItems?{urllib.parse.urlencode({'sessionId': session_id, 'pageSize': 2})}",
            token=token,
        )
        media_items = items.get("mediaItems")
        if not isinstance(media_items, list) or len(media_items) != 1:
            raise ProbeError("Expected exactly one selected test photo.")
        if items.get("nextPageToken"):
            raise ProbeError("Unexpected additional selected media page.")
        size = download_discarded_test_photo(media_items[0], token)
        print(f"PASS: one selected Google photo downloaded and discarded ({size} bytes).")
        return 0
    finally:
        try:
            request_json(session_url, token=token, method="DELETE")
            print("Picker session cleanup completed.")
        except ProbeError:
            print("WARNING: Picker session cleanup failed; it will expire at Google.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--client-id",
        default=os.environ.get("EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_ID", ""),
        help="Google Cloud OAuth Desktop client ID (public identifier)",
    )
    args = parser.parse_args()
    if not args.client_id:
        parser.error(
            "Set EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_ID to an OAuth Desktop "
            "client ID from a Google Cloud project with Photos Picker API enabled."
        )
    print("Developer-only read-only probe. No Google photos will be saved to eimir.")
    try:
        token = authorize_desktop(
            args.client_id,
            os.environ.get("EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_SECRET") or None,
        )
        return run_picker(token)
    except ProbeError as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
