#!/usr/bin/env python3
"""Opt-in, single-user HTTPS web callback for an operator's Google Picker probe.

This standalone test service is NOT an eimir. API route or deployment default.
It must sit behind a trusted TLS reverse proxy and must only use synthetic
photos. OAuth credentials, sessions and media bytes are never persisted.
"""

from __future__ import annotations

import argparse
import hmac
import html
import json
import os
import secrets
import threading
import time
import urllib.parse
from dataclasses import dataclass
from http.cookies import SimpleCookie
from pathlib import Path
from typing import Any
from wsgiref.simple_server import WSGIRequestHandler, make_server

from google_photos_picker_probe import (
    API,
    SCOPE,
    ProbeError,
    download_discarded_test_photo,
    request_json,
    valid_picker_uri,
)

COOKIE = "__Host-eimir-photos-probe"
LIFETIME = 10 * 60
MAX_POST_BYTES = 4096
PICKER_BODY = b'{"pickingConfig":{"maxItemCount":"1"}}'


class CloudProbeError(ProbeError):
    """Never expose upstream URL/token/identity information to a browser."""


def validate_origin(value: str) -> str:
    try:
        url = urllib.parse.urlsplit(value)
        port = url.port
    except ValueError:
        raise CloudProbeError("Invalid HTTPS origin.") from None
    if (
        url.scheme != "https"
        or not url.hostname
        or not url.hostname.count(".")
        or port is not None
        or url.path not in ("", "/")
        or url.query
        or url.fragment
        or url.username
        or url.password
    ):
        raise CloudProbeError("A dedicated public HTTPS origin is required.")
    return f"https://{url.netloc}"


def load_config(path: str, origin: str) -> dict[str, Any]:
    target = Path(path).expanduser().resolve()
    if target.is_relative_to(Path(__file__).resolve().parents[1]):
        raise CloudProbeError("OAuth credentials must remain outside the repository.")
    if not target.is_file():
        raise CloudProbeError("Missing operator-owned OAuth Web client JSON.")
    try:
        config = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise CloudProbeError("Invalid OAuth Web client JSON.") from None
    web = config.get("web") if isinstance(config, dict) else None
    if not isinstance(web, dict) or not web.get("client_id") or not web.get("client_secret"):
        raise CloudProbeError("An OAuth Web application client is required.")
    callback = origin + "/oauth/callback"
    if callback not in web.get("redirect_uris", []):
        raise CloudProbeError("Web client JSON does not register the exact HTTPS callback.")
    for field, host in (
        ("auth_uri", "accounts.google.com"),
        ("token_uri", "oauth2.googleapis.com"),
    ):
        try:
            endpoint = urllib.parse.urlsplit(web[field])
            port = endpoint.port
        except (KeyError, ValueError, TypeError):
            raise CloudProbeError("Invalid Google OAuth endpoint.") from None
        if endpoint.scheme != "https" or endpoint.hostname != host or port is not None:
            raise CloudProbeError("OAuth Web client contains non-Google endpoints.")
    return config


def new_google_flow(config: dict[str, Any], redirect_uri: str) -> Any:
    """Keep OAuth state, PKCE and code exchange inside Google's maintained SDK."""
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError:
        raise CloudProbeError("Install operator-only google-auth-oauthlib.") from None
    flow = Flow.from_client_config(
        config, scopes=[SCOPE], autogenerate_code_verifier=True
    )
    flow.redirect_uri = redirect_uri
    return flow


@dataclass
class ActiveProbe:
    cookie: str
    csrf: str
    state: str
    flow: Any
    started_at: float
    callback_consumed: bool = False
    access_token: str | None = None
    picker_session_id: str | None = None
    picker_uri: str | None = None
    expiry_timer: threading.Timer | None = None


def response(
    status: str,
    message: str,
    *,
    cookie: str | None = None,
    clear_cookie: bool = False,
    location: str | None = None,
    extra: str = "",
    form_page: bool = False,
    oauth_form: bool = False,
) -> tuple[str, list[tuple[str, str]], bytes]:
    headers = [
        ("Cache-Control", "no-store, max-age=0"),
        ("Pragma", "no-cache"),
        # no-referrer makes browser form POSTs send Origin: null (Fetch §3.2).
        # Keep the real origin on our forms, and suppress callback URL referrers.
        ("Referrer-Policy", "same-origin" if form_page else "no-referrer"),
        ("X-Content-Type-Options", "nosniff"),
        ("X-Frame-Options", "DENY"),
        # Browsers also check form-action on the /start -> Google redirect.
        ("Content-Security-Policy", "default-src 'none'; form-action 'self'"
         + (" https://accounts.google.com/o/oauth2/v2/auth" if oauth_form else "")
         + "; base-uri 'none'; frame-ancestors 'none'"),
        ("Content-Type", "text/html; charset=utf-8"),
    ]
    if cookie is not None:
        headers.append(
            ("Set-Cookie", f"{COOKIE}={cookie}; Secure; HttpOnly; SameSite=Lax; Path=/")
        )
    if clear_cookie:
        headers.append(
            ("Set-Cookie", f"{COOKIE}=; Max-Age=0; Secure; HttpOnly; SameSite=Lax; Path=/")
        )
    if location is not None:
        headers.append(("Location", location))
    body = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>eimir. Google Photos test</title></head><body>"
        "<main><h1>Google Photos Picker test</h1><p>"
        + html.escape(message)
        + "</p>"
        + extra
        + "</main></body></html>"
    ).encode("utf-8")
    return status, headers, body


def form(action: str, text: str, csrf: str) -> str:
    return (
        f"<form method='post' action='{action}'>"
        f"<input type='hidden' name='csrf' value='{html.escape(csrf, quote=True)}'>"
        f"<button type='submit'>{html.escape(text)}</button></form>"
    )


class CloudProbe:
    def __init__(
        self, origin: str, config: dict[str, Any], operator_key: str, *,
        flow_factory=new_google_flow, clock=time.monotonic
    ) -> None:
        self.origin = validate_origin(origin)
        if len(operator_key) < 32:
            raise CloudProbeError("A high-entropy operator access secret is required.")
        self.config = config
        self.operator_key = operator_key
        self.flow_factory = flow_factory
        self.clock = clock
        self.active: ActiveProbe | None = None
        self.failed_logins = 0
        self.locked_until = 0.0
        self.lock = threading.Lock()

    def _cookie_matches(self, cookie_header: str, active: ActiveProbe) -> bool:
        jar = SimpleCookie()
        try:
            jar.load(cookie_header)
            value = jar.get(COOKIE)
        except Exception:
            return False
        return value is not None and hmac.compare_digest(value.value, active.cookie)

    def _cleanup(self) -> bool:
        active = self.active
        self.active = None
        if active is not None and active.expiry_timer is not None:
            active.expiry_timer.cancel()
        if active is None or not active.access_token or not active.picker_session_id:
            return True
        session_url = (
            API + "/sessions/" + urllib.parse.quote(active.picker_session_id, safe="")
        )
        try:
            request_json(session_url, method="DELETE", token=active.access_token)
        except ProbeError:
            return False
        return True

    def _expire(self, cookie: str) -> None:
        with self.lock:
            if self.active is not None and hmac.compare_digest(
                self.active.cookie, cookie
            ):
                self._cleanup()

    def _render_picker(self, active: ActiveProbe, message: str) -> tuple:
        if active.picker_uri is None:
            raise CloudProbeError("No authorized picker session.")
        # picker_uri was validated before being stored.
        url = html.escape(active.picker_uri, quote=True)
        extra = (
            "<p><a rel='noopener noreferrer' target='_blank' href='"
            + url + "'>Select one synthetic photo in Google Photos</a></p>"
            + form("/check", "I have finished selecting", active.csrf)
            + form("/cancel", "Cancel and delete test session", active.csrf)
        )
        return response("200 OK", message, extra=extra, form_page=True)

    def handle(
        self, method: str, path: str, *, query: str = "",
        cookie: str = "", body: bytes = b"", request_origin: str = ""
    ) -> tuple:
        with self.lock:
            if request_origin and request_origin != self.origin:
                return response("403 Forbidden", "Cross-origin request rejected.")
            now = self.clock()
            if self.active and now - self.active.started_at > LIFETIME:
                self._cleanup()
            active = self.active
            valid = active is not None and self._cookie_matches(cookie, active)

            if method == "GET" and path == "/":
                if valid:
                    return self._render_picker(active, "Return to your active test.") if active.picker_uri else response(
                        "200 OK", "Google consent is still pending."
                    )
                extra = (
                    "<form method='post' action='/start'>"
                    "<label>Operator test secret <input name='operator_key' "
                    "type='password' required autocomplete='off'></label>"
                    "<button type='submit'>Start read-only test</button></form>"
                )
                return response("200 OK", "Operator-only test; no photo is stored.",
                                extra=extra, form_page=True, oauth_form=True)

            if method == "POST" and path == "/start":
                values = urllib.parse.parse_qs(body.decode("utf-8", errors="replace"))
                key = values.get("operator_key", [""])[0]
                if now < self.locked_until:
                    return response("429 Too Many Requests", "Test authorization unavailable.")
                if not hmac.compare_digest(key, self.operator_key):
                    self.failed_logins += 1
                    if self.failed_logins >= 5:
                        self.locked_until = now + 10 * 60
                    return response("403 Forbidden", "Operator access denied.")
                if active is not None:
                    return response("409 Conflict", "A test is already active.")
                self.failed_logins = 0
                flow = self.flow_factory(self.config, self.origin + "/oauth/callback")
                uri, state = flow.authorization_url(access_type="online")
                destination = urllib.parse.urlsplit(uri)
                if destination.scheme != "https" or destination.hostname != "accounts.google.com":
                    raise CloudProbeError("Unexpected OAuth authorization target.")
                active = ActiveProbe(
                    cookie=secrets.token_urlsafe(32),
                    csrf=secrets.token_urlsafe(32),
                    state=state,
                    flow=flow,
                    started_at=now,
                )
                self.active = active
                timer = threading.Timer(LIFETIME, self._expire, args=(active.cookie,))
                timer.daemon = True
                active.expiry_timer = timer
                timer.start()
                return response(
                    "303 See Other", "Continue with Google consent.",
                    cookie=active.cookie, location=uri
                )

            if not valid:
                return response("403 Forbidden", "No active authorized test session.")

            if method == "GET" and path == "/oauth/callback":
                assert active is not None
                if active.callback_consumed:
                    return response("409 Conflict", "Authorization already handled.")
                qs = urllib.parse.parse_qs(query, keep_blank_values=True)
                states = qs.get("state")
                if states is None or len(states) != 1 or not hmac.compare_digest(
                    states[0], active.state
                ):
                    return response("403 Forbidden", "OAuth state mismatch.")
                active.callback_consumed = True
                if qs.get("error"):
                    self._cleanup()
                    return response("303 See Other", "Google access denied.",
                                    clear_cookie=True, location="/")
                if len(qs.get("code", [])) != 1 or not qs["code"][0]:
                    self._cleanup()
                    return response("303 See Other", "OAuth callback invalid.",
                                    clear_cookie=True, location="/")
                try:
                    active.flow.fetch_token(
                        authorization_response=(
                            self.origin + "/oauth/callback?" + query
                        ),
                        timeout=20,
                    )
                    token = active.flow.credentials.token
                    if not isinstance(token, str) or not token:
                        raise CloudProbeError("No authorized token.")
                    active.access_token = token
                    created = request_json(
                        API + "/sessions",
                        token=token,
                        method="POST",
                        body=PICKER_BODY,
                        content_type="application/json",
                    )
                    identifier = created.get("id")
                    picker_uri = created.get("pickerUri")
                    if (
                        not isinstance(identifier, str)
                        or not identifier
                        or len(identifier) > 1000
                    ):
                        raise CloudProbeError("Google returned an invalid picker session.")
                    active.picker_session_id = identifier
                    if not valid_picker_uri(picker_uri):
                        raise CloudProbeError("Google returned an invalid picker URL.")
                    active.picker_uri = picker_uri
                except Exception:
                    # Neither OAuth exceptions nor API payloads may enter output.
                    self._cleanup()
                    return response(
                        "303 See Other", "Google authorization or Picker setup failed.",
                        clear_cookie=True, location="/"
                    )
                return response("303 See Other", "Select a test photo.", location="/select")

            if method == "GET" and path == "/select":
                assert active is not None
                return self._render_picker(active, "Select exactly one synthetic test photo.")

            if method == "POST" and path in ("/check", "/cancel"):
                assert active is not None
                values = urllib.parse.parse_qs(body.decode("utf-8", errors="replace"))
                csrf = values.get("csrf")
                if csrf is None or len(csrf) != 1 or not hmac.compare_digest(
                    csrf[0], active.csrf
                ):
                    return response("403 Forbidden", "Invalid form token.")
                if path == "/cancel":
                    cleaned = self._cleanup()
                    return response(
                        "200 OK",
                        "Test cancelled; remote session deleted." if cleaned
                        else "Test cancelled; remote cleanup was not confirmed.",
                        clear_cookie=True,
                    )
                if not active.access_token or not active.picker_session_id:
                    return response("409 Conflict", "Picker setup not completed.")
                session_url = (
                    API + "/sessions/" +
                    urllib.parse.quote(active.picker_session_id, safe="")
                )
                try:
                    status = request_json(session_url, token=active.access_token)
                    if not status.get("mediaItemsSet"):
                        return self._render_picker(
                            active, "Selection is not complete. Finish in Google Photos."
                        )
                    items = request_json(
                        API + "/mediaItems?" + urllib.parse.urlencode(
                            {"sessionId": active.picker_session_id, "pageSize": 2}
                        ), token=active.access_token
                    )
                    selected = items.get("mediaItems")
                    if (
                        not isinstance(selected, list)
                        or len(selected) != 1
                        or items.get("nextPageToken")
                    ):
                        raise CloudProbeError("One photo is required.")
                    total = download_discarded_test_photo(
                        selected[0], active.access_token
                    )
                except Exception:
                    self._cleanup()
                    return response(
                        "200 OK", "Picker test failed; no photo was stored.",
                        clear_cookie=True
                    )
                cleaned = self._cleanup()
                return response(
                    "200 OK",
                    f"Success: one synthetic image transferred and discarded ({total} bytes). "
                    + ("Remote session deleted." if cleaned
                       else "Remote session deletion could not be confirmed."),
                    clear_cookie=True,
                )
            return response("404 Not Found", "Unknown test path.")

    def __call__(self, env: dict, start_response: Any) -> list[bytes]:
        # Never log full paths, Google codes, headers or request bodies.
        try:
            method, path = env.get("REQUEST_METHOD", ""), env.get("PATH_INFO", "")
            if env.get("HTTP_HOST") != urllib.parse.urlsplit(self.origin).netloc:
                result = response("400 Bad Request", "Invalid test host.")
            elif method == "POST" and (
                not env.get("CONTENT_LENGTH", "").isdigit()
                or int(env["CONTENT_LENGTH"]) > MAX_POST_BYTES
            ):
                result = response("413 Request Entity Too Large", "Invalid request size.")
            else:
                body = (
                    env["wsgi.input"].read(int(env["CONTENT_LENGTH"]))
                    if method == "POST" else b""
                )
                result = self.handle(
                    method, path, query=env.get("QUERY_STRING", ""),
                    cookie=env.get("HTTP_COOKIE", ""),
                    body=body, request_origin=env.get("HTTP_ORIGIN", "")
                )
        except Exception:
            result = response("500 Internal Server Error", "Test request failed safely.")
        status, headers, body = result
        start_response(status, [*headers, ("Content-Length", str(len(body)))])
        return [body]


class QuietRequestHandler(WSGIRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        pass  # Callback authorization code must never appear in access logs.


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    if os.environ.get("EIMIR_GOOGLE_PHOTOS_PROBE_ENABLED") != "1":
        parser.error("Cloud probe is disabled; explicit test-only opt-in required.")
    origin = validate_origin(os.environ.get("EIMIR_GOOGLE_PHOTOS_PROBE_ORIGIN", ""))
    secret = os.environ.get("EIMIR_GOOGLE_PHOTOS_PROBE_OPERATOR_KEY", "")
    path = os.environ.get("EIMIR_GOOGLE_PHOTOS_PROBE_WEB_CLIENT_FILE", "")
    config = load_config(path, origin)
    app = CloudProbe(origin, config, secret)
    # A separately operated TLS gateway must be colocated with this loopback
    # listener; Codex task VMs do not themselves supply an HTTPS callback URL.
    with make_server("127.0.0.1", args.port, app,
                     handler_class=QuietRequestHandler) as server:
        print("Operator-only Google Picker probe bound to local reverse proxy.")
        server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
