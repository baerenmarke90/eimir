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
- `garten.webm` and `garten.webp` (poster): the Playwright growth fixture of
  `web/e2e/tests/garden-game.spec.ts` ("garden grows with news, bouquets, the book and visitors").
  The public demo Space has only a sparse garden, so a populated, mocked garden is shown instead.
  The video was recorded at 390 x 844 and cropped; it contains no audio.

The device frame is the Google Pixel 6 Pro from devices.css (MIT), see
`site/assets/devices.css-LICENSE.txt`.
