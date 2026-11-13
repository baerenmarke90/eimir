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
DOM only; nothing was saved to the demo. The demo build predates the reference
branch, so the composition reuses its real Planen, Wish detail and Plan detail
routes, tokens and components, and adds only the F2 elements.

States shown in 03 and 04, left to right:

1. Pläne with the single quiet hint ("2 eurer Wünsche sind gerade unterwegs ›")
   and the warm origin line on the next and undated plan cards.
2. Wünsche · Geplant: planned wishes stay visible, each with its plan date or
   "noch ohne Datum", linking to the plan.
3. Wünsche · Erfüllt: "Erinnert ›" when a memory exists, otherwise the gentle
   "Moment festhalten ›".
4. Wish detail: the quiet four-dot path replaces the status word; the primary
   action leads to the plan.
5. Plan detail: "✦ Aus eurem Wunsch ›" above the title.
6. After "Als erlebt markieren": "Wunsch erfüllt ✦" with the path advanced to
   Erlebt, "Moment festhalten" and "Später".

Existing functions represented: Planen segments, search, status scope,
"Als Nächstes"/"Danach"/"Noch ohne Termin", the floating add action, plan
schedule/place/calendar action, comments, the wish edit action and the bottom
navigation.

## Decisions carried into implementation

- The warm accent is the existing story accent (`--color-story-heart-moment`)
  on the brand surface (`--color-brand-surface`), aliased once as the
  wish-journey role; no new palette value.
- "✦" is a shared `EimirIcon` (`sparkle`), never a text glyph.
- Copy in the images is placeholder for i18n keys (de + en).
- Not included: counter tiles, counts on the Pläne/Wünsche/Anlässe segments,
  manual steps or progress bars.
