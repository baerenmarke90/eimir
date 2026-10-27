# Personal photo-source product evidence

Recorded 2026-10-27 against the #1444 delivery branch, based on
`main@8c78c2eabc4a20dbdc71f067677cdc123fb4d293`.

The generated whole-composer reference was attached to #1444 before UI work:
[preflight reference](../photo-source-sheet-delivery.png). These PNGs are actual
browser renders using repository-owned cabin/lake demo media and synthetic
credentials; they contain no real account, key, personal service or photos.

| Surface | Light | Dark |
| --- | --- | --- |
| Compact setup | [390](photo-source-link-390-light.png), [430](photo-source-link-430-light.png) | [360](photo-source-link-360-dark.png) |
| Compact selection | [390](photo-source-selection-390-light.png), [430](photo-source-selection-430-light.png) | [360](photo-source-selection-360-dark.png) |
| Expanded setup | — | [1280](photo-source-link-1280-dark.png) |
| Expanded selection | — | [1280](photo-source-selection-1280-dark.png) |

The source journey exercises open -> personal link and explicit consent ->
select two photos -> existing upload/READY -> explicit Save -> canonical diary
result. It asserts that unsaved source selection never creates a diary entry,
that existing words remain, and that both photos bind on Save. Axe reports no
violations on all four selection surfaces; reduced motion is enabled.

Additional browser coverage closes an in-flight original request and rejects
late bytes, preserves authored words, and allows disconnect after Pro expiry.
The 320 px/200% text case checks the active sheet's own reflow and offline import
feedback. The inert underlying diary is outside that sheet reflow assertion.
The existing diary create/recovery suite continues to cover local picking and
expired unbound-upload recovery. Real provider accounts and installed devices
are operational acceptance, explicitly deferred by the Product Owner.

Local tooling: Chromium 153 (environment-compatible executable), Playwright
1.62.1, normal browser security. CI uses the repository-pinned browser/runtime;
local screenshots are not physical-device certification. Provider adapters use
offline fixtures locally. The eight PostgreSQL integration cases cover encrypted
personal ownership, device/Space binding, Pro downgrade/disconnect, state replay,
expiry, stale unlink/recreate, export/deletion and revoked-device cleanup; hosted
PostgreSQL CI is required before merge. No live provider approval is inferred.
