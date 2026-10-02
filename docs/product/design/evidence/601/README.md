# Shared photo gallery Web evidence (#601)

Preflight: [generated reference and Mobile Interaction Contract](../../references/601/shared-photos-preflight.md), recorded in the owning issue before UI implementation.

## Implemented experience

The existing Momente browse row gains Photos. The secondary screen retains the
owner identity, header and active primary navigation, with photo-led month
groups and a two-column Compact / four-column Expanded grid. It uses the
existing semantic palette and PageHeader. Free/Core classification is explicit
in FREEMIUM-FEATURE-MATRIX; there is no upload, quota or entitlement change.

The existing media viewer now accepts a custom preview surface and caption.
Only the selected original and immediate neighbours load. Thumbnails use the
existing viewport-gated preview and authorized variant contract. Resource keys
bind account, Space, parent type, parent id, attachment and rendition; removal,
rebinding and late responses cannot retain another context's Object URL.

Back/Escape/close return to the triggering tile. `Zum Moment` removes the
overlay entry before opening the canonical detail; returning restores the
loaded photo pages, focus and tile offset. Browser QA exposed and fixed a
pending lightbox scroll callback that could otherwise reopen a dismissed modal.

## Visual review

Screenshots come from the running Web product with mocked HTTP media records
and repository demo photographs, not from the generated design reference.
Local Chromium 153 was used because the pinned Playwright download failed in
this workspace. CI uses the repository's pinned browser runtime.

- [390 light](story-photos-390-light.png), [390 dark](story-photos-390-dark.png)
- [1280 light](story-photos-1280-light.png), [1280 dark](story-photos-1280-dark.png)
- [320 light](story-photos-320-light.png)
- [200% text header](story-photos-390-text-200.png), [grid](story-photos-390-text-200-grid.png), [viewer](story-photos-390-text-200-viewer.png)
- [Viewer](story-photos-viewer-390.png), [empty](story-photos-empty.png), [error](story-photos-error.png)

Review: visible content and actions are coherent in both themes; photos remain
dominant and the app shell is preserved. No page overflow at 320px/200% text.
The viewer footer wraps and stays reachable with large text. Reduced motion
uses the existing static scrolling behavior. Existing primary-nav labels may
truncate at 200% text; their accessible names remain complete. No new shell
layout or Android device claim is introduced by this Web-only slice.

## Validation

- Full Web unit suite: 1,326 passed, one existing skip; production build passed.
- New browser coverage: lazy thumbnails/no eager originals; bounded neighbour
  reads; Back after viewer navigation; multi-page canonical detail return;
  theme/reflow/accessibility matrix; empty/error/offline states. Axe reports no
  WCAG A/AA violations for the six overview variants.
- Existing four-case Memory carousel browser regression passed.
- Backend Ruff and strict mypy passed. OpenAPI generated from the ASGI app;
  TypeScript regenerated using the pinned 7.24.0 generator JAR and the same
  repository configuration (Docker unavailable locally).
- Eight new HTTP/PostgreSQL acceptance cases cover owner-private exclusion,
  shared parents, readiness/image filtering, UTC fallback, equal-key paging,
  revocation, cursor binding/tampering, tenant isolation and bounded limits.
  Local PostgreSQL is unavailable; database acceptance is a CI gate.

No database migration, new media store, persistent photo cache or new provider.
Signed read descriptors and bytes continue through existing parent-bound
authorization. The current domain has no locked/unrevealed parent type in this
projection. Any future such type must establish its exclusion before joining.
#601 remains open for the other epic slices.
