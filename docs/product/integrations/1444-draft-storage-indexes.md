# Diary draft reads and metadata-only cleanup

Preflight: 2026-10-26, `main@e54fe0b843fa8e774d600d1bb71bba71ddd5a4a4`.
Related: #1444, #1457/#1458, #601. This is an independent diary-storage repair;
the scoped selection handoff in #1460 remains separate.

## Observed problem and selected scope

`MemoryDiaryDraftStore.load()` and logout cleanup use `getAll()` on the draft
store. Each record includes its selected Files. Opening one composer's draft
therefore clones every retained record and its File objects into JavaScript,
including other Account/Space/API-instance scopes, merely to inspect metadata.
Native Blob/File byte backing is browser-managed; this finding establishes
unnecessary payload-record cloning, not a measured heap-size or latency saving.
The returned result is scoped, but the read and cleanup work are not.

Use the existing IndexedDB database and record identity. Add expiration/epoch
indexes in an in-place version upgrade; read only the requested primary key.
Remove stale/expired records through index key cursors without retrieving their
payloads. Preserve fresh records, seven-day inactivity semantics, writer leases,
file order/identity and the existing logout generation guard. Close connections
on version change. A blocked open must fail visibly as before and close any
connection that arrives after its caller has already rejected the open.

Before runtime changes, prove the broad-read regression in a real browser with
legacy version-one records. Cover file-preserving upgrade, metadata-only expiry
and logout purge, old-writer rejection, concurrent-generation preservation and
blocked-upgrade connection disposal. Retain the existing diary UI journeys.

## Reuse, design and commercial review

Reuse native IndexedDB indexes/key cursors, existing File structured cloning,
the current store/session lifecycle and Playwright browser infrastructure. A new
database wrapper, storage provider, cache, dependency or editor is unnecessary.
Product read-cache storage has different ownership/erasure semantics; do not
couple these separate domains to repair this local responsibility.

No control, copy, route, hierarchy, token or native capability changes. The
current #1458 date/prose-first diary and its generated reference, Mobile
Interaction Contract and Compact/Expanded evidence remain authoritative under
`docs/product/design/references/1457/`. Existing resume/retain/discard,
loading/error/local-save feedback, focus, reduced motion, shared Save and
canonical return remain intact. No new visual reference is required for this
nonvisual storage algorithm; actual diary recovery journeys must still pass.

**No business/freemium impact:** diary capture/recovery and local photo upload
remain Free/Core for Cloud and Self-Hosted. No entitlement, quota, seven-day
retention, operating cost, downgrade, export or existing-content contract changes.
External Immich remains Premium. This does not enable a provider or resolve its
consent, encryption/retention, policy, credential or deployment acceptance gates.

## Cross-cutting quality and limits

- Privacy/performance: only the requested record's content is materialized;
  cleanup transfers keys and index metadata, never other drafts' text/Files.
- Migration: preserve the database name and records; create indexes on existing
  data atomically. Older open clients may need refresh during a schema upgrade;
  blocked/unavailable storage must not claim successful durable recovery.
- Concurrency: keep serialized transactions and writer/epoch checks. Logout
  invalidates synchronously and its asynchronous purge preserves a later login.
- Resilience/resources: close normal, version-changed and rejected late-open
  connections. No retries, delays, silent data reset or new retention policy.
- Security/operations: no backend/API/schema, provider traffic, secrets, logs,
  analytics, shared read cache or native build changes. No new encryption/E2EE
  claim; drafts remain local application data under the existing disclosure.
- Accessibility/i18n: existing localized states, labels, focus and layout are
  preserved. Browser acceptance, required CI and final review remain mandatory.
