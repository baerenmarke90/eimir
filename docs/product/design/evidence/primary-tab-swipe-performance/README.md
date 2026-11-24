# Primary tab swipe performance

## During a swipe

These Chromium captures use the synthetic accounts and timeline from the [navigation test](../../../../../web/e2e/tests/floating-bottom-nav-scroll.spec.ts). The finger was still down in all three frames. The fixture shows the unavailable relationship-signals state on the Wir page.

| Capture | What to inspect |
| --- | --- |
| [Compact, light · Planning to Lists](compact-planning-to-lists.png) | After 200 px of travel, Lists is visible beside Planning. The create button and bottom navigation stay anchored. |
| [Compact, dark · Moments to Wir](compact-dark-moments-to-wir.png) | The incoming Wir page retains its background as it enters from the left. |
| [Expanded, light · Moments to Wir](expanded-moments-to-wir.png) | Both page columns move with the swipe while the top navigation stays in place. |

## Pixel measurements

On November 24, 2026, a Pixel 10 Pro Fold running Android 17 and system WebView 156.0.8078.47 loaded production-mode E2E bundles with local fixture data in a separate test app. The viewport was 443 × 904 CSS pixels with standard motion. Each revision had two runs. Each run warmed up with one round trip from Wir through Moments and Planning to Lists and back. Two more round trips yielded 24 measured swipes per revision. Android injected each swipe over 280 ms. The frame sampler ran through 700 ms after release.

| Metric | Baseline `cd29baed8` | Change `cf7f3e37a` |
| --- | ---: | ---: |
| Renderer layouts per gesture, median | 84 | 4 |
| Renderer layout time per gesture, median | 17.15 ms | 2.99 ms |
| Animation frame interval, 99th percentile | 25.1 ms | 16.7 ms |
| Animation frame intervals above 25 ms | 35 / 2,609 | 16 / 2,702 |
| Planning-to-Lists swipes with a Lists preview panel present at release | 0 / 4 | 4 / 4 |

Chrome DevTools Protocol supplied the renderer counters. The frame intervals come from `requestAnimationFrame` callbacks. Some early intervals still reached 58.5 ms on the changed build. These runs cover warmed routes with fixture data on one device.

## Interrupted swipes and cold pages

On November 24, 2026, the same Pixel 10 Pro Fold and Android System WebView 156.0.8078.47 ran the six follow-up scenarios on `2d92d877` and the corrected client in `beabf30ff`. The USB test used an isolated WebView with synthetic accounts, a 443 CSS-pixel viewport and normal motion. Coordinates below are CSS pixels.

| Interaction | Before | After |
| --- | --- | --- |
| Scroll immediately after releasing a Wir → Moments swipe | The vertical gesture cancelled the selection. Pulling down refreshed the departing dashboard. | The upward gesture scrolled Moments. Pulling down kept the destination with zero dashboard refresh requests. |
| Tap the fixed create action during that transition | Moments opened the Wir sheet with Plan, Wish and List actions. | The first tap opened the Moments sheet in all four repetitions. A neutral tap during a cancelled swipe also kept the original cancellation. |
| Return to Moments after reading the Diary, or to Planning after viewing Wishes | The preview showed Diary or Wishes and switched segments at release. | The preview and the landing both showed Memories or Plans respectively. [Compact preview](follow-up-story-preview.png) |
| Swipe from Notes or the map's reading area | Both routes stayed in place. | Notes reached More and the map reached Planning. A touch starting on the map canvas still belonged to the map. |
| Hold the Lists chunk while entering and leaving Lists | At commit the loading indicator moved from (0, 0) to (20, 24) and narrowed from 443 to 403. It then stayed still on the return drag. | The indicator remained at (20, 24) with width 403 across commit. The return drag moved it 221 pixels. |
| Re-grab the rubber band on the first tab | A further 23-pixel outward drag moved the page backwards from +48 to +17.75. | It stayed at the +48 limit. A subsequent 130-pixel inward movement took it to −82 and revealed Moments. |

The Pixel captures show the [Moments menu after one tap](follow-up-pixel-create.png) and the [held Lists loading surface during a drag](follow-up-pixel-loading.png). The [Expanded capture](follow-up-expanded.png) shows the shared two-page transition at 1280 pixels. Browser coverage also checks reduced motion, origin and focus when returning from a Moment's map, and the native history length on tab selection.
