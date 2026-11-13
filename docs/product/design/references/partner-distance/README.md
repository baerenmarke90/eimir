# Partner distance: generated visual product reference (#1792)

Compact (390 px, Light) composition reference for the #1792 UI slices, made
under the Partner-App Experience Standard section 9A.

- **Baseline:** `main` at `096b4c781`.
- **Wir composition:** the approved #1790 slice A reference
  `docs/product/design/references/wir-feeling/01-wir-feeling-states.jpg` (commit
  `2460f237`). It shows the target Wir hero: avatars with vibe and energy chips,
  the note dot, eyebrow, couple name, duration line, private quote,
  "Euer Moment" and the four-tab navigation. The distance line is inserted below
  the duration line and moves the following content down by one row; all
  existing functions stay unchanged.
- **Settings:** follows the existing settings page anatomy (back button,
  eyebrow, serif title, white cards) of the Wir settings at the same baseline.
- **Map:** reuses the MapLibre/OpenStreetMap presentation; the dedicated
  "where we are" task (Product Owner, 2026-11-13).

| File | Content |
| --- | --- |
| `01-partner-distance-compact.jpg` | 1. Wir with the distance line. 2. One-time start sheet. 3. Settings › Relationship › Location & distance (Pro, stop always reachable, background toggle). 4. Prominent disclosure before "Allow all the time" (Google Play requirement, #1802). 5. "Where we are" map. |
| `02-distance-line-states.jpg` | Distance line states: far, nearby (< 2 km), earlier value (> 2 h), own location missing (viewer only), unavailable (no line, no reason). |

The distance line uses the wording chosen by the Product Owner on 2026-11-13 (variant V2, without "approximately"): de-DE "340 km zwischen euch" with a heart, and "Ihr seid gerade ganz nah beieinander" below 2 km. Values stay rounded bands. Other copy is de-DE placeholder for i18n keys. The images guide composition and
hierarchy; they are not pixel locks. Dark, about 360 px, large text and Expanded
evidence belong to the implementation PRs.
