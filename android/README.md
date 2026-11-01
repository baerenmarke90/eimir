# Capacitor Android Wrapper (`eimir.`)

This directory contains the canonical (and only) Android Gradle project for **eimir.**: a Capacitor wrapper around the React/Vite Web product in `web/` (Issues `#1044`, `#1008`, `#1009`; ADR 0011). It holds no product UI code; native code is limited to bounded platform capabilities.

## Overview

- **Application ID (Release)**: `de.eimir.app`
- **Application ID (Debug)**: `de.eimir.app.debug` (`applicationIdSuffix ".debug"`)
- **Package / Namespace**: `de.eimir.app`
- **Shell Activity**: `de.eimir.app.LauncherActivity` (inherits the existing bridge lifecycle)
- **Original launcher alias**: `de.eimir.app.MainActivity` (preserved for existing installs)
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

## Fresh Android identity

The `de.eimir.app` application uses a separate sandbox and requires a fresh
installation and login. It neither imports credentials from nor deletes data
belonging to a former Android installation. The obsolete native
legacy-sandbox cleanup is no longer part of startup. Existing installations
remain separate and untouched.

## Deep Linking & OIDC Callback

The Android manifest registers an intent filter for:
```
de.eimir.app://recent-authentication/oidc
```
This enables secure OIDC login flows through `@capacitor/browser` and `@capacitor/app`.

## Documentation

For full architectural details, lifecycle handling, troubleshooting, and verification evidence, see [docs/CAPACITOR-ANDROID-FOUNDATION.md](../docs/CAPACITOR-ANDROID-FOUNDATION.md).

## Native Push transports

`EimirPush` owns one Account/API/provider activation. UnifiedPush uses the
activation UUID as its connector instance. Direct FCM uses the official
Firebase Messaging SDK in FID mode; its endpoint contains the installation ID
and an opaque activation UUID. Incoming messages contain no product text or
navigation target. Both services use the same private generic notification and
an activation-bound launcher entry.

Native status exposes the compiled Android package and nullable configured
Firebase project ID. The Web owner matches both against server configuration
before choosing direct FCM; this metadata check does not obtain an installation ID.

Firebase auto-init is disabled. Explicit FCM retirement first invalidates local
receipt, then serially unregisters Messaging and requests Firebase installation
deletion. A failed deletion remains pending and resumes at the next app start,
after any stale FCM ownership is durably removed, before another activation. This
requests deletion; Google documents up to 180 days for removal from live and
backup systems. No synchronous erasure guarantee is made:
https://firebase.google.com/docs/projects/manage-installations#delete_a_firebase_installation

A local `app/google-services.json`, when supplied, must match the compiled
application ID and configured Firebase project. It is ignored build input and
must contain no server credentials. The normal debug suffix requires its own
matching Firebase registration/config; an unconfigured build retains
UnifiedPush support. Firebase Messaging is the only adopted Firebase product;
adding another product requires reassessing installation deletion ownership.
