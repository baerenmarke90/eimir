# #1444 — HTTPS Google Photos Picker test, browser-only operator flow

**Status:** Code/test preflight only. Not deployed, not authorized with a Google account, not an eimir. product feature, and not evidence of a successful provider transfer.

This is an **alternative** to the local Desktop test in [1444-google-picker-probe.md](1444-google-picker-probe.md). The person performing consent needs only a browser. Codex Cloud can develop and run offline tests, but Codex task containers **do not automatically provide a public, stable HTTPS OAuth callback**. For a genuine Google login deploy the optional service to an **operator-controlled, publicly reachable HTTPS test host**, separate from eimir. production.

## Operator browser flow

1. Open an HTTPS test subdomain and enter a separately provisioned, high-entropy operator secret in a POST password form (not a URL).
2. The standalone service uses Google's official Python OAuth Web client (PKCE + state, online-only) and requests only the Google Photos Picker readonly scope. The browser visits Google's own sign-in/consent page.
3. Google redirects to the **same test host** at /oauth/callback; a Secure, HttpOnly, SameSite=Lax cookie, one-time state and in-memory session bind the response to the initiating browser.
4. A successful callback opens a one-item Google Photos Picker session. Select **one synthetic JPEG**, then return to the test page and press **I have finished selecting**.
5. The server checks the selected item, transfers at most 25 MiB into a bounded memory-only stream, discards it without writing to eimir. or disk, and tries to delete the Google session.
6. Explicit cancellation, errors and ten-minute expiration likewise discard the local token and attempt session cleanup.

No photos enter eimir. storage, no provider keys enter the Web bundle, and no standing Google account connection is established. This does not approve persistent copying or partner sharing under Google's policies.

## One-time prerequisites (operator, not the end user)

- Dedicated publicly reachable HTTPS subdomain with valid TLS, e.g. https://photos-probe.example.org (illustrative ONLY; not a deployed address). Configure a trusted reverse proxy that **does not log OAuth callback query strings**.
- Google Cloud project with Google Photos Picker API enabled; OAuth consent configured with a dedicated test user and **Web application OAuth client**. Register the exact HTTPS redirect URI, for example https://photos-probe.example.org/oauth/callback.
- Google's OAuth **Web client JSON** in a protected file or secret volume outside the repository and container image, and a separately generated unpredictable operator access secret (at least 32 characters). No credentials in Git, chat or GitHub Actions logs.
- Python 3.12+ on the operator's test server, with developer-only Google OAuth SDK google-auth-oauthlib==1.5.0 (Apache-2.0). This dependency is not part of production eimir.
- One account containing only synthetic test photos and the ability to complete Google OAuth from a normal browser. Do not use personal photos.

## Test-server setup (server operator)

These commands run on the **cloud test host**, not on the laptop or phone of the consenting user:

~~~bash
python3 -m venv /opt/eimir-google-picker-probe-venv
/opt/eimir-google-picker-probe-venv/bin/pip install "google-auth-oauthlib==1.5.0"

export EIMIR_GOOGLE_PHOTOS_PROBE_ENABLED=1
export EIMIR_GOOGLE_PHOTOS_PROBE_ORIGIN="https://photos-probe.example.org"
export EIMIR_GOOGLE_PHOTOS_PROBE_WEB_CLIENT_FILE="/run/secrets/google-photos-web-client.json"
export EIMIR_GOOGLE_PHOTOS_PROBE_OPERATOR_KEY="REPLACE_WITH_PRIVATE_RANDOM_256_BIT_VALUE"

/opt/eimir-google-picker-probe-venv/bin/python scripts/google_photos_picker_web_probe.py --port 8787
~~~

Configure the TLS reverse proxy for that dedicated hostname to forward to **127.0.0.1:8787**, preserving the external Host, path, query string and cookies. Disable access logs of request URI/query in **every ingress/proxy layer**, specifically for the OAuth callback. The service already suppresses its own request access logs and never prints tokens. The TCP listener must **never** be directly internet-accessible.

The probe **refuses startup** unless explicitly enabled and configured with an HTTPS origin, a matching Web-client redirect URI, private Web-client JSON and a sufficiently long operator secret. Only one test is active at a time. Do not use eimir.'s login/OIDC session or expose this as an eimir. Cloud core/API endpoint.

Codex can implement and test this service in its cloud coding environment. **A normal Codex task is not itself the deployed HTTPS callback server**. A separately configured operator test host and Google Console Web client are still necessary. This PR does not provision or deploy any public endpoint.

## Safety and cleanup

- Cookie: Secure, HttpOnly, SameSite=Lax, short-lived, random. OAuth callback state is checked before exchanging any token; only one callback is consumed.
- POST operations use an independent CSRF token; operator login is rate-limited and no GET URL conveys the access secret.
- OAuth tokens and Picker session IDs remain in a single volatile process. Expiry triggers session cleanup. No DB, file, analytics or browser cache.
- Strict trusted Google OAuth, Picker and media hosts; no cross-host redirects with bearer tokens; bounded JSON and photo-byte reads; no automatic retries or background synchronization.
- Reverse proxy must redact/suppress OAuth callback URLs from logs. Shut down the test service and revoke the test grant afterward.
- Production remains blocked by Google's actual permitted-use/persistent sharing approval, Web/Capacitor device acceptance and [#797](https://github.com/baerenmarke90/eimir/issues/797).

## Automated tests and live evidence

~~~bash
python3 tools/ci/test_google_photos_picker_web_probe.py
python3 tools/ci/test_google_photos_picker_probe.py
~~~

These deterministic tests run in GitHub CI **without secrets/network**. They prove callback state, cookie, CSRF, host restrictions, selected photo transfer boundary and cleanup logic **only under mocks**.

After a real browser test, record the date, OAuth Web client type, successful or denied consent, selected test photo download and remote session cleanup status in #1444. Never include Google codes, client secrets, access tokens, Picker URLs, photos or account identities.

**Official sources:** [Google OAuth Web server](https://developers.google.com/identity/protocols/oauth2/web-server), [Google Picker sessions](https://developers.google.com/photos/picker/guides/sessions), [Picker REST](https://developers.google.com/photos/picker/reference/rest), [Picker media items](https://developers.google.com/photos/picker/guides/media-items), [Google Photos API policy](https://developers.google.com/photos/support/api-policy).
