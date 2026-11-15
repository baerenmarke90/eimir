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
(`00-before-*`, `01-before-*`, `02-before-*`); `03-pill-today-*` shows the
pill of the other designs for comparison.

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
