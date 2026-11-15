# Browser evidence

The images below are from the Playwright app with mocked API and entitlement
data. The existing Games and Date Ideas shells remain in place.

| State | Evidence |
| --- | --- |
| Compact Games shelf | [390 px Light, top](games-390-light.webp), [scrolled to Paar Minuten](games-390-light-scrolled.webp) |
| Expanded Games shelf | [1280 px Dark](games-1280-dark.webp) |
| Open game | [390 px Light](paar-minuten-390-light.webp), [390 px Dark](paar-minuten-390-dark.webp), [1280 px Dark](paar-minuten-1280-dark.webp) |
| Open game with 200% root text | [320 px, card start](paar-minuten-320-light.webp), [scrolled to action](paar-minuten-320-light-action.webp) |
| Revised Date Ideas category and count | [390 px Dark](date-inspiration-390-dark.webp) |

In the Games browser spec all four entries stay in order. Open the new deck,
read the first card, advance with Enter, check the announced card title and
visible rules, cycle back after the last card and return to the initiating
control. The flow passed at 320 (200% text), 360, 390 (Light/Dark), 430 and
1280 px with reduced motion. The primary target is at least 44 px high and
axe found no violations in the deck. The Free component test checks that
the four entries are previews and cannot start gameplay.

The existing Date Ideas browser journeys passed for the revised data:
browse/filter, save through the Wish composer, return with the filter intact,
convert into a Plan, plan directly, abandon an untouched draft, handle
network failure, and route a Free Space to the existing Pro paywall. The
variants cover 320/360/390/430 and 1280 px, including Light/Dark. PostgreSQL
API tests also confirmed authorization, filters, image resolution and
adoption. Changes use the existing Web surface across the browser and native
container, with no Android wrapper or device capability changes.
