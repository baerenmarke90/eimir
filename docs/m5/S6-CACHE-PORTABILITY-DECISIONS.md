# M5 Web S6 - Read Cache, Deep Links, and Portability Decisions

- **Status:** DECIDED
- **Date:** 2026-08-31
- **Owning issue:** #303
- **Parent:** #295
- **Decision scope:** M2-D17, M2-D18, and the M5 versioned Transfer Bundle prerequisite

This document closes the client-blocking portability and cache questions that
were deliberately left open during M2. It is the binding M5 decision source for
the runtime work that follows #303. Runtime implementation must not silently
change these semantics.

## Decision summary

1. **M2-D17 is DECIDED.** eimir. exposes two user-portability scopes:
   `SHARED` and `PERSONAL`. `PERSONAL` is the shared portable dataset plus only
   the requesting account's `OWNER_ONLY` data. No export may contain the
   partner's `OWNER_ONLY` content.
2. **M2-D18 is DECIDED.** Persistent client read caches are always bound to
   Account + Space + Privacy/owner scope, have a hard maximum age of seven days,
   and are completely removed on logout, Account change, or Space change. There
   is no Offline Write.
3. **Web does not persist `OWNER_ONLY` ProtectedPayloads.** The Web persistent
   cache uses IndexedDB only for explicitly approved `SPACE_SHARED` read
   snapshots. Private Web data remains session-memory-only.
4. **Android may persist owner-only read data only with platform-backed
   encryption.** Room is the read-cache store; ProtectedPayload cache material
   must be encrypted with a key protected by Android Keystore. The same scope,
   retention, clearing, and no-offline-write rules apply.
5. **The neutral Transfer Bundle is versioned and server-owned.** Clients do not
   assemble or parse application ZIPs as a competing portability
   implementation. Export/import use a stable asynchronous API and the same
   bundle format on eimir. Cloud and Self-Hosted.
6. **Deep links contain identity, never content.** Canonical client routes may
   contain opaque resource IDs but no ProtectedPayload, private title, query
   text, token, signed media URL, or other sensitive presentation data.

## M2-D17 - Export and private-data boundary

### Status

`DECIDED` on 2026-08-31 by the M5 product/privacy decision in #303.

### Export scopes

The public API uses exactly these scopes for normal user portability:

```text
SHARED
PERSONAL
```

`SHARED` contains the portable `SPACE_SHARED` dataset of the selected Space.
Either active member may request it. It must not contain `OWNER_ONLY` content
from either member.

`PERSONAL` contains:

- the complete `SHARED` portable dataset the requester may export; and
- only the requesting account's portable `OWNER_ONLY` content.

It never contains the partner's `OWNER_ONLY` content, including indirect
previews, counts, filenames, relation remnants, cache material, or metadata
that would disclose private-resource existence.

The requester is derived exclusively from the authenticated Authorization
Context. A client cannot submit an arbitrary `ownerId` to export another
member's private data.

### Portable data

The Transfer Bundle contains durable user-created/user-configured data required
to move the relationship history to another eimir. installation.
Examples include, where present in the current runtime:

- portable Account profile identity required for attribution and member mapping;
- Space and SpaceProfile relationship data;
- PartnerProfile and ProfilePreference data;
- RelatedPerson and ImportantDate data;
- Memories, shared HeartMoments, Milestones, Comments, and their included media;
- Wishes, Plans, Places, Chapters, typed relations, shared Collections, and
  CollectionItems;
- Reminders and RulePreferences that are durable user configuration and whose
  visibility/ownership permits inclusion;
- for `PERSONAL` only, the requester's private HeartMoments, PrivateNotes,
  GiftIdeas, PrivateCollections, and PrivateCollectionItems;
- sanitized media reachable from included portable Domain records.

Derived or operational projections are regenerated and are not portable source
records. Search indexes, Dashboard projections, Activity projections, and
Notifications are therefore not exported as authoritative data.

### Explicitly excluded data

The bundle never contains:

- passwords or password hashes;
- Passkeys/WebAuthn credentials;
- Magic-Link, verification, invitation, or recovery secrets;
- access or Refresh Tokens;
- DeviceSessions or Web sessions;
- Push Tokens or PushDelivery state;
- Auth provider secrets or IntegrationConnection credentials;
- storage credentials, presigned URLs, or signed read URLs;
- Audit/Security logs;
- OutboxEvent or Job runtime state;
- commercial Entitlements or billing state;
- server FeatureConfiguration;
- temporary/unbound upload staging data;
- client cache files.

This preserves the exclusions in the product specification and prevents a
portable archive from becoming a credential backup.

### Operational backups are separate

Normal user portability is not the same feature as an operator backup. M2-D17
does not define the M9 database/object-store backup and disaster-recovery
contract. Operational backups may need complete encrypted service state, but
that does not grant either partner a user-facing API capable of exporting the
other partner's `OWNER_ONLY` data.

### Existing data, downgrade, Cloud, and Self-Hosted

Essential data portability is **non-paywallable**. Export of data a user is
entitled to read under the rules above cannot depend on Premium.

A downgrade may stop future Premium processing but must not remove the right to
export existing portable user data. Cloud resource quotas may govern temporary
archive storage/retention as an operational limit, but they must not alter the
bundle's Privacy semantics. Self-Hosted does not receive an artificial
commercial data limit.

## M2-D18 - Client read-cache boundary

### Status

`DECIDED` on 2026-08-31 by the M5 client/security decision in #303.

### Common invariants

Every persistent cache entry is namespaced by all security-relevant context:

```text
accountId + spaceId + privacyScope + ownerId? + resourceKind + resourceId
```

For `SPACE_SHARED`, `ownerId` is absent. For a platform that is permitted to
persist `OWNER_ONLY`, `ownerId` is mandatory and must equal the authenticated
owner for that cache namespace.

Persistent read-cache data has a **hard maximum age of seven days** from the
last successful network refresh. Expired entries are deleted before use. Cache
age is based on a server/client technical timestamp recorded when an authorized
network response was received; changing device wall-clock time must not extend
retention indefinitely where a monotonic/runtime-safe comparison is available.

Logout, session invalidation, Account change, and active Space change clear all
eimir. persistent read-cache data on that client, not merely the currently
visible query. Normal cache eviction by the browser/OS is allowed because cache
content is an optimization, never the source of truth.

A cache may be used only after a network/transport availability failure or a
server availability failure. It must not mask:

- `401` unauthenticated;
- `403` permission failure;
- Privacy-safe `404`;
- validation errors;
- `409` version conflicts;
- explicit revocation/authorization responses.

The cached presentation is always visibly read-only and shows the age of the
cached snapshot. Create, Update, Delete, visibility changes, reorder,
conversion, comment mutation, and every other write remain disabled/offline-
failed while the authoritative server is unavailable. eimir. does not
queue writes for later synchronization in M5.

Tokens, credentials, presigned URLs, signed media URLs, and upload state are
never written to the read cache.

### Web decision

The browser persistent cache uses the existing platform IndexedDB capability.
No new persistence framework is introduced.

Only explicitly approved `SPACE_SHARED` read snapshots may be persisted.
`OWNER_ONLY` ProtectedPayloads are not persisted by the Web client because a
browser-origin database does not provide a sufficiently independent key-
protection boundary for this product. Private Web data may exist in the active
TanStack Query/session memory while the authenticated page is open and is
cleared with the session/Space context.

This includes private HeartMoments: when a shared HeartMoment becomes `PRIVATE`,
any previously persisted shared snapshot for that resource is evicted
immediately after the successful visibility transition. The first M5 runtime
cache revision must also invalidate the earlier S2 IndexedDB schema so a
private HeartMoment that may have been cached under the provisional S2 policy
cannot survive the policy upgrade.

Web persistent-cache candidates are bounded to explicit shared read surfaces
whose stale read-only representation remains understandable. Search query
results, Notifications, Activity, authentication/session data, private-area
content, and other high-churn or privacy-sensitive projections are not silently
made persistent merely because TanStack Query can hold them in memory.

### Android decision

Android uses Room as the local read cache as specified by the product
architecture. `SPACE_SHARED` data may be cached normally. `OWNER_ONLY`
ProtectedPayload data may be persisted only when the cached protected bytes are
encrypted with a key protected by Android Keystore and the cache namespace also
contains Account + Space + Owner.

This decision does not approve a new third-party cryptographic framework. The
Android runtime slice must perform its own current reuse/security review before
selecting any additional dependency. If the platform implementation cannot meet
this boundary safely, it must fall back to memory-only owner content rather
than weaken the rule.

### Tests derived from M2-D18

At minimum, runtime evidence must cover:

- exact Account/Space scope match before a cache hit;
- seven-day expiry and deletion;
- complete deletion on logout, Account switch, and Space switch;
- no fallback after 401/403/404;
- no persisted Web `OWNER_ONLY` payload;
- eviction after `SHARED -> PRIVATE`;
- migration/invalidating of the provisional S2 IndexedDB schema;
- corrupted/unknown cache schema failing closed;
- visible localized age plus read-only state;
- mutation controls unavailable offline;
- no credential, token, signed URL, or upload state in persistent cache.

## Canonical Deep Link contract

Deep Links are application navigation identifiers, not authorization grants.
Every target is authorized again after navigation.

### Web

- React Router remains the routing authority; no second router or redirect
  framework is added.
- The deployed Web server must continue serving the SPA entry document for
  valid application paths so direct navigation/reload works.
- Canonical target builders are centralized and tested. Existing Memory,
  HeartMoment, Milestone, Wish, Plan, Place, Chapter, Collection, and Private
  Area detail paths remain the basis; future routes enter the registry only
  after their server contract exists.
- Resource IDs are encoded path segments.
- Private routes may contain only an opaque resource ID. They must not contain
  private titles, preview text, owner names, or other content.
- Authentication return-to behavior may preserve only a validated app-relative
  canonical path. Open redirects and arbitrary external `returnTo` values are
  rejected.
- Tokens, query text containing protected content, signed media URLs, and
  credentials are forbidden in canonical Deep Links.
- An authenticated but unauthorized target resolves through normal Privacy-safe
  API behavior; the route must not disclose whether a foreign/private resource
  exists.

### Cross-client logical targets

Web paths are presentation details. Notifications/Activity and future Android
App Links should resolve from a small logical target tuple such as resource
kind + resource ID, then map to the current client's canonical route. Persisted
server events must not store a full Web URL containing product content.

## Versioned eimir. Transfer Bundle

### Format identity

The neutral archive is named conceptually:

```text
eimir-export.zip
```

Format version 1 uses:

```text
manifest.json
accounts.json
space.json
profiles.json
people.json
memories.json
heart-moments.json
milestones.json
comments.json
wishes.json
plans.json
places.json
chapters.json
collections.json
reminders.json
rules.json
private/            # PERSONAL only; absent from SHARED
media/
```

A file may be absent when the corresponding Domain has no portable rows, but
`manifest.json` is mandatory.

`manifest.json` contains at least:

```text
formatVersion
exportedAt
applicationVersion
scope
sourceSpaceId
checksums
```

`formatVersion` is an integer. Version 1 is the first supported contract.
Checksums use SHA-256 and cover every non-manifest archive entry by normalized
relative path. Archive paths are canonical, relative, and must not contain
absolute paths, `..`, device paths, or duplicate normalized names.

JSON files are UTF-8 and use the external camelCase naming convention. Domain
records carry stable source IDs so relations and media references can be
remapped during import. Source IDs are data-mapping identifiers only and never
bypass target-instance authorization.

Media in the bundle is the already-sanitized authorized media that eimir.
serves, not the original pre-ingest upload. Every media entry is referenced by
an included Domain record; unreachable/orphan media is not exported.

### Stable asynchronous API contract

Large relationship archives must not be assembled in browser memory or inside
a single long-lived HTTP request. The runtime implementation therefore uses the
existing background-job/MediaStore architecture.

#### Create export

```text
POST /api/v1/spaces/{spaceId}/transfer/exports
```

Request:

```json
{
  "scope": "SHARED | PERSONAL"
}
```

Response: `202 Accepted` with a `TransferExport` descriptor.

#### Read export status

```text
GET /api/v1/spaces/{spaceId}/transfer/exports/{exportId}
```

Public states:

```text
QUEUED
RUNNING
READY
FAILED
EXPIRED
```

The descriptor contains only safe technical state/timestamps and must not
include archive content, filenames derived from user content, or Storage Keys.
A ready export exposes a server-authorized download action, not a public object
URL.

#### Download export

```text
GET /api/v1/spaces/{spaceId}/transfer/exports/{exportId}/download
```

Only the account that created that export may download it. The route rechecks
current Membership and export ownership. `READY` returns
`application/zip`; not-ready/failed/expired states return stable ProblemDetails.
Generated export artifacts expire and are physically deleted after **24 hours**.
Expiry is server time and cleanup is idempotent.

#### Stage import

```text
POST /api/v1/spaces/{spaceId}/transfer/imports
```

The request uploads exactly one bundle through an authorized server-side
stream. The bundle is staged privately and validated asynchronously. Response:
`202 Accepted` with a `TransferImport` descriptor.

#### Read import status

```text
GET /api/v1/spaces/{spaceId}/transfer/imports/{importId}
```

Public states:

```text
QUEUED
VALIDATING
READY_TO_APPLY
APPLYING
COMPLETED
FAILED
EXPIRED
```

Validation checks format version, manifest shape, canonical archive paths,
entry count/size limits, decompression ratio, SHA-256 checksums, referenced
media, Domain schema, source-ID uniqueness, relation integrity, Privacy scope,
and target-member mapping requirements before any Domain mutation occurs.

#### Apply validated import

```text
POST /api/v1/spaces/{spaceId}/transfer/imports/{importId}/apply
```

Import is explicit two-step behavior: upload/validate first, apply second. The
client must show the validated summary before apply. Apply is idempotent for the
same import resource and never acts as a destructive replace operation.

The import descriptor/status contains counts by safe Domain category and
stable error codes, not private titles or content excerpts.

### Import semantics

Normal import targets an existing authenticated eimir. Space. It does not
restore AuthIdentity, credentials, DeviceSessions, Entitlements, or server
configuration.

The bundle's source Account IDs are mapped to active members of the target Space
before apply. The API never accepts a target account outside the authenticated
Space. `OWNER_ONLY` records from a `PERSONAL` bundle may map only to the
requesting account. A `SHARED` bundle cannot manufacture owner-only records.

Target-instance IDs are newly assigned and source IDs are remapped consistently
across relations and media. The import does not trust source tenant IDs as
current authorization identifiers.

Apply is additive and atomic at the Domain-data level: validation completes
first; then either the import's Domain mutation commits with a complete mapping
or fails without a partially visible imported graph. Media staging/finalization
uses the existing MediaStore lifecycle and cleanup semantics; failed staging
must not leave readable orphan objects.

Version 1 does **not** implement destructive replace, database restore, or
foreign/predecessor database import. A future eimir. Classic exporter must
produce this neutral format without the Next importer reading Classic source or
schema.

### Stable error families

The runtime API must expose ProblemDetails codes for at least:

```text
TRANSFER_FORMAT_UNSUPPORTED
TRANSFER_MANIFEST_INVALID
TRANSFER_ARCHIVE_UNSAFE
TRANSFER_CHECKSUM_MISMATCH
TRANSFER_TOO_LARGE
TRANSFER_RELATION_INVALID
TRANSFER_MEMBER_MAPPING_REQUIRED
TRANSFER_MEMBER_MAPPING_INVALID
TRANSFER_PRIVACY_SCOPE_INVALID
TRANSFER_NOT_READY
TRANSFER_EXPIRED
TRANSFER_ALREADY_APPLIED
TRANSFER_IMPORT_FAILED
TRANSFER_EXPORT_FAILED
```

Foreign Space, unknown foreign transfer IDs, and inaccessible transfer
resources use the existing Privacy-safe not-found behavior.

### Resource and abuse controls

Runtime implementation must define concrete entry-count, compressed-size,
uncompressed-size, and decompression-ratio limits before enabling import. Limits
are technical abuse protections rather than commercial quotas and apply in both
operating models unless a stricter managed-service resource policy is separately
approved.

ZIP parsing is server-side and uses established runtime/library support. Clients
do not extract an untrusted archive merely to validate it. Path traversal,
symlinks/special files, duplicate normalized paths, excessive entry count,
excessive expansion, and checksum mismatch fail closed before Domain apply.

## Reuse-before-build decision

Selected reusable foundations:

- the standard ZIP/JSON/SHA-256 capabilities of the server runtime;
- existing eimir. Job/Worker infrastructure for long-running generation and
  validation;
- existing private MediaStore abstraction for staged/generated archive
  artifacts and imported media;
- existing FastAPI upload/streaming and ProblemDetails conventions;
- generated OpenAPI clients as Web/Android DTO and transport authority;
- IndexedDB, TanStack Query, React Router, Room, and Android Keystore as already
  selected platform/client foundations.

Rejected for this prerequisite:

- a client-side ZIP implementation;
- a second Web persistence framework;
- a custom sync protocol or Offline Write queue;
- direct import of any predecessor database/schema;
- public object-storage export links;
- a third-party portability/SaaS provider.

No new runtime dependency is approved by #303. Any later runtime dependency
requires the repository's normal current reuse, license, privacy, Cloud/Self-
Hosted, cost, and fallback review.

## Business/freemium result

- Essential export/import of a user's portable data: **Non-paywallable**.
- Cache Privacy/isolation/clearing guarantees: **Non-paywallable**.
- Official Web/Android access to the portability flow: **Free/Core**.
- Managed Cloud may impose transparent technical/fair-use limits on temporary
  archive generation resources, but it may not hide existing user data behind
  Premium or alter owner/partner Privacy rules.
- Self-Hosted is not artificially restricted to promote Cloud.

No entitlement check belongs in the M5 client implementation for this flow.

## Cross-cutting quality result

### Security and Privacy

Authorization is rechecked for export creation, status, download, import stage,
status, and apply. Transfer IDs are not bearer credentials. Owner-only content
never crosses owner scope. Archives are private temporary data and are not
logged. Cache and Deep Link rules above are binding.

### Concurrency and consistency

Exports are point-in-time generated snapshots of the records selected by the
export job; the runtime slice must document its transaction/snapshot strategy.
Import validates before apply and uses one stable source-to-target ID mapping.
Repeated apply of the same import is idempotent rather than duplicating rows.

### Resilience

Transfer jobs survive an HTTP disconnect. Failed jobs expose safe retryable
state. Cleanup of staged/import/export artifacts is idempotent. Cache fallback
never pretends a write succeeded.

### Accessibility and i18n

All Web/Android export/import, cache-age, read-only, validation, failure, and
confirmation text is localization-driven. Transfer progress/status is exposed
semantically and not by color alone. Import apply requires an accessible
explicit confirmation after validation.

### Observability

Metrics/logs may record job type, state, duration, byte/count buckets, and safe
error code. They must not contain bundle payloads, private titles, archive
content, Storage Keys, signed URLs, or source filenames derived from user data.

### Performance and operations

Archive generation/validation is background work, not a blocking browser
operation. Import has explicit anti-zip-bomb controls. Temporary artifacts have
bounded 24-hour retention. Runtime work must include Self-Hosted storage and
cleanup behavior in tests/documentation.

## Runtime work unlocked by #303

After this decision slice merges, implementation may start in separate runtime
issues/PRs without redefining the decisions above:

1. **Transfer Bundle backend/API:** job-backed Export/Import, manifest v1,
   authorization, cleanup, media handling, abuse limits, tests, OpenAPI, and
   regenerated clients.
2. **M5 Web S6 runtime:** canonical Deep Link registry, safe auth return target,
   cache schema migration/TTL/scope clearing/data-age presentation, no Web
   owner-only persistence, and generated-client portability UI.
3. **M5 Android runtime/parity:** Room/Keystore implementation according to
   M2-D18 plus generated-client portability integration and parity evidence.

M5/G4 remains incomplete until those runtime/evidence tasks are merged and
verified. #303 itself is complete when these decisions are versioned, M2-D17 and
M2-D18 are marked `DECIDED`, and the follow-up work is traceable.