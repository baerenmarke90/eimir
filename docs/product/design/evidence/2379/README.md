# #2379 Recap reader: round fullscreen toggle, flush film strip, right-aligned title menu

Captured with Playwright Chromium against the e2e bundle, with the mocked recap data of `web/e2e/tests/automatic-recaps.spec.ts` (film variety fixture, collage forced to the `strip` layout) and the mocked profile of `web/e2e/tests/partner-nickname.spec.ts`. The capture specs were throwaway copies and are not part of the repository.

- `evidence-reader-top-<width>-<theme>.png`: the top row of the reader at 390 Light, 390 Dark and 1280 Light. The fullscreen toggle is the same round 44 px control as the three-dot menu beside it (measured: both 44 x 44 px, 12 px apart).
- `evidence-strip-end-<width>-<theme>.png`: a film-strip page after its slide has run to its end (390 Light, 390 Dark, 1280 Light), with normal motion. The third picture ends flush at the card's right padding; the first one slides out on the left. Before the change the moving box carried its own clip edge with it, so the last picture was cut off beside an empty gap.
- `evidence-profile-header-<width>-<theme>.png`: the Profile header at 390 Light, 390 Dark and 1280 Light. The three-dot menu closes the row at the right edge.

## Measured

| Check | Result |
| --- | --- |
| Strip, 3 pictures, end of slide, 390 px | last picture right edge 362 px, card right edge 370 px (the 8 px strip padding) |
| Strip, 3 pictures, end of slide, 1280 px | last picture right edge 992 px, card right edge 1000 px |
| Profile menu trigger right edge vs. heading right edge | equal at 390 px (370 = 370) and 1280 px (1024 = 1024) |
| Fullscreen toggle vs. menu trigger | both 44 x 44 px at 390 and 1280 px |

## Outstanding

Pixel acceptance on a real device. Reduced motion is unchanged: the strip stays static and is clipped by the card as before.
