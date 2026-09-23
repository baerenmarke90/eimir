# eimir. identity system — issue #1225 design proposal

**Status:** Owner-selected direction, documented in [issue #1225](https://github.com/baerenmarke90/eimir/issues/1225#issuecomment-5797850494), with a Web identity migration in this branch.

## Provenance and decision

Philipp selected the **second app-logo reference**: two overlapping warm and cool circles, a white lowercase `e` loop and a lower-right dot. The icon geometry, icon categories, outline/filled/duotone behavior, states, three color worlds and gentle app language come from the **third owner reference** in [issue comment #5784651622](https://github.com/baerenmarke90/eimir/issues/1225#issuecomment-5784651622). These two owner images, rather than earlier assistant explorations, are the sources for this proposal.

The app logo is the brand mark. The simpler two-circle motif is the small **Wir** navigation icon, as in the owner icon board. The root shell keeps the current four destinations (Wir, Momente, Planen, Mehr) and the central add action. Listen has its own icon and is shown under **Mehr › Gemeinsame Listen**, matching the current `/more/collections` route. This distinction preserves the existing app structure while carrying the owner's icon language.

## Review artifacts

| Board | Contents | Export |
| --- | --- | --- |
| Identity | App icon, wordmark, light/dark/mono, sizes, color-world marks | [identity.png](exports/identity.png) |
| Icons | Thirty proposed symbols, six groups, variant matrix and states | [icons.png](exports/icons.png) |
| App Light | Wir, Momente, Planen and Mehr/Listen in one shell | [screens-light.png](exports/screens-light.png) |
| App Dark | The same content with explicit dark surfaces and icon colors | [screens-dark.png](exports/screens-dark.png) |
| Palette & components | Three worlds in both modes, role colors, actions, focus and type | [palette.png](exports/palette.png) |

The logo is editable in [`assets/logo-mark.svg`](assets/logo-mark.svg), with separately generated dark, natural and warm marks, plus a dedicated mono drawing and self-contained 512 × 512 app-icon SVGs. The proposed icon geometry lives in [`icons.js`](icons.js). [`tokens.proposal.json`](tokens.proposal.json) documents semantic color roles, typography, sizes and motion. `build-assets.py` generates derived SVGs and the board token adapter; `render.sh` renders all five PNGs with Chromium and records their checksums in `SHA256SUMS`; `verify.py` checks the files and representative contrast pairs.

The previews use the existing `Instrument Sans` and `Literata` fonts and photos from `backend/demo_assets/images/`. The Wir preview retains Lea & Alex, the upcoming Flohmarkt and the Frühstück photo from the current Today demo/evidence. Other labels are illustrative design copy. Personal photos are neither recolored nor blurred in Dark mode.

## Selected system contract

- **Logo:** keep the warm/cool circles, white e loop, navy finishing stroke and separate dot. Use a light rounded tile for the launcher, a tuned dark tile on dark system surfaces, and a one-ink version without gradients. Keep a clear margin around the mark. Check the e at 16 and 24 px before using it as a favicon; the two-circle Wir icon covers navigation's smallest sizes.
- **Icons:** use a 24 px drawing grid, approximately 20 px optical content, 1.65 px rounded stroke and 44 px interactive target. Outline is the normal navigation/content style; filled denotes active or strong semantic content; duotone highlights a meaningful feature or status. State changes also use fill, shape, text or focus ring so color is never the only signal.
- **Worlds:** Original is the core brand world. Natürlich and Warm are contextual worlds with complete light/dark semantic roles, not only background gradients. The decision uses them as controlled context palettes. They are not user-selectable themes and do not change Premium personalization.
- **Surfaces:** photography and authored words lead. Boundaries explain independent content or an interaction layer. Do not tint personal photos globally, fill every section with cards, or add decorative empty photo frames. Use Literata for selected personal headings and Instrument Sans for controls and reading text.
- **Accessibility and motion:** the proposal includes explicit focus and disabled examples, 44 px targets, reduced-motion behavior, and representative contrast values. Full state-by-state WCAG, zoom, keyboard, touch and app-icon-mask checks are still required after an explicit design decision in issue #1225.

## Verification

`render.sh` generated five Chromium PNGs. All generated SVGs parse as XML. The semantic text, muted text, action text and action-fill pairs in all three worlds and both modes were checked with the WCAG relative-luminance formula; the minimum sampled ratio is **4.65:1** for white on the Natürlich light action fill. These are token-pair checks, not a full audit of every illustration or composited gradient.

## Web implementation and real UI evidence

The owner decision is recorded in the issue before runtime work. The implementation updates `design/tokens.json`, the generated Web token adapters, the shared `Brand` and `DestinationIcon` components, a 38-symbol typed `EimirIcon` registry (30 owner-board icons plus eight existing route/content needs), Today content icons, PWA/favicons and the existing Light/Dark bootstrap. Warm is applied to the personal daily quote; Natürlich is applied to the upcoming shared horizon. No user-controlled theme setting or entitlement changes are introduced.

The original Light palette was calibrated for the repository's existing surface-contrast contract: page `#E6EBFA`, surface `#F3F5FC`, recessed `#D6E1F7` and border `#BBC9E5`. The Dark primary button uses `#42558C` with white text; link text has a separate light `link` token. These adjustments keep the owner's composition and hue direction while meeting the app's established readability tests. The five boards above were re-rendered after calibration.

Chromium screenshots of the real mocked app are in [`evidence/`](evidence/): Today at 390 px in Light/Dark, Quick Create in Light/Dark, Planen and Momente at 390 px, and Today at 1280 px. The old #882 evidence was restored after the browser test generated fresh images, so these files are scoped to #1225.

This Web migration does not include native packaging or a release. Product Acceptance still requires human visual review of the implementation screenshots and final browser behavior before merge.
