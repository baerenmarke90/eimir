# Deliberate offline Today checklist — #508

Runtime source: `e6dda319280bb5123635fa63373d22926d260d9b`, based on
`main@3bac184b8cd1dcf82cbf4831c9845fbf252d3aef` (2026-10-16).
This later evidence commit changes no runtime source.

## Observed behavior

All 25 cases in `today-pinned-collection.spec.ts` pass against the production
preview with one worker and zero retries. The two new journeys cover Compact
390px Light and Expanded 1280px Dark, reduced motion, offline activation,
readable error and unchanged checkbox, reconnect with zero writes, canonical
detail read and return, deliberate check/reopen and exact If-Match versions.
Full-page Axe WCAG 2.2 AA and horizontal-overflow checks pass in both new error
states. Existing cases retain 320px/200% text, 360/390/430 widths, empty/sparse/
dense lists, online rollback/retry, reorder, personal pinning and server-confirmed
celebration. These are synthetic authorized API fixtures in real production Web
UI, not live-backend or native-device acceptance.

Seven component characterizations fail against the original baseline and pass
after repair. They cover both offline signals, queued dispatch after success or
failure, and an offline activation while an online predecessor is held. All 18
component cases preserve online rapid-toggle ordering and confirmed versions.
The complete Web suite passes 1,473 cases (one existing skip); the final focused
suite, production build/TypeScript, scoped lint/format, internal visual-proof
typecheck and both language audits also pass.

## Browser probe corrections

The initial production-browser run exposed two concrete existing problems: the
checkbox error referenced a nonexistent translation key, and `signIn` asserted
only `/today`, which is also the unauthenticated URL. The final correction reuses
the existing localized offline/unknown titles and waits for the real login form
to disappear before navigating. No artificial delay, automatic retry, timeout
increase, forced scroll or relaxed assertion was introduced. The final complete
25-case execution passes directly.

## Captures

Each file is an actual full-page capture from the same passing run. Fixed
navigation and the snackbar remain positioned inside the original viewport;
visible focus/skip controls are real browser states. The unavailable quote is an
existing independent fixture state; this slice does not change quote behavior.

| State | Compact Light | Expanded Dark |
| --- | --- | --- |
| Rejected offline attempt | [390px](today-checklist-offline-390-light.png) | [1280px](today-checklist-offline-1280-dark.png) |
| Deliberate check/reopen confirmed | [390px](today-checklist-confirmed-390-light.png) | [1280px](today-checklist-confirmed-1280-dark.png) |

The [preflight and interaction contract](../../../references/508/today-checklist-offline-repair.md)
preceded runtime implementation. No new composition, token, localization resource,
provider, entitlement, persistence, API, native capability or operating-model
change. Other write families and broader #508/#946 acceptance remain separate.

## SHA-256

```text
8270174423451570ea0353ceee9642bc973ac5e709fc2723852f756a4f3d69d4  today-checklist-confirmed-1280-dark.png
60ca6a285f489648bdec848b74e48cfece95b6e7298c43962af6ffa403b74988  today-checklist-confirmed-390-light.png
d1157b2c18b1f4ce05eb0e67272e7750e8ab4e275a355b7c824cb35c4a81eb7a  today-checklist-offline-1280-dark.png
a18acd7c07e0172b87598ad712821d77ba7aa035acbc2fec2d59ac733fa47b80  today-checklist-offline-390-light.png
```
