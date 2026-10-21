# Capture, Discover and session reliability (#1380)

Baseline: `ac74b40a346f52d745bc4563658061a500edc327`.

## Behavior and reuse

A selected photo batch may wait behind sequential server validation. The shared attachment readiness primitive now follows authoritative READY/terminal states instead of declaring failure after 30 seconds. Polling backs off to five seconds, cancellation aborts pending reads/timers, existing upload concurrency and quotas remain authoritative, and uncertain writes are never replayed.

Discover retains its authorized daily lead and stable curated ordering. Each read admits readable shared additions from the preceding 24 hours into the next slots, with eight results maximum. Three indexed descriptor queries read at most eight candidates per kind; protected payload hydration still follows canonical authorization. Private Heart Moments and foreign Spaces are excluded. The existing Space-first projection invalidator now includes the canonical Discover key, including author-summary updates.

Session lifecycle callbacks use the current login generation. A late callback for the immediately consumed refresh token reuses the completed rotation for the same API origin instead of replaying it and revoking the family. Existing silent renewal, native secure storage, browser tab-scoped storage, logout/account ownership and server replay/revocation enforcement remain in place. The existing session policy is 60 days sliding, 180 days absolute; short-lived access credentials renew silently.

An effect must capture the owner of its rendered access token before subscribing or scheduling renewal. If that generation no longer belongs to the current login, it does nothing. Reading an arbitrary replacement session from storage would let an obsolete effect rotate and publish another login's credentials, including a new login for the same Account. The shared `SessionOwner` contract already used by authenticated requests and media owns this boundary.

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

### Current-main integration verification (2026-10-19)

The continuation integrates `main@a975a4a1e7eb2fc8af8e36f0f77bb42920693f12` into PR #1381, preserving the merged authorized-image cache and comment-deletion repair. Two new lifecycle regressions fail before the owner guard: an obsolete rendered generation renews replacement credentials twice, for both same-Account reauthentication and an Account switch. Both pass with the guard; all ten earlier hook cases remain green.

- Full Web suite: 1,998 passed, one existing skip, across 220 test files.
- Focused session, request, upload, media-cache, projection and gallery checks: 86 passed.
- TypeScript/production build, lint, changed-file formatting, browser inventory and `git diff --check`: passed. Existing lint warnings remain.
- Browser integration on the PR candidate: 30 passed without retries, covering deep-route restoration, deliberate logout, multi-photo capture/order, Discover return, draft survival across proactive/resume/outage renewal, gallery gestures/reflow and authorized byte reuse.
- A separate temporary combination with gallery PR #1388 at `e3043f6aa2119770d7f2d14f5ad69c2ca2b4e92b` passed 40 focused component cases and 22 browser cases without retries. Its six-photo journeys retain the three-original initial window at 390 px Dark and 1280 px Light; capture, Discover and cached viewer return remain intact. That independent gallery change is not folded into PR #1381.

These browser checks use the production React consumers with synthetic API fixtures and the available Chromium 153 executable through a local configuration override. The repository Playwright configuration is unchanged. They do not establish a connected production API journey or physical-device/native acceptance. The original PostgreSQL/backend evidence above remains separately scoped; this continuation changes no backend code. Required hosted checks must pass on the updated PR head before merge.

## Business and cross-cutting review

**No business/freemium impact:** existing core capture/Story/media and non-paywallable authentication/privacy classifications apply equally to Cloud and Self-Hosted. Quotas, capabilities, retention, storage policy, export/deletion, downgrade and entitlement boundaries are unchanged. No provider/dependency, schema migration, realtime service or user configuration is added. Read overhead is bounded and uses existing indexes. No credentials, media payloads or personal diagnostics are recorded. Existing accessibility, i18n and motion primitives are reused.
