# Evidence for #2203: Einblicke cleanup

Captured by `web/e2e/tests/today-pro-insights.spec.ts` with mocked API data
(Chromium, local run). In full-page captures the Compact navigation bar overlays
the scrolled content; this comes from the capture method, not from the layout.

| File | State |
| --- | --- |
| `verlauf-ratings-390-light.webp` | Verlauf with the retained-ratings line, Compact 390 px, Light |
| `verlauf-ratings-320-dark-200pct.webp` | Same at 320 px, Dark, 200 % text, reduced motion |
| `verlauf-320-dark-200pct.webp` | Verlauf without retained ratings, 320 px, Dark, 200 % text |
| `verlauf-1280-light.webp` | Verlauf, Expanded 1280 px, Light |
| `monat-390-light.webp` | Monat without the handwriting slogan, Compact 390 px, Light |

The spec deletes the ratings, then checks the status message and that the line
stays gone after the user navigates away and back. It also checks that the
retired weekly review is never requested, and that Free Spaces can delete
retained ratings from the gate. Every view passes axe with no violations and
shows no horizontal overflow.
