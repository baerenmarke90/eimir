# Canonical Capacitor Android Foundation (`#1044`)

This document describes the canonical Capacitor Android wrapper of **eimir.** in `android/`. It was established under Issue `#1044` (parent `#1005`, ADR 0011), moved into the release pipeline by `#1008` Slice B, and promoted to the repository's only Android project by `#1009`.

`android/` is a platform boundary, not a second application: there is no Kotlin/Compose product UI, no native screen parity program, and no native product state. Product behavior lives in the React/Vite application in `web/`. Native code exists only for bounded platform capabilities (deep links, system bars, and future push/haptics/share slices).

---

## 1. Integration Architecture & Asset Pipeline

The Android client packages the local Vite production bundle directly into the application container without relying on a remote web server URL (`server.url` is omitted from `capacitor.config.ts`).

### Asset Pipeline Flow
```
web/ (Vite + TypeScript)
  ├── npm run cap:build:web (vite build)
  │     └── generates production bundle in web/dist/
  └── npm run cap:sync (or cap:copy)
        └── copies web/dist/ -> android/app/src/main/assets/public/
              └── Gradle compiles assets into app-debug.apk / app-release.apk
```

### Key Configuration
- **Capacitor Configuration**: `web/capacitor.config.ts`
  - `appId`: `'de.sidebyside.app'` (canonical released app ID)
  - `appName`: `'eimir.'`
  - `webDir`: `'dist'`
  - `android.path`: `'../android'`
  - `server.androidScheme`: `'https'` (`https://localhost` inside WebView)
  - `plugins.CapacitorHttp.enabled`: `true` (native cross-origin HTTP bridge)
- **API Base Requirement (Fail-Closed)**:
  - In native mode (`Capacitor.isNativePlatform()`), the app **strictly requires** a non-empty `VITE_EIMIR_API_BASE_URL` pointing to a valid remote server (HTTP/HTTPS).
  - Falling back to `window.location.origin` inside the native container would incorrectly target `https://localhost` (the internal WebView origin), resulting in broken network calls.
  - The build script `web/scripts/build-capacitor-web.mjs` enforces `VITE_EIMIR_API_BASE_URL` at build time.
  - Runtime resolution (`web/src/client/config.ts`) throws a fail-closed descriptive error if `VITE_EIMIR_API_BASE_URL` is missing or resolves to localhost/127.0.0.1 in native mode.
  - For an Android build pointed at a `demo.` API subdomain, the build enables the existing Demo entry and banner unless `VITE_EIMIR_DEMO_MODE=false` is set explicitly. Other API hosts require `VITE_EIMIR_DEMO_MODE=true` to enable that presentation. The backend remains authoritative for Demo entry and destructive-action restrictions.
  - The Demo reset timer is independent of Demo mode. Set `VITE_EIMIR_DEMO_RESET_TIMER` and `VITE_EIMIR_DEMO_RESET_INTERVAL` to match the backend deployment (`EIMIR_DEMO_MODE_RESET_TIMER`, `EIMIR_DEMO_MODE_RESET_INTERVAL`); the build does not infer an active reset timer from the API hostname. The build fails on non-boolean flags, on a reset timer without Demo mode, and on an interval the backend would reject (`30m`/`6h`/`1d` form, 5m to 7d).
  - Canonical `VITE_EIMIR_*` values take precedence over legacy `VITE_SBS_*` values. The resolved values are passed to Vite explicitly, so they also take precedence over any local `web/.env*` file.
  - The Web-demo launch link (`VITE_EIMIR_DEMO_URL`) is always cleared for the native bundle, because following it would leave the app for the system browser.
  - Demo selection happens in the Web bundle, so `assembleDebug`, `assembleRelease`, and `bundleRelease` of one synchronized bundle behave identically. All variants share the `de.sidebyside.app` application ID (debug adds `.debug`); a Demo bundle should therefore be distributed as a debug build or through a separate channel rather than through the production release workflow.
- **Native HTTP Transport (`CapacitorHttp`)**:
  - `CapacitorHttp.enabled: true` patches `window.fetch` and `window.XMLHttpRequest` in the native WebView container.
  - Requests are routed through the native Android network stack, preserving `Authorization: Bearer ...` headers and bypassing WebView CORS restrictions against the remote API origin.
  - Standard native TLS validation is enforced (no disabled certificate checks).
  - Browser and PWA deployments remain on standard web platform `fetch`/`XMLHttpRequest`.
  - **Boundary / Large Transfers**: CapacitorHttp buffers request and response payloads across the JavaScript-Java bridge in memory. Large multi-megabyte uploads (e.g. videos or huge attachments) may hit memory or bridge performance limits and should be monitored or delegated to specialized background upload plugins in subsequent slices.
- **Service Worker Suppression**:
  - In native Capacitor WebView containers, Service Worker registration is skipped (`web/src/pwa.ts`) to avoid conflicting cache layers with Capacitor's local asset pipeline.

---

## 2. Lifecycle, Back-Button, and Resume Behavior

The mobile lifecycle integration is managed via `useCapacitorShell()` (`web/src/capacitorShell.ts`), mounted at the root in `web/src/main.tsx`:

- **Hardware Back-Button (`App.addListener('backButton', ...)`):**
  - Evaluates `canGoBack` (provided by Capacitor).
  - If true, invokes `window.history.back()`.
  - If at root or history is exhausted, invokes `App.minimizeApp()` so the Android task and WebView remain reusable when the OS retains the process.
- **App Resume (`App.addListener('appStateChange', ...)`):**
  - Listens for `isActive === true`.
  - Updates TanStack Query's `focusManager` on background/foreground transitions.
    Query v5 listens to browser visibility changes, not synthetic window focus;
    the native callback must therefore notify the framework directly. Fresh
    ordinary reads remain quiet under their 60-second freshness policy, stale
    active reads revalidate, and explicit live-domain policies remain intact.
  - Also dispatches `window.dispatchEvent(new Event('focus'))` on resume for the
    existing session-refresh and presence consumers. Disposed callbacks are
    ignored and cleanup restores the framework's default browser focus check.

---

## 3. External Link & OIDC Callback Handling

- **External Links:**
  - Standard Capacitor WebView behavior is preserved without invasive global click-handler DOM interception.
  - In-app navigation uses existing React router / window history.
- **Delivered mailbox and invitation links:**
  - The shared Web identity-entry intake reads `appUrlOpen` and `App.getLaunchUrl()` for HTTPS auth URLs from the configured API origin, as well as browser routes and PWA launch targets. Proofs remain in memory and use the existing identity flow before an older signed-in shell can take precedence.
  - This intake only handles URLs already delivered to the wrapper. The ordinary main manifest registers the OIDC filter below. The separately published Android test channel also has a sideload manifest for five HTTPS auth paths on `demo.eimir.ur-cloud.de`; it does not establish verified App Links for arbitrary Self-Hosted domains. OS domain verification and APK distribution are separate boundaries. A Web/backend deployment cannot update a previously bundled APK.
- **OIDC Authentication Flow:**
  - When running in native mode (`isCapacitorNative()`), OIDC login launches via `@capacitor/browser`:
    ```ts
    await Browser.open({ url: authUrl, windowName: '_system' });
    ```
  - Upon backend authentication completion, the identity provider redirects to:
    ```
    de.sidebyside.app://recent-authentication/oidc?code=...&state=...
    ```
  - The Android app receives this via an `intent-filter` registered in `android/app/src/main/AndroidManifest.xml`.
  - The web application captures the incoming deep link using both:
    1. `@capacitor/app` `appUrlOpen` listener (for warm starts / in-background resume).
    2. `App.getLaunchUrl()` (for cold-boot starts when the activity is created by the intent).
  - The handler verifies matching session `state`, extracts `code`, invokes the backend completion endpoint (`completeRecentAuthentication`), and closes the browser view (`Browser.close()`).
- **Client Capabilities Filter**:
  - `loadRecentAuthenticationCapabilities()` automatically passes `client: RecentAuthenticationClient.android` when running natively.
  - The backend returns only OIDC connections that have an `android_redirect_uri` configured, preventing users from selecting unsupported web-only flows in the Android container.

---

## 4. Native Passkey Boundary

- Direct eimir.-WebAuthn via `navigator.credentials` inside the Android WebView is **not supported** in this foundation slice (it requires Android Credential Manager and Digital Asset Links integration, scheduled for future iterations).
- `loadRecentAuthenticationCapabilities()` explicitly forces `passkey: false` in native container mode, so passkey re-authentication options are not presented in the native UI.
- `authenticateRecentPasskey()` fails closed with an informative error if invoked in native mode.
- Standard Web/PWA passkey authentication remains completely unchanged.
- The bounded native passkey bridge (Credential Manager plus Digital Asset Links, handing its result to the existing Web auth orchestration) is tracked in #630. It is not implemented on `main`. OIDC needs no bridge and stays out of that scope.
- Third-party OIDC/Pocket-ID authentication (which runs in the system browser/Custom Tab via `@capacitor/browser`) is decoupled from WebView WebAuthn and functions independently.

---

## 5. Application ID & Namespace Configuration

- **Release Application ID**: `de.sidebyside.app` (immutable historical identifier required for existing releases and keystores).
- **Debug Application ID**: `de.sidebyside.app.debug` (ensures parallel installation alongside release builds via `applicationIdSuffix = ".debug"` in `android/app/build.gradle`).
- **Android Package / Namespace**: `de.eimir.app` (modern namespace used for generated R classes and `MainActivity.java` at `android/app/src/main/java/de/eimir/app/MainActivity.java`).
- **SDK Compatibility**:
  - `minSdkVersion = 26` (Android 8.0 Oreo, preserved from the retired client's requirement; not lowered to 24).
  - `compileSdkVersion = 36`, `targetSdkVersion = 36`.
- **Branding Assets**:
  - Adaptive icons (`mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`) use eimir. brand red background (`#D93D59`) with the canonical double-ring vector (`drawable/ic_launcher_foreground.xml`) and Android 13+ themed monochrome vector (`drawable/ic_launcher_monochrome.xml`).
  - Splash drawables use eimir. launch background (`#FAF7F5`) with centered eimir. icon.

---

## 6. Build, Test, and Verification Commands

### Compatible security toolchain

The wrapper uses Gradle **9.8.1**, AGP **9.4.0**, Capacitor **8.5.2** and
JDK **21**. Gradle 9.8.1 contains the fixes for three advisories also repaired
in the 8.14.6 patch used before this migration:
[worker authentication](https://github.com/gradle/gradle/security/advisories/GHSA-mvvg-497x-hmj8),
[client/daemon authentication](https://github.com/gradle/gradle/security/advisories/GHSA-xwqc-3h47-hg64),
and [repository TLS failure handling](https://github.com/gradle/gradle/security/advisories/GHSA-j5m7-59rp-24f5).

Raise Gradle and AGP only together. Gradle 9.6 or later removed the
`InternalProblems` API that AGP 8.x uses, and AGP 9.4 requires Gradle 9.6.0 or
later according to the
[official AGP/Gradle compatibility table](https://developer.android.com/build/releases/about-agp).

The Capacitor project documents AGP 8.13.0 for
[Capacitor 8](https://capacitorjs.com/docs/updating/8-0) and AGP 9.2.1 with
Gradle 9.5.1 only in the [unreleased Capacitor 9 guide](https://capacitorjs.com/docs/next/updating/9-0).
AGP 9.4.0 on Capacitor 8.5.2 is therefore a pairing Capacitor does not
document. It is accepted for this repository because the wrapper builds and
passes its own gates on it (debug APK, unsigned release APK/AAB, lint, unit
tests, Android launcher tests under strict dependency verification), and the
repository owns neither Kotlin sources nor a Capacitor fork. Review this
decision again when Capacitor 9 is released. The one source change AGP 9
forced is the default R8 rule file `proguard-android-optimize.txt` in
`android/app/build.gradle`, which has no effect while `minifyEnabled` stays
`false`.

Distribution and generated wrapper-JAR checksums come from the
[official Gradle checksum reference](https://gradle.org/release-checksums/).
Generate the wrapper with the verified distribution; the bootstrap JAR in
Gradle's source repository can still belong to the preceding release.
Both release workflows pin the generated JAR, and strict dependency verification
continues to use the existing artifact allowlist without exemptions.

### Web Layer
```bash
cd web

# Run all unit tests
npm test

# Run type checks, linter, and formatting
npm run typecheck
npm run lint
npm run format:check

# Architectural validation check (requires full repository checkout)
npm run cap:check

# Build web production bundle with explicit API base URL
VITE_EIMIR_API_BASE_URL="https://api.eimir.example.com" npm run cap:build:web

# Sync web bundle, plugins, and config to android/
npm run cap:sync
```

### Android Native Wrapper
```bash
cd android

# Build Debug APK
./gradlew assembleDebug

# Output APK location
app/build/outputs/apk/debug/app-debug.apk
```

---

## 7. Troubleshooting Guide

| Issue | Cause | Resolution |
|---|---|---|
| `VITE_EIMIR_API_BASE_URL is missing or invalid` | Build or runtime did not supply remote API base. | Provide valid URL `VITE_EIMIR_API_BASE_URL="https://..."` during `cap:build:web`. |
| Java compiler `invalid source release: 21` | System default Gradle Java is older than Java 21 (e.g., Java 17 in `~/.gradle/gradle.properties`). | Point Gradle to Java 21: `-Dorg.gradle.java.home="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"` or update `gradle.properties`. |
| Blank screen on app start | Web bundle assets missing from assets directory. | Run `npm run cap:build:web && npm run cap:sync` from `web/`. |
| Deep link doesn't trigger app | AndroidManifest intent-filter missing scheme/host. | Verify `aapt dump xmltree ... AndroidManifest.xml` contains scheme `de.sidebyside.app`, host `recent-authentication`, path `/oidc`. |
| API call CORS error in native WebView | `CapacitorHttp` is disabled or not synced. | Verify `plugins.CapacitorHttp.enabled = true` in `capacitor.config.ts` and run `npm run cap:sync`. |
| Chrome DevTools WebView debugging | Inspecting running Capacitor WebView on device/emulator. | Connect device via USB, open `chrome://inspect/#devices`, select `de.sidebyside.app.debug`. |

---

## 8. Migration History

- `#1044` / PR `#1046` created the Capacitor wrapper as a staging project next to the legacy Kotlin/Compose client; a real-device smoke test on a Pixel accepted it.
- `#1008` Slice B / PR `#1056` moved release, signing, SBOM, and publication workflows to the wrapper.
- `#1009` removed the legacy Kotlin/Jetpack Compose client (screens, ViewModels, native read cache, Kotlin API models, Compose and Robolectric tests) and promoted the wrapper to the canonical `android/` directory. The staging path `capacitor-android/` no longer exists.
- Git history preserves the retired client; it is not a reference implementation. New product behavior is built once, in `web/`.

### Reading older documents

Dated plans, gate reviews, audits, and evidence records written before `#1009` may describe a native Kotlin/Jetpack Compose client, Kotlin Multiplatform, SwiftUI, Room/Keystore read caches, or "Web/Android parity". They are historical records of what was true or planned at the time and are **not** current guidance; ADR 0011 governs. In particular:

  - account-deletion, Space-offboarding, and logout rules that name an Android cache are satisfied by the Web client's session and read-cache clearing inside the WebView. The wrapper keeps no native product-data cache; the encrypted current-session credential slot described below is cleared through that same session facade;
- the retired native read cache (Room database plus Android Keystore key) held only a non-authoritative copy of server data. Because the stable application ID preserves the old sandbox across an in-place update, `LegacyNativeDataCleanup` deletes that database, its Space preference and its Keystore key on wrapper startup without reading or migrating their contents, and stops running once all three removals have succeeded (completion marker). Server data continuity and store-upgrade continuity rest on the backend, `de.sidebyside.app` and the signing key.

### Acceptance rule

Mobile Web is the normative product reference. React product work reaches the Android app automatically through Capacitor packaging, so ordinary product changes need no Android implementation or Android screenshots. Android-specific acceptance (real device or emulator) is required only for changes to the wrapper itself, the Capacitor configuration, the release build, or a native platform capability.

---

### Native source inventory

| File | Classification | Owner / purpose |
|---|---|---|
| `android/app/src/main/java/de/eimir/app/MainActivity.java` | NATIVE_CAPABILITY_REQUIRED | Capacitor `BridgeActivity` host; starts the one-shot cleanup. No product logic. |
| `android/app/src/main/java/de/eimir/app/PhotoFileChooser.java` | NATIVE_CAPABILITY_REQUIRED | Selected-photo original-file handoff (#1471): optional photo-metadata permission, read-only document grants, original MediaStore access, cancellation and Activity ownership. No independent upload or location-tracking pipeline. |
| `android/app/src/main/java/de/eimir/app/LegacyNativeDataCleanup.java` | NATIVE_CAPABILITY_REQUIRED / TEMPORARY_UPGRADE_MIGRATION | Deletes the retired Kotlin client's Room database, Space preference and Keystore key after an in-place update. One-shot: writes a completion marker after all three removals succeed; retries only while one fails. Temporary: remove in a later cleanup once no installation that predates the wrapper can remain (no issue tracks that yet). |
| `AndroidManifest.xml`, `res/**`, Gradle files | NATIVE_CAPABILITY_REQUIRED | Launcher, OIDC deep link, FileProvider, icons/splash, build and verification metadata. |

## 9. Reuse-Before-Build Assessment

### Selected-photo locations (#1471)

Android may redact EXIF GPS from ordinary WebView GET_CONTENT selections before
the backend receives their bytes. Image inputs on Android 10+ therefore use the
shared `PhotoFileChooser` adapter. It requests `ACCESS_MEDIA_LOCATION` in the
existing selection task, then opens `ACTION_OPEN_DOCUMENT` with read-only,
selected-file grants. `MediaStore.getMediaUri` maps supported document providers
to the same authorized item; `setRequireOriginal` requests its original bytes.
Resolution/open checks run on Capacitor's background handler and retain a
selected readable file when a provider cannot resolve an original. No native
cache, media scan, persistent grant or library-wide storage permission is added.

Declining the optional permission keeps ordinary selection available and does
not upgrade URIs. The Activity does not repeatedly ask after a decline; Android
app permissions remain the route for changing a previously refused OS grant.
The account preference, private/shared policy and sanitized media storage remain
server-authoritative; OS metadata permission never enables live location or
bypasses the account switch. Camera capture and non-image inputs still use
Capacitor. A wrapper/APK update is required for existing installations.

The preflight, official platform sources and generated composition are in
[Android photo-location import](product/design/references/android-photo-location-import/README.md).
`PhotoFileChooserTest` supplies native contracts and a real Android document-picker
round trip with a GPS-bearing JPEG; the existing API 28/36 native job owns the
build/lint/instrumentation proof. Browser File fixtures alone do not establish
this platform behavior. The screenshot is synthetic system-picker evidence,
not a claim that every OEM/provider has been physically accepted.

| Existing Component | Reused / Adapted | Rationale |
|---|---|---|
| Vite Production Build | Reused directly (`dist/`) | No duplicate bundling tools; standard Vite output is synced. |
| React UI & Routes | Reused 100% | Single code base for desktop, PWA, and mobile. |
| PWA Service Worker | Disabled in native | Prevents conflicting caching layers inside WebView container. |
| Brand & Icon Assets | Reused directly | Android launcher icons and splash drawables generated directly from `web/public/pwa-512.png` and semantic tokens. |
| Recent Auth Flow | Extended for native | Reused cryptographic state verification while adapting transport to `@capacitor/browser` and native deep-linking. |
| Project Identity Guard | Reused | Verified 0 `MUST_RENAME` findings; `de.sidebyside.app` protected as historical immutable release identifier. |

---

## 10. Verification Log

### `aapt dump badging`
```
package: name='de.sidebyside.app.debug' versionCode='1' versionName='1.0-debug' compileSdkVersion='36'
sdkVersion:'26'
targetSdkVersion:'36'
application-label:'eimir.'
application-icon-160:'res/mipmap-anydpi-v26/ic_launcher.xml'
application: label='eimir.' icon='res/mipmap-anydpi-v26/ic_launcher.xml'
application-debuggable
launchable-activity: name='de.eimir.app.MainActivity'  label='eimir.'
```

### Deep Link Intent Verification
```
E: activity (line=37)
  A: android:name="de.eimir.app.MainActivity"
  E: intent-filter
    A: android:name="android.intent.action.VIEW"
    E: data
      A: android:scheme="de.sidebyside.app"
      A: android:host="recent-authentication"
      A: android:path="/oidc"
```

### Local Bundle & Config Inclusion (`unzip -l`)
```
assets/public/index.html
assets/public/assets/index-B1PHVKtg.js
assets/public/assets/index-DfSq4jf3.css
assets/public/fonts/literata-latin-variable.woff2
assets/public/fonts/instrument-sans-latin-variable.woff2
assets/capacitor.config.json (contains plugins.CapacitorHttp.enabled: true, no server.url, no allowNavigation)
```

### Debug APK SHA-256
```
ac75428097821ff60a6f09c8ab67ec41662c30390e65a54ec449251a5cdcaaa7  app/build/outputs/apk/debug/app-debug.apk
```

### Physical Device Smoke Test Status
- **Status**: Accepted on real Pixel device (#1044 / PR #1046).

---

## 11. Release Pipeline — #1008 Slice B, canonical path since #1009

Issue `#1008` (Slice B) moved all release, signing, SBOM attestation, and publication workflows to the Capacitor Android wrapper. They set `ANDROID_PROJECT_DIR: "android"` since `#1009` (it was `capacitor-android` during the staging period):

- **Workflows**:
  - `.github/workflows/release-evidence.yml`: builds unsigned release APK/AAB from `android/`, generates SPDX 2.3 SBOMs, and records release evidence.
  - `.github/workflows/release-candidate.yml`: validates release inputs (`android_api_base_url`, `release_version`), forwards them to `release-evidence.yml`, and binds the immutable release candidate manifest.
  - `.github/workflows/release-publish.yml`: verifies release preflight, builds and cryptographically signs release APK/AAB from `android/`, re-attests signed bytes, and binds release publications.
- **Tooling & Build Steps**:
  - Pinned Actions: Node.js `24.21.0` via `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (`v7.1.0`); JDK `21` Temurin via `actions/setup-java@dd06d9cba3e5552c54d9f8ea23572deb30010f7c`.
  - Pinned Gradle Wrapper: distribution SHA-256 `5ceda8d2425eb2af196dec31b6fc1f38af2fb638fd621f86fa685805f2262224`; wrapper JAR SHA-256 `3b8a25775a69158b5ad2b1d17a80a88dc7b40a352a73eb27d06c612a7ce68e98`.
  - Web Bundle & Native Plugin Graph: built via `VITE_EIMIR_API_BASE_URL="$ANDROID_API_BASE_URL" npm run cap:build:web` followed by `npm run cap:sync`.
  - Native Wrapper Drift Guard: `git diff --exit-code -- android/capacitor.settings.gradle android/app/capacitor.build.gradle` confirms no uncommitted native file drift occurs during CI.
  - Strict Dependency Verification: `android/gradle/verification-metadata.xml` holds sha256 checksums and is enforced via `--dependency-verification strict`. It is the only Android dependency verification metadata in the repository.
  - Release Signing Configuration: `android/app/build.gradle` reads properties and environment variables (`eimirReleaseKeystore`, `eimirReleaseKeystorePassword`, `eimirReleaseKeyAlias`, `eimirReleaseKeyPassword` with temporary backward compatibility fallbacks for `sbs*`).
  - Identity Extraction: release identity is directly extracted from built APK artifacts via `aapt dump badging` rather than parsing Gradle files.

## Native authenticated-session retention (#1357)

Android retains only the current instance-scoped session envelope through
`NativeSessionStorage`. A non-exportable Android Keystore AES-256 key protects
standard AES/GCM ciphertext; the configured API base URL is authenticated as
additional data and hashes to a distinct file name. AtomicFile writes occur on
a single background executor in app-private no-backup storage. Snapshot size is
bounded to 16 KiB, and storage errors contain no credential or path payload.
The existing no-backup manifest policy remains enabled.

Before React mounts, the current instance's snapshot is restored into the
existing Web session facade, with a five-second native-read budget. An existing
WebView session is migrated without replacing it with an older native snapshot.
Malformed or refresh-expired snapshots are cleared. Native read completion
cannot overwrite a login/logout that happened while it was pending.

Writes are serialized. Refresh rotation waits for persistence; failed persistence
clears an obsolete durable generation and retains only the current WebView
session. There is no plaintext localStorage fallback. Explicit logout and
confirmed refresh rejection clear the encrypted slot through the same facade.
Storage failure can require another sign-in after restart rather than silently
weakening credential storage. Product data, read-cache records and owner-only
content are never added to this slot. The legacy cache cleanup uses another key
alias and does not erase these current session credentials.

Access tokens still expire after 15 minutes and are refreshed automatically.
Refresh is retried after temporary transport failures and checked on foreground,
visibility and reconnect events. A temporary restore outage keeps the credential
available; a definitive 401/403 ends the session. The backend's 60-day sliding
inactivity window and 180-day absolute session-family limit remain authoritative,
as do explicit revocation, replay detection and recent-auth requirements.

Browser/PWA sessions retain their existing tab-scoped sessionStorage behavior.
Real Android process restart, in-place update, logout/relaunch and Keystore
failure acceptance must still be checked on a device; JVM cryptography and Web
bridge tests do not establish those physical outcomes.

## Plan calendar handoff (#1560)

The existing Plan action uses the bounded `PlanCalendar` Capacitor plugin on
Android. It opens the installed calendar editor through Android's documented
[`ACTION_INSERT` / CalendarContract](https://developer.android.com/identity/providers/calendar-provider#intents).
The selected calendar app owns review, saving and cancellation. No calendar
read/write permission, Google account, provider SDK or direct database write is
required. Resolving the bridge means only that the editor opened, never that a
calendar event was saved. An unavailable app, failed launch or older APK receives
a localized recovery state. There is no automatic retry or background export.

`planCalendarEvent` is the common schedule contract for this adapter and the
existing browser RFC 5545 export: all-day dates use UTC-midnight carriers and
an exclusive next-day end; timed schedules preserve exact instants and omit an
unknown end. The native boundary accepts only bounded plain strings, a strict
boolean and finite integral timestamps; it fixes the intent action and URI.
Only the deliberately selected title, description, place label and schedule
leave the app. No credentials, IDs, files, telemetry or calendar data are read.
There is no paid capability, managed cost, quota or Cloud/Self-Hosted difference.

Browser clients retain Web Share when a calendar File is supported and a
resource-owned download otherwise, including recovery after sharing fails.
`PlanCalendarTest` verifies the native intent and hostile-input boundary in the
existing Android API 28/36/37.1 workflow. The bridge registration is checked
alongside other wrapper capabilities. Installed third-party calendar behavior,
physical-device Back/TalkBack and save/cancel acceptance remain separate from
these contract checks and browser/component coverage.
