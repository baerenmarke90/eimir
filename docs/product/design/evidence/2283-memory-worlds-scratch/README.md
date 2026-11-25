# Evidence: Rubbellos (#2283, stage 6)

Captures for the Rubbellos (scratch card) memory world in Momente ›
Erinnerungen: a lottery ticket from a dispenser whose golden heart is scratched
free to reveal a memory, with three silver coins for a bonus. Earlier stages
are listed in [`../2283-memory-worlds/`](../2283-memory-worlds/README.md) and
the sibling `2283-memory-worlds-*` folders.

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data (three memories without photos).

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-scratch-390-light.png` | A fresh ticket under the dispenser: the golden heart with the scratch stamp, three silver coins, the win line and the rules |
| `memory-worlds-scratch-revealed-390-light.png` | After the reveal button (the keyboard and screen-reader alternative to scratching): the memory in the heart, the coins and the win stamp; axe has no WCAG A/AA violations |
| `memory-worlds-scratch-revealed-390-dark.png` | The revealed ticket in Dark, with the open-in-diary action and the next ticket |
| `memory-worlds-scratch-1280-dark.png` | Expanded in Dark: the ticket centred at the world reading width |

## Behaviour exercised

- The reveal button uncovers the memory without scratching and the
  open-in-diary link appears (asserted in the spec).
- Reveal thresholds (heart 55 %, coins 45 %), the bonus rules, the tear-off
  flight and dust, and reduced motion are covered by `scratchTicket.test.ts`,
  `ScratchCardWorld.test.tsx` and `motion/scratchCard.test.ts`.

## Not covered here

- Scratching the canvas foil with a finger: jsdom has no 2D canvas and the
  e2e uses the reveal button; the feel and the pixel sampling need the device
  check of the planned test release.
- On-device acceptance on the Pixel for this production build.
