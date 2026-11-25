# Evidence: memory worlds, stage 1 (#2283)

Captures for the first stage of the Erinnerungswelten in Momente › Erinnerungen:
the per-person world choice, the Free world Stapel and the Pro world Plattenkiste.
Story stays the default and is unchanged.

## Sources

- `memory-worlds-*.png`: written by `web/e2e/tests/memory-world-selection.spec.ts`
  (`VISUAL_EVIDENCE_DIR`), on mocked API data.
- `preview-*.jpg`: the product preview (`web/preview`, recorded fictional demo
  Space) in the in-app browser at half scale, with the recorded world switched
  locally to `stack` and `crate`. The recording itself is unchanged in this PR.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-free-390-light.png` | Mehr › Darstellung, Free: the Erinnerungswelten section with Story as the current world |
| `memory-worlds-free-pro-preview-390-light.png` | The world sheet for Free with the Plattenkiste selected: Pro mark, the Pro hint and "Pro entdecken" instead of saving; nothing is written |
| `memory-worlds-pro-saved-390-dark.png` | Pro, Dark: the Plattenkiste saved |
| `memory-worlds-pro-320-light.png`, `-430-light.png`, `-1280-light.png` | The sheet at 320, 430 and Expanded 1280 with reduced motion; no horizontal overflow (asserted) |
| `memory-worlds-pro-360-large-text.png` | The sheet at 360 with 200 % text; the save action stays reachable (asserted) |
| `memory-worlds-stack-390-dark.png` | Erinnerungen with the Stapel, Dark, after the calm entrance; position 1 of 3 and the world switch entry |
| `memory-worlds-crate-playing-390-light.png` | Erinnerungen with the Plattenkiste after Enter on the crate: the record is on the platter and plays (`data-phase="playing"` asserted); axe has no WCAG A/AA violations in the world |
| `preview-stack-390-light.jpg` | Demo data: the Stapel with a text-only lead (no photo in the recording) |
| `preview-stack-after-swipe-390-light.jpg` | After a sideways swipe: the top print goes to the back, position 2 of 8 |
| `preview-crate-playing-390-light.jpg` | Demo data: a record playing, clock and lyric line advancing with the tonearm |
| `preview-crate-390-dark.jpg` | The Plattenkiste in Dark |
| `preview-crate-playing-1280-light.jpg` | Expanded: the world centred at its reading width |

## Behaviour exercised

- Open → choose → save → observe → return: Free saves Stapel; Pro saves the
  Plattenkiste, keeps it after a reload and returns to Story; the "Welt
  wechseln" entry in Erinnerungen leads to the setting with the current world.
- Downgrade: a saved Plattenkiste stays in effect without Pro and is named as
  kept; no write happens.
- Stapel: swipe to the next print. Plattenkiste: pull a record, play, clock and
  progress advance; put back.

## Not covered here

- On-device acceptance on the Pixel for this production build. The prototype
  these worlds are ported from was measured on the device (frame recordings,
  traces); the port keeps its motion but has not been re-measured.
- Photo-heavy selections in the e2e captures (the mocked selection has no
  photos); the preview recording covers one photo card in the Stapel.
