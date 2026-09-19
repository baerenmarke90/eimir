# Canonical Capacitor Android Foundation (`#1044`)

This document describes the canonical Capacitor Android wrapper foundation established for **eimir.** under Issue `#1044` (as part of parent `#1005` and aligned with Slice A / Slice B boundaries in `#1008`).

---

## 1. Integration Architecture & Asset Pipeline

The Android client packages the local Vite production bundle directly into the application container without relying on a remote web server URL (`server.url` is omitted from `capacitor.config.ts`).

### Asset Pipeline Flow
```
web/ (Vite + TypeScript)
  ├── npm run cap:build:web (vite build)
  │     └── generates production bundle in web/dist/
  └── npm run cap:sync (or cap:copy)
        └── copies web/dist/ -> capacitor-android/app/src/main/assets/public/
              └── Gradle compiles assets into app-debug.apk / app-release.apk
```

### Key Configuration
- **Capacitor Configuration**: `web/capacitor.config.ts`
  - `appId`: `'de.sidebyside.app'` (canonical released app ID)
  - `appName`: `'eimir.'`
  - `webDir`: `'dist'`
  - `android.path`: `'../capacitor-android'`
  - `server.androidScheme`: `'https'` (`https://localhost` inside WebView)
  - `plugins.CapacitorHttp.enabled`: `true` (native cross-origin HTTP bridge)
- **API Base Requirement (Fail-Closed)**:
  - In native mode (`Capacitor.isNativePlatform()`), the app **strictly requires** a non-empty `VITE_EIMIR_API_BASE_URL` pointing to a valid remote server (HTTP/HTTPS).
  - Falling back to `window.location.origin` inside the native container would incorrectly target `https://localhost` (the internal WebView origin), resulting in broken network calls.
  - The build script `web/scripts/build-capacitor-web.mjs` enforces `VITE_EIMIR_API_BASE_URL` at build time.
  - Runtime resolution (`web/src/client/config.ts`) throws a fail-closed descriptive error if `VITE_EIMIR_API_BASE_URL` is missing or resolves to localhost/127.0.0.1 in native mode.
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
  - If at root or history is exhausted, invokes `App.exitApp()`.
- **App Resume (`App.addListener('appStateChange', ...)`):**
  - Listens for `isActive === true`.
  - Dispatches `window.dispatchEvent(new Event('focus'))`, which naturally triggers TanStack Query's window focus refetching mechanism (`refetchOnWindowFocus`) across active query caches.

---

## 3. External Link & OIDC Callback Handling

- **External Links:**
  - Standard Capacitor WebView behavior is preserved without invasive global click-handler DOM interception.
  - In-app navigation uses existing React router / window history.
- **OIDC Authentication Flow:**
  - When running in native mode (`isCapacitorNative()`), OIDC login launches via `@capacitor/browser`:
    ```ts
    await Browser.open({ url: authUrl, windowName: '_system' });
    ```
  - Upon backend authentication completion, the identity provider redirects to:
    ```
    de.sidebyside.app://recent-authentication/oidc?code=...&state=...
    ```
  - The Android app receives this via an `intent-filter` registered in `capacitor-android/app/src/main/AndroidManifest.xml`.
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
- Third-party OIDC/Pocket-ID authentication (which runs in the system browser/Custom Tab via `@capacitor/browser`) is decoupled from WebView WebAuthn and functions independently.

---

## 5. Application ID & Namespace Configuration

- **Release Application ID**: `de.sidebyside.app` (immutable historical identifier required for existing releases and keystores).
- **Debug Application ID**: `de.sidebyside.app.debug` (ensures parallel installation alongside release builds via `applicationIdSuffix = ".debug"` in `capacitor-android/app/build.gradle`).
- **Android Package / Namespace**: `de.eimir.app` (modern namespace used for generated R classes and `MainActivity.java` at `capacitor-android/app/src/main/java/de/eimir/app/MainActivity.java`).
- **SDK Compatibility**:
  - `minSdkVersion = 26` (Android 8.0 Oreo, preserved from legacy requirements; not lowered to 24).
  - `compileSdkVersion = 36`, `targetSdkVersion = 36`.
- **Branding Assets**:
  - Adaptive icons (`mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml`) use eimir. brand red background (`#D93D59`) with the canonical double-ring vector (`drawable/ic_launcher_foreground.xml`) and Android 13+ themed monochrome vector (`drawable/ic_launcher_monochrome.xml`).
  - Splash drawables use eimir. launch background (`#FAF7F5`) with centered eimir. icon.

---

## 6. Build, Test, and Verification Commands

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

# Sync web bundle, plugins, and config to capacitor-android
npm run cap:sync
```

### Android Native Wrapper
```bash
cd capacitor-android

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

## 8. Migration Path & Distinction from `android/` Client

- **Slice Separation**:
  - `capacitor-android/`: The new canonical staging wrapper for modern cross-platform delivery under `#1044` / `#1005`.
  - `android/`: The legacy Kotlin Jetpack Compose mobile client.
- **Independence**:
  - As defined in `#1008` and `#1044`, `android/` was left completely untouched during this phase.
  - Deprecation and cleanup of legacy `android/` code will be executed exclusively under Issue `#1009`.

---

## 9. Reuse-Before-Build Assessment

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

## 11. Post-Foundation Release Migration — #1008 Slice B

Issue `#1008` (Slice B) migrated all release, signing, SBOM attestation, and publication workflows from the legacy Kotlin/Compose client under `android/` to the Capacitor Android wrapper under `capacitor-android/`:

- **Workflows Migrated**:
  - `.github/workflows/release-evidence.yml`: builds unsigned release APK/AAB from `capacitor-android/`, generates SPDX 2.3 SBOMs, and records release evidence.
  - `.github/workflows/release-candidate.yml`: validates release inputs (`android_api_base_url`, `release_version`), forwards them to `release-evidence.yml`, and binds the immutable release candidate manifest.
  - `.github/workflows/release-publish.yml`: verifies release preflight, builds and cryptographically signs release APK/AAB from `capacitor-android/`, re-attests signed bytes, and binds release publications.
- **Tooling & Build Steps**:
  - Pinned Actions: Node.js `22.19.0` via `actions/setup-node@1d0ff469b7ec7b3cb9d8673fde0c81c44821de2a` (`v4.2.0`); JDK `21` Temurin via `actions/setup-java@dd06d9cba3e5552c54d9f8ea23572deb30010f7c`.
  - Pinned Gradle Wrapper: distribution SHA-256 `ed1a8d686605fd7c23bdf62c7fc7add1c5b23b2bbc3721e661934ef4a4911d7c`; wrapper JAR SHA-256 `7d3a4ac4de1c32b59bc6a4eb8ecb8e612ccd0cf1ae1e99f66902da64df296172`.
  - Web Bundle & Native Plugin Graph: built via `VITE_EIMIR_API_BASE_URL="$ANDROID_API_BASE_URL" npm run cap:build:web` followed by `npm run cap:sync`.
  - Native Wrapper Drift Guard: `git diff --exit-code -- capacitor-android/capacitor.settings.gradle capacitor-android/app/capacitor.build.gradle` confirms no uncommitted native file drift occurs during CI.
  - Strict Dependency Verification: `capacitor-android/gradle/verification-metadata.xml` generated with sha256 checksums, verified via `--dependency-verification strict`.
  - Release Signing Configuration: `capacitor-android/app/build.gradle` reads properties and environment variables (`eimirReleaseKeystore`, `eimirReleaseKeystorePassword`, `eimirReleaseKeyAlias`, `eimirReleaseKeyPassword` with temporary backward compatibility fallbacks for `sbs*`).
  - Identity Extraction: release identity is directly extracted from built APK artifacts via `aapt dump badging` rather than parsing legacy Gradle files.
  - Legacy Isolation: legacy `android/` code is completely untouched and decoupled from release pipelines; removal will take place in Issue `#1009`.

