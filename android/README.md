# Capacitor Android Wrapper (`eimir.`)

This directory contains the canonical (and only) Android Gradle project for **eimir.**: a Capacitor wrapper around the React/Vite Web product in `web/` (Issues `#1044`, `#1008`, `#1009`; ADR 0011). It holds no product UI code; native code is limited to bounded platform capabilities.

## Overview

- **Application ID (Release)**: `de.sidebyside.app`
- **Application ID (Debug)**: `de.sidebyside.app.debug` (`applicationIdSuffix ".debug"`)
- **Package / Namespace**: `de.eimir.app`
- **Main Activity**: `de.eimir.app.MainActivity`
- **SDK Target**: `minSdkVersion = 26`, `compileSdkVersion = 36`, `targetSdkVersion = 36`

## Asset Synchronization

Web assets are built from the `web/` package and synchronized into `app/src/main/assets/public/` using Capacitor CLI:

```bash
cd ../web

# 1. Build web production bundle with explicit API base URL:
VITE_EIMIR_API_BASE_URL="https://api.eimir.example.com" npm run cap:build:web

# 2. Sync web bundle and plugins into this Android project:
npm run cap:sync
```

> **Note**: `app/src/main/assets/public` is intentionally ignored by git and populated automatically via `cap:sync` / `cap:copy`.

## Building the Android Application

Requires **Java 21** and Android SDK installed (e.g. at `$ANDROID_HOME` or configured in `local.properties`).

```bash
# Build Debug APK:
./gradlew assembleDebug

# Build Unsigned Release Artifacts (APK + AAB) with strict dependency verification:
./gradlew --dependency-verification strict \
  -PeimirVersionCode=1 \
  -PeimirVersionName="0.1.0" \
  :app:assembleRelease :app:bundleRelease

# Build Signed Release Artifacts:
EIMIR_RELEASE_KEYSTORE="/path/to/keystore.jks" \
EIMIR_RELEASE_KEYSTORE_PASSWORD="password" \
EIMIR_RELEASE_KEY_ALIAS="key-alias" \
EIMIR_RELEASE_KEY_PASSWORD="key-password" \
./gradlew --dependency-verification strict \
  -PeimirVersionCode=1 \
  -PeimirVersionName="0.1.0" \
  :app:assembleRelease :app:bundleRelease
```

### Release Properties & Signing Configuration

`app/build.gradle` evaluates:
- `eimirVersionCode` (Gradle property, fallback `sbsVersionCode`, default `1`)
- `eimirVersionName` (Gradle property, default `"0.1.0"`)
- Keystore file: `eimirReleaseKeystore` property or `EIMIR_RELEASE_KEYSTORE` env var (fallback `sbsReleaseKeystore` / `SBS_RELEASE_KEYSTORE`)
- Keystore password: `eimirReleaseKeystorePassword` property or `EIMIR_RELEASE_KEYSTORE_PASSWORD` env var (fallback `sbsReleaseKeystorePassword` / `SBS_RELEASE_KEYSTORE_PASSWORD`)
- Key alias: `eimirReleaseKeyAlias` property or `EIMIR_RELEASE_KEY_ALIAS` env var (fallback `sbsReleaseKeyAlias` / `SBS_RELEASE_KEY_ALIAS`)
- Key password: `eimirReleaseKeyPassword` property or `EIMIR_RELEASE_KEY_PASSWORD` env var (fallback `sbsReleaseKeyPassword` / `SBS_RELEASE_KEY_PASSWORD`)

Supply-chain dependencies are strictly verified against `gradle/verification-metadata.xml`.

## Legacy Native Storage Cleanup

The retired Kotlin/Compose client persisted a Room read cache and a remembered
Space preference inside the same Android application sandbox. Because
`de.sidebyside.app` is intentionally preserved for store-update continuity,
Android also preserves that sandbox during an in-place upgrade.

`LegacyNativeDataCleanup` therefore runs from `MainActivity` on every start.
It only deletes the retired database, its journal/WAL sidecars, the old Space
preference and the former owner-only cache Keystore entry. It never reads or
migrates cached product content. Failed cleanup is retried on the next start.
This bounded migration code is not a product-data store or a second client.

## Deep Linking & OIDC Callback

The Android manifest registers an intent filter for:
```
de.sidebyside.app://recent-authentication/oidc
```
This enables secure OIDC login flows through `@capacitor/browser` and `@capacitor/app`.

## Documentation

For full architectural details, lifecycle handling, troubleshooting, and verification evidence, see [docs/CAPACITOR-ANDROID-FOUNDATION.md](../docs/CAPACITOR-ANDROID-FOUNDATION.md).
