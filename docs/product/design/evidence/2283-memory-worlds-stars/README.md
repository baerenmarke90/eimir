# Evidence: Sternbild (#2283, stage 8)

Captures for the Sternbild memory world in Momente › Erinnerungen: the
memories as stars on an old star chart above a hill, where the two of them sit
under a blanket next to a telescope, joined by their constellation line. Earlier
stages are listed in [`../2283-memory-worlds/`](../2283-memory-worlds/README.md)
and the sibling `2283-memory-worlds-*` folders.

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data. The sky follows the clock of the
machine that ran the spec (evening, so the captures show the night sky).

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-stars-390-light.png` | The star chart with season marks, moon, a shooting star and the couple on the hill; the card below names the lit star ("Stern 3 von 3") and holds its memory |
| `memory-worlds-stars-moved-390-light.png` | After ArrowRight from the focused star: one star is pressed and the card follows; axe has no WCAG A/AA violations |
| `memory-worlds-stars-390-dark.png` | Dark: the lit star with its halo, the constellation line and the card in the dark chart palette |
| `memory-worlds-stars-1280-dark.png` | Expanded in Dark: the chart centred at the world reading width |

## Behaviour exercised

- Arrow keys move along the stars, the pressed star and the card follow, and
  the lit star's memory can be opened (asserted in the spec).
- Shooting stars by keyboard and swipe, tracing the constellation, the
  telescope view, newborn stars, day, dawn, night and winter with fake timers,
  and reduced motion are covered by `ConstellationWorld.test.tsx`,
  `starChart.test.ts` and `motion/constellation.test.ts`.

## Not covered here

- Day, dawn and winter skies as captures (covered by unit tests with fake
  timers).
- On-device acceptance on the Pixel for this production build.
