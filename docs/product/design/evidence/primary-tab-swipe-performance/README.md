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
