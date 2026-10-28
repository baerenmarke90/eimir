# #1470 — app continuity evidence

Baseline: `main` `624458354c651b39c19f97a82f04eda1a93a5314`.
Implementation/preflight: [continuity acceptance](../../../../m5/1470-continuity-acceptance.md).
All media/content in this evidence is synthetic and belongs to the existing
browser fixtures; no account, production photo, token or media URL is included.

## Regression and correction

The new observer-level test fails on the baseline: a native background/resume
callback without a browser visibility event leaves a stale query unchanged.
The background-focus assertion also fails. The existing synthetic window focus
still refreshes session credentials but is not Query v5's focus signal.

The native hook now updates the framework focus manager directly, preserves
session/presence focus delivery, ignores disposed callbacks and restores browser
focus detection at cleanup. The framework retains query-specific freshness;
there is no global invalidation, document reload or alternative media cache.

## Executed verification

- Full Web suite: **2,171 passed, 2 intentionally skipped** (238 test files).
- Focused observer/media/authorization unit group: **35 passed**.
- Browser group: **49 passed, 0 failed, 0 flaky, 0 skipped**: native resume,
  carousel/sensitive media, photo-place/map/correction, session rotation and
  draft retention/save, browser reload/deep-route restoration and sign-out.
- TypeScript, production build, token/PWA checks and scoped format/lint passed.
  Existing bundler and lint warnings remain; no new runtime dependency.
- Browser inventory and engineering-language/identity checks passed.

The membership-outage cases preserve the exact editor DOM node and authored
text, then save once and open the confirmed Memory. The native-resume cases
preserve the exact loaded photo and shell DOM nodes and document geometry after
three short background/foreground cycles and one stale resume. HTTP 401/403/404
separately remove the shell/media rather than retaining revoked content.

## Measured media behavior

The [machine-readable measurements](metrics.json) contain 14 native callback
scenarios: 390 px Light and 1280 px Dark, each with success, HTTP 429/503,
transport failure and HTTP 401/403/404 membership outcomes.

| Measurement | Authorized/transient outcomes | Definitive rejection |
| --- | ---: | ---: |
| Initial image transports | 3 | 3 |
| Additional image transports after resumes | 0 | 0 |
| Additional read descriptors after resumes | 0 | 0 |
| Initial allocated/active Object URLs | 3 / 3 | 3 / 3 |
| Active Object URLs after outcome | 3 | 0 |
| Stale membership revalidation requests | 1 | 1 |

Authorized outcomes allocate/revoke no replacement Object URLs. Definitive
rejection releases all three. Existing six-photo gallery tests retain bounded
neighbor loading and reuse authorized immutable bytes when revisiting images.

## Reviewed runtime images

These capture the retained reading position after a stale resume and a failed
membership refresh (HTTP 503), rather than an initial-load screenshot.

- [Compact 390 px Light](resume-390-light.png)
- [Expanded 1280 px Dark](resume-1280-dark.png)

Existing gallery/place journeys also cover 320/360/430 px, 200% text, Light/Dark,
keyboard/touch controls, axe and reduced motion. No visual composition changes.

## Remaining acceptance

The native bridge is exercised through the real Capacitor JavaScript proxy with
synthetic plugin callbacks. This does not certify a physical WebView, Android
process/memory behavior, OEM picker return, TalkBack, actual network switching,
deployed worker/provider or an installed APK. There is no attached Android
device or SDK in this workspace. #1470 stays open and its follow-up PR stays
draft pending that native acceptance. No deployment or app publication occurred.
