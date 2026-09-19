# Capacitor Android Staging Wrapper (`eimir.`)

This directory contains the canonical Capacitor Android wrapper project for **eimir.** (Issue `#1044`, parent `#1005`).

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

# Output APK:
# app/build/outputs/apk/debug/app-debug.apk
```

## Deep Linking & OIDC Callback

The Android manifest registers an intent filter for:
```
de.sidebyside.app://recent-authentication/oidc
```
This enables secure OIDC login flows through `@capacitor/browser` and `@capacitor/app`.

## Documentation

For full architectural details, lifecycle handling, troubleshooting, and verification evidence, see [docs/CAPACITOR-ANDROID-FOUNDATION.md](../docs/CAPACITOR-ANDROID-FOUNDATION.md).
