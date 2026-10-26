# #1444 — Google Photos Picker live API probe (operator-only)

**Status:** Runnable developer test harness, NOT a completed live provider test, production approval or eimir. media upload.
**Scope:** One explicitly selected synthetic photo, read and discarded in memory. No photo is saved to eimir., disk or logs.

This follows [the feasibility review](1444-photo-import-feasibility.md) and validates the genuine Google OAuth / Picker / byte-download path before an actual product integration.

## Prerequisites outside Git

1. In [Google Cloud Console](https://console.cloud.google.com/apis/library), create/select a dedicated **test** project and enable **Google Photos Picker API**, not the unrelated Google Picker API.
2. Configure the OAuth consent screen and permitted test-user account.
3. Create a **Desktop application OAuth client** and retain its client ID on the tester's machine. Desktop loopback callbacks with PKCE are the intended testing path. This credential is NOT the future eimir. Web/Capacitor OAuth client.
4. Put exactly one synthetic, non-sensitive supported JPEG in the tester's Google Photos account. Sign in to this Google account in the machine's normal desktop browser.
5. Run from that desktop with Python 3.12+ and an available browser. No Google account or credential is available in this project repository.

Do not post access/refresh tokens, OAuth secrets, Picker URLs, media IDs, account identifiers or test photos into GitHub, chat, logs or a copied console transcript.

## Run locally

Windows PowerShell:

~~~powershell
$env:EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_ID = "YOUR-DESKTOP-CLIENT-ID.apps.googleusercontent.com"
python scripts/google_photos_picker_probe.py
Remove-Item Env:EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_ID
~~~

Linux/macOS:

~~~bash
EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_ID="YOUR-DESKTOP-CLIENT-ID.apps.googleusercontent.com" \
  python3 scripts/google_photos_picker_probe.py
~~~

The desktop OAuth code exchange supports an optional client secret. If your particular test client requires one, inject it privately through the EIMIR_GOOGLE_PHOTOS_TEST_OAUTH_CLIENT_SECRET environment variable, **never into a Git-tracked file or printed shell arguments**. Google authentication must be performed in the system browser, not in the embedded Capacitor WebView.

## What the probe does

1. Opens an ephemeral 127.0.0.1 HTTP callback server for Google Desktop OAuth with random state and PKCE challenge. Requests only the Google Photos Picker readonly scope, without offline access or storing tokens.
2. Creates a session at https://photospicker.googleapis.com/v1/sessions with a strict one-image selection limit, opens the returned Google Photos page in the normal browser and polls the session using Google's recommended interval and timeout.
3. Lists the selected media item, allows only supported photo MIME types, validates the Google-owned media URL host, reads at most 25 MiB from a single photo and **discards all bytes**.
4. Deletes the Picker session in a finally block even if image download fails. The user account and any other image are unaffected.

No data is uploaded to eimir. and no production OAuth credentials, refresh tokens or background sync exist.

## Failure handling

A wrong OAuth state, denied consent, missing test client, unexpected URL/redirect, unsupported MIME/video, oversized or empty image, failed network request, timeout or revoked grant stops safely. The probe does not automatically retry requests or weaken validation. Media URLs are accepted only from documented Google photo hosts (lhN.googleusercontent.com); if Google uses a different legitimate host, record the compatibility issue instead of disabling checks.

The probe does not prove eimir. Web/Capacitor OAuth callback handling, the downstream attachment binding or legal approval for storing Google Photos in a shared Memory. Production use is blocked by Google OAuth/policy verification and the applicable #797 encryption-at-rest gates.

## Deterministic local tests

~~~bash
python3 tools/ci/test_google_photos_picker_probe.py
~~~

The CI Change Detection job runs those tests without credentials, network or browser. This checks state, host restrictions, photo-byte handling and session cleanup, **not live provider access**.

## Evidence checklist

For a legitimate live run, note in #1444 the date, Desktop OAuth client type, scope, Google API status codes, one-item completion, allowed MIME type, byte-transfer success/aggregate size and session cleanup. **Do not include** actual names, images, tokens, media identifiers or Picker URLs.

**Official sources:** [Google API setup](https://developers.google.com/photos/overview/configure-your-app), [Desktop OAuth and PKCE](https://developers.google.com/identity/protocols/oauth2/native-app), [Photos Picker REST endpoint](https://developers.google.com/photos/picker/reference/rest), [media bytes](https://developers.google.com/photos/picker/guides/media-items) and [Google Photos policy](https://developers.google.com/photos/support/api-policy).
