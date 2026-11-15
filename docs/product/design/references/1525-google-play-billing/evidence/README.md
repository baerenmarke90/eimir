# Google Play purchase states on the shared Pro paywall (#1525)

Captured 2026-11-15 from the production paywall component and stylesheet in
the mocked Web E2E harness (`installDateIdeaMocks`, Chromium, reduced
motion). The Android-only channel state was injected through a temporary
local stub that is **not** part of the repository; Google Play itself was not
involved. These images show composition, hierarchy, theming and reflow of the
new states. They are **not** device evidence: a Play-installed build with a
license tester is still required once the Play Console is set up
([operations](../../../../operations/google-play-billing.md)).

| File | State |
| --- | --- |
| `play-offers-390-light.webp`, `play-offers-390-dark.webp`, `play-offers-360-light.webp`, `play-offers-430-light.webp` | Free Space, live store offers, eligible 14-day trial on the yearly plan, purchase and restore |
| `play-offers-320-light-200pct.webp` | 320 px with 200 % text; no horizontal scrolling |
| `play-offers-1280-dark.webp` | Expanded, same single reading column |
| `play-loading-390-light.webp` | Store offers loading: target prices as information, no purchase action |
| `play-unreachable-390-dark.webp` | Google Play unreachable: calm note with retry, no purchase action |
| `play-active-manage-390-light.webp` | Pro active for the Space: continue and manage in Google Play |
| `play-restore-none-390-light.webp` | Restore found no purchase: alert, nothing charged |

The trial length and prices shown are sample store values, not decisions.
