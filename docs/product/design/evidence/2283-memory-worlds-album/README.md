# Evidence: Fotobuch (#2283, stage 5)

Captures for the Fotobuch memory world in Momente › Erinnerungen: a photo book
laid out from the memories by season, whose pages turn in 3D. Earlier stages:
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md),
[`../2283-memory-worlds-cloud/`](../2283-memory-worlds-cloud/README.md),
[`../2283-memory-worlds-booth/`](../2283-memory-worlds-booth/README.md) and
[`../2283-memory-worlds-fridge/`](../2283-memory-worlds-fridge/README.md).

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data: three memories without photos, so
the cover shows the quote mark instead of a photo.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-album-cover-390-light.png` | The cover with the span of years and the number of moments |
| `memory-worlds-album-page-390-light.png` | After ArrowRight: the season opener (page 2) with the focus ring on the book; axe has no WCAG A/AA violations |
| `memory-worlds-album-cover-390-dark.png` | Dark, back on the cover after Home |
| `memory-worlds-album-1280-dark.png` | Expanded in Dark: the book centred at the world reading width |

## Behaviour exercised

- Arrow keys turn pages and the book's name follows the page (page 2 of n);
  Home returns to the cover (asserted in the spec).
- Page building, PageUp/PageDown/End, the hidden previous/next buttons, the
  end-page restart, opening a memory, the one-time invite and the 3D turn with
  and without reduced motion are covered by `PhotoAlbumWorld.test.tsx` and
  `motion/photoAlbum.test.ts`.

## Not covered here

- On-device acceptance on the Pixel for this production build (drag, fling and
  the cast shadow of the turning page).
- Photo pages with real photos; the mocked selection has none.
