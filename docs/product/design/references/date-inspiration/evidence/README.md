# Date inspiration runtime evidence (#1892)

Captured by `web/e2e/tests/date-inspiration.spec.ts` (Chromium, mocked API
derived from the bundled development catalog, reduced motion) from product
source commit `feddb64efc` on branch `feat/date-inspiration`. These are runtime
captures, separate from the preflight [Compact reference](../compact-reference.png).

| File | State |
| --- | --- |
| `entry-390-light.webp` | Wishes mode with the new entry below the shared Wish selection entry (Pro, so no Pro mark). |
| `free-390-light.webp` | Free Space: calm explanation with Pro mark and link; no catalog request. |
| `320-light.webp`, `320-light-filters.webp` | 320 px at 200 % text: header and open filters reflow without horizontal scrolling. |
| `360-light-cards.webp` | 360 px idea card with duration, budget and setting. |
| `390-dark-cards.webp`, `390-dark-filters.webp` | Dark theme cards and the disclosed duration/budget/setting filters. |
| `430-light-cards.webp` | 430 px card with the lighter save action and the dominant plan action. |
| `saved-390-light.webp` | Combined filters (category + free budget), confirmed save turned into a link to the actual Wish. |
| `1280-dark-cards.webp` | Expanded: same order, leading edge, bounded reading width. |

Behavioral acceptance in the same spec: Free without catalog read; filter →
save (one idempotent request) → open Wish → Back restores filters → shell Back
returns to Wishes with the new Wish; idea → prefilled composer → saved Plan;
unchanged prefill closes without a discard prompt; catalog failure → retry;
axe (WCAG 2.2 AA tags) on Compact and Expanded states.

Not covered here: a physical Android device run (no wrapper or native change),
the final 200-idea editorial catalog, and Product Owner acceptance.
