# Shared Collection detail toggle — browser evidence (#508)

Captured by the changed Playwright browser spec in [Web Browser QA run 36208589603](https://github.com/baerenmarke90/eimir/actions/runs/36208589603), against UI commit `0f9a3ba6036455634986d099ddcdeb57e8eb5c12` on 2026-09-26. The following import-order-only commit did not change the rendered UI.

| Capture | State and viewport |
| --- | --- |
| `planning-collection-detail-pending-390-light.png` | 390 px Compact, Light, PATCH response held: optimistic check and row-local saving status |
| `planning-collection-detail-rollback-390-light.png` | 390 px Compact, Light, failed PATCH: checkbox restored and retry visible |
| `planning-collection-detail-confirmed-1280-light.png` | 1280 px Expanded, Light, successful retry |
| `planning-collection-detail-confirmed-320-dark-200pct.png` | 320 px Compact, Dark, 200% root font size and reduced motion, successful retry and wrapped row actions |

The browser spec asserts no horizontal overflow in these states and runs axe WCAG 2.2 AA checks on the confirmed Expanded state. The screenshots are full-page captures; the fixed Compact navigation stays positioned within the initial viewport in the 320 px image.

## Reorder response states

Captured by the changed Playwright browser spec in [Web Browser QA run 36381149259](https://github.com/baerenmarke90/eimir/actions/runs/36381149259), against UI commit `963902e790c814729073d2853cb33c78b8477507` on 2026-09-28.

| Capture | State and viewport |
| --- | --- |
| `planning-collection-reorder-pending-390-light.png` | 390 px Compact, Light, PUT response held: submitted order remains visible with a saving status |
| `planning-collection-reorder-rollback-390-light.png` | 390 px Compact, Light, failed PUT: prior order restored and retry visible |
| `planning-collection-reorder-confirmed-1280-light.png` | 1280 px Expanded, Light, successful retry confirms the submitted order |
| `planning-collection-reorder-confirmed-320-dark-200pct.png` | 320 px Compact, Dark, 200% root font size and reduced motion after successful retry |

The browser spec asserts the pending, rollback, and retry order, no horizontal overflow, and axe WCAG 2.2 AA on the confirmed Expanded state. These are full-page captures; the fixed Compact navigation remains positioned within the initial viewport in the 320 px image.
