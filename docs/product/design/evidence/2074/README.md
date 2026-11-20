# #2074 Wir on the motion layer, with the important-day Moment (#2072)

Captured with Playwright Chromium from `web/e2e/tests/today-daily-checkin.spec.ts`. The cases are `visual evidence 2074 …` and the important-day journeys, run with `VISUAL_EVIDENCE_DIR`. The API is mocked, and the Verbunden design is used throughout.

## Ordinary day (the migrated opening)

`2074-ordinary-<width>-<theme>[-200-text|-reduced-motion]-<n>-<state>.png`

- `1-opening`: a frame while `data-motion-stage="playing"`. The portraits fade in and a partner value arrives.
- `2-rest`: after the opening ended on its own clock. The rings breathe (opacity only), the check-in row is closed, and the shared time sits on the heart line.
- Widths 360, 390 and 430 in Light and Dark, 390 with 200 % text, and 390 Dark with reduced motion (final composition at once, so there is no opening frame).

## Important day (#2072)

`2074-<width>-<theme>[-200-text|-reduced-motion]-<n>-<state>.png`. The partner's birthday is mocked as today.

- `1-moment`: during the Moment. The heart is filled and the hearts rise in the flight layer. The middle line has cross-faded to the occasion copy (`occasionMarks.todayPartnerBirthday`), with `occasionMarks.partnerBirthday` below it. Alex's ring is warm, with a soft halo and the cake mark.
- `2-rest`: the static state for the rest of the day.
- Widths 360, 390 and 430 in Light and Dark, and 360 with 200 % text. At 200 % text the heart line is only a few characters wide, so only the main occasion line shows, slightly smaller, and the line below steps back. 390 with reduced motion shows the final state at once, with no rising hearts.

## Behaviour checked in the same spec

- **Open → return, ordinary day** (`the Wir opening ends on its own and returning to Wir replays no entrance`):
  - the opening ends by itself;
  - the ring breath is a finite opacity animation on `::before`, with no `scale`;
  - after Planen → Wir, the first frame has no running one-shot CSS animation.
- **Open → Moment → return → new app start** (`the important-day Moment plays once after the opening and rests for the day`, anniversary 3 years ago today):
  - exactly 6 rising hearts;
  - `occasionMarks.todayAnniversary` (count 3) with `occasionMarks.anniversary` below;
  - the heart link's accessible name starts with the occasion;
  - Planen → Wir shows `final` at once and adds no hearts;
  - a reload the same day shows `final` and adds no hearts.
- **Reduced motion** (`reduced motion shows the important day at once, without rising hearts`): the final state, the warm partner ring and the cake mark, with 0 rising hearts.
- The occasion copy stays inside the viewport at every width.

## Known, not caused by this change

At 360 px with 200 % text, Wir on `main` is 369 px wide with or without an occasion. The partner's send mark reaches 9 px past the edge. It is a follow-up, outside the motion scope.

## Outstanding

Pixel device acceptance on an Android test release:
- the opening once per app start;
- the ring breath smooth on a mid-range phone;
- no replay from Momente or Planen;
- no avatar flash;
- the Moment with its haptic tick, once the haptics backend lands in step 5 (#2076). Until then the adapter is a no-op.
