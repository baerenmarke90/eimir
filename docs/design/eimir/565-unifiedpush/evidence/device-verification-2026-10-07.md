# UnifiedPush device verification: 2026-10-07

Implementation: `25ef10349877a6d3333835f4bcc461855332a412`, PR #1271.
Baseline main: `4aa0806523a55dfafbee94d4479c6ffe06825303`.
This report supersedes the previous claim that the post-fix implementation had
not been tested. It does not declare the draft PR ready to merge.

## Build and test identity

The installed QA debug APK used the same implementation with only an isolated
`.debug.qa` application suffix and an HTTP exception for `localhost`. The API
and worker used a dedicated PostgreSQL container and port 8100. Neither change
was committed. Both were removed before the regular packaging checks.

- QA APK SHA-256: `67724e2f13fbf4e2c8d0542555519727907c77b492662bb3036541bb39c69c6b`.
- Pixel 10 Pro Fold, Android 16, folded physical display: 1080 × 2364.
- Actual WebView viewport: 443 × 970 CSS pixels. These are not 390px captures.
- ntfy: existing installation and existing server configuration.
- Sunup 1.3.3: newly installed from F-Droid for this test, then removed during cleanup.
- Accounts and relationship content are isolated fictional QA fixtures.

The implementation required one additional TypeScript fix: narrow the nullable
configuration result before accessing its VAPID key. Regression tests were
expanded without loosening existing assertions or timeouts.

| Check | Result |
| --- | --- |
| UnifiedPush hook and Notification Settings panel | 32 tests passed |
| Complete Web suite | 1387 passed, 1 existing skip, no failures |
| TypeScript, lint and format | Passed; existing lint warnings remain |
| Tokens, PWA and Capacitor foundation | Passed; Capacitor checked after QA configuration removal |
| Web bundle and Capacitor sync | Passed |
| Regular Android debug and unsigned release | Both passed with JDK 21 and strict dependency verification |
| Documentation and engineering language audits | Passed |

The complete suite used `vitest run --maxWorkers=2 --minWorkers=1` after the
initial unconstrained run timed out while a concurrent Android build was also
running. The test assertions and timeout settings were unchanged.

Regular package IDs were checked in the built artifacts: debug
`de.sidebyside.app.debug`, release `de.sidebyside.app`. Neither was installed
on the personal device. Their SHA-256 values are:

- Debug: `4524fb3c27ed523ed3ba3dc9960350be89f4fe1623b874603b377c1a00f77ac2`.
- Unsigned release: `798007bc929d6094eb167db2627b6e07bc2603543f8a8ed4a5bdec388e839ce8`.

## Executed device acceptance

App setup sometimes used direct QA route navigation and fixture login through
the WebView debugger. The actual permission dialog, system notification
settings, activation, disable, logout and notification taps were exercised
with Android touch input. Read-only WebView state, the QA database and Android
notification records were checked independently of the screenshots. Assertions
waited for the corresponding state to finish before recording a result.

| Case | Observed result |
| --- | --- |
| ntfy registration and re-enable | Device active; authenticated server endpoint registered |
| Android permission denial before registration | Blocked copy, only the system-settings action, no meaningless disable |
| Existing registration with app notifications blocked | Blocked copy, settings action and legitimate disable; permission status false |
| Open notification settings and return | Correct Android app-notification page; resume reflects the permission change without another automatic prompt |
| Foreground encrypted wake | QA delivery succeeded and notification data refreshed; no Android notification |
| Background encrypted wake | QA delivery succeeded and one neutral Android notification appeared |
| Repeated background wakes | One record with notification ID 1; no stack of notifications |
| Notification content | App title and generic message only; PRIVATE visibility; no names or relationship content |
| Tap while app running | Authenticated `/more/notifications` route |
| Process terminated, then encrypted wake | Process absence checked before delivery; receiver restarted and the neutral notification appeared |
| Cold notification tap | Sign-in first, then authenticated inbox; existing session-loss behavior remains |
| Disable | Native receipt off and the current Account's server endpoint inactive |
| Logout with a visible notification | Native receipt off, server endpoint inactive before token/session cleanup, Android notification removed |
| Cold-start login to a different Account | Old native instance disabled; old notification count changed from one to zero after startup settled |
| Second Account delivery | Alex received a wake triggered by the Lea fixture |
| Server rejects distributor origin | Actual QA API returned 422; native receipt stopped; no pointless retry/disable action |
| Installation without Push transport | Actual QA configuration returned 503; unavailable-installation copy and no enable action |
| Configuration request cannot be checked | Fault injected only into the QA WebView's configuration fetch; transient-status copy with retry, distinct from 503 |
| Retry after request recovery | Fault removed; real API registration succeeded and device became active |

The status-request fault injection did not change repository code or device
network settings. It simulated a rejected fetch of
`/api/v1/push-endpoints/unifiedpush-configuration`; it is not evidence of a
whole-device network outage. A later attempt to control the QA WebView while
another phone app was foreground did not complete and adds no acceptance claim.

## Physical captures

All PNGs below are unedited Android screen captures of the installed QA build.
They supplement, rather than replace, the earlier component renderings and
[design preflight](../../../../product/design/references/565/unifiedpush-device-preflight.md).

| State | Capture |
| --- | --- |
| Off | [Compact Light](pixel-compact-off-2026-10-07.png) |
| Active | [Compact Light](pixel-compact-on-2026-10-07.png) |
| Existing registration blocked | [Compact Light](pixel-compact-blocked-2026-10-07.png) |
| Android permission prompt | [System dialog](pixel-permission-prompt-2026-10-07.png) |
| Permission denied without registration | [Compact Light](pixel-compact-denied-2026-10-07.png) |
| Rejected distributor origin | [Compact Light](pixel-compact-rejected-2026-10-07.png) |
| Unconfigured transport | [Compact Light](pixel-compact-unavailable-2026-10-07.png) |
| Transient configuration request failure | [Compact Light](pixel-compact-unreachable-2026-10-07.png) |

## CI and remaining acceptance

At the implementation SHA, Release Evidence, Web Browser QA, CodeQL, Product
Design Review, Reuse Review, Self-Hosted Recovery and Deployment Guard passed.
Two workflows remain red for dependency audits, before their later test/build
steps execute:

- [Web S8, run 37597810100](https://github.com/baerenmarke90/eimir/actions/runs/37597810100):
  7 audit findings, including source-map-js and tinypool; the existing dependency
  upgrade PR #132 is a separate follow-up. The audit was not bypassed.
- [CI, run 37597810117](https://github.com/baerenmarke90/eimir/actions/runs/37597810117):
  Supply Chain reports Mako 1.4.1 and PyJWT 2.13.0, with 28 advisory entries.
- [Release Evidence, run 37597810089](https://github.com/baerenmarke90/eimir/actions/runs/37597810089)
  passes after the nullable-configuration fix.
- [Web Browser QA, run 37597810066](https://github.com/baerenmarke90/eimir/actions/runs/37597810066)
  passes; this does not replace native acceptance.

Sunup registration was attempted, but its connection to
`push.services.mozilla.com` resolved to `0.0.0.0` on the device and failed before
an endpoint was obtained. There is no successful second-distributor claim.
The device's DNS/filter configuration was not changed.

Physical unfolded-display, Dark and Android system-font scaling acceptance
remain open. Existing component evidence covers Dark, Expanded and 320px at
200% root text size; it is explicitly not native device evidence. The personal
phone's theme and font settings were not changed.

Cold start still requires signing in again because the current main session
lifecycle does not persist the session across app-process termination. This
PR's pending inbox route is retained until authentication succeeds.

Keep PR #1271 as draft until the dependency gates and remaining device
acceptance are resolved. PR #1275 has the same Web dependency-audit blocker;
its physical Demo checks recorded on 2026-10-06 were not repeated with this
Push QA APK. Public Demo backend reset configuration is still unverified.

## Cleanup

All remaining server registrations in the isolated QA database were revoked
through their owning authenticated QA Accounts before teardown. The separate
`.debug.qa` app and the newly installed Sunup app were uninstalled. The QA API,
worker, PostgreSQL container and its unreferenced anonymous volume were removed;
port 8100 is no longer served. Only the QA reverse on 8100 and debugger forward
on 9333 were removed. The existing ntfy installation was retained.

The temporary Android build changes were restored and the wrapper foundation
check passed with the regular package IDs. The personal
`de.sidebyside.app.debug` APK was independently pulled before and after QA;
its SHA-256 is unchanged:
`11e233d2d5113c1726812ddf97af2154c8b75353e6b3fa2a800b861a1e7af454`.
The existing Self-Hosted API on port 8000 remains healthy (HTTP 200). Its data,
configuration and containers were not changed. Private QA artifacts and the
personal APK backup remain in the local scratchpad; none of those APKs,
credentials, endpoints or keys are committed.
