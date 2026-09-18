# M2 Decision Log

**As of:** August 31, 2026  
**Rule:** An open question is never decided silently in code.

This log separates specification statements from implementation proposals. `PROPOSED` is not binding. `DECIDED` requires a date, decision owner, and reference to an ADR, specification, or Issue.

## Status and priority

- `OPEN` – decision missing.
- `PROPOSED` – preferred option exists, approval missing.
- `DECIDED` – documented and binding.
- `BLOCKING` – decide before the first affected implementation.
- `BEFORE_CLIENTS` – decide before stable Web/Android integration.
- `LATER` – may deliberately be deferred beyond M2 while the boundary remains open.

## Decisions

| ID | Priority | Status | Owner | Question | Proposal / next action |
|---|---|---|---|---|---|
| M2-D01 | BLOCKING | DECIDED | Product + Domain | May the partner modify or delete a Memory authored by the other person? | No. Both active partners read shared Memories; Update/Delete remain exclusive to the immutable author. See decision below / #68. |
| M2-D02 | BLOCKING | DECIDED | Domain + API | Do Comments receive a `version` field for Optimistic Concurrency? | Yes. Editable Comments receive `version`; Update/Delete require the same If-Match/409 semantics as other mutable resources. See #68. |
| M2-D03 | BLOCKING | DECIDED | Domain + Data | How are multiple Attachments bound: exclusive ownership, reuse, join entity, and sort order? | Exclusive binding to at most one parent; MemoryAttachment with stable `position`; no Cross-Space or multiple binding. See #69. |
| M2-D04 | BLOCKING | DECIDED | Security + Product | Which MIME types, file sizes, pixel limits, and video durations apply per platform? | JPEG/PNG/WebP/HEIC/HEIF ≤25 MiB/40 MP/12k px; MP4/QuickTime ≤250 MiB/180 s/4K; Memory ≤20 Attachments/500 MiB. See #69. |
| M2-D05 | BLOCKING | DECIDED | Backend + Ops | Is Media validation synchronous during Finalize or asynchronous? Which internal states are required? | Asynchronous; `PENDING/UPLOADING/VALIDATING/READY/FAILED/DELETING/DELETE_FAILED`. See #69. |
| M2-D06 | BLOCKING | DECIDED | Security + Privacy | Is emotion on HeartMoment metadata or ProtectedPayload? | ProtectedPayload. Emotion is sensitive relationship content and must not be used as Analytics/Event/Log metadata. See #68. |
| M2-D07 | BLOCKING | DECIDED | Domain + Privacy | What happens to Comments when a HeartMoment changes from `SHARED` to `PRIVATE`? | The change is allowed only as an atomic Privacy operation; existing Comments are deleted in the same DB transaction. No partner projection may remain afterward. See #68. |
| M2-D08 | BLOCKING | DECIDED | API + Data | Which Story ordering applies when `happenedOn` is missing, and which tie-breaker stabilizes cursors? | `effectiveDate = happenedOn ?? UTC_DATE(createdAt)`; key `(effectiveDate, createdAt, kindRank, id)`, complete Keyset Pagination; cursor opaque/integrity-protected. See #70. |
| M2-D09 | BLOCKING | DECIDED | API | Exact routes, nesting, and DTO names? | Space-scoped route catalog and DTOs are frozen in `API-DESIGN.md`/`API-CONTRACT.json`. Parent Comments are nested; Update/Delete by Space-scoped Comment ID. See #70. |
| M2-D10 | BEFORE_CLIENTS | OPEN | Product + Privacy | Which Notification Preview may a Comment show? | Generic by default; content excerpt only after explicit Privacy approval. |
| M2-D11 | BLOCKING | DECIDED | Data + Privacy | Delete, Retention, and Cascade rules for Entity, Relation, Blob, Event, and Audit? | Domain portion #68 plus Media portion #69 decided: domain entity immediately invisible; Comments atomic; final Media reference sets `DELETING`; Provider Cleanup async/idempotent; `DELETE_FAILED` retryable/observable. |
| M2-D12 | BLOCKING | DECIDED | Backend + Ops | How long are incomplete/failed uploads retained? | PENDING/UPLOADING/FAILED 24 h; Cleanup at least hourly; DELETE_FAILED until success/manual intervention. See #69. |
| M2-D13 | BLOCKING | DECIDED | Security + Media | Direct Upload or server-side stream for Local/S3 adapters? | Local: authorized server stream. S3: presigned Upload ≤10 min; Read URL ≤5 min. Domain/Finalize Authorization remains server-controlled. See #69. |
| M2-D14 | BLOCKING | DECIDED | Privacy + Product | Are EXIF, GPS, and other embedded metadata removed? | Yes, during ingest. The validation job extracts an allowlist of technical fields into ProtectedPayload and then stores only the sanitized file. See #78. |
| M2-D15 | BLOCKING | DECIDED | Media + Product | Are Thumbnailing, Transcoding, and Poster Frames part of M2? | One derived variant each: image Thumbnail and video Poster Frame. Transcoding is not part of M2. See #78. |
| M2-D16 | BLOCKING | DECIDED | Architecture + Security | Minimum schema for each M2 Domain Event? | Envelope: `eventId`, `eventType`, `occurredAt`, `spaceId`, `actorId`, `resourceType`, `resourceId`, `resourceVersion`; event-specific payload only IDs, safe states/categories, and technical timestamps. No ProtectedPayload, filenames, URLs, or emotion. See #68. |
| M2-D17 | BEFORE_CLIENTS | DECIDED | Product + Privacy | Which private data is included in personal Export, shared Export, or Backup? | `SHARED` contains only portable SPACE_SHARED data; `PERSONAL` adds only the requesting account's OWNER_ONLY data. Operational Backup remains separate. See #303 and `../m5/S6-CACHE-PORTABILITY-DECISIONS.md`. |
| M2-D18 | BEFORE_CLIENTS | DECIDED | Client + Security | Which cache/offline Retention applies to private content on Web and Android? | Account+Space+Privacy/Owner scoped, hard seven-day maximum age, complete clearing on logout/Account/Space change, no Offline Write. Web persists SPACE_SHARED only; Android OWNER_ONLY requires Keystore-backed encryption. See #303 and `../m5/S6-CACHE-PORTABILITY-DECISIONS.md`. |
| M2-D19 | LATER | PROPOSED | Architecture | How does E2EE remain retrofittable without pretending real E2EE exists today? | Preserve ProtectedPayload and opaque MediaStore; Key Management explicitly outside M2. |
| M2-D20 | BLOCKING | DECIDED | Domain | Can an Attachment be `READY` without a parent, and for how long? | Yes, owner only and for at most 60 min from `readyAt`; then `DELETING`; Bind vs. Cleanup is serialized. See #69. |
| M2-D21 | BEFORE_CLIENTS | OPEN | Search + Privacy | Is M2 Search implemented directly in Postgres or through a separate index? | Global full-text Search is not required for G2 and generally belongs to M4; if needed earlier, require a new explicit gate decision. |
| M2-D22 | BLOCKING | SUPERSEDED by #1021 | Product + UX | Is the owner area for private HeartMoments part of the shared Story route or a separate view? | *(as decided in M2)* Separate view. `/timeline` remains a pure shared Read Model without private variant and without `visibility` parameter; the owner area is served by the existing HeartMoment collection. See #104. **Superseded:** `/timeline` is now viewer-authorized instead; see the entry below. |
| M2-D23 | BLOCKING | DECIDED | Security + Media | In which order are image and video processing implemented, and which parsers enter the project? | Images first with Pillow and pillow-heif; video including ffmpeg follows as a separate slice. Until then the server rejects MP4/QuickTime fail-closed. See #85. |
| M2-D24 | BLOCKING | DECIDED | API + Security | How does the owner read an unbound Attachment when AttachmentReadRequest requires a parent reference? | Add `parentType: "NONE"` to the union for the owner's own unbound upload inside the binding window. Owner, `READY`, and window are checked server-side. See #79. |
| M2-D25 | BLOCKING | DECIDED | Product + Domain | May the partner modify or delete the other person's Milestone? | No. Both read; Update and Delete remain with the immutable author, as for Memory (M2-D01). See #94. |

## Binding Domain/Privacy principles for M2

- Public Domain/API language uses `visibility = SHARED | PRIVATE` where a resource supports both visibility states.
- `SPACE_SHARED` and `OWNER_ONLY` remain internal Authorization/persistence classes; clients do not write `privacyClass` as a second source of truth.
- `PRIVATE` is not post-hoc UI filtering. Unauthorized rows are excluded in the authorized data query itself.
- ProtectedPayload is an architecture and leakage boundary, not a claim of real E2EE.
- Memory and Milestone are shared Space content; HeartMoment may be `SHARED` or `PRIVATE`; Comment has no independent visibility and inherits parent reachability.
- Author/owner IDs are immutable after creation. Normal updates must not transfer ownership.

## Decided entries

### M2-D01 – Write permissions for Memory
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Product + Domain / project decision #68  
Decision: A Memory is shared content readable by both active Space partners. Update and Delete may be performed only by the immutable `authorId`. The partner may not change or delete the Memory through either content or non-content fields. A later collaboration feature requires a new explicit Domain decision and must not silently weaken this rule.  
Rationale: Shared readability does not grant write authority. The author rule prevents surprising modification/deletion of personal Memories and provides a simple, testable ownership boundary.  
Consequences: Create derives `authorId` from Authorization Context. Read/List allow both active Space members. Update/Delete require Membership + authorized resource query + author check + current version. Foreign Space remains 404; a visible partner Memory without write permission follows the existing 403-vs-404 convention for known shared resources. Web/Android must not offer active Edit/Delete actions to the partner.  
Tests: author CRUD; partner read/list; partner update/delete denied; foreign Space 404; stale author update/delete 409; `authorId` immutable.  
References: #68, `DOMAIN-MODEL.md`, `PROJECT-CONTROL.md`.

### M2-D02 – Optimistic Concurrency for Comments
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Domain + API / project decision #68  
Decision: Comments are editable entities and receive a persisted `version` field. Update and Delete require `If-Match` according to the same API convention as other mutable M1/M2 resources; a stale version deterministically returns `409 RESOURCE_VERSION_CONFLICT`. Only the immutable Comment author may modify Body or delete the Comment.  
Rationale: Without versioning, Comment Edit would become an isolated last-write-wins special case and break the global Concurrency invariant.  
Consequences: Comment DTO exposes `version`/ETag; Create starts at version 1; every persisted change increments the version. Parent Privacy/Delete may atomically remove Comments as a server-side Domain operation without requiring an If-Match supplied by the Comment author.  
Tests: author update/delete; partner denied; stale update/delete 409; Parent Cascade despite Comment ownership; Cross-Space 404.  
References: #68, `DOMAIN-MODEL.md`, existing API Concurrency convention.

### M2-D06 – HeartMoment emotion is ProtectedPayload
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Security + Privacy / project decision #68  
Decision: `emotion`, together with HeartMoment `text`, is classified as ProtectedPayload. The value may be delivered through the authorized resource API to authorized clients, but is not general metadata and must not be copied into Analytics, logs, Notification Previews, Domain Event payloads, metric labels, or Search indexes outside the protected content boundary.  
Rationale: Emotion describes sensitive relationship content and may reveal private information independently of the text. Plaintext is not required for sorting, Tenant Isolation, or routing.  
Consequences: Persistence must respect the ProtectedPayload abstraction; future encryptability must not depend on plaintext emotion in indexes/events. Filtering by emotion is not part of the M2 contract.  
Tests: Events/logs do not contain emotion; private HeartMoment remains fully owner-only; serialization returns emotion only after successful resource Authorization.  
References: #68, `DOMAIN-MODEL.md`, `SECURITY-TEST-MATRIX.md`.

### M2-D07 – SHARED to PRIVATE for HeartMoment
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Domain + Privacy / project decision #68  
Decision: A `SHARED -> PRIVATE` transition is an atomic Domain operation. In the same DB transaction, Privacy class is changed to `OWNER_ONLY` and all Comments on that HeartMoment are domain-deleted. After commit, no partner visibility may remain through Comment, Story, Activity, Notification, cache, or Event projections. The API response after the transition reveals neither Comment count nor earlier private states to the partner. `PRIVATE -> SHARED` does not restore deleted Comments.  
Rationale: Comments are shared content on a previously shared parent. Merely hiding them would complicate Retention/re-sharing semantics and could unexpectedly make partner data visible again later. Deletion is the clearest Privacy boundary.  
Consequences: Before `SHARED -> PRIVATE`, the UI must provide a general warning that existing Comments will be removed. It must not reveal foreign private data. Projections/consumers receive only safe IDs/state changes.  
Tests: transition and Comment Delete atomic; rollback fully restores old state; Story/partner GET after commit without leak; PRIVATE->SHARED restores nothing; race with Comment Create is serialized or rejected without conflict leakage.  
References: #68, `DOMAIN-MODEL.md`, `SECURITY-TEST-MATRIX.md`.

### M2-D11 – Domain Delete/Retention rules
Status: DECIDED (DOMAIN); see supplement below for Media portion  
Date: 2026-08-25  
Decision owner: Data + Privacy / project decision #68  
Decision: Domain Delete makes the resource unreadable immediately upon successful commit. Story is a non-persisted Read Model and requires no independent deletion. Comments are dependent Domain objects and are atomically deleted in the same DB transaction when their parent is deleted. Domain Events/Audit may retain IDs, types, versions, actor/Space reference, timestamp, and safe states required for technical traceability, but no ProtectedPayload. Physical Blob deletion, orphan Retention, and Cleanup Retry are decided separately in #69.  
Rationale: Privacy requires immediate domain-level invisibility, while external Storage I/O must not be unreliably coupled to the DB transaction.  
Consequences: Parent Delete and Comment Cascade form one DB transaction. Cleanup is event/job-based and idempotent. Historical Events must not become shadow copies of deleted content.  
Tests: after commit 404/no List or Story row; transaction rollback restores parent+Comments; Event contains no ProtectedPayload; Storage Cleanup failure does not make a deleted Domain resource visible again.  
References: #68, #69, `DOMAIN-MODEL.md`, `MEDIA-PIPELINE.md`.

### M2-D16 – Minimum M2 Domain Event schema
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Architecture + Security / project decision #68  
Decision: Every M2 Domain Event uses at least the envelope `eventId`, `eventType`, `occurredAt`, `spaceId`, `actorId`, `resourceType`, `resourceId`, `resourceVersion`. Event-specific payload may contain only additional IDs, technical timestamps, and states/categories explicitly classified as safe. Forbidden are ProtectedPayload fields, Comment Body, Memory/Milestone title and Body, HeartMoment text/emotion, original filenames, Storage Keys, Download URLs, and unnecessary personal metadata. Delete Events may contain the last known resource ID/version and `deletedAt`, but not deleted content.  
Rationale: Consumers need stable routing/invalidation data, not sensitive content. A small envelope reduces leakage in Outbox, logs, retries, and Observability and preserves future encryptability.  
Consequences: Notification/Activity consumers load required presentation through their own Authorization or use generic text; they must not expect sensitive snapshots in the Event. A `PRIVATE` HeartMoment generates no partner-directed Activity/Notification.  
Tests: schema/contract test per Event type; negative tests for forbidden keys/values; private Events create no partner projection; Outbox and logs contain no ProtectedPayload.  
References: #68, `DOMAIN-MODEL.md`, `SECURITY-TEST-MATRIX.md`.

### M2-D17 – Export and private-data boundary
Status: DECIDED  
Date: 2026-08-31  
Decision owner: Product + Privacy / M5 decision #303  
Decision: Normal user portability has two scopes. `SHARED` contains the portable `SPACE_SHARED` dataset of the selected Space and no `OWNER_ONLY` content from either member. `PERSONAL` is that shared dataset plus only the requesting account's portable `OWNER_ONLY` content. The requester comes from Authorization Context; no client-selected owner may export a partner's private data. Credentials, sessions, Passkeys, Refresh/Push Tokens, Security/Audit logs, signed URLs, runtime Job/Outbox state, Entitlements, and temporary upload/cache state are excluded. Operational backup/disaster recovery remains a separate M9 contract and does not create a partner-facing private-data export path.  
Rationale: Data portability must preserve the user's shared history and their own private data without turning export into an authorization bypass. Keeping operational backup separate avoids conflating a host-level recovery mechanism with a user-facing data-rights API.  
Consequences: The M5 Transfer Bundle API exposes `SHARED | PERSONAL`; essential portability is non-paywallable; the neutral bundle is identical across Cloud and Self-Hosted; private rows/media are selected before bundle generation rather than generated and filtered client-side. A future Classic migration must produce the neutral bundle and cannot import a foreign database directly.  
Tests: either partner can export SHARED without any owner-only row/count/media; PERSONAL includes only caller-owned private rows; partner private data is absent even through relations/previews; excluded credential/runtime data never appears; Cross-Space/foreign export IDs are Privacy-safe.  
References: #303, `../m5/S6-CACHE-PORTABILITY-DECISIONS.md`, `../../specification/CLEAN-ROOM-MASTER-SPEC.md`, `../../specification/PRODUCT-SPEC.md`.

### M2-D18 – Client read-cache retention and isolation
Status: DECIDED  
Date: 2026-08-31  
Decision owner: Client + Security / M5 decision #303  
Decision: Persistent read-cache entries are namespaced by Account + Space + Privacy scope and, where owner-only persistence is permitted, Owner. They have a hard seven-day maximum age and are completely cleared on logout, Account change, or Space change. Cache fallback is allowed only for transport/server availability failures and never masks 401/403/Privacy-safe 404 or write/conflict outcomes. Cached presentation is visibly aged and read-only; M5 implements no Offline Write. Web IndexedDB persists only explicitly approved `SPACE_SHARED` snapshots and never `OWNER_ONLY` ProtectedPayload. Android may persist `OWNER_ONLY` ProtectedPayload only with platform-backed encryption using a Keystore-protected key; otherwise it falls back to memory-only owner content.  
Rationale: Namespace-only separation is insufficient if sensitive browser cache survives an identity/context transition. The browser does not provide an independent application key boundary strong enough to justify persistent private payloads, while Android has a platform-backed Keystore boundary. A bounded retention window reduces stale/privacy risk without pretending the client is an offline replica.  
Consequences: The first M5 cache runtime revision invalidates the provisional S2 IndexedDB schema, evicts a shared HeartMoment immediately after successful `SHARED -> PRIVATE`, stores no tokens/signed URLs/upload state, and presents localized cache age. Android Room/Keystore runtime must independently prove encryption and clearing. Search/Notification/Activity/private projections do not become persistent merely because they exist in in-memory query state.  
Tests: exact scope match; seven-day expiry; logout/Account/Space clearing; no fallback after 401/403/404; no Web owner-only persistence; S2 schema invalidation; SHARED->PRIVATE eviction; corrupted cache fails closed; visible age/read-only UX; no offline mutation queue; no credentials in cache.  
References: #303, `../m5/S6-CACHE-PORTABILITY-DECISIONS.md`, M3-D22 in `../m3/DECISION-LOG.md`.

### M2-D03 – Attachment binding
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Domain + Data / project decision #69  
Decision: An Attachment belongs to exactly one Space and owner and may be bound to at most one Domain resource in M2. Memory uses an explicit `MemoryAttachment` relation with unique zero-based `position`; HeartMoment allows at most one Attachment. Reuse of the same Attachment record across multiple parents and Cross-Space binding are forbidden.  
Rationale: Exclusive binding keeps parent Authorization and Cleanup unambiguous and avoids many-to-many Privacy races.  
Consequences: Binding requires owner + writable parent in the same Space + `READY` within the binding window and occurs atomically.  
References: #69, `MEDIA-PIPELINE.md`.

### M2-D04 – Media allowlist and limits
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Security + Product / project decision #69  
Decision: Images JPEG/PNG/WebP/HEIC/HEIF up to 25 MiB, 40 MP, and 12,000 px per edge. Videos MP4/QuickTime up to 250 MiB, 180 seconds, and 3840×2160. Memory at most 20 Attachments and 500 MiB; HeartMoment at most one. All other types fail closed.  
Rationale: A small positive allowlist covers typical smartphone media while limiting parser, storage, and DoS risk.  
Consequences: The server validates actual bytes/MIME/size/dimensions/duration; client values are UX only.  
References: #69, `MEDIA-PIPELINE.md`, `SECURITY-TEST-MATRIX.md`.

### M2-D05 – Asynchronous validation and states
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Backend + Ops / project decision #69  
Decision: `finalizeUpload` atomically sets `VALIDATING` and enqueues an idempotent job. Internal states are `PENDING`, `UPLOADING`, `VALIDATING`, `READY`, `FAILED`, `DELETING`, `DELETE_FAILED`.  
Rationale: Media parsers and Provider I/O do not belong in a long HTTP/DB transaction; the same contract works for Local and S3.  
Consequences: Clients do not treat Finalize as upload success and observe status; concurrent Finalize is serialized.  
References: #69, `MEDIA-PIPELINE.md`.

### M2-D11 – Media Delete/Cleanup supplement
Status: DECIDED (MEDIA)  
Date: 2026-08-25  
Decision owner: Data + Privacy / project decision #69  
Decision: When the final allowed parent reference is removed or an orphan expires, the DB atomically marks the Attachment `DELETING`. Provider deletion occurs outside the domain transaction through an idempotent job. Failures become `DELETE_FAILED` with repeated Retry/alerting; they never make Domain content visible again.  
Rationale: External Storage I/O must not be unreliably coupled to the DB transaction.  
Consequences: Cleanup is observable; metadata is finalized/removed only after successful Provider Cleanup.  
References: #69, #68, `MEDIA-PIPELINE.md`.

### M2-D12 – Upload Retention
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Backend + Ops / project decision #69  
Decision: PENDING without completion, UPLOADING without Finalize, and FAILED become eligible for Cleanup after 24 hours. Cleanup runs at least hourly. `DELETE_FAILED` has no automatic forgetting period and remains visible/metricized until success or manual intervention.  
Rationale: 24 hours tolerates mobile interruptions while preventing permanent orphans.  
Consequences: Retention is based on server-side timestamps, never client time.  
References: #69, `MEDIA-PIPELINE.md`.

### M2-D13 – Upload/Read transport
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Security + Media / project decision #69  
Decision: LocalMediaStore accepts uploads through an authorized server-side streaming route. S3MediaStore may use presigned Upload URLs with a maximum TTL of 10 minutes. Reads: Local streams after server-side Authorization; S3 returns a signed URL with a maximum TTL of 5 minutes only after parent Authorization. Bucket/Storage remains private.  
Rationale: Adapters may optimize transport but must not bypass Domain Authorization or Finalize.  
Consequences: URLs/signatures are not logged or persisted; the residual access window after permission revocation is limited to at most 5 minutes for S3 and documented as a trade-off.  
References: #69, `MEDIA-PIPELINE.md`.

### M2-D20 – READY without a parent
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Domain / project decision #69  
Decision: A READY Attachment may remain unbound for at most 60 minutes from `readyAt` and is manageable only by its owner during that time. Afterward it becomes eligible for Cleanup. Binding and Cleanup are serialized through status check/Row Lock.  
Rationale: A short window decouples upload and parent mutation without creating permanently readable orphans.  
Consequences: After successful binding, lifetime follows the parent; no partner access exists merely because the Attachment is READY.  
References: #69, `MEDIA-PIPELINE.md`.

### M2-D08 – Story ordering and cursor
Status: DECIDED  
Date: 2026-08-25  
Decision owner: API + Data / project decision #70  
Decision: Story uses `effectiveDate = happenedOn ?? UTC_DATE(createdAt)` and the complete Keyset key `(effectiveDate, createdAt, kindRank, id)`. `kindRank` is `MEMORY=1`, `HEART_MOMENT=2`, `MILESTONE=3`. ASC/DESC applies the same direction to the complete tuple. The cursor is opaque, versioned, integrity-protected, and bound to Space plus `type`/`year`/`order`.  
Rationale: A complete unique key prevents tie duplicates/gaps without Offset Pagination and remains deterministic for heterogeneous Story unions.  
Consequences: `q` remains M4. Privacy/Tenant filtering occurs before sorting. A manipulated or context-foreign cursor returns `400 INVALID_CURSOR` without foreign metadata. Concurrent modification of a sort field does not promise a historical snapshot; clients refresh.  
Tests: identical effectiveDate/createdAt across all kinds; ASC/DESC; cursor with changed Space/filter/order; PRIVATE HeartMoment never in union; no tie duplicates/gaps on unchanged data.  
References: #70, `API-DESIGN.md`, `API-CONTRACT.json`.

### M2-D09 – Routes, nesting, and DTO names
Status: DECIDED  
Date: 2026-08-25  
Decision owner: API / project decision #70  
Decision: M2 remains entirely under `/api/v1/spaces/{spaceId}`. Memories, HeartMoments, Milestones, and Attachments have their own collections. Comment Create/List is nested under the parent; Comment Update/Delete runs through `/comments/{commentId}` in the Space. Story remains `/timeline`. Privacy transition for HeartMoment is an explicit `/visibility` mutation. DTO/operationId names are frozen in `API-DESIGN.md` and machine-readably in `API-CONTRACT.json`.  
Rationale: Parent nesting for Comment Create/List removes freely selectable target IDs/types from the Body; Space scoping matches the existing Tenant Guard. A dedicated Privacy endpoint makes destructive SHARED->PRIVATE semantics explicit.  
Consequences: Clients write neither `privacyClass` nor Storage internals. All mutations of existing resources use If-Match. `backend/openapi.json` is updated by the existing generator only with implemented runtime slices; the manifest is not a second production OpenAPI contract.  
Tests: unique operationIds/method-path pairs; all paths Space-scoped; If-Match matrix; no `privacyClass` write fields; Attachment descriptor without Storage Keys/Bucket/Provider.  
References: #70, `API-DESIGN.md`, `API-CONTRACT.json`, `backend/tests/test_m2_api_contract_manifest.py`.

### M2-D14 – EXIF/metadata removal on ingest
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Privacy + Product / project decision #78  
Decision: Embedded metadata is removed on ingest. Before stripping, the existing validation job extracts a closed allowlist of technical fields into ProtectedPayload: capture timestamp, orientation, width, height, and video duration. Everything else — GPS/location, device and serial numbers, software, author and copyright fields, Comment/description fields, container Thumbnails, and unknown segments — is discarded. Only the sanitized file is stored; uploaded original bytes are not retained permanently. The allowlist is fail-closed: a field not explicitly listed is removed, not kept.  
Rationale: A blacklist of known location fields is incomplete — containers carry location in vendor-specific and newly introduced segments as well. Only an allowlist matches the fail-closed approach M2 already applies to MIME and format validation. Stripping on ingest creates exactly one object, so Export, Backup, and any future read path do not have to decide repeatedly which copy may leave the system. Extraction before stripping preserves domain value: capture timestamp remains available as a source for `happenedOn`.  
Consequences: The validation step from M2-D05 rewrites the object; `READY` is set only after successful stripping. Media that cannot be safely sanitized fails closed as `FAILED` and is not stored unstripped. The extracted allowlist is ProtectedPayload and is not projected into Events, logs, metrics, or indexes. A future feature "download original with metadata" does not exist and requires a new decision. M2-D17 (Export) may assume no location remains in Media objects.  
Tests: image with GPS tag contains no location data after `READY`; vendor segment with embedded location is also removed; unknown metadata segment does not survive ingest; capture timestamp exists as ProtectedPayload and appears in no Outbox row; Media that cannot be sanitized ends `FAILED` rather than `READY`; video retains duration and loses location.  
References: #78, `MEDIA-PIPELINE.md`, `PRIVACY-THREAT-MODEL.md`, `SECURITY-TEST-MATRIX.md`.

### M2-D15 – Scope of derived Media variants
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Media + Product / project decision #78  
Decision: M2 creates at most one derived variant per Attachment: a reduced Thumbnail for images and one Poster Frame for video. Video Transcoding, multiple resolution levels, audio extraction, and adaptive streaming are not part of M2. Variants are created server-side in the same validation job after M2-D14 has been applied and contain no embedded metadata themselves.  
Rationale: M2 allows images up to 25 MiB and 40 MP. A Story Timeline delivering originals exceeds every client budget and turns every List view into bandwidth amplification through the authorized read route — not only a Performance issue but an abuse issue. The Poster Frame adds little incremental cost because validation already needs a server-side Media probe for duration and resolution. Transcoding, by contrast, would pull a large dependency with attack surface and long-running jobs into the first Media slice and contradict the goal of keeping S1 a manageable security surface.  
Consequences: Storage Key receives controlled server-side variant suffixes following the existing pattern; clients do not choose variant keys. A variant has no independent Authorization and follows exactly that of its Attachment and therefore the parent. Cleanup removes variants with the Attachment; an orphaned variant object is a Cleanup error, not an allowed state. Failed variant generation does not set the Attachment to `FAILED`; the Attachment is delivered without a variant — a missing Thumbnail is a presentation issue, not a security issue. Video without a generated Poster Frame is shown neutrally in the client.  
Tests: Thumbnail and Poster Frame exist after `READY` and are metadata-free; variant cannot be retrieved without parent read permission; parent Privacy transition also blocks the variant; Delete removes original and variants; failed variant generation leaves the Attachment usable; no client-selectable variant key.  
References: #78, `MEDIA-PIPELINE.md`, `DELIVERY-PLAN.md`.

### M2-D23 – Order and parsers for Media processing
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Security + Media / project decision #85  
Decision: Media processing is implemented in two steps. The first slice fully handles images only — JPEG, PNG, WebP, HEIC, and HEIF — including validation, metadata removal per M2-D14, and Thumbnail generation per M2-D15. `Pillow` and `pillow-heif` enter the project for this; HEIC/HEIF is in the D04 allowlist and cannot be supported without libheif. Video and Poster Frames follow as a separate slice together with ffmpeg. Until that slice is delivered, the server rejects MP4 and QuickTime fail-closed even though M2-D04 allows them.  
Rationale: Parsing untrusted Media files is the riskiest code path in the product. Introducing image and video parsers simultaneously brings in the full attack surface at once and makes the first Media slice too large for careful review. The two questions are also different in kind: Pillow is a library decision, ffmpeg is an operational decision affecting Container Image and Self-Hosted installation — and a system binary is invisible to the existing `uv audit` gate, so it needs a separate evidence path.  
Consequences: M2-D04 remains unchanged as a contract; the gap between allowed target contract and current server response is explicitly documented rather than silently different. Until then, a video upload ends with `ATTACHMENT_TYPE_NOT_ALLOWED`, not a server failure or a stuck `PENDING`. Clients must not present video as available in M2. Before implementation, the video slice must resolve the ffmpeg question including image size, CVE tracking, and resource limits during Transcoding. The inventory entry for `Pillow` and `pillow-heif` is created in #79 together with the declaration because the dependency gate treats a documented line without a declaration as an error.  
Tests: video MIME is rejected while the video slice is absent; rejection uses a stable error code and leaves no object in the Store; HEIC/HEIF reaches `READY`; image formats on the allowlist complete stripping and Thumbnail generation.  
References: #85, #79, `MEDIA-PIPELINE.md`, `DELIVERY-PLAN.md`.

### M2-D24 – Read access to unbound Attachments
Status: DECIDED  
Date: 2026-08-25  
Decision owner: API + Security / project decision #79  
Decision: `AttachmentReadRequest` is additively extended with the variant `{ parentType: "NONE" }`. It represents the owner's own, not-yet-bound upload inside the binding window from M2-D20. Existing variants `MEMORY` and `HEART_MOMENT` remain valid unchanged. For an already bound Attachment, `NONE` is invalid; reachability is then determined exclusively by the parent.  
Rationale: Section 8 of the Media Pipeline already defines this case — a `READY` Attachment without a parent is visible to its owner inside the window. The request contract frozen in #70 simply could not express it because it was modeled as a closed union over two parent types. Without the variant, the owner could not view a newly uploaded image, and the first Media slice could prove only the absence of its authorized read path.  
Consequences: The variant is not an Authorization shortcut. The server requires owner identity, status `READY`, and an unexpired binding window; afterward readability follows only the parent. A partner never gains access through `NONE`, including to an unbound Attachment in the same Space. After the window expires, the Attachment becomes `DELETING` anyway. The extension is backward-compatible: existing clients continue sending a parent reference.  
Tests: owner reads own unbound upload; partner receives 404; `NONE` on a bound Attachment is rejected; expired window returns 404; `NONE` on foreign or non-`READY` Attachment returns 404.  
References: #79, `API-DESIGN.md`, `API-CONTRACT.json`, `MEDIA-PIPELINE.md`.

### M2-D25 – Write permissions for Milestone
Status: DECIDED  
Date: 2026-08-25  
Decision owner: Product + Domain / project decision #94  
Decision: A Milestone is shared content readable by both active Space partners. Update and Delete may be performed only by the immutable `authorId` — the same rule as for Memory in M2-D01. Shared readability does not grant write authority.  
Rationale: The Domain model explicitly left this question open and prohibited any partner write authority inferred from shared readability until resolved. The deciding factor was reversibility: opening collaborative editing later is additive and threatens no existing content, whereas closing it later would remove functionality from couples that had come to rely on it. It also keeps Authorization on a single already-tested rule; otherwise Milestone would become the first resource where read and write boundaries diverge.  
Consequences: `authorization.rules` needs no new rule class — `SPACE_SHARED` remains readable by the Space and writable only by the owner. Create derives `authorId` from Authorization Context; the partner's `capabilities` exposes neither Edit nor Delete. Future collaborative editing requires a new explicit decision and its own rule in the table, not an endpoint exception.  
Tests: author CRUD; partner read/list; partner update/delete denied with 403; foreign Space 404; stale `If-Match` 409; `authorId` immutable.  
References: #94, `DOMAIN-MODEL.md`, `authorization/rules.py`.

### M2-D22 – Owner view for private HeartMoments
Status: DECIDED  
Priority: promoted from `BEFORE_CLIENTS` to `BLOCKING`  
Date: 2026-08-25  
Decision owner: Product + UX / project decision #104  
Decision: The owner area for private HeartMoments is a separate view and not part of the shared Story route. `GET /spaces/{spaceId}/timeline` returns shared content only; it has no `PRIVATE` variant of the Story union, no `visibility` parameter, no owner mode, and no count of private entries. The owner area is served by the existing collection `GET /spaces/{spaceId}/heart-moments?visibility=PRIVATE`. M2 adds no new route for this. The rejected alternative was extending `/timeline` with an owner mode that also mixes in the caller's private HeartMoments.  
Rationale: Both options can be implemented correctly — the difference is how often the Privacy question must be answered again afterward. A Story route with owner mode would have two result sets under one `operationId`, and every later Story property would have to account for it independently: month grouping, counts, Cursor binding, Client Cache, Prefetch, Export, and M4 Read Models. Each would create another opportunity to lose the mode; a missing mode would not look like an error, but like a valid row in the shared Timeline. The separate view makes the boundary visible in the route itself and lets Story remain what M2-D11 already defines: a derived Read Model over shared content. The separate variant is already demonstrated — `list_heart_moments` applies the `visibility` filter only after `readable()` and therefore gives the partner an empty page rather than foreign private rows. The decision is also reversible: offering a combined view later is additive, while relaxing an existing shared route later to include private content would create functional loss and a migration problem for Client Caches.  
Consequences: The Story union in `API-DESIGN.md` remains unchanged with `MEMORY`, `HEART_MOMENT` (`SHARED` only), and `MILESTONE`. `/timeline` accepts no `visibility` parameter; sending one is a request error rather than a silently ignored filter. Cursor binding from M2-D08 needs no owner dimension because the result set does not vary by mode. The Privacy filter remains part of the authorized query and is not modeled as a Story parameter. Web and Android present the owner area as a separate clearly labeled view, not a filter chip in Story; moving there is a navigation step rather than a List option. M2-D18 therefore governs any owner cache separately from Story cache. M4-A Read Models and M4-B Activity inherit this boundary and must not reintroduce private HeartMoments through a shared projection. M2-D17's separation of owner and partner Export remains unaffected.  
Tests: `/timeline` contains no private HeartMoment even for the owner; `/timeline` with `visibility` parameter is rejected rather than filtered; `SHARED -> PRIVATE` removes the item from `/timeline` for both sides and keeps it in the owner List; `heart-moments?visibility=PRIVATE` returns an empty page to the partner; a Story Cursor cannot be rewritten to address private rows.  
References: #104, #70, `API-DESIGN.md`, `API-CONTRACT.json`, `DELIVERY-PLAN.md`.

**Superseded by #1021 (2026-09-18).** This entry is kept verbatim as the historical M2 record; M2-D22 was in fact the decision made and shipped at the time. It no longer describes current `/timeline` behavior — see the entry immediately below.

### #1021 – Timeline becomes viewer-authorized, superseding M2-D22
Status: DECIDED  
Date: 2026-09-18  
Decision owner: Product / project decision #1021  
Decision: `PRIVATE` HeartMoments are no longer categorically excluded from `/timeline`. The route is now viewer-authorized: it returns the requesting account's own Story, which includes that account's own `OWNER_ONLY` HeartMoments at their ordinary chronological position, but never the partner's. `PRIVATE` still means "hidden from the partner", not "removed from one's own shared life story". The route continues to accept no `visibility` request parameter and has no separate owner mode; the projection follows the requesting account rather than a client-chosen filter. `SharedHeartMomentSummary` gained a `visibility` field reporting the item's real domain visibility rather than an assumed `SHARED`, and keeps its established type name to avoid unproductive generated-client churn.  
Rationale: M2-D22's stated alternative — a combined view — was rejected in M2 primarily because Story had no per-viewer authorization dimension yet and mixing modes into one route risked losing the mode silently. That dimension already exists in every other M2 resource through `readable()`, which already resolves `OWNER_ONLY` to "owner yes, partner no" correctly; Story's separate `SPACE_SHARED`-only clause on top of `readable()` was the one place duplicating a narrower rule instead of reusing it. Product judged that routing an owner's own private HeartMoments through a second, separately maintained List view cost more in ongoing complexity (a second Timeline-shaped surface, its own filters, grouping, and empty states) than the risk M2-D22 was written to avoid, once the privacy boundary itself is expressed exactly once in `readable()`.  
Consequences: `story.service._leg` gained a `shared_only` flag; the Timeline, `require_readable_story_item` (renamed from `require_shared_story_item`), and `read_available_years` use the viewer-authorized default, while `read_shared_story_counts` (feeding the Dashboard's relationship-shared count, #809) keeps `shared_only=True` so an account's own private HeartMoment never inflates a "shared with your partner" count. The Story Cursor binding gained the requesting `accountId` alongside `spaceId`, because two accounts in the same Space can now have genuinely different authorized result sets; a cursor minted for one account is `400 INVALID_CURSOR` for the other, same as any other binding mismatch — no new error shape, no disclosure. Story-view receipts (`POST /story-views`) use the same viewer-authorized predicate, so opening one's own private HeartMoment from one's own Timeline records a view like any other. Discover (`story.discover_service`) and its own `SPACE_SHARED`-only candidate queries are untouched; they were already independent of `story.service._leg`. Comment authorization on HeartMoment is untouched; a `PRIVATE` HeartMoment still accepts no new comments.  
Tests: see `backend/tests/integration/test_story.py::TestPrivacy` (owner sees own private item, partner never does, `SHARED <-> PRIVATE` transitions), `TestAvailableYears` (owner-private year visible only to the owner), `TestPagination` (mixed shared/private pages, no gaps/duplicates), and `backend/tests/integration/test_story_views.py` (owner records a view of their own private item; partner gets a non-enumerating 404 for it) plus `backend/tests/integration/test_dashboard_story_summary.py` (shared counts unaffected).  
References: #1021, #104 (M2-D22), `API-DESIGN.md`, `DOMAIN-MODEL.md`, `story/service.py`.

## Decision format

When approved, update the table row and add an entry below:

```text
### M2-Dxx – Short title
Status: DECIDED
Date: YYYY-MM-DD
Decision owner: Role/Name
Decision: ...
Rationale: ...
Consequences: ...
References: ADR / Spec / Issue / PR
```

## Definition of "decision-clear"

A decision is complete only when:

1. the selected option and deliberately rejected alternative are identifiable,
2. Privacy, Security, and data-migration consequences are named,
3. API, Web, Android, and operational consequences were considered,
4. tests and acceptance criteria can be derived from it,
5. a binding source is linked.
