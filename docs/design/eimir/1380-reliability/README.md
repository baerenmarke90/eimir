# Capture, Discover and session reliability (#1380)

Baseline: `ac74b40a346f52d745bc4563658061a500edc327`.

## Behavior and reuse

A selected photo batch may wait behind sequential server validation. The shared attachment readiness primitive now follows authoritative READY/terminal states instead of declaring failure after 30 seconds. Polling backs off to five seconds, cancellation aborts pending reads/timers, existing upload concurrency and quotas remain authoritative, and uncertain writes are never replayed.

Discover retains its authorized daily lead and stable curated ordering. Each read admits readable shared additions from the preceding 24 hours into the next slots, with eight results maximum. Three indexed descriptor queries read at most eight candidates per kind; protected payload hydration still follows canonical authorization. Private Heart Moments and foreign Spaces are excluded. The existing Space-first projection invalidator now includes the canonical Discover key, including author-summary updates.

Session lifecycle callbacks use the current login generation. A late callback for the immediately consumed refresh token reuses the completed rotation for the same API origin instead of replaying it and revoking the family. Existing silent renewal, native secure storage, browser tab-scoped storage, logout/account ownership and server replay/revocation enforcement remain in place. The existing session policy is 60 days sliding, 180 days absolute; short-lived access credentials renew silently.

## Product Design / UX

Product Reference v1 R1 capture and R2 Moments remain the owning experiences. This is a nonvisual reliability repair using existing composers, picker, status/removal controls, gallery, Discover, shell, tokens, localization and reduced motion. No new or materially changed composition/native capability requires a generated reference. Smartphone remains normative; Expanded uses the same flow. Existing loading, terminal error, explicit cancellation and offline behavior remain available.

Browser acceptance uses one multi-selection of three synthetic one-pixel PNG files, delayed server readiness beyond the former deadline, one create, ordered binding, all three decoded gallery images, then navigation back to Discover without reload. API fixtures control readiness, not arbitrary real delays. Screenshots document existing composition, not real user media or physical-device acceptance.

| State | Compact, 390 px Light | Expanded, 1280 px Dark |
| --- | --- | --- |
| Batch ready | [Image](evidence/batch-ready-390.png) | [Image](evidence/batch-ready-1280.png) |
| Saved with three photos | [Image](evidence/batch-saved-390.png) | [Image](evidence/batch-saved-1280.png) |
| Return to Discover | [Image](evidence/batch-discover-390.png) | [Image](evidence/batch-discover-1280.png) |

## Validation

- Baseline regressions reproduced: two of three photos falsely fail after 30 seconds; a late consumed refresh token is sent again; all three resource types stay absent after an existing daily selection; Discover cache is not invalidated.
- Web: 1,943 passed, one existing skip. Typecheck/build, lint and formatting pass (existing lint warnings remain).
- Backend: 30 Discover/selector tests and 106 session/Story/read-model integration tests pass on an isolated PostgreSQL instance. Ruff and strict mypy pass.
- Browser: 18 affected acceptance cases pass, including Compact/Expanded batch upload, existing create defaults/tags, canonical Discover, proactive/resume/outage renewal and unauthorized/logout boundaries. The new batch test explicitly asserts selection order rather than nondeterministic HTTP arrival order.
- New tests cover queued processing, cancellation during/between reads, terminal validation failure, completed-refresh replay, stale lifecycle callbacks, full/empty daily selections, all three content kinds, both partners, private/foreign isolation, finite ordering and the recent-window boundary.

## Business and cross-cutting review

**No business/freemium impact:** existing core capture/Story/media and non-paywallable authentication/privacy classifications apply equally to Cloud and Self-Hosted. Quotas, capabilities, retention, storage policy, export/deletion, downgrade and entitlement boundaries are unchanged. No provider/dependency, schema migration, realtime service or user configuration is added. Read overhead is bounded and uses existing indexes. No credentials, media payloads or personal diagnostics are recorded. Existing accessibility, i18n and motion primitives are reused.
