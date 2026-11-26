# Evidence: Fotoautomat (#2283, stage 3)

Captures for the Fotoautomat memory world in Momente › Erinnerungen, in its two
device-local styles: Klassisch (a sixties cabin with coin, curtain and drying
strip) and Modern (a booth with camera, countdown and printer). Earlier stages:
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md) and
[`../2283-memory-worlds-cloud/`](../2283-memory-worlds-cloud/README.md).

## Sources

- `memory-worlds-booth-*.png`: written by
  `web/e2e/tests/memory-world-selection.spec.ts` (`VISUAL_EVIDENCE_DIR`) on
  mocked API data.
- `preview-booth-*.jpg`: the product preview (`web/preview`, recorded
  fictional demo Space) in the in-app browser at half scale, with the recorded
  world switched locally to `booth`. The recording itself is unchanged.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-booth-classic-390-light.png` | Klassisch: the cabin with the sample strip, coin slot and develop dial; the Klassisch/Modern switch sits in the row of the world switch entry |
| `memory-worlds-booth-modern-390-light.png` | Modern after switching: camera, display "Bereit" and the print action; axe has no WCAG A/AA violations |
| `preview-booth-modern-printing-390-light.jpg` | A run: the flash and the display counting the shots (1/4) |
| `preview-booth-modern-strip-390-light.jpg` | The printed strip of four pictures (notes and a photo) with the span of years and the follow-up actions |
| `preview-booth-modern-390-dark.jpg` | Modern in Dark |
| `preview-booth-classic-390-dark.jpg` | Klassisch in Dark, with the coin hint below the cabin |
| `stack-plain-notes-390-dark.png` | Product Owner correction in this PR: Stapel notes (memories without a photo) are plain paper without ruled lines |
| `preview-booth-classic-1280-light.jpg` | Expanded: the cabin centred at the world reading width; the style switch and the world switch stay at the ends of the toolbar row |

## Behaviour exercised

- The style switch toggles and survives a reload (since #2283's world switch follow-up it sits right below the booth heading)
  (asserted in the spec); runs of both styles, the viewer dialog with focus
  return, hanging a strip on the line and putting it in the tin are covered by
  `PhotoBoothWorld.test.tsx`.

## Not covered here

- On-device acceptance on the Pixel for this production build.
- Hyphenation: at the smallest note size the text uses `hyphens: auto` with the
  document language. The in-app preview browser has no German hyphenation
  dictionary and breaks a long word without a hyphen; the Android WebView
  hyphenates German.
