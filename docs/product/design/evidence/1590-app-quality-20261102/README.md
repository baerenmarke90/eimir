# App quality: actual browser evidence

Related: #1590, #1592, #1593 and #1594; stacked on #1591, with #1588 already merged into main.

These are screenshots of the running application with synthetic fixtures and an existing repository demo photo. They are not generated product concepts. Capture source: [bfcc328ccdf690123d5f41aa288b0a77064dd9f1](https://github.com/baerenmarke90/eimir/commit/bfcc328ccdf690123d5f41aa288b0a77064dd9f1). Integration source: [a93f2b9065cabcdb3624c98bd767dbf62289f61d](https://github.com/baerenmarke90/eimir/commit/a93f2b9065cabcdb3624c98bd767dbf62289f61d); subsequent changes add the same media assertions to the maintained browser inventory and correct the native test's dialog-root selection. The Web runtime is identical to the capture source.

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

The capture audit passed **13 browser journeys without retries**. The promoted media cases passed again in their repository location. The focused motion/create/gesture/token suite passed **65 tests**; TypeScript, formatting/lint, token/PWA checks, inventory and production build passed. Inventory: 82 specs, 762 baseline tests, 574 PR-critical baseline tests. Hosted checks validate each updated PR revision separately.

Using the repository's installed browser runtime, run from `web/e2e`:

```sh
npx playwright test tests/wir-design-selection.spec.ts tests/media-url-continuity.spec.ts tests/today-freshness.spec.ts tests/memory-create-defaults.spec.ts --grep 'does not paint a default design|restores the chosen design|shape-following press|authorized thumbnail|Today supports app-wide pull refresh|connected photo source saves to the canonical'
```

## Native acceptance remains separate

The previous source passed actual renderer crash/reopen instrumentation on API 28 and 37.1. API 36 diagnostics showed the recovery Activity resumed and its dialog received focus, while Espresso selected the empty, unfocused Activity host. The new assertion explicitly matches the dialog and retains actual renderer termination, visible recovery, no automatic restart, explicit retry and a distinct fresh bridge. A new native matrix run must establish that correction; earlier green results are not transferred to a new revision. One API 36 retry followed an ADB transport closure and is recorded in the PR. Physical-device acceptance remains open in #1590.
