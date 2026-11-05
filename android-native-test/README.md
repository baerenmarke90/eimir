# eimir. native Android test client (experimental)

**Status:** experimental, isolated test branch. Not a product delivery target.
**Decision record:** [ADR 0014](../docs/decisions/0014-experimental-native-android-test-client.md), a deliberate,
time-boxed exception to [ADR 0011](../docs/decisions/0011-web-first-pwa-capacitor-mobile-delivery.md).
**Package:** `de.eimir.nativetest` (debug: `de.eimir.nativetest.debug`).
**Backend:** pinned to the `eimir-test` instance `https://demo.eimir.ur-cloud.de`.

This directory answers one question: how well does eimir. work as a genuinely native, Kotlin/Jetpack Compose
Android consumer app while keeping its product design, functions and backend architecture? It is a separate
Gradle build. The canonical Capacitor app in [`../android`](../android) is not touched and remains the only
Android delivery. Both apps install side by side and keep separate device sessions against the same backend.

## Architecture

```text
Compose UI (Material 3 mapped to eimir. tokens, eimir. icon grammar, Literata + Instrument Sans)
   │  ViewModels + StateFlow (lifecycle-aware, survive rotation/fold, SavedStateHandle for drafts and scope)
   ▼
EimirRepository ── ChangeBus (confirmed writes refresh affected screens in place)
   │
Retrofit interface (EimirApi) ── generated OpenAPI models (api/generated, kotlinx.serialization)
   │
OkHttp: bearer interceptor + serialized refresh authenticator ── SessionManager ── Keystore AES-GCM file
   │
Coil 3 (memory-only) with authorized attachment/avatar fetchers ── Telephoto zoom ── system Photo Picker
```

| Concern | Decision |
| --- | --- |
| Product UI | Native Compose screens. No WebView anywhere. Custom Tabs/system browser are not needed by the active auth methods. |
| Navigation | Navigation Compose (type-safe routes). Each tab keeps its own back stack and scroll position; the central plus is an action sheet, not a destination. Predictive back is enabled. |
| API models | Generated from `backend/openapi.json` with the repository's pinned openapi-generator image (`tools/generate-api-models.sh`, `--check` reports drift). `ApiContractTest` verifies every bound path, method, mandatory `If-Match` and contextual type against the contract. |
| Design tokens | `generateDesignTokens` reads `design/tokens.json` at build time; colours, spacing, radii, type scale, motion and the media concealment blur are never restated. `DesignTokenTest` checks parity and WCAG AA contrast in Light and Dark. |
| Icons | `tools/generate_icons.py` converts the Web outline icon grammar (`web/src/components/EimirIcon.tsx`, #1225) into Compose path data. |
| Fonts | The repository's own OFL Literata and Instrument Sans variable fonts, converted losslessly from the Web WOFF2 files to TTF (glyph data unchanged; licences in `app/src/main/assets`). |
| Sessions | One `SessionManager`; all refreshes run under one mutex because the backend revokes the whole token family on a replayed refresh token. The rotated pair is persisted before use. Only an explicit 401/403 from refresh signs out; network or server failures keep the session (no reset after a temporary outage). |
| Token storage | AES-256-GCM sealed file in `noBackupFilesDir`, key in the Android Keystore; backup and device transfer are disabled. Tokens never enter logs, URLs, preferences or saved state. |
| Space context | Server memberships decide; one active membership enters directly, several require an explicit choice. A stored Space is revalidated in the background and left immediately when no longer authorized. Login or Space changes clear all in-memory projections and images. |
| Media | Every network delivery first asks `read-access` (STREAM URLs get the bearer, signed URLs never do). Coil runs memory-only: no personal bytes on disk, cleared on sign-out/Space change. Cache keys contain login, Space, parent, attachment and variant (as in #1384). |
| Writes | Creates send a stable `Idempotency-Key` per draft; versioned writes send `If-Match`; a 409 reloads and explains. A created Memory whose photo binding is unconfirmed becomes a *partial* state that reconciles instead of creating again. No silent offline write queue. |
| Offline | Loaded content stays visible with an explicit offline/stale notice; refresh runs on reconnect and on return to the app. |

## Build

Dependency verification is strict and SHA-256 based (`gradle/verification-metadata.xml`, generated from an empty Gradle home; it records the macOS `aapt2` classifier only because this build runs locally, not in CI). Prerequisites (this Mac): JDK 21 at `/opt/homebrew/opt/openjdk@21/...`, Android SDK with platform 37,
Docker only for regenerating models.

```bash
cd android-native-test && ./gradlew --no-daemon -Dorg.gradle.java.home="$JAVA_HOME" :app:testDebugUnitTest :app:lintRelease
```

```bash
android-native-test/tools/build-signed-apk.sh 1
```

The script builds the minified release, signs it with the dedicated native-test key, and prints package,
version, signer certificate digest, source revision and APK SHA-256. A different origin requires the explicit
Gradle property `eimirNativeApiOrigin` (validated: bare HTTPS origin); the active host is shown on the sign-in and
About screens, so the app can never switch to a production backend unnoticed.

### Versioning and signing

* `versionName` = `0.1.0-native-test.<versionCode>`; `versionCode` is supplied per build and must increase.
* Signing key: dedicated to `de.eimir.nativetest` (RSA 4096, PKCS12), kept outside the repository in
  `~/Library/Application Support/eimir-native-test/signing/` with its password in the macOS Keychain item
  `eimir-native-test-signing`. It is **not** the Capacitor test, release or any third-party key. Losing it
  means testers must uninstall before installing a build signed with a new key.
* Without the key the release build stays unsigned; it never falls back to the debug key. Debug builds use
  `.debug` and are not equivalent to a published test build.
* No GitHub Actions release workflow and no publication to the Capacitor update channel.

## Sign-in on the test instance

`/api/v1/instance/status` on the test instance reports `magicLink: true`, `passkey: true`, `localPassword: false`,
`oidc: false`, `accountCreation: self_service`, `selfServiceSignupAvailable: false`.

* **Magic Link: implemented.** The request uses the existing endpoint and its non-enumerating response.
  The mailed link (`/auth/magic-link?token=…`) reaches the app by (1) Android share sheet → *eimir. native*,
  (2) pasting the link (clipboard button on the sign-in screen), or (3) opening it directly once the person
  allows the domain under *Open by default* (in-app Settings entry `settings_open_link_settings`). The activity is
  `singleTask`, so a link arriving while the app runs lands in the existing task. Only links of the pinned
  origin are accepted; the proof is kept in memory only and removed from the retained intent. A link
  arriving while another login is active asks before replacing it.
* **Why not verified App Links:** the instance's `/.well-known/assetlinks.json` verifies only
  `de.sidebyside.app` (the Capacitor test app) for this host. Registering a second package would make Android
  show a chooser for both apps' auth links. That is a server/deployment change (#1375/#1331 scope) and was
  not made.
* **Passkeys: not offered.** Android Credential Manager would sign with origin
  `android:apk-key-hash:<signing cert>`; the instance's `EIMIR_WEBAUTHN_ORIGINS` and Digital Asset Links
  (`delegate_permission/common.get_login_creds`) do not include this package. Enabling it needs an operator
  decision on the test deployment; the client side would use the existing `passkeys/authentication/*` contract.
* **Invitations, signup proofs, e-mail verification:** recognised from the same links; an invitation that
  arrives before sign-in is accepted right after it. Self-service signup is closed on the instance.
* **Sign-out** revokes the device session on the server (best effort) and always clears local state.
* Device sessions are registered with `platform = "android-native"`, separating them from Web/Capacitor sessions.

## Product scope and parity

The binding work list is the [Web → native parity matrix](docs/PARITY-MATRIX.md). Implemented in this first
increment: Wir/Today, Momente (Timeline with scope sheet, Discover, all photos), Memory detail with gallery,
comments, photo places and map hand-off, Memory create/edit with Photo Picker uploads, heart moment and
milestone details, Planen (plans and wishes with schedule/complete/return-to-wish/plan-this-wish), and Mehr
(profile, private notes, places, people, notifications, activity, search, settings, About). Remaining Web
surfaces (chapters, collections, games, insights, reminders, important dates, imports/exports, external
photo sources, heart moment/milestone creation, profile editing, relationship settings, push) are listed
as open there instead of being shown as non-functional placeholders.

## Privacy and security notes

* Sensitive media (#1477): unknown or sensitive classification is concealed before any pixel is drawn;
  unknown media is not even requested until revealed. Reveals are per viewing context, never saved, and
  reset when the app leaves the foreground; while anything is revealed the app is excluded from the Recents
  thumbnail (Android 13+). Sharing is offered only for visible, non-concealed photos.
* Photo places (#1478): original picked bytes are uploaded (Photo Picker metadata grant on supported devices,
  `ACCESS_MEDIA_LOCATION` + `setRequireOriginal` otherwise); the backend applies the person's photo-location
  preference and resolves names asynchronously. The app polls unresolved places at most 20 times while
  visible, shows OSM attribution, and opens maps only through a deliberate `geo:` intent. No map SDK, tiles
  or geocoder in the app.
* Sharing re-encodes the photo to JPEG, dropping EXIF (including GPS); the temporary copy lives in the cache,
  is exposed through a FileProvider and deleted on the next share, sign-out or process start.
* No analytics, crash reporting or HTTP logging is included.

## Tests and evidence

`./gradlew :app:testDebugUnitTest` runs 48 JVM/Robolectric tests:

* session lifecycle (serialized rotation, outage keeps session, rejection ends it, origin binding, login identity) and root gate transitions (restore, Space switch, link replacement prompt, sign-out),
* entry-link parsing (origin pinning, shared mail text, invitation fragments),
* the real OkHttp stack against MockWebServer (bearer, refresh-and-retry, outage, 403/404 parity, premium, 409/`If-Match`),
* OpenAPI contract checks,
* sensitive media concealment,
* end-to-end Compose journeys through `MainActivity` against a fixture backend serving only synthetic content and
  the repository's approved demo photographs: Today → Memory → back, Timeline → detail with photo place → back with
  scope preserved, quick create → capture → save → result → back, Planen, Mehr/Settings; Light/Dark, 320 dp and
  Expanded renders in [`docs/evidence`](docs/evidence).

Not covered here: real-device runs, TalkBack sessions, frame-time measurements, live sign-in. See the PR for the
exact acceptance status.

## Maintenance cost

A second product UI duplicates every user-facing change: each Web feature, copy change, design calibration and
accessibility fix must be re-implemented, reviewed and accepted twice, and the backend contract gains a second
consumer whose models must be regenerated with every OpenAPI change. Rough order of magnitude from this
increment: ~30 screens/sheets and ~9.9k lines of hand-written production Kotlin (excluding generated API models, tokens and icon data) plus ~1k lines of tests, covering roughly half of the Web surface. Shared contracts keep
business rules single-sourced (generated models, server-side authorization, entitlements, visibility), but
presentation parity, product acceptance and Android release work scale linearly with the Web product. ADR 0011
removed the previous Compose client for exactly this reason; this experiment does not change that decision
by itself.
