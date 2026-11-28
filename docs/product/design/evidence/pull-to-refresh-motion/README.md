# Pull-to-refresh motion evidence

Evidence for the pull-to-refresh motion correction (indicator out of flow, transform-only movement, spring release, no clipping or covering by page chrome).

## How it was captured

- Device: Pixel 10 Pro Fold, inner display, Capacitor debug build (`de.eimir.app.debug`) of this branch against the production API.
- The screenshots were taken with `adb screencap`. The disc was **placed at fixed offsets through the WebView DevTools** (a pull offset of 36 px and 126 px from the top of the main column), not by a finger. The page itself was not scrolled or changed.
- Both images are cropped to the area under test: status bar, avatars, photos and names are not part of the committed evidence.

| File | What it shows |
| --- | --- |
| `planen-disc-at-commit-distance.webp` | Planen, disc at the commit position (36 px, fully shown), in front of the segmented control. |
| `planen-disc-pulled-deep-over-filter-bar.webp` | Planen, disc pulled deep (126 px), in front of the Offen/Erlebt filter bar instead of being cut off or covered. |

## What this does not cover

- A real finger pull and its feel: the release spring and the exit slide were not recorded. The owner tested the debug build by hand on Wir, Planen, Listen and the diary and accepted it.
- Expanded/Web, Light/Dark, large text and reduced motion on the device. Reduced motion and the spring settle are covered by unit tests (`usePullToRefresh.test.tsx`).
- Wir was checked on the device with the real account (disc in front of the relationship duration and the distance heart). Those screenshots contain private photos and are not committed.
