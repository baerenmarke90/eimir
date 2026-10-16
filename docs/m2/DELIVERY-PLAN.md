# M2 Delivery Plan

**Goal:** deliver M2 as small, vertical, independently reviewable product increments  
**As of:** August 24, 2026

This plan starts only after the open M0/M1 gates. It creates no Issue numbers and does not modify the ongoing Issues #5–#11. Each package is scoped so that exactly one Issue, one branch, and one Pull Request can result from it.

## Entry gates

M2 implementation starts only when:

- transport and first registration for Self-Hosted are secure,
- Auth, Tenant, and Concurrency invariants are protected over HTTP,
- reproducible build, dependency scan, and OpenAPI contract are in place,
- Provider and ProtectedPayload boundaries are viable,
- private Authorization and relationship Profiles are complete,
- blocking M2 decisions in the [Decision Log](./DECISION-LOG.md) are resolved.

## Delivery sequence

```text
S0 Readiness
   │
   ├── S1 Attachments ──┐
   │                    ├── S3 Memory + Media ──┐
   └── S2 Memory CRUD ──┘                       │
                                                ├── S7 Story ── S8 Clients & Hardening
       S4 HeartMoment Privacy ──────────────────┤
       S5 Milestone ────────────────────────────┤
       S6 Comments + Outbox ────────────────────┘
```

S4 and S5 may be prepared after S0 in parallel with S1–S3. S7 starts only once all four source types and their visibility rules are stable.

## S0 – M2 Readiness & contract decisions

**Result:** implementable, internally consistent M2 contract.

**Delivery scope**

- decide open items in the Decision Log,
- confirm Domain and Privacy invariants,
- transfer OpenAPI schemas and error codes from `API-DESIGN.md`,
- design the migration/index plan including Rollback,
- establish Security test cases as an executable test structure,
- record M2 Observability and Retention rules.

**Acceptance**

- no blocking decision remains open,
- API lint and contract tests are green,
- Threat Review for owner-only and Media is complete,
- every later slice has a clear contract and test path.

## S1 – Attachment Foundation & MediaStore

**Result:** secure Attachment lifecycle foundation not yet bound to a Domain parent.

**Delivery scope**

- `Attachment` persistence and state model,
- `MediaStore` port plus Local and S3-compatible adapters,
- Create Upload, Finalize, validation, authorized Read, and Delete,
- random Storage Keys, size/MIME/dimension checks,
- Cleanup for failed and orphaned uploads,
- adapter contract tests and abuse tests.

**Acceptance**

- only validated Attachments reach `READY`,
- both adapters pass the same contract,
- Cross-Tenant, MIME spoofing, and race tests are green,
- neither Bucket nor Local Storage is readable without Authorization.

**Not included:** Gallery and Memory UI. Thumbnail and Poster Frame are part of S1 according to M2-D15; Transcoding, multiple resolution levels, and adaptive streaming explicitly are not.

**Split according to M2-D23:** S1 is divided into three deliverable pieces.

- **S1-a Images:** persistence, state machine, LocalMediaStore, Upload, asynchronous validation including stripping and Thumbnail, authorized Read, Delete, and Cleanup — for JPEG, PNG, WebP, HEIC, and HEIF.
- **S1-b S3 adapter:** presigned Upload and Read URL against the same contract test as the local adapter.
- **S1-c Video:** ffmpeg, MP4/QuickTime, and Poster Frames. Resolve image size, CVE tracking, and resource limits first.

The split is chosen so that no intermediate state reaches `READY` without applying M2-D14; otherwise an unstripped file would temporarily exist in the Store.

## S2 – Memory CRUD without Media

**Result:** Memories with author, domain date, and safe Concurrency.

**Delivery scope**

- Create/Get/List/Update/Delete,
- `happenedOn` separate from `createdAt`,
- author projection and Space scope,
- ProtectedPayload boundary for Title/Body,
- Optimistic Concurrency and error contract,
- HTTP, Tenant, and permission tests.

**Acceptance**

- author and partner see only permitted Space data,
- author may update/delete according to the decided contract,
- stale version deterministically returns `409`,
- logs/Events contain no protected content.

## S3 – Memory with multiple Media

**Result:** a Memory can present multiple authorized Media in a stable order.

**Delivery scope**

- Attachment relation and stable ordering,
- atomic Bind/Unbind operations,
- Gallery projection for Web and Android,
- handle Parent Delete/Finalize race,
- tolerate missing/failed Media in presentation.

**Acceptance**

- no Cross-Space binding,
- order remains stable across Update and Read,
- deleted/invalid parents leave no visible orphans,
- no Attachment grants more visibility than its parent.

## S4 – HeartMoment with owner-only Privacy

**Result:** `SHARED` and `PRIVATE` are correctly separated in every access path.

**Delivery scope**

- CRUD with emotion, visibility, date, and optional Attachment,
- owner-only Policy as a central reusable rule,
- List/Search/projection filtering,
- Privacy-safe error semantics,
- complete canary and indirect leak tests.

**Acceptance**

- partner can neither access nor indirectly infer private entries,
- `SHARED → PRIVATE` removes Comment/Story/cache visibility according to the contract,
- optional Attachment follows the exact parent visibility,
- Export, Event, and Notification paths are reviewed.

## S5 – Milestone

**Result:** Milestones are a dedicated Domain model.

**Delivery scope**

- CRUD, author, and `happenedOn`,
- Tenant/Concurrency/ProtectedPayload rules,
- projection for Story and later Chapter/Recap linkage,
- HTTP and isolation tests.

**Acceptance**

- no hidden reuse of Memory tables or type flags,
- Story-relevant fields are stable,
- later extensions require no M2 data migration out of a universal model.

## S6 – Comments, Outbox & Notification Hook

**Result:** Comments work only on permitted Shared targets and reliably create a minimal Event.

**Delivery scope**

- enumerated targets `MEMORY`, `MILESTONE`, `HEART_MOMENT`,
- Create/List/Update/Delete according to the author rule,
- central target existence and visibility check,
- atomic Outbox entry for a Comment on another person's Shared content,
- idempotent Worker/Notification interface.

**Acceptance**

- no Comment on private or foreign content,
- Domain change and Outbox commit atomically,
- Retry creates no duplicate domain Notifications,
- Event/Preview contains no impermissible content.

## S7 – Story Read Model

**Result:** a derived, performant Timeline without private leaks.

**Delivery scope**

- Query Service for Memory, Milestone, and HeartMoment,
- author and Attachment projection,
- filters `type`, `year`, `order`, `cursor`, `limit`,
- stable Cursor Pagination and month groups,
- Query/index analysis with realistic data volumes.

`q` is deliberately no longer listed here. M2-D08 moved global full-text Search to M4-A, and M2-D21 keeps open whether it is implemented directly in Postgres or through a separate index. The earlier entry came from the version before #70 and would have made S7 implement Search that the frozen contract does not know.

M2-D22 (#104) originally kept the owner area for private HeartMoments out of this route entirely. #1021 superseded that decision: `/timeline` is viewer-authorized, so a caller's own `PRIVATE` HeartMoment remains part of their own Timeline (never the partner's), still without a `visibility` request parameter or a separate owner mode.

**Acceptance**

- an account's own `PRIVATE` HeartMoment is included at its ordinary position; the partner's `PRIVATE` HeartMoment is excluded before Count, grouping, and Cursor creation,
- ordering and tie-breakers match the decision,
- pages are stable and duplicate-free,
- the Read Model is derived and not a second domain source of truth.

## S8 – First Web/Android flows & Hardening

**Result:** the same Core flow works end to end on both clients.

**Delivery scope**

- view Story, create Memory, add multiple Media,
- deliberately create HeartMoment as Shared or Private,
- Loading/Empty/Error/Offline Read states,
- Accessibility, dynamic font, Touch Targets, and keyboard flow,
- clear cache on logout/Space change,
- End-to-End and Release Smoke Tests.

**Acceptance**

- Web and Android use the same published API contract,
- Privacy choice is understandable before saving,
- no illusion of Offline Write,
- Core flow is operable with screen reader/keyboard or TalkBack.

## Issue-ready work packages

The following titles may be created directly as Issues after S0:

1. **[M2][Media] Implement Attachment lifecycle and MediaStore contract**
2. **[M2][Media] Validate LocalMediaStore and S3MediaStore against a shared contract**
3. **[M2][Memory] Deliver Memory CRUD, ProtectedPayload, and Concurrency**
4. **[M2][Memory] Integrate multiple Attachments and ordered Gallery**
5. **[M2][Privacy] Deliver HeartMoment Shared/Private with complete owner-only protection**
6. **[M2][Milestone] Deliver dedicated Milestone model and API**
7. **[M2][Comments] Implement permitted targets, Outbox, and Notification Hook**
8. **[M2][Story] Deliver derived Read Model with Search and Cursor Pagination**
9. **[M2][Web] Integrate Story, Memory, and Privacy Core flow**
10. **[M2][Android] Integrate Story, Memory, and Privacy Core flow**
11. **[M2][Security] Complete Cross-Tenant, owner-only, and Media abuse suite**
12. **[M2][Release] Accept Performance, Accessibility, and Observability**

Each Issue adopts relevant rows from the [Security Test Matrix](./SECURITY-TEST-MATRIX.md) as acceptance criteria. Cross-cutting work is not hidden in an omnibus PR.

## PR rules

- one Issue, one branch, one domain purpose,
- migration and Rollback in the same PR as the model,
- contract first or in the same PR; clients never target undocumented endpoints,
- do not duplicate Auth/Tenant logic per Controller,
- Security tests must demonstrably fail before the fix and pass afterward,
- new decisions are recorded in the Decision Log,
- screens and API are reviewed together against Empty, Error, and permission states.

## M2 Exit Criteria

M2 is complete when:

- all six Domain components are production-usable,
- Web and Android share at least one complete Memory/Media/Story flow,
- private HeartMoments pass all leak tests,
- Local and S3 Media satisfy the same Security contract,
- OpenAPI, migrations, Observability, and operational documentation are current,
- no Critical or High Security gap remains open,
- Performance budgets and Accessibility acceptance are satisfied,
- real E2EE is neither claimed nor architecturally blocked.
