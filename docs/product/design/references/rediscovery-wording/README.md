# Rediscovery wording reference (#1790 C2)

Generated visual reference for slice C2 of #1790: rediscovery cards vary their
wording instead of using a bare date as the title.

- Baseline: `main` `096b4c781` (2026-11-13), public demo, persona Lea.
- Method: DOM-only composition on the existing Wir "Erinnert ihr euch?" card and
  the Momente "Wisst ihr noch?" featured card; nothing was saved.
- Reviewed existing screen/functions: Wir retrospective section (heading,
  "Für heute ausblenden", photo, title, date, "Erinnerung ansehen"), Momente
  Erinnerungen tab (kicker, featured card, "Zeit für euch" links, tapestry),
  shell navigation and the floating add action. All remain unchanged.

| File | State |
| --- | --- |
| `01-rediscovery-wording-390-light.webp` | 390 px Light: untitled entries with a variant headline, titled entries with a variant secondary line, on both surfaces |
| `02-rediscovery-wording-390-dark.webp` | Same states in Dark |
| `03-rediscovery-wording-360-light.webp` | Same states at 360 px |

Composition notes:

- An authored title stays the headline; the variant fills the secondary line
  next to the date ("Ein Donnerstagnachmittag · 13. November 2025").
- Without a title, a variant becomes the headline and the date moves to the
  secondary line.
- At 360 px the date must not break internally; the secondary line wraps at
  the separator instead (the 360 px titled Wir panel shows the problem the
  implementation avoids).
- Place names are shown without a German preposition because the grammatical
  gender of an authored place name is unknown.
