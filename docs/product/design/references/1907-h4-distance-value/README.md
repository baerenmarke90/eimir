# Distance value in the Verbunden Wir hero (#1907 H4)

## Generated visual reference (before implementation)

Composed on the real `/today` route of `main` `40eca3333` with the default Wir
design Verbunden (`connected`), e2e harness with mocked API, DOM only, nothing
saved.

Product Owner input (2026-11-15): the band text (a range such as 10–50 km) looks
cheap; specifically the small value under the avatars in Verbunden. The pill
of the other Wir designs (`partnerLocation.distanceBetween`) is good and stays.

Existing screen reviewed and kept: both avatars with names, the bridge with
the days together (`wir-bridge-lead`) and the two-coloured heart line, the
"&", the daily impulse below, the welcome block and the navigation. Today the
distance is a small muted line with a pin glyph under the "&"
(`00-before-*`, `01-before-*`, `02-before-*`); 

- **Option A** (`option-A-*`): the pill of the other designs, centred under
  the names. Same component, glyphs and states as today's pill (heart and
  `partnerLocation.distanceBetween`; nearby `partnerLocation.distanceNear`;
  earlier with clock and time), opens the map.
- **Option B** (`option-B-*`): the value moves onto the bridge, below the
  heart line, in the same display type as the days above it (days / heart /
  value; nearby a new short value next to `partnerLocation.distanceNearShort`; earlier muted with a small clock and
  time). It opens the map; the days keep opening the story.

Variants: 390 Light for range, nearby and earlier; 390 Dark for far; 360 with
200 % root font size. At 200 % the Verbunden hero already overlaps today
(avatars and the days); option B would inherit that, so it falls back to
option A's position at large text.

## Revised proposal (supersedes options A and B)

Product Owner correction (2026-11-15): placement is not the issue (the space
on the bridge is taken when the duration shows years, months and days). The
range itself is the issue: a statement such as "10–20 km away" does not say
anything meaningful.

Proposal: the four range bands (`RANGE`, 2–50 km) are described in words
instead of numbers; nearby (`NEARBY`) keeps its words and far values
(`APPROXIMATE`, from 50 km) keep their single rounded number. The words come
only from the server band, so nothing becomes more precise.

| Band | Short value (Verbunden) | Sentence (pill, map sheet, text alternative) |
| --- | --- | --- |
| 2–5 km | around the corner | you are just around the corner |
| 5–10 km | a stone's throw | only a stone's throw between you |
| 10–25 km | not far | you are not far from each other |
| 25–50 km | a short trip | only a short trip between you |

German copy is in the issue proposal and will live in the
`partnerLocation` locale resources.

- `10-before-10-25-390-light.jpg`: today.
- `11-words-10-25-390-light.jpg`: the proposal (recommended).
- `12-upper-bound-10-25-390-light.jpg`: alternative, a single upper bound
  instead of words.
- `13-` to `15-`: the other range bands in words; `16-`: Dark.
- `17-pill-words-10-25-390-light.jpg`, `18-map-sheet-words-10-25-390-light.jpg`:
  the same band as a sentence in the pill and on the map sheet.

The value no longer wraps inside the narrow slot under the "&"; it is centred
on its own line. At 200 % text the Verbunden hero already overlaps today
(avatars and days); the value then wraps centred within the screen width.

## Product Owner approval and live preview

Approved on 2026-11-15 after a live preview of the real app (e2e build with
fixture data and a band switcher, never committed): the words over the
numeric ranges. Checking them beside the daily vibe and energy marks showed
that the longest short forms come within 7 px of the marks at 360 px, so the
Product Owner also approved shorter short forms (`distanceStonesThrowShort`,
`distanceShortTripShort`) and a fallback: when the value would come closer
than 8 px to a mark, it moves to its own line below the marks.

## Implementation evidence

Captured from the implementation branch in the e2e harness (mocked API):

- `20-impl-verbunden-5-10-390-light.jpg`, `21-impl-verbunden-5-10-390-dark.jpg`:
  Verbunden with both daily marks, the value beside them.
- `22-impl-verbunden-5-10-320-below-marks.jpg`: 320 px, the value on its own
  line below the marks.
- `23-impl-verbunden-5-10-390-text-130-below-marks.jpg`: 130 % text, own line.
- `24-impl-pill-nearby-360-light.jpg`, `25-impl-pill-far-390-light.jpg`: the
  pill of the other designs, unchanged for nearby and far values.

## Follow-up: kilometres on the map, pin glyph (Product Owner, 2026-11-16)

- The map sheet keeps the kilometres of a range band below its words
  (`partner-map-between-km`); nearby never shows a number and far values
  already contain theirs.
- The Verbunden hero always shows the distance pin; the clock glyph for an
  earlier value is gone, the earlier state stays in the accessible name.

Evidence (real app build with fixture data): `30-impl-verbunden-earlier-pin-390-light.jpg`,
`31-`/`32-` (5–10 km, Light/Dark), `33-impl-map-sheet-km-earlier-390-light.jpg`,
`34-`/`35-` (map sheet 5–10 km, Light/Dark).
