# M5 Web Client Completion

- **Status:** staged Web delivery in progress; S6 prerequisites frozen by #303
- **Parent issue:** #295
- **S6 prerequisite:** #303
- **S6 runtime follow-ups:** #345 Transfer Bundle backend/OpenAPI, #346 Web runtime
- **Android offline/read-cache owner:** #328 (historical: the native Android read cache was retired with the Kotlin client in #1009; see [ADR 0011](../decisions/0011-web-first-pwa-capacitor-mobile-delivery.md))

This package controls the staged productization of the eimir. Web
client. M5 Web may progress in parallel with M4 only where the required Domain
and OpenAPI contracts are already stable on `main`. It does not change or
pre-commit open M4 contracts, and it does not declare M5 or G4 complete.

**Reference status:** This staged M5 delivery package and its clickable comparisons describe their historical scope. [Product Reference v1](../product/design/product-reference-v1.md) now governs product-design direction; the lower-level domain, privacy, accessibility, and API contracts remain binding. See [Implementation Status](../IMPLEMENTATION-STATUS.md) for current delivery status.

## Binding sources

- `specification/CLEAN-ROOM-MASTER-SPEC.md`
- `docs/ROADMAP.md`
- `docs/IMPLEMENTATION-STATUS.md`
- `docs/DESIGN-PRINCIPLES.md`
- `docs/DESIGN-TOKEN-POLICY.md`
- `docs/ACCESSIBILITY-QA-MATRIX.md`
- `docs/CROSS-CUTTING-QUALITY.md`
- `docs/BUSINESS-MODEL.md`
- `docs/FREEMIUM-FEATURE-MATRIX.md`
- `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`
- `docs/m5/WEB-DESKTOP-UX-AUDIT.md`
- `docs/m5/ANDROID-DELIVERY-PLAN.md`
- the relevant M1-M4 decisions and the authoritative generated Web client

The two independently created clickable product references supplied for this
work are visual comparison material, not a replacement for the binding product,
Privacy, Accessibility, or API contracts:

- `eimir-clickable-demo-expanded.html`
- `eimir-clickable-mockup.html`

## Current Web client assessment

The existing client has grown from the original M2 vertical reference flow into
staged production domain surfaces while retaining the same contract-first
foundation. Its strongest foundations should be retained:

- React, React Router, TanStack Query, i18next, and the generated OpenAPI client;
- a real sign-in -> Memory/image upload -> Story flow;
- image upload orchestration with validation polling and authorized reads;
- localized product copy and locale-aware Story date grouping;
- Light, Dark, and System appearance preferences;
- semantic Story markup, focus indicators, reduced-motion behavior, and theme
  contrast tests;
- Vitest coverage for generated discriminators, uploads, Story presentation,
  i18n, theme behavior, and the real G2 client flow.

## M5 Web gap analysis

| Area | Current baseline | M5 Web gap |
| --- | --- | --- |
| Architecture | staged production route/components on the existing React foundation | keep route layouts, feature boundaries, shared state/error patterns, and API composition coherent as remaining slices land |
| Navigation | production app-shell/routing work is staged under M5 | finish canonical Deep Link behavior and safe auth-return handling in #346 |
| Identity context | real session/Space context is an M5 prerequisite for product data | retain complete account/Space cache isolation and lifecycle behavior |
| M1 UI | staged under the M5-Web domain slices | finish only remaining issue-scoped parity/evidence gaps |
| M2 UI | product Memory/Story surfaces are staged and include the provisional S2 read cache | replace the provisional cache boundary with the binding M2-D18 policy in #346 |
| M3 UI | staged Wishes/Plans/Places/Chapters/Collections/Private Area surfaces | finish only remaining issue-scoped parity/evidence gaps |
| Stable M4 UI | staged Search/Dashboard/Activity/Notifications integration | integrate later M4 contracts only after their owning runtime is stable |
| Async states | shared product states exist and continue to expand by slice | ensure S6 cache/transfer lifecycle states use the same ProblemDetails/state system |
| Error handling | centralized product error handling is established by M5 shell work | map stable Transfer errors without leaking private/archive content |
| Forms | reusable production forms/destructive confirmation patterns are staged | apply the same patterns to import confirmation and transfer failures |
| i18n | localized product copy and locale-aware formatting | complete cache-age, transfer-scope, validation, expiry, and failure copy in #346 |
| Accessibility | useful production foundations and #192 browser evidence path | complete Deep Link/cache/transfer keyboard, focus, semantic-status, scaling, and manual G4 evidence |
| Responsive design | shared production layouts are staged across M5 slices | retain Compact/Medium/Expanded behavior for S6 transfer/cache states |
| Offline/cache | provisional S2 IndexedDB detail cache exists | #303 freezes seven-day Account+Space scope; Web persistent storage is SPACE_SHARED-only; #346 invalidates v1 and implements the hardened runtime |
| Portability | no production runtime yet | #303 freezes `SHARED`/`PERSONAL` and Transfer Bundle v1; #345 implements server/OpenAPI; #346 integrates the generated Web flow |
| Deep Links | product routes/builders exist | #303 freezes the privacy boundary; #346 centralizes/tests canonical targets and safe auth return |
| Test architecture | node-based unit/static rendering plus real G2 API E2E | focused routing/cache/transfer tests plus browser E2E/accessibility through existing issue #192 |

## S6 decision boundary

#303 is the prerequisite/decision slice. It closes the previously open
client-shaping decisions instead of inventing them inside Web runtime code.

The binding S6 decisions are versioned in
[`S6-CACHE-PORTABILITY-DECISIONS.md`](./S6-CACHE-PORTABILITY-DECISIONS.md) and
synchronized into M2-D17/M2-D18.

Important consequences:

- portability scopes are exactly `SHARED` and `PERSONAL`;
- partner `OWNER_ONLY` content never enters another user's export;
- passwords, Passkeys, sessions, Refresh/Push Tokens, Security/Audit logs,
  signed URLs, runtime Job/Outbox state, Entitlements, and client caches are not
  user-portability data;
- essential portability and cache/privacy guarantees are non-paywallable;
- persistent cache has a hard seven-day maximum age and is completely cleared
  on logout, Account change, or Space change;
- Web persists only explicitly approved `SPACE_SHARED` read snapshots and never
  `OWNER_ONLY` ProtectedPayload;
- Android owner-only persistence requires Room plus a Keystore-protected
  encryption boundary and remains owned by #328;
- M5 does not promise Offline Write;
- Deep Links contain opaque identity but no protected presentation content,
  tokens, signed media URLs, or credentials;
- the neutral Transfer Bundle is versioned, server-owned, asynchronous, and has
  fail-closed archive validation plus 24-hour temporary export retention.

## S6 runtime ownership

- **#345 — Transfer Bundle backend/OpenAPI:** implements job-backed Export/Import,
  manifest v1, authorization, media/staging, archive abuse limits, cleanup,
  ProblemDetails, `backend/openapi.json`, and the generated TypeScript client
  (the Kotlin client generation was retired in #1009).
- **#346 — Web S6 runtime:** implements canonical Deep Links, safe auth return,
  invalidation of the provisional S2 IndexedDB schema, Account/Space/scope cache
  v2 with seven-day expiry, complete clearing/invalidation, localized read-only
  cache age, and generated-client Export/Import UI after #345 merges.
- **#328 — Android resilience/read cache (historical, see above):** consumed the same M2-D18 policy for
  Android and owns cold-start/offline product resilience; it must not weaken the
  Keystore requirement for persistent owner-only payloads.

The complete slice sequence and dependency rules are in
[`WEB-DELIVERY-PLAN.md`](./WEB-DELIVERY-PLAN.md).
