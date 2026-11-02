# App quality: actual browser evidence

Related: #1590, #1592, #1593 and #1594; stacked on #1591, with #1588 already merged into main.

These are screenshots of the running application with synthetic fixtures and an existing repository demo photo. They are not generated product concepts. Capture source: [1782b56b8821787b7316c74814253f77f8086ee6](https://github.com/baerenmarke90/eimir/commit/1782b56b8821787b7316c74814253f77f8086ee6), including #1591 `0f220027`. Integration source: [`bc64d09a`](https://github.com/baerenmarke90/eimir/commit/bc64d09a0389f95d18f30ce211d0f9570c726663); the only subsequent change is a three-line Plan-layout browser readiness assertion, with no Web runtime change. Captured again after integrating the live feature's preview/reflow work and route-commit guards. Existing startup, scoped media ownership, contact feedback and all strict save/return assertions are retained.

Runtime: Chromium headless shell 153.0.8010.0, the production React components served by Vite, trusted CDP touch input, no retries. All captures were inspected at their actual Compact/Expanded sizes. This proves browser behavior and composition; it does not establish physical-device startup speed, frame rate or a diagnosis of every reported Android crash.

## Captures and behavioral acceptance

| State | Compact | Expanded | Observed behavior |
| --- | --- | --- | --- |
| First unresolved design | [390 Light](today-startup-unresolved-390-light.webp) | [1280 Dark](today-startup-unresolved-1280-dark.webp) | No false default design or content while the authoritative selection is unresolved. |
| Remembered design during slow revalidation | [390 Light](today-startup-preserved-390-light.webp) | [1280 Dark](today-startup-preserved-1280-dark.webp) | The remembered Modern composition is present before the delayed appearance response. The response preserves that selection. |
| Held contact feedback | [360 Light](shell-control-press-360-light.webp), [390 Dark](shell-control-press-390-dark.webp), [430 Light, reduced motion](shell-control-press-430-light-reduced.webp) | [1280 Dark](shell-control-press-1280-dark.webp) | Transparent tap overlay, circular mobile target, measured scale 0.96 mobile / 0.98 Expanded; no scale with reduced motion. Cancel clears contact without opening an action. Release opens the existing sheet/menu; Escape closes it and keyboard focus remains visible. |
| Story thumbnail after detail and return | [390 Light](story-media-return-390-light.webp) | [1280 Dark](story-media-return-1280-dark.webp) | Same blob URL after route remount, one thumbnail content GET, and a new parent read authorization. Existing content hierarchy, navigation and reflow are retained. |

The existing typography, palette, personal focal point, destinations and screen compositions remain authoritative. Native CSS feedback roles and Pointer Events provide direct contact feedback without delaying activation or taking over scroll/gesture handling. Sensitive Today media remains obscured as required by the fixture; the visible Story photo is non-sensitive synthetic content. The paired browser cases assert no horizontal overflow on return.

## Reproduction and results

Maintained journeys:

- `web/e2e/tests/wir-design-selection.spec.ts`: four startup and four held-touch/cancellation/focus cases.
- `web/e2e/tests/media-url-continuity.spec.ts`: two authorized thumbnail detail/return cases, promoted unchanged in behavior from the capture audit to PR-critical coverage.
- `web/e2e/tests/today-freshness.spec.ts`: pull refresh, plan rescheduling, save and return, with a strict photo-source availability fixture.
- `web/e2e/tests/memory-create-defaults.spec.ts`: connected source import, save and canonical Plan/HeartMoment return; image order is checked against selected filenames rather than parallel upload completion order.

The capture audit passed **13 browser journeys without retries**, followed by **five navigation journeys** covering 360/390/430/1280 root swipes and Diary-to-Map keyboard focus. The latest trace showed that a URL update can precede replacement of the old Map tablist. The keyboard journey now waits for the selected Diary tab, and root swipes await the real Today hero before hit-testing. The promoted media cases passed again in their repository location. The latest hosted [Web S8 job](https://github.com/baerenmarke90/eimir/actions/runs/41460555021/job/125328181012) passed the complete integrated Web suite: **2,515 tests, with two existing skips**; TypeScript, formatting/lint, engineering-language audit, token/PWA checks, inventory and production build passed. Inventory: 82 specs, 763 baseline tests, 575 PR-critical baseline tests. Hosted checks validate each updated PR revision separately. One redundant concurrent local full run hit the unchanged IndexedDB LRU test's five-second budget (2,514 passed, one timeout); that file then passed all six cases in isolation, and the hosted full suite above passed. No timeout or assertion was weakened.

Using the repository's installed browser runtime, run from `web/e2e`:

```sh
npx playwright test tests/wir-design-selection.spec.ts tests/media-url-continuity.spec.ts tests/today-freshness.spec.ts tests/memory-create-defaults.spec.ts --grep 'does not paint a default design|restores the chosen design|shape-following press|authorized thumbnail|Today supports app-wide pull refresh|connected photo source saves to the canonical'
```

## Native acceptance remains separate

Actual renderer crash/reopen instrumentation passed on **API 28, 36 and 37.1** in [Android run 41454483221](https://github.com/baerenmarke90/eimir/actions/runs/41454483221), source `9c2d7c4e`. Android implementation/test files are unchanged in the current integration; the new source still runs its own hosted checks. API 36 diagnostics originally showed the recovery Activity resumed and its dialog receiving focus while Espresso selected the empty host. Explicit dialog matching retained real renderer termination, visible recovery, no automatic restart and a deliberate fresh bridge. One earlier API 36 retry followed an ADB transport closure. Physical-device cold-start/resume acceptance and the reported device-specific crash diagnosis remain open in #1590.
