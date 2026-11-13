# Repeat a completed Wish ("Nochmal erleben") — visual reference (#1816)

Issue: #1816. Product Owner decisions (2026-11-13, chat): the repeat creates a
new **Wish**, offered on the completed Wish; "Gleich planen" continues into the
existing Wish-to-Plan conversion; a series is one row under "Erfüllt".

## Sources

| File | Variant | Baseline |
| --- | --- | --- |
| `01-wish-repeat-390-light.png` | Light, 390 px | `main` `258d6560f` |
| `01-wish-repeat-390-dark.png` | Dark, 390 px | `main` `258d6560f` |

The public demo was not in demo mode when this was composed, so the images were
composed from the real application in the browser-test harness (API mocked with
the fixtures of `web/e2e/tests/wish-journey.spec.ts`) and then changed by live
DOM edits only. They reuse the shipped components, tokens and sheet; the added
elements are placeholder for the new copy.

Left to right:

1. **Planen, Wünsche, Erfüllt:** one row per series ("2× erlebt", the existing
   "Erinnert" line stays), the earlier times collapsed under "Alle Male
   ansehen".
2. **Planen, Wünsche, Offen:** an open repeat carries the quiet "2. Mal" mark
   (the shared sparkle origin mark).
3. **Completed Wish detail:** the existing four-step path and "Aus diesem Wunsch
   wurde Wirklichkeit"; the creation entry is the shared filled add button
   ("Nochmal erleben") per the Button contract.
4. **Sheet:** the shipped bottom sheet with the title as an editable proposal.
   The primary action creates the Wish; a secondary "Gleich planen" creates it
   and opens the existing conversion (not drawn: the reused sheet only carries
   one footer action).
5. **Reminder detail:** one quiet line above the schedule, "Aus eurem Wunsch
   „…“ · 2. Mal", linking to the Wish.

Existing functions represented: Planen segments, search, scope filter, the
shared selection entry, the floating add action, the wish edit action, the
bottom navigation and the reminder content.

## Intentional departures and assumptions

- The sheet in panel 4 is the plan-completion sheet with changed text; the real
  sheet is built on the same `ShortTaskSheet`.
- No counters, progress bars or new palette values. The series mark reuses
  `WishOriginMark`.
