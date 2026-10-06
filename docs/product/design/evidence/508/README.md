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

## Own Daily Energy response states

Captured by the changed Playwright browser spec in [Web Browser QA run 36400649711](https://github.com/baerenmarke90/eimir/actions/runs/36400649711), against UI commit `20833a684973ab67c0c2cfcfa6a8d22031fe589a` on 2026-09-28.

| Capture | State and viewport |
| --- | --- |
| `today-energy-pending-390-light.png` | 390 px Compact, Light, PATCH response held: own battery shows the submitted value, the saving status is visible, and partner Energy stays hidden |
| `today-energy-rollback-390-light.png` | 390 px Compact, Light, failed PATCH: own battery returns to the confirmed value, selected slider position remains, and retry is visible |
| `today-energy-confirmed-1280-light.png` | 1280 px Expanded, Light, successful retry adopts the server's own and partner projections |
| `today-energy-confirmed-320-dark-200pct.png` | 320 px Compact, Dark, 200% root font size and reduced motion after successful retry; the open slider paints above the fixed navigation |

The spec checks the pending/rollback/retry lifecycle, unrevealed partner state before server confirmation, no horizontal overflow, axe on the confirmed Expanded hero, and the slider's hit-test at 320 px/200% text. These are full-page screenshots; the fixed navigation stays positioned within the initial viewport in the 320 px capture and is behind the open popover.
