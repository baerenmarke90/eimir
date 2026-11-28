# #2373 A marker sweep behind the quoted words of a recap highlight

Captured with Playwright Chromium from `web/e2e/tests/automatic-recaps.spec.ts`, run with `SCREENSHOT_EXPORT_DIR`, with mocked recap data.

- `recaps-quote-marker-sweeping-<width>-<theme>.png`: a photo highlight about 550 ms after it was shown (360 Light, 390 Dark). The marker sweeps in behind the partner's quote.
- `recaps-quote-marker-rest-<width>-<theme>.png`: the same scene at rest.
- `recaps-own-words-photo-quote-*.png` and `recaps-own-words-words-quote-*.png`: the static marker with reduced motion on a photo highlight and on a text-led highlight, at 390 Light, 430 Dark and 1280 Dark (Expanded).

## Behaviour checked

- **Marker sweep** (`a marker sweeps behind the quoted words …`):
  - the quote's text exists once in the document, and the marker copy is drawn from `data-text` and is `aria-hidden`;
  - exactly one `eimir-motion-recap-marker-sweep` animation runs when the scene is shown;
  - it finishes on its own clock with the whole marker uncovered;
  - nothing is written.
- **Own words** (`quotes and the mutual-reaction line …`, reduced motion): the quote text and the reaction line are unchanged, there is no horizontal overflow, and axe finds no violation in the reader with the marker present.

## Outstanding

Pixel device acceptance of the sweep's rhythm on a real screen.
