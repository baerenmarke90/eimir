# Evidence for #2194 — weekly brief hint on Wir

Captured by `web/e2e/tests/today-pro-insights.spec.ts` with mocked API data
(Chromium, local run). Full-page captures show the Compact navigation bar over
the scrolled content; that is an artifact of full-page screenshots.

| File | State |
| --- | --- |
| `wir-hint-390-light.webp` | Compact 390 px, Light: the quiet hint below the couple hero and check-in |
| `wir-hint-320-dark-200pct-reduced-motion.webp` | 320 px, Dark, 200 % text, reduced motion; copy and action hyphenate instead of clipping |

The same spec asserts that Free Spaces never see the hint or read the brief,
that the action links to the brief of the last completed week, and that the
page has no horizontal overflow.
