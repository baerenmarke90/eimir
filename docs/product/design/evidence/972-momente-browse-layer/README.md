# #972 — Momente compact browse layer visual evidence

This folder contains exact-build Web/Mobile Web evidence for issue #972.

- `972-browse-1440-light.png`: 1440 × 1200, expanded Web, light theme.
- `972-browse-390-light.png`: 390 × 844, light theme.
- `972-browse-320-dark-large-text.png`: 320 × 720, dark theme, root text enlarged to 125%.

All three captures exercise the real Web client with the deterministic Momente browser fixture. The browser assertions verify all three structural destinations, two primary tabs only, browse-before-content placement, 44px minimum targets, keyboard focus, no horizontal overflow, removal of the old lower structural blocks, and axe WCAG A/AA checks (with only the two documented pre-existing Discover exclusions already present in this spec).

The 1440 px capture satisfies the repository's Expanded/Web evidence requirement while the 390 px and 320 px captures remain the normative Compact/mobile acceptance evidence.

Scope is Web/Mobile Web only for #972. Native Android is deliberately outside the regular feature scope for this slice and was not changed.