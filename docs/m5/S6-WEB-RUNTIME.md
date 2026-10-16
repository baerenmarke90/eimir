# M5 Web S6 Runtime

Issue: #346

This runtime consumes the frozen S6 decisions from `S6-CACHE-PORTABILITY-DECISIONS.md` and the generated Transfer Bundle contract delivered by #345.

## Canonical Deep Links

- Canonical resource links contain opaque identifiers only.
- `web/src/client/deepLinks.ts` is the product target registry for Memory, HeartMoment, Milestone, Wish, Plan, Place, Chapter, shared Collection and current-owner Private Area resources.
- Authentication return targets are restricted to canonical app-relative paths. External URLs, legacy paths, query strings, fragments, normalized traversal paths and auth callback paths fail closed.
- Magic-link return state is stored as a short-lived path-only value and is revalidated before use. No token, credential, title, preview or signed URL is stored in it.
- Authorization remains server-owned after navigation; a Deep Link never grants access.

## Persistent Web Read Cache v2

The provisional IndexedDB schema v1 is deliberately invalidated on upgrade instead of migrated.

Every v2 record is bound to:

- Account ID;
- Space ID;
- privacy scope `SPACE_SHARED`;
- resource kind;
- resource ID;
- schema version 2;
- last successful authorized refresh timestamp.

The hard maximum age is seven days. Expired, future-dated, malformed, wrong-scope or wrong-context records fail closed and are deleted.

Only transport/offline and server-availability failures may use the persistent cache. 401, 403, privacy-safe 404, conflict and validation/authorization outcomes never fall back to cached data.

HeartMoment detail caching has an additional central privacy check: only serialized `SHARED` payloads are persistable. A private result deletes any former shared snapshot. The Story projection uses the generated shared HeartMoment summary contract; current-owner private payloads are not persisted as raw HeartMoment detail.

The cache context marker clears persistent data when the active Account or Space changes. Logout continues to call `clearProductReadCache()` explicitly. Cached presentation is read-only and the app shell exposes the timestamp of the last successful authorized network state.

No offline-write queue is introduced.

## Transfer Bundle UI

The transfer surface lives in Profile and uses only the generated `TransferApi` and generated models.

Export:

- exact `SHARED` / `PERSONAL` scope selection;
- server status polling for queued/running work;
- download only when status is `READY`;
- download through the authorized generated endpoint, never through the descriptor's storage/download URL;
- content-free local filename and 24-hour retention explanation.

Import:

- one ZIP bundle upload through the generated endpoint;
- server-side validation/status polling;
- content-minimized summary (scope, source-member count, aggregate record count, media count);
- explicit checkbox confirmation before `apply`;
- additive semantics only; no replace/restore UI;
- no client-side ZIP extraction or validation library.

Raw archive content and server error codes are not rendered into user-visible failure copy.

## Business / Freemium

No entitlement runtime is introduced. Basic supported cached Core reads and essential data portability remain Free/Core and non-paywallable. Cloud and Self-Hosted consume the same API contract.

## Reuse-before-build

Reused:

- React Router for route matching and canonical path handling;
- existing IndexedDB read-cache foundation, upgraded in place with a fail-closed v2 schema;
- TanStack Query for transfer polling;
- generated TypeScript `TransferApi` and models;
- existing ProblemDetails normalization and i18n/accessibility primitives.

No second router, persistence framework, sync engine, archive library, handwritten Transfer DTO/API layer or external provider is added.
