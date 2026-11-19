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
  - `appId`: `'de.eimir.app'` (canonical released app ID)
  - `appName`: `'eimir.'`
  - `webDir`: `'dist'`
  - `android.path`: `'../android'`
  - `android.minWebViewVersion`: `111` (the supported WebView floor; see [Supported WebView and browser floor](#supported-webview-and-browser-floor-1613))
  - `server.androidScheme`: `'https'` (`https://localhost` inside WebView)
  - `server.errorPath`: `'webview-unsupported.html'` (static ES5 notice below the WebView floor or after a failed main-frame load, #1931)
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
  - Demo selection happens in the Web bundle, so `assembleDebug`, `assembleRelease`, and `bundleRelease` of one synchronized bundle behave identically. All variants share the `de.eimir.app` application ID (debug adds `.debug`); a Demo bundle should therefore be distributed as a debug build or through a separate channel rather than through the production release workflow.
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
  - The regular main manifest permanently registers verified HTTPS App Links for `app.eimir.de` (and, until installed builds have moved, the transition host `demo.eimir.ur-cloud.de`, #1835) and the five canonical identity paths: `/auth/signup`, `/auth/magic-link`, `/auth/invitation`, `/auth/verify-email`, and `/auth/recovery`. Android verifies the website's `/.well-known/assetlinks.json` against the installed package and signer. The existing test-channel overlay may repeat the same filter; no arbitrary Self-Hosted domains are claimed. Intake still accepts only the configured API origin, not every URL delivered by Android. OS domain verification and APK distribution are separate boundaries. A Web/backend deployment cannot update a previously bundled APK.
- **Calendar plan links (#1895):**
  - Synced calendar events carry `https://<instance>/p/<short id>`, the plan UUID in unpadded base64url. The same verified App Link filter claims `/p/` for the hosts above, so the link opens the installed app. `usePlanShortLinkAppOpen` reads `appUrlOpen` and `App.getLaunchUrl()`, accepts only HTTPS links of the configured API origin and opens the plan detail; the Web route `/p/:shortId` does the same in a browser. Self-Hosted domains are not claimed, so their calendar links keep opening the browser.
- **OIDC Authentication Flow:**
  - When running in native mode (`isCapacitorNative()`), OIDC login launches via `@capacitor/browser`:
    ```ts
    await Browser.open({ url: authUrl, windowName: '_system' });
    ```
  - Upon backend authentication completion, the identity provider redirects to:
    ```
    de.eimir.app://recent-authentication/oidc?code=...&state=...
    ```
  - The Android app receives this via an `intent-filter` registered in `android/app/src/main/AndroidManifest.xml`.
  - The web application captures the incoming deep link using both:
    1. `@capacitor/app` `appUrlOpen` listener (for warm starts / in-background resume).
    2. `App.getLaunchUrl()` (for cold-boot starts when the activity is created by the intent).
  - The handler verifies matching session `state`, extracts `code`, invokes the backend completion endpoint (`completeRecentAuthentication`), and closes the browser view (`Browser.close()`).
- **Sign-in with an external provider (#58):**
  - The sign-in and settings screens start Google (or another configured provider) with `client: android`; the
    server answers with the connection's `android_redirect_uri` and `nativeAvailable` in the public instance
    status decides whether the app offers it. The authorization page opens in the system browser tab
    (`Browser.open`).
  - The registered callback is the connection's verified HTTPS address `/auth/oidc/<id>`. The manifest claims
    the prefix `/auth/oidc/` on the verified hosts, so Android returns the provider to the app, which reads it
    through the same `appUrlOpen`/launch-URL intake as mailed links. Only the parameters a provider adds
    (`code`, `state`, `error`, `scope`, `authuser`, `prompt`, `iss`, `hd`) are accepted, each once, on the
    configured origin.
  - Setting-up steps for operators: `docs/operations/google-and-passkey-sign-in.md`.
- **Client Capabilities Filter**:
  - `loadRecentAuthenticationCapabilities()` automatically passes `client: RecentAuthenticationClient.android` when running natively.
  - The backend returns only OIDC connections that have an `android_redirect_uri` configured, preventing users from selecting unsupported web-only flows in the Android container.

---

## 4. Native Passkey Boundary

- Direct eimir.-WebAuthn via `navigator.credentials` inside the Android WebView is **not supported** in this foundation slice (it requires Android Credential Manager and Digital Asset Links integration, scheduled for future iterations).
- `loadRecentAuthenticationCapabilities()` explicitly forces `passkey: false` in native container mode, so passkey re-authentication options are not presented in the native UI.
- `authenticateRecentPasskey()` fails closed with an informative error if invoked in native mode.
- Standard Web/PWA passkey authentication remains completely unchanged.
- The bounded native passkey bridge (#630) is the `Passkeys` Capacitor plugin (`PasskeysPlugin.java`): Android Credential Manager with the Play services provider for Android 13 and older. The server's WebAuthn options go to the platform as JSON and its JSON response goes back unchanged, so the Web layer never interprets credential material. The sign-in screen and Settings offer passkeys only after the plugin reports itself available; recent-authentication (account deletion, ServerAdmin) still reports `passkey: false` natively. The relying party must trust the app through Digital Asset Links (`get_login_creds`) and the server must accept the app's `android:apk-key-hash:` origin (`docs/operations/google-and-passkey-sign-in.md`). A real device check is required before the bridge counts as accepted. OIDC needs no bridge.
- Third-party OIDC/Pocket-ID authentication (which runs in the system browser/Custom Tab via `@capacitor/browser`) is decoupled from WebView WebAuthn and functions independently.

---

## 5. Application ID & Namespace Configuration

- **Release Application ID**: `de.eimir.app` (fresh eimir. installation selected by the Product Owner in #565).
- **Debug Application ID**: `de.eimir.app.debug` (ensures parallel installation alongside release builds via `applicationIdSuffix = ".debug"` in `android/app/build.gradle`).
- The former Android package is a separate installation. Log in to the existing server Account; no local credentials are copied and the old app is not uninstalled automatically. Subsequent updates within `de.eimir.app` must preserve its sandbox and signing identity.
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

The wrapper uses Gradle **9.9.1**, AGP **9.4.0**, Capacitor **8.6.2** and
JDK **21**. Gradle 9.8.1 and later contain the fixes for three advisories also repaired
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
AGP 9.4.0 on Capacitor 8.6.2 is therefore a pairing Capacitor does not
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
| Deep link doesn't trigger app | AndroidManifest intent-filter missing scheme/host. | Verify `aapt dump xmltree ... AndroidManifest.xml` contains scheme `de.eimir.app`, host `recent-authentication`, path `/oidc`. |
| API call CORS error in native WebView | `CapacitorHttp` is disabled or not synced. | Verify `plugins.CapacitorHttp.enabled = true` in `capacitor.config.ts` and run `npm run cap:sync`. |
| Chrome DevTools WebView debugging | Inspecting running Capacitor WebView on device/emulator. | Connect device via USB, open `chrome://inspect/#devices`, select `de.eimir.app.debug`. |

---

## 8. Migration History

- `#1044` / PR `#1046` created the Capacitor wrapper as a staging project next to the legacy Kotlin/Compose client; a real-device smoke test on a Pixel accepted it.
- `#1008` Slice B / PR `#1056` moved release, signing, SBOM, and publication workflows to the wrapper.
- `#1009` removed the legacy Kotlin/Jetpack Compose client (screens, ViewModels, native read cache, Kotlin API models, Compose and Robolectric tests) and promoted the wrapper to the canonical `android/` directory. The staging path `capacitor-android/` no longer exists.
- Git history preserves the retired client; it is not a reference implementation. New product behavior is built once, in `web/`.

### Reading older documents

Dated plans, gate reviews, audits, and evidence records written before `#1009` may describe a native Kotlin/Jetpack Compose client, Kotlin Multiplatform, SwiftUI, Room/Keystore read caches, or "Web/Android parity". They are historical records of what was true or planned at the time and are **not** current guidance; ADR 0011 governs. In particular:

  - account-deletion, Space-offboarding, and logout rules that name an Android cache are satisfied by the Web client's session and read-cache clearing inside the WebView. The wrapper keeps no native product-data cache; the encrypted current-session credential slot described below is cleared through that same session facade;
- the retired native read cache (Room database plus Android Keystore key) held only a non-authoritative copy of server data. Because the stable application ID preserves the old sandbox across an in-place update, `LegacyNativeDataCleanup` deletes that database, its Space preference and its Keystore key on wrapper startup without reading or migrating their contents, and stops running once all three removals have succeeded (completion marker). Server data continuity and store-upgrade continuity rest on the backend, `de.eimir.app` and the signing key.

### Acceptance rule

Mobile Web is the normative product reference. React product work reaches the Android app automatically through Capacitor packaging, so ordinary product changes need no Android implementation or Android screenshots. Android-specific acceptance (real device or emulator) is required only for changes to the wrapper itself, the Capacitor configuration, the release build, or a native platform capability.

---

### Native source inventory

| File | Classification | Owner / purpose |
|---|---|---|
| `android/app/src/main/java/de/eimir/app/MainActivity.java` | NATIVE_CAPABILITY_REQUIRED | Capacitor `BridgeActivity` host; starts the one-shot cleanup. No product logic. |
| `android/app/src/main/java/de/eimir/app/PhotoFileChooser.java` | NATIVE_CAPABILITY_REQUIRED | Selected-photo original-file handoff (#1471): optional photo-metadata permission, read-only document grants, original MediaStore access, cancellation and Activity ownership. No independent upload or location-tracking pipeline. |
| `android/app/src/main/java/de/eimir/app/ApproximateLocationPlugin.java`, `ApproximateLocationPolicy.java` | NATIVE_CAPABILITY_REQUIRED | Partner distance (#1792): one approximate position on request under `ACCESS_COARSE_LOCATION`, reusing a recent cached fix first. Network/fused providers only, never GPS. Only after a person's own precise choice (PO 2026-11-17) and with `ACCESS_FINE_LOCATION` actually granted does a single measurement use fused, GPS or network (`PresencePrecision` rounds to about 100 m on the device). |
| `android/app/src/main/java/de/eimir/app/PresenceBackground.java`, `PresencePublishRule.java`, `PresenceLocationReceiver.java`, `PresenceUploadJob.java` | NATIVE_CAPABILITY_REQUIRED | Opt-in background partner location (#1792): passive-provider fixes only, network-bound job uploads with a scoped presence device credential, 6-hour heartbeat without measuring, re-registration after boot/update. No foreground service and no Web-session refresh; cleared on sign-out. |
| `android/app/src/main/java/de/eimir/app/LegacyNativeDataCleanup.java` | NATIVE_CAPABILITY_REQUIRED / TEMPORARY_UPGRADE_MIGRATION | Deletes the retired Kotlin client's Room database, Space preference and Keystore key after an in-place update. One-shot: writes a completion marker after all three removals succeed; retries only while one fails. Temporary: remove in a later cleanup once no installation that predates the wrapper can remain (no issue tracks that yet). |
| `AndroidManifest.xml`, `res/**`, Gradle files | NATIVE_CAPABILITY_REQUIRED | Launcher, OIDC deep link, FileProvider, icons/splash, build and verification metadata. |

## 9. Reuse-Before-Build Assessment

### Approximate location for partner distance (#1792)

**Precise choice (PO 2026-11-17).** The same plugin serves a person's opt-in precise choice. `ACCESS_FINE_LOCATION` is declared next to the coarse permission and requested together with it (`requestPermissions` with the `location` and `preciseLocation` aliases), so Android 12+ shows its Precise/Approximate switch; the app never assumes the grant and continues approximately when the person keeps "approximate". A precise `current` call tries the fused provider, then GPS, then the network provider (12 s each when a fallback remains, 20 s for the last), accepts a cached fix only if it is younger than 3 minutes and reports at most 500 m, and the background passive registration uses a 200 m minimum distance instead of 1 km. Nothing in the background starts a measurement, so the energy contract in [PARTNER-LOCATION.md](m9/PARTNER-LOCATION.md) section 6 still holds. Play's Data safety form and location permission declaration must list precise location with this purpose.

Alternatives considered: the Web Geolocation API inside the WebView, `@capacitor/geolocation`, Google Play services `FusedLocationProviderClient` and the platform `LocationManager` with AndroidX `LocationManagerCompat`.

The small `ApproximateLocation` plugin uses the platform `LocationManager` through `LocationManagerCompat.getCurrentLocation` (already on the classpath through AndroidX Core). It adds no dependency, works without Google Play services (Self-Hosted and de-Googled devices) and lets the app guarantee the energy contract in [PARTNER-LOCATION.md](m9/PARTNER-LOCATION.md) section 6. Only the network and fused providers are used, under the coarse permission. A cached fix younger than the requested maximum age (default 10 minutes) is returned without a new measurement. Otherwise one measurement runs with a 20-second limit. `@capacitor/geolocation` was not chosen because it adds a Google Play services location dependency (with new Gradle verification entries) and offers neither a provider restriction nor a passive mode. The WebView geolocation path would need an additional WebChromeClient permission bridge and cannot express the provider rule.

In the foreground the plugin never listens continuously. The Web client decides when to publish (displacement of at least 1 km, a new consent generation or a 6-hour-old publication) and calls the API itself.

Background updates while the app is closed (Product Owner, 2026-11-13) are opt-in and need "Allow all the time" (`ACCESS_BACKGROUND_LOCATION`, requested separately after the approximate grant). `PresenceBackground` registers the platform **passive** provider with a `PendingIntent` (15 minutes, 1 km). The app therefore receives only positions that other apps or the system already computed and never triggers a measurement itself. `PresenceLocationReceiver` stores the fix and schedules `PresenceUploadJob`, an ordinary network-bound job. A persisted 6-hour heartbeat job reads the last known position without measuring. The receiver re-registers after boot and app update. There is no foreground service, wake lock or exact alarm, and no fallback to active location.

Uploads never use or refresh the Web session. A native refresh would race the Web client's refresh-token rotation. Instead the Web client issues a scoped presence device credential, which can only publish this owner's snapshot. The server binds it to the issuing device session, the consent generation and at most 30 days. It is stored with the last positions in one Keystore-encrypted no-backup file. Any settings change, an inactive share (`active: false`), a 401, sign-out of the instance or disabling deletes it and unregisters the updates. On each app open the Web client rotates the credential or stops background updates when the share ended.

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
| Project Identity Guard | Reused | Verified 0 `MUST_RENAME` findings; `de.eimir.app` protected as historical immutable release identifier. |

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
  - Pinned Actions: Node.js `26.13.1` via `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (`v7.1.0`); JDK `21` Temurin via `actions/setup-java@dd06d9cba3e5552c54d9f8ea23572deb30010f7c`.
  - Pinned Gradle Wrapper: distribution SHA-256 `f20c816177c0ff192881874852260771b462903aef3e794b0dac4759d1fda284`; wrapper JAR SHA-256 `621008afc4f5d59357fcf06ffa644dd5aade5e091bdc363742710445f73cdaf8`.
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

The same plugin keeps one per-login media key (`mediaKey`, `clearMediaKey`):
32 random bytes, wrapped by the same Keystore key under distinct associated
data in a separate no-backup file. The WebView imports it as a non-extractable
Web Crypto key and seals every stored image row with AES-GCM; image bytes never
cross into native storage. `clear` (logout) deletes the media key together with
the session envelope, which makes every sealed row unreadable. The read cache
seals the payload of every row under the same key (`sealJson`), so cached text
and the list outbox are stored as ciphertext as well, and Memory diary drafts
seal their text and the bytes of their photos the same way.

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


## Background renderer reclamation (#1609)

`MainActivity` distinguishes Android's non-crash background renderer reclamation
from real renderer crashes. A healthy resume retains the existing bridge and
WebView. A real `onRenderProcessGone` callback invalidates the Activity's bridge
reference, disposes picker/plugin owners once, detaches and destroys the dead
WebView, and returns handled. No later Activity lifecycle or detach callback
may use that dead bridge.

A non-crash exit after `onStop` permits one complete Activity recreation on the
next foreground return, including a delayed exit callback before a live
`postVisualStateCallback` confirms a foreground frame. Recovery never launches
another Activity while hidden. The attempt bit survives recreation; only a
later confirmed foreground frame followed by another background visit rearms
it. Actual crashes, foreground losses, interrupted native media selections and
repeated losses remain explicit through the existing localized
`RuntimeRecoveryActivity`. No timer, renderer-priority override or automatic
write retry is introduced.

Recreation uses an ordinary launcher intent unless a new intent arrived while
the bridge was absent. It does not replay the consumed original auth/push link
or restore a pending plugin operation. Existing encrypted native session
storage, scoped authored drafts and disposable image-cache contracts remain
unchanged. Volatile unsaved fields/files are not guaranteed to survive renderer
death, and this policy cannot establish the root cause of an unlogged device
crash.

Android's [termination handling guidance](https://developer.android.com/develop/ui/views/layout/webapps/handle-termination)
and Capacitor 8.6.2's existing `BridgeActivity`/`Bridge` lifecycle own the
implementation. No new dependency, service, account, data egress or cost.
`RuntimeRecoveryTest` exercises real non-crash termination through
`WebViewRenderProcess.terminate()` on API 29+, healthy return and real
`chrome://crash` recovery; API 28 retains the supported healthy/crash cases.
The isolated native lane retains screenshots and diagnostics. Pure policy
regressions cover delayed delivery, one-shot fallback, picker interruption and
rearming. Physical Pixel acceptance remains separate from emulator evidence.

Bundled-interface readiness is required before native return screenshots on
modern providers. The stock API 28 image still ships Chromium 69 and cannot
parse the existing product bundle; its pre-existing native adapter/frame/crash
coverage is not bundled Web-product acceptance. It is classified by the
product's WebView floor (below), not treated as a successful UI result.

## Supported WebView and browser floor (#1613)

Product Owner decision of 2026-11-15 ([#1613](https://github.com/baerenmarke90/eimir/issues/1613)):
eimir. sets a minimum supported WebView version. It does not provision a newer
WebView on the stock API 28 emulator image. Google distributes Android System
WebView updates through Google Play, and there is no official checksum-published
standalone package. On real devices with
Google Play, Play keeps the WebView current; devices without Play depend on
their vendor's WebView updates.

| Surface | Supported floor | Where it is set |
| --- | --- | --- |
| Android app (Capacitor WebView) | Android System WebView / Chromium **111** | `android.minWebViewVersion` in `web/capacitor.config.ts` |
| Web / PWA | Chrome and Edge 111, Firefox 114, Safari and iOS 16.4 | `build.target` in `web/vite.config.ts` |
| Android OS | API 26 (`minSdkVersion`) | `android/variables.gradle` |

- **Source of the floor.** The values equal Vite 8's `baseline-widely-available`
  build target. They are pinned in `build.target`, so a toolchain upgrade cannot
  move them silently; pinning produced a byte-identical bundle on 2026-11-15.
  The newest platform features the product relies on stay within this floor:
  for example `color-mix()` (Chromium 111), `:has()`, container queries and
  dynamic viewport units in CSS, and `Intl.Segmenter`, `Object.hasOwn` and
  `Array.prototype.at` in JavaScript. The hand-written `public/` scripts need at
  most Chromium 85. `text-wrap` is progressive enhancement. Raising the floor
  is a product decision: change all three places together.
- **SDK level is not a browser capability.** An API level says nothing about
  the installed WebView. Capacitor's `Bridge.isMinimumWebViewInstalled()`
  compares the actual provider's major version with `android.minWebViewVersion`.
- **Below the floor** ([#1931](https://github.com/baerenmarke90/eimir/issues/1931)).
  Capacitor logs `System WebView is not supported` and loads
  `web/public/webview-unsupported.html` (`server.errorPath`) instead of the app.
  The page reuses the PWA offline page's stylesheet. Its generated ES5 script
  (`npm run i18n:generate`, copy from the `webViewNotice` locale resources)
  compares the WebView's Chromium version with the same floor:
  - Below the floor, it asks for an Android System WebView update, with one
    action that opens the Play Store listing.
  - Otherwise, the page was reached through a failed main-frame load, which
    Capacitor also routes to `errorPath`. It then offers a retry of the app root.

  `webViewFloor.test.ts` keeps the floor identical in `vite.config.ts`,
  `capacitor.config.ts` and the notice, and keeps the notice script free of
  syntax newer than ES5.
- **Native acceptance lanes.** API 36 and 37.1 run with providers above the
  floor and must reach the bundled interface (`RuntimeRecoveryTest` waits for it
  whenever `isMinimumWebViewInstalled()` is true). The stock API 28 image
  (Chromium 69) is the explicit native-only legacy lane. It keeps its native
  adapter, launcher, frame, real crash/recovery, picker, privacy, signing and
  source checks, and it is not counted as Web-product acceptance. There
  `RuntimeRecoveryTest` requires the painted update notice instead and captures
  `webview-update-notice.png`. If the
  configured floor were missing, the API 28 lane would have to show the bundled
  interface and fail, so the classification cannot pass silently.

## Screen protection for private surfaces (#683)

The retired Compose client protected owner-only routes with `FLAG_SECURE` (#683). The Capacitor app restores that policy: while a private surface is open, Android blocks screenshots and screen recordings and shows a blank Recents preview. Browsers have no such control, and a second camera can always photograph the screen, so product copy never claims that copies are impossible.

**Mechanism.** `SecureScreenPlugin.java` sets or clears `FLAG_SECURE` on the Activity window on the UI thread and reports the window's actual state. `web/src/client/secureScreen.ts` counts holds, orders requests and keeps the flag across a navigation from one private surface to the next. `useSecureScreen` and `SecureSurface` (`web/src/components/SecureSurface.tsx`) hold the flag while mounted and keep private content unpainted (`visibility: hidden`) until the window confirms it, so no frame of private content can be captured. When protection is not confirmed the content stays unpainted and a whole surface says so (fail closed). Opening a once message waits for confirmation before it uses the message up and never opens it without protection. A recreated Activity starts without the flag; the reloaded Web layer asks again before private content renders. Visibility is decided by the runtime platform, never by the viewport.

**Protected surfaces.** Each surface that can render `OWNER_ONLY` content (`ContentVisibility.PRIVATE`, `ProfileVisibility.PRIVATE_PARTNER_NOTE`, Private Area records, once messages, private search results):

| Surface | Scope |
| --- | --- |
| Once messages (`/today/only-you`, compose, read) | whole route |
| Search | whole route |
| Private Area (`/more/private/*`), including private partner notes | whole route |
| Profile (private partner notes) | whole route |
| Heart Moment create and edit | whole route |
| Heart Moment detail | while the moment is not shared |
| Story timeline (`StoryList`) | while it contains an own private Heart Moment; only those cards wait for confirmation |
| Photos overview | while the private filter is selected |
| Important dates (`ImportantDatesPanel`) | while it contains a private date or its editor is open |
| Our Story landmarks (`RelationshipPassport`) | while an own private date is listed |
| Recap private draft and reflection editor | while shown |

Shared-only surfaces (Today, Discover, recaps, map, activity, notifications, People) stay capturable; their APIs return `SPACE_SHARED` content only, and related people are shared by database constraint (`people_are_shared`). A new surface that renders owner-only content must use `SecureSurface` or `useSecureScreen` in its first implementation.

**Reuse review.** `@capacitor-community/privacy-screen` 8.0.0 (MIT, maintained, Capacitor 8) offers a global enable/disable switch. It was not selected: it adds a Gradle module with new dependency-verification entries, enables protection globally by default, and has no hold count or confirmed state, so the fail-closed ordering would still need the same Web layer. The in-house plugin is 50 lines on platform API only, follows the other in-house plugins in `MainActivity`, and needs no new dependency. Fallback: without the plugin a hold rejects and private content stays unpainted.

**Verification.** `SecureWindowFlagsTest` (JVM) and `SecureScreenTest` (instrumentation through the real Capacitor bridge, including Activity recreation) run in CI; Web unit tests cover hold ordering, the unpainted gate and the once-message order. A device check on a Pixel (screenshot blocked, blank Recents preview) is still open.
