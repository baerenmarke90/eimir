# Evidence: round world switch in the world's top row (#2283 follow-up)

Captures for the "Welt wechseln" entry in Momente › Erinnerungen. It used to
be a labelled pill in a row of its own above every world. Following the
Product Owner decision of 2026-11-26, it is now a round picture of the
current world at the end of the world's top row:

- next to the heading in every world;
- next to the theme circles in Story.

The Fotoautomat's Klassisch/Modern switch moved from that row to right below
the booth's heading. The Expanded-only "Neu entdecken" button above the world
is removed (Product Owner decision, 2026-11-26); pulling down on touch
screens still renews the selection. Earlier stages are listed in
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md) and the sibling
`2283-memory-worlds-*` folders.

## Source

Local Playwright captures of `/story?tab=discover` on the mocked API data of
`web/e2e/tests/memory-world-selection.spec.ts`, with reduced motion. The
`before-*` images are from `main` at `f54181f0f`; the `after-*` images are
from this change.

## What each image shows

| File | Shows |
| --- | --- |
| `before-story-390-light.png` | Before: Story with the separate "Welt wechseln" pill row above the theme circles |
| `before-stack-390-dark.png` | Before: the pill row above the Stapel heading |
| `before-booth-390-light.png` | Before: the Klassisch/Modern switch sharing the pill row |
| `after-story-390-light.png` | Story: the round world picture at the end of the theme-circle row, centred on the circles |
| `after-story-390-dark.png` | The same in Dark |
| `after-story-320-light.png` | Story at 320 px |
| `after-stack-390-dark.png` | Stapel: heading, position and the round world picture in one row |
| `after-stack-1280-dark.png` | Expanded: the same row at the world reading width, with no "Neu entdecken" button above it |
| `after-story-1280-light.png` | Expanded Story: the round world picture at the end of the theme-circle row, no "Neu entdecken" button |
| `after-booth-390-light.png` | Fotoautomat: the round world picture in the heading row, the Klassisch/Modern switch right below the heading |
| `after-fridge-320-light.png` | A long heading wraps inside itself while the round picture keeps its place (320 px) |
| `after-crate-390-dark.png` | Plattenkiste in Dark |

## Behaviour exercised

- `memory-world-selection.spec.ts`:
  - The Plattenkiste's round entry, named "Welt wechseln – gerade: …", leads to the setting.
  - The Fotoautomat's round entry is in the heading row, and its style switch is outside that row.
  - After returning to Story, the round entry ends the theme-circle row.
- `MemoryWorldSwitch.test.tsx`:
  - The link has no visible text and names the current world.
  - It is the last element of the heading row, after the Stapel's position.
  - It is absent outside the Erinnerungen page.
  - The booth's style switch follows the heading row.

## Not covered here

- On-device acceptance on the Pixel.
