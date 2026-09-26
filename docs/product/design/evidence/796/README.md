# #796 implementation evidence

Captured from the actual Web shell and route components with `web/e2e/tests/optional-product-tour.spec.ts` and intercepted API fixtures on 2026-09-26. The fixtures use a populated partner Space and an intentionally disabled daily quote; screenshots verify UI composition, not backend data correctness.

| State | Screenshot |
| --- | --- |
| First Mehr visit, Compact 390, Light | [Mehr invitation](tour-more-compact-light.png) |
| Wir step, Compact 390, Light | [Wir orientation](tour-wir-compact-light.png) |
| Wir step, Expanded 1280, Dark | [Expanded orientation](tour-wir-expanded-dark.png) |
| Wir step, Compact 360, Dark, 200% text and reduced motion | [Large-text orientation](tour-wir-360-dark-large-text-reduced-motion.png) |
| Wir step, Compact 430, Light | [430 orientation](tour-wir-430-light.png) |

The browser journey opens the first-use invitation, visits real Wir → Momente → Planen routes, opens the actual Quick Create sheet, dismisses it, replays from Mehr, and dismisses the replay. A second browser case scrolls to and opens Settings while the invitation is present, then returns to Mehr without a repeated invitation. At 360/200% the orientation card scrolls internally while both actions stay visible; the document has no horizontal overflow. Unit tests verify account/Space isolation and persistence of dismissal; those details are not visible in screenshots.
