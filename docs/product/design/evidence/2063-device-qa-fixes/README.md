# #2063 Device QA fixes: Compact evidence

Screenshots of the changed Compact states at 390 × 844 in Light and Dark, with
reduced motion. They were captured from the production bundle in the mocked
browser harness (`web/e2e`, Playwright) on 2026-11-19. They are not device
screenshots; Pixel acceptance is still outstanding.

| File | State |
| --- | --- |
| `plan-date-sheet-390-{light,dark}.png` | Plan schedule sheet with the in-app calendar, a day chosen |
| `discard-sheet-390-{light,dark}.png` | Discard sheet: safe action first, destructive action last |
| `plan-title-error-390-light.png` and `-dark.png` | Inline, app-styled error for a missing Plan title |
| `wir-create-menu-390-{light,dark}.png` | Wir create menu with moments, Plan, Wish and List |
| `wir-top-390-{light,dark}.png` | Wir header area with the floating create button |
| `list-detail-add-390-{light,dark}.png` | Shared-list add row that wraps instead of truncating |

Not shown here, because the browser harness has no system insets or idle
device: the status-bar backdrop (it needs a non-zero top safe-area inset) and
the settled idle motion on Wir and Momente. Both need the Pixel check.
