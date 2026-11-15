# Browser evidence

Playwright exercises the real Web shell with mocked API and entitlement
data. The app opens a film clue immediately on a single phone. The title
stays hidden until requested, the released title receives keyboard focus,
and the clue remains readable. A film may be skipped at any time.
The next prompt receives focus and Back restores the initiating shelf entry.

| State | Evidence |
| --- | --- |
| Compact Games shelf | [390 px Light, top](games-390-light.webp), [scrolled to Paar Minuten](games-390-light-scrolled.webp) |
| Expanded Games shelf | [1280 px Dark](games-1280-dark.webp) |
| Film clue | [390 px Light](paar-minuten-390-light.webp), [390 px Dark](paar-minuten-390-dark.webp), [1280 px Dark](paar-minuten-1280-dark.webp) |
| Title revealed | [390 px Light](paar-minuten-revealed-390-light.webp), [390 px Dark](paar-minuten-revealed-390-dark.webp), [1280 px Dark](paar-minuten-revealed-1280-dark.webp) |
| Story round after advancing | [390 px Light](paar-minuten-story-390-light.webp) |
| Game with 200% root text | [320 px, clue](paar-minuten-320-light.webp), [scrolled to action](paar-minuten-320-light-action.webp) |
| Revised Date Ideas category and count | [390 px Dark](date-inspiration-390-dark.webp) |

The Games browser spec keeps the four shelf entries in order. It checked
open → read → reveal → advance → return at 320 (200% text), 360, 390
(Light/Dark), 430 and 1280 px with reduced motion. The primary control is
at least 44 px high, and axe found no violations in the revealed card.
The 390 px Light test skipped the remaining film solutions, visited each
of the 24 prompts once, and returned to the original clue with the title
hidden. The Free component test checks that the four entries are previews
and cannot open gameplay.

Dates still use the existing flows. The focused browser tests cover
browsing and filters, ordinary Wish adoption and later conversion, direct
Plan creation, leaving a clean draft, retry and the Free Pro paywall.
The calendar handoff test verifies the dated Plan path. The Web and native
container share this product UI. This change adds no device capability.
