# Android test updater implementation evidence

Date: 2026-10-17. Owner: #1331. The generated whole-screen preflight was committed
in `7756c805230e02f58421c023ce30e62d2f0def6e`, before runtime implementation.
It and the unchanged Settings baseline are retained in the parent directory.

## Shared UI

Real React `AppShell` → `SettingsPage` consumers, with a synthetic native adapter
and synthetic profile metadata. No real accounts, backend, download or Android
installer were used in these browser captures. The optional adapter seam is only
for deterministic UI tests; normal availability is compile-time/native-gated.

The screen reuses the R5 Settings utility category, PageHeader, named Back,
ordinary buttons, semantic tokens and German i18n. Installed version and status
lead, release notes/build details are disclosed on demand, and one action follows
the actual phase. This technical maintenance surface deliberately avoids romantic
microcopy, celebration and account/server configuration. The existing shell and
all other Settings categories remain available. No new motion is required beyond
existing feedback; reduced motion retains every state.

| Evidence | State and scope |
| --- | --- |
| [390 light](available-390-light.png) | Offered update and deliberate Download |
| [360 dark](available-360-dark.png) | Compact, long notes collapsed |
| [430 light](available-430-light.png) | Wide Compact, long notes collapsed |
| [1280 dark](available-1280-dark.png) | Same bounded utility composition on Expanded |
| [320 light, 200% text](available-320-light-large.png) | Reflow without horizontal overflow; actions remain in normal flow |
| [Permission](permission-390-light.png) | Explicit second Install action; resume never auto-installs |
| [Unavailable](error-390-light.png) | Inline localized Retry; no false current-version claim |

Browser results: six updater scenarios plus four existing registration/onboarding
entry scenarios passed in Chromium 151.0.7922.34 (Playwright 1.62.1 headless shell).
Updater coverage: Settings → check → download → cancel/retry → ready → permission
→ explicit install → Back; service error/retry; Light/Dark; 320/360/390/430/1280;
200% text; reduced motion; no horizontal overflow; scoped axe WCAG 2 A/AA + 2.1 AA.
Native events are mocked; these results do not prove installer handoff or A → B.

## Automated/native evidence

- Full shared-Web suite: 1,689 passed, one existing skipped test, including
  #1330 from main `cacc2522d2ab81db3d2b60fffbcce7909e587172`. Typecheck, lint (existing warnings only),
  format, token/PWA checks and Capacitor foundation passed.
- Native sideload JVM suite: 11 passed, covering the real JSON catalog parser,
  completed-marker requirement, package/metadata validation, URL policy, signer
  equality, integrity and highest-compatible-version selection.
- Producer Python suite: four passed, covering inherited Demo configuration,
  clean regular build identity, actual APK badging and upgrade monotonicity.
- Strict Gradle `testSideloadUnitTest`, `lintSideload`, `assembleSideload` and
  `assembleRelease` succeeded with Java 21 / SDK 36 / AGP 8.13.0 / Gradle 8.14.6.
  Android lint: zero errors; 19 pre-existing icon/manifest/resource warnings.
- Actual normal release APK was inspected for absence of update classes and
  `REQUEST_INSTALL_PACKAGES`; the sideload APK includes both. Native code lives
  exclusively in the sideload source set; no new runtime dependency was added.

The signed build's embedded identity and packaged manifest provide its exact
source revision, version, target origin and mode flags. Do not infer a signed
artifact identity from these synthetic screenshot version labels.

Initial signed APK: `0.2.0-test.1`, Android version code 1, 7,414,411 bytes,
source `2ef6745a9f544f2ae9a0eab258d27be64a3cc951`.
[Artifact identity, SHA-256 and exclusion inspection](signed-build.json).
The packaging helper successfully verified its actual APK signature against the
retained test certificate. The APK and release-asset bundle are delivered
privately, not committed or published as a GitHub Release. Later changes in this
PR move fixture text into its locale owner and record this evidence; they do not
change the APK runtime sources.

## Acceptance boundary

Persistent backend provisioning, public feed publication and real Android A → B
installation/data continuity remain open, as detailed in the
[runbook](../../../../../ANDROID-TEST-UPDATES.md). The draft PR must not present
these as completed. No merge or release approval is implied by local checks.

**No business/freemium impact:** client maintenance stays Free/Core. There is no
entitlement, couple ownership, storage/quota, downgrade, domain-data or
Cloud/Self-Hosted capability change. Public GitHub requests contain distribution
metadata only; product credentials/content never cross that boundary.
