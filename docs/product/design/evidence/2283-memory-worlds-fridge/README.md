# Evidence: Kühlschranktür (#2283, stage 4)

Captures for the Kühlschranktür memory world in Momente › Erinnerungen: photos
and notes held by colourful magnets on a fridge door. Earlier stages:
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md),
[`../2283-memory-worlds-cloud/`](../2283-memory-worlds-cloud/README.md) and
[`../2283-memory-worlds-booth/`](../2283-memory-worlds-booth/README.md).

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data: three memories without photos, so
the door shows notes.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-fridge-390-light.png` | The door after the notes went up: notes under tape, the magnet letters "WIR ♥ UNS"; nothing is cut off at the edges |
| `memory-worlds-fridge-card-390-light.png` | Enter on a focused note opens it as a card; the open-in-diary action is a label-tape strip across the card's edge (as in the prototype); axe has no WCAG A/AA violations |
| `memory-worlds-fridge-390-dark.png` | Dark, after closing the card with Escape: focus returned to the note (focus ring), and the note keeps the place it was moved to by the arrow key |
| `memory-worlds-fridge-1280-dark.png` | Expanded in Dark: the door centred at the world reading width |

## Behaviour exercised

- Arrow keys move a focused note (announced: "… hängt jetzt weiter rechts");
  Enter opens it; Escape closes and returns focus (asserted in the spec).
- Dragging by pointer, the scroll-or-drag decision on touch, the edge
  announcement and reduced motion are covered by `FridgeDoorWorld.test.tsx`.
- The notes do not sway (Product Owner decision from the prototype review).

## Not covered here

- On-device acceptance on the Pixel for this production build.
- Photos on the door with the demo data: the in-app preview pane rendered the
  page cropped during this session, so no preview captures were taken.
- Hyphenation: the in-app preview browser has no German hyphenation
  dictionary and breaks long words without a hyphen; the Android WebView
  hyphenates German (`lang="de"`, `hyphens: auto`).
