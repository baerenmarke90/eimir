# Screens on the public eimir.de site

Real captures of the Web app at a 390 x 844 CSS-pixel smartphone viewport, taken on 2026-11-18
from a build of `main` at that date. `tools/site/build_main_site.py` copies them into the static
site and fingerprints their file names, so a changed capture is never served from a stale cache.
Refresh them whenever Wir, Momente, Tagebuch, Garten, Rückblicke, Eure Geschichte or Planen change
materially.

- `wir`, `momente`, `planen`, `geschichte`, `rueckblicke`, `tagebuch`: the canonical public demo
  Space (fictional data only, see `docs/DEMO-SPACE.md`), 3x, with the demo banner hidden and 44 px of
  top inset so the camera cut-out of the device frame does not cover content.
- `tagebuch-lang`: the Diary tab of the same Space, scrolled in 700 px steps and stitched into one
  tall image. The site scrolls it through the device screen with a CSS scroll-driven animation.
- `garten.webp`: the garden screen of the public demo Space (neutral text, 44 px top inset). The
  animated scene is laid over it.
- `garten-zeitraffer.svg`: the app's own garden scene in six states over a year (day 1, 3 weeks,
  2 months, 4 months at night, 6 months in autumn, 9 months in winter), exported from the Playwright
  fixtures of `web/e2e/tests/garden-game.spec.ts` (mocked garden data and clock). One file contains
  the six scenes, the garden stylesheets (`GardenGamePage.css`, `GardenSeasonArt.css`,
  `GardenAmbience.css`, `GardenGrowth.css`, `GardenRareVisitors.css`) and the resolved design
  variables, so the app's CSS animations run endlessly. CSS cross-fades the states and moves the
  view from left to right. Re-export it whenever the garden art changes.
- `geschichte-lang.webp`, `geschichte-zeitverlauf-0..3.webp`: Eure Geschichte of the demo Space as one
  tall capture (taken while the timeline slider is scrubbed, so the page is in its expanded state)
  plus four frames of the timeline section while scrubbing back through the months. The site scrolls
  the page and cross-fades the frames over the timeline.

The device frame is the iPhone 18 Pro from react-mockframe 1.3.0 (MIT, adapted from Marvel
devices.css), see `site/assets/iphone-frame-LICENSE.txt`. Its 402 x 874 pt screen matches the
390 x 844 px captures almost exactly.
