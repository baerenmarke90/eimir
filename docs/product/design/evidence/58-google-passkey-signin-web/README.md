# #58 Google and passkey sign-in (Web): implementation evidence

Implements the approved reference in
[`references/58-google-passkey-signin`](../../references/58-google-passkey-signin/README.md).
Baseline `main` `8c3f6c06e`. Captures come from the real components running on the Vite
dev server against a mocked `/api/v1/instance/status`; the settings captures use the real
`SignInMethodsPanel` with mocked responses.

| Image | State |
| --- | --- |
| [01](01-signin-cloud-360-light.jpg), [02](02-signin-cloud-390-light.jpg), [03](03-signin-cloud-430-light.jpg) | Cloud sign-in, Light, 360 / 390 / 430 px |
| [04](04-signin-cloud-390-dark.jpg), [05](05-signin-cloud-360-dark.jpg) | Cloud sign-in, Dark, 390 / 360 px |
| [06](06-signup-terms-accepted-390-light.jpg) | Start-together tab with the terms accepted: Google enabled |
| [07](07-settings-sign-in-methods-390-light.jpg), [08](08-settings-sign-in-methods-390-dark.jpg) | Account settings: sign-in methods, Light and Dark |
| [09](09-signin-cloud-768-expanded-light.jpg) | Cloud sign-in at the Expanded breakpoint (768 px): same card, heading and body visible |

## What changed for people

- Sign-in and start-together offer Google and, on sign-in, a passkey above the e-mail link. The
  e-mail form keeps the single filled action. Provider and passkey entries appear only when the
  instance reports them; none of them appear in the Android app yet.
- Start together asks for the terms first; Google signup is enabled only after the box is ticked.
- The Google return (`/auth/oidc/<connection>`) completes in place, with a loading state and
  plain error states (no account yet, address already registered, address not verified, expired
  attempt). A declined provider dialog returns quietly to the form.
- A wrong password now says the details are wrong (`login.errorFallback`) instead of the
  session-expired copy; forgot-password is a text action instead of a second filled button.
- Compact: smaller headline, no repeated in-card heading on the Cloud tabs, left-aligned field
  labels. Expanded keeps the existing heading and body.
- Account settings list the mailed link, linked providers and passkeys. Adding a passkey uses the
  shared filled add action; removing a passkey or unlinking a provider asks twice, and the server
  refuses the last way in.

## Validation

- Vitest on the touched areas: IdentityEntry (including the new provider/passkey cases),
  SignInMethodsPanel, entry-token parsing, instance status, WebAuthn codec, settings, i18n and
  theme tests. `tsc` and Biome (errors) on the touched files are clean.
- The generated TypeScript client was extended by hand because the generator container is not
  available on this machine. Run `tools/openapi/generate.sh` before merging.
- Local-only failures that also occur without this change: `webLayout.test.ts` and
  `safeAreaLayout.test.ts` compare CSS/config text and fail on CRLF checkouts.

## Not verified

- A real Google round trip (needs the Google console client) and a real passkey ceremony.
- The Android app and the passkey bridge (#630) are separate slices; the browser-only controls are
  hidden in the native container by `isCapacitorNative()`.
- Playwright and axe were not run locally (not installed in this checkout); the existing
  Cloud entry journeys were read against the changes (Expanded keeps heading and body visible).
- A wide desktop window and 200 % text scaling were not captured; the Expanded breakpoint is shown at 768 px.
