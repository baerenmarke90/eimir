#!/usr/bin/env python3
"""One-off, consented Google Photos Picker smoke; never stores selected media.

Run from a trusted desktop with an owner-controlled OAuth Desktop client and
a dedicated Google account containing synthetic test photos. Not production
OAuth, not an eimir. media importer and not a policy approval.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
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


def authorize_desktop(client_secrets_file: str) -> str:
    """Delegate PKCE, CSRF state, loopback callback and token exchange to Google."""
    path = Path(client_secrets_file).expanduser().resolve()
    repository = Path(__file__).resolve().parents[1]
    if path.is_relative_to(repository):
        raise ProbeError("Keep the OAuth Desktop client JSON outside this repository.")
    if not path.is_file():
        raise ProbeError("OAuth Desktop client JSON file not found.")
    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise ProbeError("Cannot read valid OAuth Desktop client JSON.") from None

    installed = config.get("installed") if isinstance(config, dict) else None
    if not isinstance(installed, dict) or not installed.get("client_id"):
        raise ProbeError("Expected Google OAuth Desktop client JSON, not Web credentials.")
    try:
        auth_url = urllib.parse.urlsplit(installed["auth_uri"])
        token_url = urllib.parse.urlsplit(installed["token_uri"])
    except (KeyError, ValueError, TypeError):
        raise ProbeError("OAuth client JSON has invalid Google endpoints.") from None
    if (
        auth_url.scheme != "https"
        or auth_url.hostname != "accounts.google.com"
        or token_url.scheme != "https"
        or token_url.hostname != "oauth2.googleapis.com"
    ):
        raise ProbeError("OAuth client JSON does not target Google's official endpoints.")

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        raise ProbeError("Install developer-only google-auth-oauthlib==1.5.0.") from None

    try:
        flow = InstalledAppFlow.from_client_config(
            config, scopes=[SCOPE], autogenerate_code_verifier=True
        )
        credentials = flow.run_local_server(
            host="127.0.0.1",
            port=0,
            open_browser=True,
            timeout_seconds=MAX_WAIT_SECONDS,
            access_type="online",
            authorization_prompt_message=None,
        )
    except Exception:
        # OAuth-library exceptions can embed codes, URLs and account details.
        raise ProbeError("Desktop OAuth was cancelled, rejected or timed out.") from None
    if not isinstance(credentials.token, str) or not credentials.token:
        raise ProbeError("Google did not issue a usable access token.")
    # No refresh-token cache, token serialization or eimir. session linkage.
    return credentials.token


def valid_picker_uri(uri: object) -> bool:
    if not isinstance(uri, str):
        return False
    try:
        parts = urllib.parse.urlsplit(uri)
        port = parts.port
    except ValueError:
        return False
    return (
        parts.scheme == "https"
        and parts.hostname == "photos.google.com"
        and port is None
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
        "--client-secrets-file",
        required=True,
        help="Path OUTSIDE the repo to Google Cloud's OAuth Desktop client JSON",
    )
    args = parser.parse_args()
    print("Developer-only read-only probe. No Google photos will be saved to eimir.")
    try:
        token = authorize_desktop(args.client_secrets_file)
        return run_picker(token)
    except ProbeError as exc:
        print(f"FAIL: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
