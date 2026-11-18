# Date inspiration and Pro paywall runtime evidence (#1892)

Captured by `web/e2e/tests/date-inspiration.spec.ts` (Chromium, mocked API
derived from the bundled editorial catalog `catalogVersion` 1.0.0, reduced
motion) on branch `feat/date-inspiration`; the pull request records the exact
head commit. These are runtime captures, separate from the preflight
[Compact reference](../compact-reference.png), which predates the editorial
catalog and the shared paywall.

| File | State |
| --- | --- |
| `entry-390-light.webp` | Wishes mode with the entry below the shared Wish selection entry (Pro Space, so no Pro mark). |
| `free-390-light.webp` | Free Space: calm hint with Pro mark and the deliberate paywall link; no catalog request. |
| `360-light.webp`, `390-dark.webp`, `1280-dark.webp` | Discovery top: header, category chips, filter disclosure, count (200 ideas) and the first card with its editorial image. Expanded keeps one column at the leading edge. |
| `430-light-filters.webp`, `320-light-filters-200pct.webp` | Disclosed duration/budget/place filters; 320 px at 200 % text without horizontal scrolling. |
| `saved-390-light.webp` | Combined filters (category + home) after saving through the existing Wish composer: the card (idea image above) links to the actual Wish and plans through it; the next card shows its own image. |
| `paywall-dateIdeas-390-light.webp` | Shared paywall, date inspiration context: hero, title, three benefits, yearly preselected (about 37 % saving), monthly, "for both of you", purchase not yet available, terms (full page). |
| `paywall-recaps-390-dark.webp`, `paywall-recaps-320-light-200pct.webp`, `paywall-recaps-1280-dark.webp` | Recaps context in Dark, at 320 px with 200 % text and Expanded (full page; long pages cropped at 3000 px). |
| `paywall-active-390-dark.webp` | General context for a Space that already has Pro: confirmation instead of plans. |

Behavioral acceptance in the same spec (11 tests): Free without catalog or image read →
deliberate paywall → plan choice → Back returns to the ideas; filter → 24 ideas
with "show more" → the idea's own image loads through the protected API with its alt text → save via the prefilled Wish composer (one `createWish` with
an `Idempotency-Key`) → actual Wish → Back restores filters → plan through
`convertWishToPlan` with `If-Match` and the idea's `planTitle`; plan an unsaved
idea through the prefilled Plan composer; closing an unchanged prefill saves
nothing and needs no prompt; catalog failure → retry; active Pro on the
paywall; axe (WCAG 2.2 AA tags) on Compact and Expanded states.

Not covered here: a physical Android device run (no wrapper or native change),
a real billing provider (none exists yet) and Product Owner acceptance.
