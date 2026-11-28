# #2370 The days-together count rolls into place on the anniversary and on round days

Captured with Playwright Chromium from `web/e2e/tests/today-daily-checkin.spec.ts` (cases `visual evidence 2370 …`), run with `VISUAL_EVIDENCE_DIR`. The API is mocked, and the Verbunden design is used throughout.

`2370-<occasion>-<width>-<theme>[-200-text|-reduced-motion]-<n>-<state>.png`

- `round-day`: the relationship started 1000 days ago. The important-day Moment plays, and the middle line reads "1.000 Tage zusammen".
- `anniversary`: the relationship started three years ago today. The middle line reads "Heute vor 3 Jahren", and the line below the heart reads "1.096 Tage zusammen" (it used to repeat "An eurem 3. Jahrestag").
- `1-rolling`: a frame about 200 ms into the Moment. The digit strips are still rolling (right to left), the copy fades in, and the small hearts rise.
- `2-rest`: the static state for the rest of the day.
- Round day: 360, 390 and 430 px in Light and Dark, 360 px with 200 % text, and 390 Dark with reduced motion (final state at once, so there is no rolling frame). Anniversary: 390 px in Light and Dark, and 390 Dark with reduced motion.

At 200 % text the heart line is only a few characters wide. The existing container rule makes the main line slightly smaller, and the line below steps back. The main line now breaks long words at a syllable with a hyphen ("zusam-men") before it breaks anywhere. As with the birthday copy on `main` (#2074 evidence), the line overlaps the portraits' edges at this size.

## Behaviour checked in the same spec

- **Round day** (`a round day together plays the Moment with a rolling count (#2370)`):
  - while the Moment plays, every digit strip has its own running animation;
  - 6 rising hearts;
  - the readable number is "1.000", and the bridge link's accessible name starts with "1.000 Tage zusammen.";
  - at rest every strip shows its own digit (1, 0, 0, 0);
  - after Planen → Wir, the strips show the number at once with no animation.
- **Not a round day** (1001 days): no occasion, and the stage carries no `data-important-day`.
- **Anniversary** (`the important-day Moment plays once …`): the line below shows the locale-formatted days together; it is part of the accessible name; at rest no strip animates; tab return and reload the same day replay nothing.
- The occasion copy stays inside the viewport at every captured width.

## Outstanding

Pixel device acceptance on an Android test release: the roll on a mid-range phone, and the haptic tick on the first beat.
