# Implementation Status

As of: September 3, 2026
Current repository state: GitHub `main` is the canonical SHA source; this living status document deliberately stores no static current SHA.  
Current gate status: **G3 passed; M4 complete; M5 complete; G4 passed; M6 is the next milestone, evaluated by G5**

## Document roles

- **Binding source:** [Clean-Room Master Specification](../specification/CLEAN-ROOM-MASTER-SPEC.md)
- **Compact product overview:** [PRODUCT-SPEC.md](../specification/PRODUCT-SPEC.md)
- **Current forward roadmap decision:** [ADR 0006](decisions/0006-release-before-optional-expansion.md)
- **Current gate decision:** [2026-09-03-g4-gate-review.md](reviews/2026-09-03-g4-gate-review.md)
- **Status sources and drift rules:** [STATUS-SOURCES.md](STATUS-SOURCES.md)
- **Binding development rule:** [REUSE-BEFORE-BUILD.md](REUSE-BEFORE-BUILD.md) and [AGENTS.md](../AGENTS.md)
- **Architecture/operations decisions:** dated ADRs under [docs/decisions](decisions)
- **M2 project control:** [m2/PROJECT-CONTROL.md](m2/PROJECT-CONTROL.md)
- **M3 readiness, delivery, and evidence:** [m3/README.md](m3/README.md), [m3/DELIVERY-PLAN.md](m3/DELIVERY-PLAN.md), and [m3/G3-EVIDENCE.md](m3/G3-EVIDENCE.md)
- **M4 delivery and evidence:** [m4/README.md](m4/README.md), [m4/DELIVERY-PLAN.md](m4/DELIVERY-PLAN.md), and [m4/M4-EVIDENCE.md](m4/M4-EVIDENCE.md)
- **Historical reviews:** dated files under `docs/reviews/`; they are never modified retroactively.
- **This document:** living work and progress list.

If sources conflict, the Master Specification takes precedence for Clean-Room, Security, Privacy, Domain, architecture and technical requirements. For the **forward M6-M9 milestone numbering/order only**, Product Spec 1.1 and ADR 0006 supersede section 68 of the current Master Specification until that section is consolidated. A new gate decision always receives a new dated review.

## Working rules

1. Modify only this repository.
2. Before implementation, read the relevant specification, Decision Log, and current Issues.
3. One Issue = one clear scope = its own branch/PR.
4. No direct changes to `main`, no rebase, no force push.
5. Before merge, freshly check current `main`, PR HEAD, complete diff, mergeability, and CI.
6. Record findings outside scope as a separate Issue.
7. Do not rewrite historical reviews.
8. Before building technical commodity functionality in-house, perform the Reuse review defined in [REUSE-BEFORE-BUILD.md](REUSE-BEFORE-BUILD.md) and document it in the Issue or PR. A relevant PR without a traceable review is not merge-ready; CI enforces the decision.

## M0 — Foundation

**Status: complete.**

- [x] FastAPI, SQLAlchemy 2, PostgreSQL, Alembic
- [x] REST API v1, camelCase, Problem Details
- [x] UUIDv7 and time/date conventions
- [x] Transactional Outbox and PostgreSQL Job Queue
- [x] MediaStore/Provider abstractions
- [x] ProtectedPayload base abstraction
- [x] reproducible dependencies and Lockfile
- [x] OpenAPI contract + contract check
- [x] PostgreSQL integration tests
- [x] dependency/vulnerability scan, container build, Secret Scan, Provenance

## M1 — Identity & Relationship

**Status: runtime scope complete; G1 passed.**

- [x] Account, AccountEmail, AuthIdentity
- [x] local password login with Argon2
- [x] Device Sessions and rotating tokens
- [x] Space, Membership, central Tenant Guard
- [x] race-safe Invitations
- [x] SpaceProfile with ETag/If-Match and 409
- [x] PartnerProfile and ProfilePreference
- [x] RelatedPerson and ImportantDate
- [x] central SQL-side `SPACE_SHARED`/`OWNER_ONLY` Authorization
- [x] OIDC Authorization Code + PKCE/State/Nonce/Discovery/JWKS
- [x] OIDC Invitation onboarding without email merge
- [x] Passkey/WebAuthn Registration and Authentication
- [x] Magic Link, email verification, and Recovery
- [x] Refresh replay protection
- [x] #61: RelatedPerson deletion with explicit `preserve`/`cascade` policy and no destructive default
- [x] G1 Gate Review after #61: **PASSED**

### Completed M1/repository hardening

- [x] **#59 — Pre-Exposure:** Passkey Authentication start protected against challenge flooding.
- [x] **#60 — Pre-Exposure:** Rate Limit thresholds are enforced atomically under concurrency.
- [x] **#25 — Repository Hardening:** active ruleset for `main` enforces Pull Request, Merge Commit, current required checks, no force pushes, and no branch deletion.

The Pre-Exposure/repository hardening items that were previously listed as open in the Living Status are therefore complete. GitHub remains the operational source for each Issue state.

### Operations: Self-Hosted startup path

- [x] **#110 — Startup path and migration decoupled** (PR #111): `alembic upgrade head` no longer depends on Cursor Signing Key, SMTP, and public address; Compose separates migration from runtime configuration; CI exercises the real startup path instead of merely parsing it.
- [x] **#115 — Network and port readiness hardened** (PR #118): an occupied API port or missing network path no longer leaves the instance appearing healthy; dedicated Deployment Guard in CI.

Two operational commitments resulting from this are binding and documented in [ADR 0002](decisions/0002-self-hosted-first-start-mode.md):

- The provided Compose stack starts as a **clearly marked local test mode**. Real operation requires `EIMIR_ENVIRONMENT=production` in `.env`; the application reports its operating mode on every startup.
- SMTP access is **not a startup prerequisite**. `EIMIR_MAIL_TRANSPORT=none` is allowed in production; mail-dependent sign-in paths then return `503 MAIL_TRANSPORT_UNAVAILABLE`, while sign-in remains available through password, Passkey, and OIDC. `log` remains forbidden in production.

## M2-S0 — Readiness & contract decisions

**Status: complete.** All `BLOCKING` decisions in the [Decision Log](m2/DECISION-LOG.md) are `DECIDED`.

- [x] **#67 — Planning:** synchronized G1 status, Roadmap, and milestone boundaries.
- [x] **#68 — Domain/Privacy:** closed Memory, Comment, and Privacy decisions.
- [x] **#69 — Media:** decided Attachment lifecycle, limits, validation, and Retention.
- [x] **#70 — API:** defined routes, DTOs, Concurrency, Pagination, and Story sorting.
- [x] **#78 — Media metadata:** decided EXIF/GPS stripping during ingest and variant scope (M2-D14/D15).

Only `BEFORE_CLIENTS` decisions that become relevant before stable full integration remain open: M2-D10 (Notification Preview), M2-D17 (Export/Backup), M2-D18 (Client Cache), and M2-D21 (Search Index). They did not block G2 and are handled in their respective later milestones.

M2-D22 (owner view) is no longer in that category: the question shapes the Story route and was therefore promoted to `BLOCKING` and decided in #104 — just as M2-D14 and M2-D15 had previously been in #78. M2-D22 was itself later superseded by #1021, which made `/timeline` viewer-authorized instead of routing the owner view through a separate collection; see `docs/m2/DECISION-LOG.md`.

## M2 — Runtime and G2

**Status: complete; G2 passed.**

- [x] **#71 — Memory CRUD without media** (PR #77): Memory Domain with ProtectedPayload for title/body, author-only writes with shared readability, `If-Match`/409, signed Keyset Cursor, and `resourceVersion` in the Outbox envelope.
- [x] **#80 — HeartMoment with owner-only Privacy** (PR #84): first type with a real user visibility choice; `SHARED -> PRIVATE` as a dedicated atomic operation, emotion in ProtectedPayload.
- [x] **#79 — Attachment lifecycle for images** (PR #89): state machine, LocalMediaStore, asynchronous validation with metadata stripping and Thumbnail, authorized reads, Retention, and Cleanup.
- [x] **#90 — Bind Attachments to Memory and HeartMoment** (PR #93): `MemoryAttachment` with stable `position`, HeartMoment with at most one Attachment, atomic Bind/Unbind against the binding window from M2-D20, and no Cross-Space binding.
- [x] **#94 — Milestone Domain and API** (PR #95): dedicated model instead of a type flag on Memory, author rule from M2-D25, `If-Match`/409, and Story-ready fields.
- [x] **#97 — Comments, Outbox, and Notification Hook** (PR #98): Create/List nested under the parent, Update/Delete space-scoped, enumerated targets `MEMORY`/`MILESTONE`/`HEART_MOMENT`, atomic Outbox entry, and idempotent Retry.
- [x] **#87 — S3-compatible MediaStore adapter** (PR #100): presigned Upload and Read URL with the TTLs from M2-D13, tested against the same contract test as the local adapter.
- [x] **#113 — Story Read Model and `/timeline`** (PR #114): derived Timeline over Memory, Milestone, and HeartMoment; sort key and Keyset Cursor per M2-D08. No Story table. At delivery, private HeartMoments were excluded from the result even for their owner (M2-D22); #1021 later superseded that and made the route viewer-authorized, so an account's own private HeartMoment is now included, never the partner's.
- [x] **S8 — thin Web/Android reference flows:** Web and Android deliver the critical Memory/Media/Story reference path.
- [x] **#144 — real G2 client E2E evidence:** Web and Android run against the same real eimir. stack of API, Worker, PostgreSQL, and LocalMediaStore.
- [x] **#147 / PR #170 — final G2 Gate Review:** **G2: PASSED**.

### Future backlog outside M2/G2

- [ ] **#88 — Video uploads and poster frames:** future development, do not implement now. Prototype #109 was deliberately closed without merge because of a production image of roughly 755 MiB and the additional ffmpeg operational, Supply Chain, and Security burden.

Video remains fail-closed until a new product decision: M2-D04 allows MP4 and QuickTime in the target contract, while the current server rejects them with `ATTACHMENT_TYPE_NOT_ALLOWED`. Clients must not present video as available.

Historical M2 project control and binding milestone boundaries are documented in [M2 Project Control](m2/PROJECT-CONTROL.md). The immutable G2 decision is documented in the [final G2 Gate Review](reviews/2026-08-26-g2-final-gate-review.md).

### Binding M2/M5 boundary

M2 is **Domain + API + minimal vertical Web/Android reference flows**. These reference flows provide technical E2E evidence for the critical Memory/Media/Story Core and do not imply full client parity.

M5 is **Client Completion & Parity**: complete client integration, Deep Links, Read Cache, Export/Import, systematic Web/Android parity, and Accessibility. Per ADR 0006/#433, new M7 Relationship Depth domains are not pulled into M5; M5 completes the M0-M4 Core first.

### Privacy terminology

- `SHARED` / `PRIVATE`: public domain values.
- `SPACE_SHARED` / `OWNER_ONLY`: internal Authorization/Privacy classes.
- Clients do not redundantly write `privacyClass`.

### M4 boundary

M4 is internally split into three delivery slices:

- M4-A Search + Dashboard Read Models
- M4-B Activity + Notifications
- M4-C Reminders + Rules

Global full-text Search was not part of G2 or G3. The minimum Story contract includes `type`, `year`, `order`, `cursor`, and `limit`; global full-text Search belongs to M4-A.

## M2 runtime sequence after S0

1. ~~Memory CRUD without media (#71)~~ — delivered
2. ~~Attachment Foundation / MediaStore Contract (#79)~~ — delivered, images
3. ~~HeartMoment Privacy (#80)~~ — delivered
4. ~~Memory + multiple media (#90)~~ — delivered
5. ~~Milestone (#94)~~ — delivered
6. ~~Comments + Outbox/Notification Hook (#97)~~ — delivered
7. ~~Story Read Model (#113)~~ — delivered
8. ~~thin Web/Android reference flows~~ — delivered
9. ~~G2 Review~~ — **PASSED**

The S3 adapter (#87) ran in parallel and is delivered. Video (#88) is not part of this chain or M2/G2; it is Future Backlog.

## G2 — Story Alpha

**Status: PASSED.** The binding decision source is the [final G2 Gate Review](reviews/2026-08-26-g2-final-gate-review.md).

Demonstrated are M2 Domain/API, Story Privacy, Media/parent Authorization, Cross-Tenant/race/data integrity, OpenAPI, migrations, PostgreSQL integration, and a real critical Memory/Media/Story flow in Web and Android against the same eimir. stack.

Manual Accessibility acceptance was deliberately moved from G2 into final client/release QA. As of 2026-09-02, this manual acceptance step is deprioritized and is **not** required for G4; the per-slice automated accessibility semantics already delivered (contrast, TalkBack/screen-reader names, focus order, touch targets, dynamic type) stand as the accepted evidence instead. Dedicated Performance evidence is deprioritized the same way, for the same date: the existing per-PR [Cross-Cutting Quality](CROSS-CUTTING-QUALITY.md) review already covers query count, payload size, and resource impact, and a separate evidence artifact would not meaningfully add to that. Full client parity remained part of M5/G4 and was produced on 2026-09-02 as the pragmatic Web/Android feature audit recorded on #295; its six findings (#603-#608) were closed rather than accepted, and the [G4 Gate Review](reviews/2026-09-03-g4-gate-review.md) records the result.

## M3 — Planning & Private Area

**Status: complete; G3 passed.** The [M3 Technical Readiness Package](m3/README.md) records the completed M3 decisions, runtime delivery, evidence, and final gate result; all M3-D01 through M3-D32 are `DECIDED`.

The runtime sequence followed the [M3 Delivery Plan](m3/DELIVERY-PLAN.md). Each production slice was contract-testable and passed the applicable Reuse-before-build plus normal PR/CI gates.

- [x] **M3-S1 — Wish Foundation:** Wish Domain with ProtectedPayload for title, collaborative write per M3-D01, `status` exclusively server-controlled, `If-Match`/409, status filtering through a Space- and filter-bound Cursor, and redacted `WISH_*` events. The Wish->Plan operation and Plan-dependent rows of the Delete Matrix followed in S2.
- [x] **M3-S2 — Plan + Wish->Plan:** Plan Domain with Direct Create per M3-D30, state machine `IDEA | PLANNED | COMPLETED` with date invariants as both service and DB constraints, `sourceWishId` with `UNIQUE` and a composite Same-Space foreign key, atomic and idempotent Wish->Plan conversion, `return-to-wish`, `schedule`/`unschedule`/`complete`, and canonical lock order `Wish -> Plan` with real PostgreSQL race and rollback tests. The Wish Delete Matrix from M3-D05 is complete.
- [x] **M3-S3 — Place Foundation:** Place Domain with name, description, and address behind the ProtectedPayload boundary; coordinates as typed `NUMERIC` columns with pair, range, and precision invariants in both service and schema; CRUD/List without deduplication; no Geocoding or Maps Provider. `Plan.placeId` was added (canonical and single-column, with composite Same-Space foreign key). Place deletion versionedly unlinks assigned Plans while preserving them. Additionally, bound DB parameters no longer appear in error messages and therefore no longer appear in application logs.
- [x] **M3-S4 — typed Content Relations:** `place_memories`, `place_heart_moments`, and `place_milestones` with real composite foreign keys over `(id, space_id)`, primary key `(place_id, target_id)`, and typed REST routes instead of free `(targetType,targetId)` polymorphism. Same-Space is a schema property rather than a service rule. Unknown, deleted, foreign, and private targets all resolve indistinguishably to `RELATION_TARGET_NOT_FOUND`. The Privacy transition `SHARED -> PRIVATE` removes relations in the same transaction; schema guards make private-with-shared-relation states unrepresentable. PostgreSQL race tests cover parent deletion, target deletion, and Privacy transition.
- [x] **M3-S5 — Chapter:** Chapter Domain with optional `startOn`/`endOn`, canonical nullable `placeId`, collaborative CRUD/List with `If-Match`/409, typed `chapter_memories`/`chapter_heart_moments`/`chapter_milestones`, deterministic derived cross-type content ordering, privacy-safe target handling, and delete semantics that remove only the Chapter and its relations while preserving all originals.
- [x] **M3-S6 — Shared Collections:** shared Collection + CollectionItem aggregate with collaborative writes; immutable server-derived `createdBy`; independent root structure/order and Item content versions; contiguous positions; append-on-create, transactional delete compaction, and atomic exact-set full-list reorder; Cross-Tenant fail-closed handling and real PostgreSQL reorder/create/delete/completion race coverage; Collection/Item titles remain out of event payloads. ShoppingList and persisted multi-select state remain outside S6.
- [x] **M3-S7 — PrivateNote + GiftIdea:** dedicated owner-only PrivateNote and GiftIdea tables/services with ProtectedPayload content, server-derived Space/owner/privacy, CRUD/List under `/spaces/{spaceId}/private/...`, `If-Match`/409, GiftIdea lifecycle `IDEA | BOUGHT | GIVEN`, inert URL storage without server fetches, privacy-safe 404 behavior, owner-filtered pagination, redacted private events, and PostgreSQL/HTTP partner/Cross-Tenant coverage.
- [x] **M3-S8 — PrivateCollection:** dedicated owner-only PrivateCollection and PrivateCollectionItem persistence with Parent-derived Item authorization, ProtectedPayload content, root/item optimistic concurrency, append/compaction and atomic full-list reorder, privacy-safe partner/Cross-Tenant handling, redacted private events, real PostgreSQL race coverage, and synchronized OpenAPI plus generated TypeScript/Kotlin clients (Issue #259 / PR #260).
- [x] **M3-S9 — Integrated M3 backend/API evidence:** executable [G3 evidence map](m3/G3-EVIDENCE.md) for all five M3-D24 real HTTP/PostgreSQL flows; integrated Chapter relation/delete preservation and Private Area owner -> partner -> owner context-switch flows; Shared Collection and PrivateCollection Parent Delete vs. Item Create/Reorder races added with independent PostgreSQL transactions; existing S1-S8 Tenant, Privacy, redaction, lifecycle, and contract suites reused rather than duplicated (Issue #261 / PR #263).
- [x] **M3-S10 — final G3 Review:** the immutable [2026-08-30 G3 Gate Review](reviews/2026-08-30-g3-gate-review.md) reviewed the merged S9 tree, exact successful workflow runs, all five mandatory flows, negative/race/delete/redaction/contract evidence, and current open findings; **G3: PASSED** (Issue #264).

## G3 — Shared everyday use

**Status: PASSED.** The binding decision source is the [final G3 Gate Review](reviews/2026-08-30-g3-gate-review.md).

Demonstrated are consistent Wish/Plan/Place/Chapter/Collection behavior, complete owner-only Private Area isolation, deterministic version/Delete/race semantics, Domain-original preservation outside documented Parent-Child cascades, protected event/log redaction, canonical OpenAPI/generated-client compatibility, and all five mandatory M3-D24 real HTTP/PostgreSQL flows. The exact S9 tree passed CI, PostgreSQL integration, CodeQL, Reuse Review, Self-Hosted Deployment Guard, and the existing client-regression guard.

No current open issue documents an actual G3-blocking Critical/High Security/Privacy/Tenant finding or known Tenant/`OWNER_ONLY` leak. Release, Observability, Accessibility, client-parity, Backup/Restore, Premium, future-provider, and cleanup backlog remains open in its later milestone or product scope.

## M4 — Engage

**Status: complete.** The cumulative delivery/evidence index is [M4 Evidence Map](m4/M4-EVIDENCE.md).

- [x] **M4-A-S0:** Search + Dashboard decisions frozen (#272 / #273).
- [x] **M4-A-S1:** authorization-first PostgreSQL Search foundation delivered (#274 / #288), including the bounded FTS metadata correction #294.
- [x] **M4-A-S2/S3:** shared-only Dashboard and integrated M4-A evidence delivered (#280 / #291 plus cumulative required checks).
- [x] **M4-B-S0:** Activity/Notification/Push/Thinking contracts frozen (#276 / #278).
- [x] **M4-B-S1:** minimized Activity + recipient Notification foundation delivered (#282 / #284).
- [x] **M4-B-S2/S3:** content-free Thinking-of-you + provider-neutral PushDelivery and integrated evidence delivered (#289 / #305 plus cumulative required checks).
- [x] **M4-C-S0:** Reminder/Rule contracts frozen (#277 / #279).
- [x] **M4-C-S1:** shared Reminder domain, typed schedules, offsets and per-account mute preference delivered (#285 / #308).
- [x] **M4-C-S2/S3:** controlled Rule catalog, generated Reminder reconciliation, durable occurrences, bounded Job Queue planning, deterministic time/DST behavior and minimized `REMINDER_DUE` handoff delivered (#292 / #309).

The final M4 migration order is `0028 -> 0029 -> 0030 -> 0031 -> 0032`. M4 remains Free/Core at the delivered baseline and reuses PostgreSQL FTS, the transactional Outbox and the existing PostgreSQL Job Queue rather than adding a parallel search, broker, scheduler, notification, or push stack.

## M5 — Client Completion & Parity

**Status: complete.** M5 productized the stable M0-M4 contracts across Web and Android: the Web slices tracked by #295 and the Android slices tracked by #350, plus the shared S6 runtime (#303 decisions, #345 Transfer Bundle, #346 Web Deep Links/cache/portability, #328 Android resilience) and the route-model decision #360.

The gate's parity requirement was met by the pragmatic Web/Android feature audit recorded on #295 on 2026-09-02. It covered every M5 domain against actual code, found six real functional gaps and no others, and all six were closed rather than accepted:

- #603 HeartMoment content editing (Android) — PR #609
- #604 Comment editing (Web) — PR #613
- #605 Wish/Plan editing, direct Plan creation, schedule/complete dates, Chapter place (Android) — PR #611
- #606 Collection and PrivateCollection icon field (Web) — PR #614
- #607 Collection and PrivateCollection item renaming (Android) — PR #612
- #608 Search type filter and Search/Activity/Notifications pagination (Android) — PR #610

## G4 — Core Release Candidate

**Status: PASSED.** The binding decision source is the [G4 Gate Review](reviews/2026-09-03-g4-gate-review.md), which reviewed `main` `61ff4b05` / tree `87f430dc`.

Demonstrated are Web/Android domain equivalence for the Core, bounded Read Cache/offline-read that does not pretend Offline Write exists, version-gated and privacy-scoped Transfer Bundle Export/Import, stable route identity and canonical Deep Link contract, verified Design System tokens with automated Accessibility semantics on both clients, and passing Privacy/Security gates including tenant and `OWNER_ONLY` isolation. No M7 domain was required to reach Core client-completeness.

One boundary is declared rather than claimed: Android registers no OS-level App Link (`VIEW`/`BROWSABLE` intent filter), so the app cannot yet be opened from an external URL. `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md` already names Android App Links as future work, and Android implements the logical target tuple that document specifies; only the OS-level entry point remains open.

No current open issue documents an actual G4-blocking Critical/High Security/Privacy/Tenant finding or known Tenant/`OWNER_ONLY` leak. Launch readiness, release engineering, retention/deletion lifecycle, push delivery, Post-G4 client polish and the M7-M9 product backlog remain open in their later milestone scope.

## Later milestones

- [x] M4 — Search/Dashboard, Activity/Notifications, Reminders/Rules
- [x] **M5 — Client Completion & Parity:** complete Web/Android Core productization, Export/Import, Read Cache, Deep Links, automated Accessibility semantics, and the Web/Android parity audit -> **G4 passed**
- [ ] **M6 — Operate & Launch:** Managed/Self-Hosted operation, Backup/Restore/Upgrade, administration, observability, Entitlements/Billing adapters, hardening, release engineering and launch QA -> G5
  - [x] **#190 — Self-Hosted recovery evidence:** coordinated PostgreSQL and durable LocalMediaStore backup/restore, fresh-target integrity/privacy acceptance, reproducible `0032`-to-head upgrade validation, S3 responsibility boundary, operator runbook, and required CI gate delivered.
- [ ] **M7 — Relationship Depth:** module readiness, Daily Check-in/Vibe/Energy, partner notes/support gestures, Questions, shared achievements, monthly/yearly recaps
  - [ ] **#432 — M7-S0:** Space module/capability configuration and disable/re-enable semantics
  - [ ] **#429/#431:** one coherent Daily Check-in/Privacy foundation for Vibe and Energy before their separate product surfaces
  - [ ] **#430:** shared achievements/Celebration based on authoritative completion events where possible
- [ ] **M8 — Discover & Integrations:** Shopping, Recipes, Events/Entertainment, external media and provider adapters
- [ ] **M9 — Context & Presence:** Maps/location history, explicit opt-in context, Geofencing, Presence and contextual suggestions
- [ ] MX — real E2EE as a separate later Security milestone

## Active milestone

**M6 — Operate & Launch** is the next launch-critical milestone, following G4 directly: Managed/Self-Hosted operation, Backup/Restore/Upgrade, administration, observability, Entitlements/Billing adapters, hardening, release engineering and launch QA. G5 (#525) is evaluated after M6; M7-M9 are post-launch expansion and are not G5 prerequisites.
