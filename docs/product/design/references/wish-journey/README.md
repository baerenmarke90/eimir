# Wish journey references (#1790 F2)

Issue: #1790, slice F2 "Wish journey — visible progress derived from existing
building blocks" (Product Owner decision 2026-11-13).

## Sources

| File | Variant | Baseline |
| --- | --- | --- |
| `01-wishes-planned-filter.jpg` (branch `design/wir-feeling-reference`, `b6fba2001`) | Light, 390 px | `main` `d83440b28` |
| `02-planen-wish-progress.jpg` (branch `design/wir-feeling-reference`, `b6fba2001`) | Light, 390 px | `main` `d83440b28` |
| `03-wish-journey-dark-390.jpg` | Dark, 390 px | `main` `096b4c781` |
| `04-wish-journey-light-360.jpg` | Light, 360 px | `main` `096b4c781` |

All four were composed on the public demo (Lea & Alex) by changing the live
DOM only; nothing was saved to the demo. The composition reuses the demo's real
Planning, Wish detail and Plan detail routes, tokens and components, and adds
only the F2 elements.

States shown in 03 and 04, left to right:

1. Plans segment with the single quiet hint (`wishJourney.hintUnderway`) and
   the warm origin line (`wishJourney.planOrigin`) on the next and undated
   plan cards.
2. Wishes, planned scope: planned wishes stay visible, each with its plan date
   (`wishJourney.plannedOn`) or no date yet (`wishJourney.plannedUndated`),
   linking to the plan.
3. Wishes, fulfilled scope: `wishJourney.remembered` when a memory exists,
   otherwise the gentle `wishJourney.captureMoment`.
4. Wish detail: the quiet four-step path replaces the status word; the primary
   action leads to the plan (`wishJourney.openPlanOn`).
5. Plan detail: `wishJourney.fromWish` above the title.
6. After completing the plan: `wishJourney.fulfilledTitle` with the path
   advanced to the experienced step, the memory capture and the later action.

Existing functions represented: Planning segments, search, status scope, the
next/later/undated plan groups, the floating add action, plan schedule, place
and calendar action, comments, the wish edit action and the bottom navigation.

## Decisions carried into implementation

- The warm role reuses the existing story accent (`--color-story-heart-moment`)
  on the brand surface (`--color-brand-surface`), aliased once as the
  wish-journey role; no new palette value.
- The sparkle is a shared `EimirIcon` (`sparkle`), never a text glyph.
- Copy in the images is placeholder for the `wishJourney.*` i18n keys (de + en).
- Not included: counter tiles, counts on the segments, manual steps or
  progress bars.

## Implementation evidence

`evidence/` holds browser captures from `web/e2e/tests/wish-journey.spec.ts`
(plans, planned, fulfilled, wish detail and fulfilment surfaces) at 360, 390
and 430 px Light, 390 px Dark, 200 % text, reduced motion and Expanded Dark.
