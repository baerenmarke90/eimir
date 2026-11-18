# Wir: calm motion for the distance

Evidence for the distance on the Verbunden Wir hero: the pin settles after the arrival and the value follows, a changed value fades over instead of jumping, and a current position makes the pin wiggle once (an earlier position stays grey and still).

Captured from the running app in the desktop app's browser pane engine (Chromium via Playwright against the fixtures of `partner-distance-wir.spec.ts`, web served from the PR branch). This is not a physical device.

Files (Compact, 390 px wide, still frames at rest):

- `distance-390-light-fresh.png`: a current position, brand-coloured pin.
- `distance-390-light-earlier.png`: an earlier position, muted grey pin.
- `distance-390-dark-earlier-reduced-motion.png`: Dark, reduced motion on, earlier position.

Still frames cannot show motion. The frames are taken after the motion has ended, so they show the resting composition only; the layout around the distance is unchanged.

## Measured motion (real Wir view, `prefers-reduced-motion: no-preference`)

Sampled from `Element.getAnimations()` while Wir opened (time since the page started):

| What | Observed |
| --- | --- |
| Slot fade, pin landing, value fade | start 0.44 s / 0.44 s / 0.84 s after the stage starts; the landing finishes at 1.04 s |
| Wiggle of a current position | rotation about the pin's point: -11 deg, +9 deg, -5 deg, +1 deg, then 0 deg; finished at about 2.0 s and stays at 0 deg |
| Earlier position | no wiggle animation exists; the pin is the muted colour |
| Value change (a later read returns another value) | both values are in the DOM during the swap, then only the new one; the leaving copy is removed afterwards |
| Reduced motion | no pin, wiggle, leave or arrive animation runs |

## Not covered

A physical device, the other App designs, a screen recording of the motion, and Expanded/Web beyond what `partner-distance-wir.spec.ts` already covers.
