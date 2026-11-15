# #1444 — Google Photos Picker live API probe (operator-only)

**Status:** Runnable developer test harness, NOT a completed live provider test, production approval or eimir. media upload.
**Scope:** One explicitly selected synthetic photo, read and discarded in memory. No photo is saved to eimir., disk or logs.

**Browser-only cloud alternative:** [Operator HTTPS Web OAuth probe](1444-google-picker-cloud.md). The desktop script below remains an optional fallback; users of the separate cloud test do not need to run Python locally.

This follows [the feasibility review](1444-photo-import-feasibility.md) and validates the genuine Google OAuth / Picker / byte-download path before an actual product integration.

## Prerequisites outside Git

1. In [Google Cloud Console](https://console.cloud.google.com/apis/library), create/select a dedicated **test** project and enable **Google Photos Picker API**, not the unrelated Google Picker API.
2. Configure the OAuth consent screen and permitted test-user account.
3. Create a **Desktop application OAuth client**, then download Google's OAuth client JSON to a protected folder **outside the eimir. repository**. The probe rejects a credential file kept inside the checkout. This Desktop client is NOT the production eimir. Web/Capacitor OAuth client.
4. Put exactly one synthetic, non-sensitive supported JPEG in the tester's Google Photos account. Sign in to this Google account in the machine's normal desktop browser.
5. Run from that desktop with Python 3.12+ and an available browser. No Google account or credential is available in this project repository.

Do not post access/refresh tokens, OAuth secrets, Picker URLs, media IDs, account identifiers or test photos into GitHub, chat, logs or a copied console transcript.

## Run locally

Install the *operator-only* official Google OAuth SDK in a dedicated local Python environment (do not add it to the eimir. runtime dependencies). The tested upstream package is **google-auth-oauthlib 1.5.0, Apache-2.0**, released September 29, 2026.

Windows PowerShell (from the repository root):

~~~powershell
python -m pip install "google-auth-oauthlib==1.5.0"
python scripts/google_photos_picker_probe.py --client-secrets-file "$HOME\Documents\google-picker-desktop-test.json"
~~~

Linux/macOS (from the repository root):

~~~bash
python3 -m pip install "google-auth-oauthlib==1.5.0"
python3 scripts/google_photos_picker_probe.py --client-secrets-file "$HOME/private/google-picker-desktop-test.json"
~~~

Use a protected local path to the **downloaded Desktop OAuth client JSON**, outside the working tree. Do not paste OAuth client secrets or authorization codes into shell arguments, screenshots, logs or this issue. The SDK handles loopback callbacks, CSRF state, PKCE S256 and the code/token exchange; **no handwritten OAuth handler is used**. The probe requests online-only consent (no refresh-token storage), and suppresses the SDK's default console print of the authorization URL.

The official SDK is installed only for a manual operator run; normal CI has no Google OAuth dependency or access to credentials.

## What the probe does

1. Uses Google's official Desktop OAuth SDK on 127.0.0.1 with an ephemeral loopback port, random CSRF state and PKCE S256. Requests only the Google Photos Picker readonly scope, without offline access or storing tokens.
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

**Official sources:** [Google-auth-oauthlib Python SDK](https://pypi.org/project/google-auth-oauthlib/1.5.0/), [Google API setup](https://developers.google.com/photos/overview/configure-your-app), [Desktop OAuth and PKCE](https://developers.google.com/identity/protocols/oauth2/native-app), [Photos Picker REST endpoint](https://developers.google.com/photos/picker/reference/rest), [media bytes](https://developers.google.com/photos/picker/guides/media-items) and [Google Photos policy](https://developers.google.com/photos/support/api-policy).
