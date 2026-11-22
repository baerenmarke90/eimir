# Evidence for #2210: Einblicke removed

Captures come from the existing browser specs on this revision, run locally in
Chromium with mocked API data. In full-page captures the Compact navigation bar
overlays the scrolled content; this comes from the capture method, not from the
layout.

| File | State |
| --- | --- |
| `more-390-dark.webp` | Mehr without the Einblicke entry, Compact 390 px, Dark |
| `more-320-dark.webp` | Same at 320 px, Dark |
| `more-1280-dark.webp` | Same at Expanded 1280 px, Dark |
| `more-free-390-light.webp` | Mehr for a Free Space: two Pro marks remain, Compact 390 px, Light |

Wir no longer shows the weekly brief hint, and recaps no longer have a
good-days scene. Unit tests (`recaps.test.ts`, `MoreOverviewPage.test.tsx`)
and the recap browser specs cover both; neither adds new UI.
