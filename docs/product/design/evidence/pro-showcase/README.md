# eimir. Pro showcase: visual reference

Owning issue: #2310. Contract: [Pro showcase](../../pro-paywall.md#pro-showcase-product-owner-request-of-2026-11-26).

No image model was available, so the reference is a clickable Compact mockup.
It is not product code. It was built against `main` at `1b81814ed` and uses
token values read from the running `connected` app design in Light and Dark.
The general page was reviewed before the mockup was made:

- [current `main`, Free, Light](baseline-main-general-light.webp)

The Product Owner rejected mockup v1 (too fast, a wavy map line, a monotonous
film, too dull to invite a purchase) and accepted **mockup v2** on
2026-11-26. The v2 captures are at 390 px. Each shows one moment of a moving
scene; the live mockup shows the motion.

- [General, Light, top](mockup-v2-general-light-top.webp): heading, the memory-worlds scene (Mochis with the heart balloon), the next card peeking in, page indicator and the price anchor line.
- [Recap film, Light](mockup-v2-film-light.webp): the collage part of the five-part film.
- [Map and closeness, Light](mockup-v2-map-light.webp): photo pins, the Mochis at both ends and the single soft arc with the distance chip.
- [Games and garden, Dark](mockup-v2-garden-dark.webp): the garden in bloom with a butterfly; scene artwork keeps its colours in Dark.

The scenes use five fictional CC0 sample photos from the curated demo set,
never a couple's own content. The demo data of the local preview is not
shown.

## Implementation captures (real app)

Captured from the running Web app on the local read-only preview (fictional
demo Space; entitlement switched to Free in the preview only). The images
are scaled screenshots of the given viewport widths. Each shows one moment
of a moving scene.

- [390 px, Light, Free, general](app-390-light-general-free.webp): heading, the memory-worlds card on its world tour, indicator, price anchor.
- [390 px, Light, recap film](app-390-light-film.webp) and [map and closeness](app-390-light-map.webp): the current card plays, the indicator follows.
- [430 px, Light, general](app-430-light-general.webp): the Mochis with the rising balloon.
- [360 px, Dark, garden](app-360-dark-garden.webp), [price and plans](app-360-dark-price-and-plans.webp) and [catalogue](app-360-dark-catalogue.webp) with the ten worlds and the storage entry (captured before the "new" tags were removed for the relaunch).
- [390 px, Light, memory map context](app-390-light-memory-map-context.webp): the scene replaces the two-circle hero; the three benefits stay.
- [390 px, Light, Pro active](app-390-light-active.webp): gallery kept, no price anchor and no plans.
- [320 px, 200 % text](app-320-light-text-200.webp): no horizontal page scroll. The pane's browser has no German hyphenation dictionary, so long headings break anywhere here; `hyphens: auto` applies where the WebView has one.
- [1024 px, Expanded](app-1024-light-expanded.webp): cards stay phone-width in the reading column, the first card in view is current, and the next card rests at its still frame.

Reduced motion is covered by unit tests and the stylesheet: every animation
is declared inside `prefers-reduced-motion: no-preference`, and a scene
that never played shows the same still frame as the 1024 px capture's
second card.

## Scene words fit their fields, no "new" tags (relaunch fix)

Captured from the real `ProPaywallPage` and its real stylesheets on the local
Vite server (a throwaway harness page rendered it; the API is not needed for
the paywall). Animations were paused at the moment the words are visible.

- [390 px, Light, recap film](fit-390-light-recap.jpg) and [map and closeness](fit-390-light-map.png): `art.recapFact` and `art.onceMessage` sit inside their fields.
- [390 px, Dark, game card](fit-390-dark-game.jpg): `art.gameQuestion` fits the widened card.
- [390 px, Dark, catalogue](fit-390-dark-catalogue-no-new.jpg): no "new" tags on any entry.
- [1024 px, Expanded, Light, map](fit-1024-light-expanded-map.jpg): the same fit in the Expanded gallery.
