# Evidence for #2197 — private weekly brief

Captured by `web/e2e/tests/today-pro-insights.spec.ts` with mocked API data
(Chromium, local run). Full-page captures show the Compact navigation bar over
the scrolled content; that is an artifact of full-page screenshots.

| File | State |
| --- | --- |
| `personal-390-light.webp` | Compact 390 px, Light |
| `personal-390-dark.webp` | Compact 390 px, Dark |
| `personal-320-dark-200pct.webp` | 320 px, Dark, 200 % text, reduced motion |
| `personal-1280-light.webp` | Expanded 1280 px, Light |

The same spec switches between the shared and private view, checks the URL keeps the
choice, runs axe without violations and checks there is no horizontal
overflow.
