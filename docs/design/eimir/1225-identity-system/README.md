# eimir. identity system — issue #1225

**Status:** The owner-selected Web identity was merged in [PR #1244](https://github.com/baerenmarke90/eimir/pull/1244). [#1245](https://github.com/baerenmarke90/eimir/issues/1245) continues the visual fidelity review. Final Product Design acceptance remains with Philipp.

The [corporate identity document](CI.md) is the complete contract for the selected app logo, the owner icon set, its variants and states, the three color worlds, Light/Dark treatment, and the existing product-design rules inherited from Product Reference v1. It maps each rule to its delivered asset or runtime implementation.

## Owner originals

The four supplied PNGs are preserved unchanged and are the visual authority for this issue:

- [App logo and logo variants](references/owner-app-logo.png)
- [Thirty-icon overview](references/owner-icon-overview.png)
- [Outline, Filled and Duotone examples plus worlds](references/owner-icon-variants.png)
- [Icon states](references/owner-icon-states.png)

## Editable assets and review evidence

- [`assets/`](assets/) contains the SVG logo master and generated variants. `build-assets.py` synchronizes the Web SVG delivery assets.
- [`icons.js`](icons.js), `boards.js` and `boards.css` produce the explanatory boards; the typed `EimirIcon` registry is the runtime source.
- [`exports/`](exports/) preserves the snapshot identity, icon, palette and Compact Light/Dark boards. The editable board source contains the #1245 refinements; regenerate these PNGs with `render.sh` before using them as current visual evidence.
- [`evidence/`](evidence/) contains screenshots of the real Web implementation in Compact Light/Dark and Expanded layouts.
- `verify.py` checks board symbols, SVG syntax, export hashes and representative contrast pairs. `web` build and test scripts validate runtime tokens, PWA assets and behavior.

The implementation keeps the existing four root destinations, central add action, current content hierarchy and feature behavior. The owner images define the new identity only; other product rules remain those of [Product Reference v1](../../../product/design/product-reference-v1.md).
