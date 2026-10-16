# M3 Place, Relations, and Chapter Semantics

**Status:** `DECIDED` – effective with merge of this decision PR  
**Date:** August 26, 2026  
**Tracking:** #163  
**Covers:** M3-D06, D07, D08, D09, D10, D11, D12, D26, D28, D31

This document closes the blocking M3 decisions for Places, typed Content Relations, and Chapters. It contains only Domain, persistence, API, Privacy, Concurrency, and test decisions. It does **not release M3 runtime code**; the existing G2/status-sync gate rule remains unchanged.

## 1. Binding sources

- `specification/CLEAN-ROOM-MASTER-SPEC.md`
- `specification/PRODUCT-SPEC.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `docs/m3/README.md`
- `docs/m3/DOMAIN-MODEL.md`
- `docs/m3/API-DESIGN.md`
- `docs/m3/SECURITY-TEST-MATRIX.md`
- M3-D01 from #162: collaborative write for shared M3 planning resources

In particular, the following remain source-bound:

- Place is `SPACE_SHARED` and may exist without coordinates.
- Place may be linked with Memories, HeartMoments, Milestones, Plans, and Chapters.
- Relations require real referential integrity; no uncontrolled `(targetType,targetId)` universal relation.
- Chapter bundles Memories, shared HeartMoments, and Milestones.
- Chapter Delete removes Relations, never original content.
- `OWNER_ONLY` must not leak indirectly through Relations, counts, errors, or ordering gaps.
- precise location data must not reach logs, Analytics, Events, or metric labels.

## 2. M3-D06 / D28 – Place Privacy, field classification, and location leakage

### Decision

Place remains a **shared `SPACE_SHARED` object**. Both active Space members may read its Domain content. There is no per-Place visibility level in M3.

The following are **protected Domain content**:

- `name`
- `description`
- `address`
- `latitude`
- `longitude`

These fields belong to the ProtectedPayload/E2EE-readiness boundary. In version 1, `latitude`/`longitude` may exist as typed DB columns for clean validation and future Provider/map extensibility; their classification nevertheless remains `sensitive protected content`. Technical column representation does not turn them into Telemetry or Event data.

Technical metadata outside the ProtectedPayload boundary:

- `id`
- `spaceId`
- `createdBy`
- `createdAt`
- `updatedAt`
- `version`

### Coordinate invariants

- both coordinates are set or both are `NULL`;
- Latitude: `-90 <= latitude <= 90`;
- Longitude: `-180 <= longitude <= 180`;
- M3 persistence precision: at most 6 decimal places;
- no automatic rounding in API responses except to this persistence precision;
- a Place without coordinates is fully valid;
- Address may be stored without coordinates and coordinates may be stored without Address.

### Output / Privacy

An active partner in the same Space receives the exact stored Place values. Non-members or IDs from another Space receive no distinguishable existence information.

In particular, the following are forbidden:

- coordinates in application logs;
- coordinates/address in Error Context;
- coordinates/address in Domain Events;
- coordinates/address in Analytics or metric labels;
- automatic Geocoding/Reverse-Geocoding calls;
- server-side Provider IDs or map metadata in M3.

Maps, Geocoding, current position, and Provider data remain reserved for M7/M8 or later explicit Provider scope.

## 3. M3-D07 – Place identity and deduplication

### Decision

**No automatic or implicit deduplication.**

- every Create request creates a new Place;
- name, address, and coordinates are not Unique Keys;
- identical or nearly identical coordinates are not automatically merged;
- no fuzzy matching in the Write Path;
- a later explicit Merge/Duplicate UX is separate scope.

Rationale: Places with the same name or address may intentionally be distinct from a Domain perspective; automatic merging would mutate data and introduce Privacy risk.

## 4. M3-D08 / D31 – Canonical relation surface

### Decision

M3 uses **typed Relations and direct FKs**, not a generic relation table.

### 4.1 Direct single-Place FKs

For Plans and Chapters there is exactly one canonical truth:

```text
Plan.placeId?    -> places.id
Chapter.placeId? -> places.id
```

Therefore M3 has **no** additional `place_plans` or `place_chapters` tables.

Semantics:

- a Plan has at most one primary Place;
- a Chapter has at most one primary Place;
- `placeId` is nullable;
- Place Delete sets these FKs to `NULL` (`ON DELETE SET NULL` or equivalent transactional semantics);
- Plan/Chapter remains after Place Delete.

This decides M3-D31: `Chapter.placeId` is canonical and `place_chapters` is not introduced in parallel.

### 4.2 Place Relations to existing content

M3 provides the following typed n:m Relations:

```text
place_memories
place_heart_moments
place_milestones
```

Each table contains at minimum:

```text
- place_id      FK places.id
- target_id     FK to the concrete target type
- created_by
- created_at
UNIQUE(place_id, target_id)
```

- Place Delete removes only Join rows;
- Target Delete removes only the affected Join rows;
- original resources are never deleted with the relation.

For `place_heart_moments`, only `SHARED` HeartMoments are allowed.

### 4.3 Chapter Relations

M3 provides:

```text
chapter_memories
chapter_heart_moments
chapter_milestones
```

Each table contains at minimum:

```text
- chapter_id    FK chapters.id
- target_id     FK to the concrete target type
- created_by
- created_at
UNIQUE(chapter_id, target_id)
```

A target may appear in multiple Chapters; there is **no** global Unique Constraint on `target_id`.

### 4.4 External API

The external API is **typed**, not polymorphic.

Example form:

```text
PUT    /api/v1/spaces/{spaceId}/places/{placeId}/memories/{memoryId}
DELETE /api/v1/spaces/{spaceId}/places/{placeId}/memories/{memoryId}

PUT    /api/v1/spaces/{spaceId}/places/{placeId}/heart-moments/{heartMomentId}
DELETE /api/v1/spaces/{spaceId}/places/{placeId}/heart-moments/{heartMomentId}

PUT    /api/v1/spaces/{spaceId}/places/{placeId}/milestones/{milestoneId}
DELETE /api/v1/spaces/{spaceId}/places/{placeId}/milestones/{milestoneId}

PUT    /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{memoryId}
DELETE /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{memoryId}

PUT    /api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments/{heartMomentId}
DELETE /api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments/{heartMomentId}

PUT    /api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones/{milestoneId}
DELETE /api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones/{milestoneId}
```

Plan/Chapter Place is set through the normal versioned update of those resources or the resource operation defined for that purpose; no additional generic Relation Service is introduced for it.

## 5. M3-D09 – Relation Privacy

### Decision

A shared Relation may point only to a target that is permitted as shared content for both Space members.

In particular:

- private HeartMoments must not be bound to Place or Chapter;
- `OWNER_ONLY` targets are forbidden for Shared Relations in general;
- unknown, foreign, Cross-Space, or unreadable targets are handled identically as Privacy-safe `404` on Create;
- Lists/counts do not include private targets;
- an error must not distinguish whether a target exists, is private, or belongs to another Space.

### HeartMoment Privacy transition

During `SHARED -> PRIVATE`, all Shared Relations are removed **in the same DB transaction**, before or together with the visibility change:

```text
place_heart_moments
chapter_heart_moments
```

The commit must never expose a state in which a private HeartMoment remains provable through Shared Relations.

On a later `PRIVATE -> SHARED` transition, old Relations are **not automatically reconstructed**.

## 6. M3-D10 – Chapter ordering

### Decision

Chapter content receives **no manually persisted ordering** in M3.

Presentation is derived deterministically from the linked original resources:

1. Domain event date (`happenedOn`) ascending;
2. if no Domain date exists: `createdAt`;
3. stable tie-breaker: Resource Type and UUID.

Consequences:

- no `position` column in Chapter relation tables;
- no Chapter Reorder endpoint in M3;
- relation tables remain simple and fully referential;
- a later curated manual order is separate decision/migration scope.

## 7. M3-D11 – Chapter dates

### Decision

`startOn` and `endOn` are independently optional.

Valid:

- both `NULL`;
- only `startOn`;
- only `endOn`;
- both set, if `endOn >= startOn`.

The date boundaries are not automatically calculated from linked content and are not silently adjusted when Relations change.

## 8. M3-D12 – Chapter Delete

Source-bound and unchanged:

```text
DELETE Chapter
  -> delete Chapter itself
  -> remove chapter_memories / chapter_heart_moments / chapter_milestones
  -> preserve Memory / HeartMoment / Milestone
  -> preserve Place
```

If the Chapter has a `placeId` reference, only the Chapter is deleted; the Place remains.

## 9. Place Delete

Place Delete is allowed with the following semantics:

| Relationship | Consequence |
|---|---|
| `place_memories` | delete Join rows |
| `place_heart_moments` | delete Join rows |
| `place_milestones` | delete Join rows |
| `Plan.placeId` | set to `NULL` |
| `Chapter.placeId` | set to `NULL` |
| Memory/HeartMoment/Milestone | original remains |
| Plan/Chapter | original remains |

There is no Place Cascade to Domain originals.

## 10. M3-D26 – Concurrency and Relation races

### Baseline rule

No Relation Create uses unsafe `check-then-insert` without locks/constraints.

### Relation Create

Transactional order for Join Relations:

```text
1. verify Membership
2. load Parent Space-scoped and lock FOR UPDATE
3. load Target Space-scoped and lock FOR UPDATE
4. re-check Target Privacy
5. insert UNIQUE/FK-protected Join
6. write safe Outbox/Audit metadata
7. Commit
```

A duplicate `PUT` of the same Relation is idempotent and may return the same end state without creating a second Join row.

### Parent Delete vs. Relation Create

- whoever acquires the Parent lock first wins;
- Delete removes Parent + Join rows;
- a waiting Create revalidates after acquiring the lock and returns 404/Conflict without an orphaned Relation.

### Target Delete vs. Relation Create

- Target Delete locks the Target;
- Relation Create locks Parent, then Target;
- if Delete wins first, Create sees no Target after revalidation;
- if Create wins first, Delete waits until commit and then removes Target + Join row according to FK semantics.

### HeartMoment SHARED -> PRIVATE vs. Relation Create

The Privacy transition locks the HeartMoment and removes its Shared Join rows in the same transaction. It does **not lock Relation Parents afterward**, avoiding an inverted Parent->Target lock order.

Relation Create locks Parent -> Target. After the Target lock, `SHARED` is checked again. The result is always either:

- Shared + Relation present, or
- Private + Relation absent.

A state `Private + Relation present` is invalid.

### Direct FK updates

`Plan.placeId` and `Chapter.placeId` use normal resource-version/`If-Match` semantics and Same-Space Place revalidation in the same transaction.

## 11. Error codes

At minimum:

```text
PLACE_NOT_FOUND                    404
CHAPTER_NOT_FOUND                  404
MEMORY_NOT_FOUND                   404
HEART_MOMENT_NOT_FOUND             404
MILESTONE_NOT_FOUND                404
RELATION_TARGET_NOT_FOUND          404
RELATION_ALREADY_EXISTS            200/204 idempotent, no error required
RESOURCE_VERSION_CONFLICT          409
CHAPTER_DATE_RANGE_INVALID         422
PLACE_COORDINATE_PAIR_REQUIRED     422
PLACE_LATITUDE_INVALID             422
PLACE_LONGITUDE_INVALID            422
```

No separate Cross-Space/private-target error code is introduced.

## 12. Mandatory tests

### Place

- Place without coordinates is valid;
- only Latitude or only Longitude -> 422;
- Latitude/Longitude boundary values;
- no automatic deduplication;
- both partners may write according to M3-D01;
- Cross-Tenant CRUD fails closed;
- Place Delete removes Relations, sets Plan/Chapter FK to NULL, and preserves originals.

### Relations

For every approved Relation type:

- Happy Path;
- idempotent duplicate PUT;
- Same-Space FK;
- Cross-Space target -> 404;
- deleted target -> 404;
- Parent Delete vs. Create race;
- Target Delete vs. Create race;
- no Domain-original Cascade.

Additional HeartMoment tests:

- PRIVATE target -> 404;
- SHARED -> PRIVATE atomically removes Place/Chapter Relations;
- Race Relation Create vs. Privacy transition never leaves a leak state;
- PRIVATE -> SHARED reconstructs no old Relations.

### Chapter

- date variants: empty/start-only/end-only/both;
- `endOn < startOn` -> 422;
- multiple Chapters may reference the same target;
- derived ordering is stable;
- Chapter Delete preserves all original targets;
- `Chapter.placeId` is the only Chapter/Place truth.

## 13. Reuse-before-build

Not relevant for this pure Domain/Privacy decision. Later Maps, Geocoding, Provider, or ranking functionality must be reviewed again before in-house implementation according to `docs/REUSE-BEFORE-BUILD.md` and `docs/EXTERNAL-PROVIDER-CANDIDATES.md`.
