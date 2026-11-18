# Wir: calm arrival without jumps, shared moment without controls

Evidence for the Wir arrival rework: the modules wait, invisibly in their own place, until the hero and the daily quote above them have stopped changing; the quote and the portrait photos fade in; the shared moment shows nothing on top of the photograph.

Captured from the running app (local test instance, demo Space, web served from the PR branch) in the desktop app's browser pane. This is not a physical device.

Files:

- `moment-430-light.webp`, `moment-430-dark.webp`: Compact, the shared moment with no progress marks and no pause control.
- `moment-1280-light.webp`: Expanded; the second picture of the rotation is on show.
- `moment-430-light-200-text.webp`: root font size set to 200 % as an approximation of large text; no horizontal overflow.

## Measurement: does visible content jump while data arrives?

Both builds were served against the same local API with 2.5 s of artificial latency on the daily quote, the daily check-in and the portrait request, and one animation frame was sampled at a time (position of the shared moment module, its opacity, the height of the quote and of the hero).

| Build | The module is visible | Visible jumps afterwards |
| --- | --- | --- |
| main (8a95f238b) | fully visible at 2.6 s | +119 px at 4.26 s (quote arrives) and +36 px at 4.45 s (check-in row arrives) |
| this branch | starts to appear at 5.6 s, after the quote | none; the module is placed while it is still invisible and then fades in at its final position |

Also checked in the app: the picture rotation still changes every 8 s without the controls, and no button is left inside the shared moment frame.

Not covered: a physical device, the other App designs, reduced motion in a browser.
