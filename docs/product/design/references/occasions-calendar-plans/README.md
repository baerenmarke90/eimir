# Plans in the occasions calendar (#1907 F3)

Compact reference: [generated SVG](compact-reference.svg). It is a code-generated visual
proposal in the current Dark theme with synthetic titles and dates, not a screenshot of a
tested build. The Product Owner chose the Planen symbol (option A) on 2026-11-15 from three
candidates (Planen symbol, ticket, signpost).

Baseline: `main` `eacc51c04`, route `/plan#dates` (Planen › Anlässe), reviewed on the
deployed instance and in `web/src/components/ImportantDatesPanel.tsx`.

## Existing experience that stays

The four-destination shell, the Pläne / Wünsche / Anlässe segment, the "next occasion" card,
the twelve-month band, the month sheet with tappable days, the occasion rows with their
reader sheet, the floating add action for occasions, the past-occasions list, focus return
and the contextual "plan for this day" action from the reader are unchanged.

## What changes

- Dated Plans with status planned join the month band and the month sheet.
- Marks differ by shape, not only by color: an occasion keeps its dot; a Plan gets a short
  bar in the brand text color. A day with both shows bar and dot next to each other.
- Under the month, Plans are listed in date order between the occasions. A Plan row has a
  brand-tinted date marker, the Planen symbol, its list title and one quiet line with
  weekday, time (or "ganztägig") and the word "Plan".
- Tapping a Plan row, or a day whose first entry is a Plan, opens the Plan detail page.
  Back returns to the occasions calendar on the same month.
- A multi-day date-only Plan marks every day in its range inside the shown month and is
  listed once, with its range.
- Discreet Plans (#1790 F3) show only their list title with the lock, as in the Plans list.
- The "next occasion" card stays occasions-only; the Plans tab already leads with the next
  Plan.
- Not shown: undated Plans, ideas, completed Plans and Plans whose day has passed.

## Review criteria

- Bar and dot remain distinguishable without color; day buttons name every entry.
- Rows keep at least 56 px touch height; the Planen symbol uses the occasion symbol size.
- Compact 360/390/430 px, 320 px reflow, 200 % text, Light and Dark, reduced motion,
  keyboard focus and Expanded.
- No new data, endpoint, entitlement or managed cost.

## Implementation evidence

Captured by the browser journey in `web/e2e/tests/people-important-dates-mobile-first.spec.ts`
on CI run 43757532311 (PR head `2416bc371`, merged with `main`): `10-impl-november-390-light.png`,
`11-impl-december-390-light.png`, `12-impl-december-390-dark.png`, `13-impl-december-1280-dark.png`.
