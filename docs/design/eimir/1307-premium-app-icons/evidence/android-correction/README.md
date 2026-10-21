# Android launcher correction evidence — 2026-10-19

The existing generated catalog reference and Mobile Interaction Contract remain
the composition authority. The implementation changes the Android launcher,
not the catalog layout. See [the native contract](../../ANDROID.md).

## Automated product checks

- Full Web suite: 1,883 passed, one pre-existing skipped case.
- Seven real-App browser journeys passed, including server save -> native
  failure -> local retry without a second preference write, preview isolation,
  expiry retention/free reset, pending protection, conflict and return/focus.
- Native feedback checked at 320/360/390/430/1280 px, Light/Dark, reduced motion,
  200% text and axe. Native calls alone are replaced in the browser journey.
- Android debug/test builds, lint and native unit tests passed with JDK 21,
  Gradle 8.14.6 and strict dependency verification. The same-version Gradle binary
  used locally was verified against its official SHA-256.
- APK identity is checked from the compiled manifest, including all eleven
  aliases and the unique default. `aapt dump badging` omits activity aliases;
  the release gate now validates the actual packaged manifest with apkanalyzer.
  The preserved default identity remains `de.eimir.app.MainActivity`.

## Actual Android launcher and upgrade proof

Device: isolated Android 16 / API 36 ARM64 emulator, official AOSP image and
Launcher3. This is an actual Android launcher, not a browser simulation.

Three Android instrumentation tests passed:

1. Every choice has exactly one enabled launcher and keeps OIDC entry reachable.
2. An invalid choice cannot remove the working launcher.
3. The selected alias starts the permanent shell with the real AppIcon and
   NativeSessionStorage plugins registered.

[Raw instrumentation output](native/instrumentation-api36.txt).

Upgrade exercise used debug-signed builds of the delivered test.5 source
`918fbe57` (version code 5) and corrected source `81eb5f64` (version code 6):

1. Install the old source, create an app-private sentinel and drag its ordinary
   application icon from the drawer onto the home screen.
2. Install the correction using an in-place APK update. The sentinel survives,
   the same home-screen position remains, and the old component starts the new
   permanent shell.
3. Invoke the actual Capacitor native bridge with `iconId: sage`; Android
   acknowledges `{iconId: sage}`, resolves the Sage alias, and updates the
   existing home-screen icon in its existing position.
4. Force-stop the test app, tap the changed home-screen icon and verify a new
   shell instance starts. The sentinel is still readable.
5. Apply `original` through the actual bridge and verify the Original component
   becomes the launcher again. No uninstall, data deletion or synthetic
   product-side restart is involved.

| Before update | Updated Original | Selected Sage |
| --- | --- | --- |
| [test.5 home screen](native/test5-home.png) | [preserved position](native/updated-original-home.png) | [actual changed home-screen icon](native/selected-sage-home.png) |

APK SHA-256 identities for this local upgrade test:

- Old debug build: `f7a96c8af2c9978217d41600c8d575d07455ddd99e4bcc9c620585a3b4cd2334`.
- Corrected debug build: `cd3483eb21aba270ccaf18aa7f5f8225cb49829ffef60f6eda309c8aad60b196`.

The source application has the historical red-ring Android artwork. The update
also brings the approved Original poster artwork to the packaged launcher.

## Test-channel integration and limits

`codex/android-test-homescreen-icons` merges the correction with the existing
test channel and current main changes, retaining the updater, encrypted session
adapter and email-entry flow. Sideload App Links target the permanent shell.
The unsigned validation-only test.6 build passed and contains AppIcon,
AppUpdates and NativeSessionStorage implementations. Its SHA-256 is
`3657e970febd47c7ef32ef1ca376522747857a4f410b9bb74131c19ea15a45ca`.

This unsigned artifact is not an installation candidate and cannot be published
by the existing release helper. Delivery still requires the durable test-channel
signer and a higher-version signed release. The debug upgrade test does not
claim public signer continuity, a real account login, or physical-device/OEM
launcher acceptance. Android 28/36 hosted instrumentation runs provide the
additional legacy/atomic switching regression gate; their live results are on
PR #1372.
