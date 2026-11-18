# Evidence: first-run Wir, full-screen garden and the play-mode choice (#2048)

Captured on 2026-11-18 from this branch (after `1756d84c6`, plus the full-screen and
evidence commit that adds this file).

## How it was captured

- **Garden and Wish detective**: the branch's web client on a local Vite server against
  the local demo instance (signed in as Lea), Chromium via Playwright, reduced motion.
  Device clock in the evening/night, so the garden shows the moon and no sun.
- **First-run Wir**: the `quiet-hints.spec.ts` fixture (a new, empty Free Space without
  a partner) with the Wir design answered as the default `connected`, Chromium.
- **Play-mode choice at 390 px**: the `wish-detective.spec.ts` fixture.

| File | Shows |
| --- | --- |
| `wir-first-run-solo-390-light.png`, `-390-dark.png` | First sign-in alone: the dashed partner place invites, welcome, filled first-moment action, quiet invitation link, no daily-quote Pro teaser |
| `wir-first-run-solo-1280-dark.png` | The same on Expanded |
| `wir-first-run-solo-320-200pct.png` | 320 CSS px with 200 % text: both portraits fit, no sideways scroll (measured overflow 0 px; it overflowed before) |
| `garden-fullscreen-button-390-light.png`, `-dark.png` | The full-screen button on the garden frame |
| `garden-fullscreen-844x390-light.png`, `-dark.png` | The garden in full screen, landscape, covering the screen; close button and title chip only |
| `garden-page-1280-light.png`, `-dark.png` | The garden page on Expanded after closing full screen (focus returns to the full-screen button) |
| `play-mode-choice-390-light.png` | The shared choice "each on your own phone" / "together on one phone" |
| `wish-detective-1280-light.png`, `-dark.png` | The same choice on Expanded |

## Not covered here

- The remote game screens themselves (question, clues, guessing, waiting, results): the
  local demo backend does not run this branch's new endpoints. They are covered by the
  component tests in `RemoteCoupleGames.test.tsx` and the backend integration tests;
  the composition follows `references/wir-start-garden-remote-games/`.
- The moonbow animation (only after watering) and the picture/heart naming field: covered
  by component tests, not captured.
- Native Android: landscape lock and release, camera capture without a gallery copy and
  the new push previews still need the Pixel check.
