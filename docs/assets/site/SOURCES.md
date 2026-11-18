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
- `garten.webp`: still of the garden screen from the Playwright growth fixture of
  `web/e2e/tests/garden-game.spec.ts` ("garden grows with news, bouquets, the book and visitors"),
  with the same 44 px top inset. The public demo Space only has a sparse garden, so a populated,
  mocked garden is shown instead.
- `garten-scene.svg`: the garden scene of that fixture exported as a standalone SVG. It contains the
  scene markup, the garden stylesheets (`GardenGamePage.css`, `GardenSeasonArt.css`,
  `GardenAmbience.css`, `GardenGrowth.css`, `GardenRareVisitors.css`) and the resolved design
  variables, so the app's own CSS animations (falling leaves, swaying plants, clouds, animals) run
  endlessly. The site lays it over the still at the scene position and pans it slowly. Re-export it
  whenever the garden art changes.

The device frame is the iPhone 18 Pro from react-mockframe 1.3.0 (MIT, adapted from Marvel
devices.css), see `site/assets/iphone-frame-LICENSE.txt`. Its 402 x 874 pt screen matches the
390 x 844 px captures almost exactly.
