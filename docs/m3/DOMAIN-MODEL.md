# M3 Domain Model

**Status:** Readiness draft; source-bound statements and open decisions are separated  
**As of:** August 26, 2026

## 1. Principles

M3 extends the modular monolith with clearly separated Domain areas. There is **no** shared `items`/`content` table.

Shared invariants:

- shared resources belong to exactly one `space_id`;
- every access starts with active Membership in that Space;
- mutable resources have a `version` for Optimistic Concurrency;
- creator/owner IDs are set server-side from Authorization Context and are not transferred through normal updates;
- Domain content is not duplicated in logs, Analytics, or Domain Event payloads;
- `OWNER_ONLY` is enforced in the data query, not through client filtering;
- Relations must never bypass target Authorization;
- Cross-Space Relations are invalid;
- Shared and Private remain separate Domains. Private storage is not modeled as a `visibility` flag on Wish/Plan/Collection.

## 2. Privacy and ownership matrix

| Domain | Source-bound visibility | Owner/author field | Write rule |
|---|---|---|---|
| Wish | `SPACE_SHARED` | `createdBy` | **OPEN – M3-D01** |
| Plan | `SPACE_SHARED` | `createdBy` | **OPEN – M3-D01** |
| Place | `SPACE_SHARED` | `createdBy` | **OPEN – M3-D01** |
| Chapter | shared Space content | `createdBy` | **OPEN – M3-D01** |
| Collection | `SPACE_SHARED` | add `createdBy`? **OPEN – M3-D13** | **OPEN – M3-D13** |
| CollectionItem | inherits Collection | `createdBy` according to Master Spec | **OPEN – M3-D13** |
| PrivateNote | `OWNER_ONLY` | `ownerId` | owner-only, server-side |
| GiftIdea | `OWNER_ONLY` | `ownerId` | owner-only, server-side |
| PrivateCollection | `OWNER_ONLY` | `ownerId` | owner-only, server-side |
| PrivateCollectionItem | inherits PrivateCollection / Owner | not fully specified | owner-only; exact persistence **OPEN – M3-D18** |

For Private Area models, the existing central owner/Privacy Authorization should be reused. Whether each model directly carries `PrivateResourceMixin` or child Items are loaded only through the authorized Parent is decided per table; there must not be a second, weaker private-authorization path.

## 3. Wish

### Source-bound model

```text
Wish
- id
- spaceId
- title
- createdBy
- createdAt
- updatedAt
- version
- status: OPEN | PLANNED | COMPLETED
```

The source does not define a free `description`/`body` field. Such a field is therefore not silently assumed in M3.

### Source-bound behavior

- Wish is shared Space content.
- Users can search, filter, sort, and see Wish progress; global full-text Search itself belongs to the later Search milestone.
- A Wish can be the origin of a Plan.

### Still to decide

- partner write/delete rights relative to the creator.
- whether `PLANNED` may arise only from a successful Wish->Plan transaction.
- whether `COMPLETED` is allowed without a Plan or only through a completed Plan.
- Delete of a Wish with an existing `sourceWishId` Plan.
- whether a Wish remains editable after Plan conversion and which fields stay synchronized — preferred: **no automatic content coupling** after conversion.

## 4. Plan

### Source-bound model

```text
Plan
- id
- spaceId
- sourceWishId?
- title
- description?
- status: IDEA | PLANNED | COMPLETED
- plannedStart?
- plannedEnd?
- experiencedOn?
- placeId?
- createdBy
- createdAt
- updatedAt
- version
```

### Source-bound workflow

```text
Wish
  -> Plan
  -> COMPLETED / experienced
  -> optional Chapter
```

A not-yet-completed Plan may in principle be returned to a Wish state. The exact semantics remain open in this readiness draft.

### State machine – proposed form

```text
IDEA --------> PLANNED --------> COMPLETED
  \               |
   \--------------/
        before completion
        controlled return to Wish
```

The diagram is `PROPOSED`. In particular, these questions remain to be decided here:

- whether `PLANNED -> IDEA` is allowed as a normal Plan state change,
- whether “return to Wish” deletes, archives, or preserves the Plan as history,
- whether a `COMPLETED` Plan may be reopened,
- which combinations of `plannedStart`, `plannedEnd`, `experiencedOn`, and status are valid.

### Date invariants – proposal, not yet binding

- `plannedEnd >= plannedStart` when both are set;
- `COMPLETED` requires `experiencedOn` or an explicit decision why it may exist without a date;
- `IDEA` may exist without a schedule;
- `PLANNED` may require at least one domain planning indicator — a schedule requirement is not yet decided.

## 5. Atomic Wish -> Plan conversion

The user-flow specification requires conversion to be traceable and domain-transactional. The resulting readiness requirement is:

```text
lock/read Wish in space
  -> authorize
  -> validate current version/status
  -> create exactly one Plan with sourceWishId
  -> update Wish status/relation
  -> emit safe events
  -> commit once
```

The exact idempotency strategy remains open in this draft. Possible approaches:

1. Unique Constraint on `(space_id, source_wish_id)` – simple if a Wish may have at most one active/originating Plan.
2. explicit Idempotency Key – more general, but adds infrastructure/semantics.
3. serialized Row-Lock transaction plus Unique Constraint – preferred candidate if 1:1 cardinality is decided.

The decision is M3-D02. Two confirmations must never create two domain-equivalent Plans.

## 6. Return Plan -> Wish

The product specification allows returning a not-yet-completed Plan. **Not specified** is whether:

- the original Wish is reactivated,
- a new Wish is created,
- the Plan is preserved/archived/deleted,
- Plan changes are copied back into the Wish.

This semantics is BLOCKING (M3-D03). Implementation must not improvise this as `DELETE Plan + PATCH Wish`.

## 7. Place

### Source-bound model

```text
Place
- id
- spaceId
- name
- description?
- address?
- latitude?
- longitude?
- createdBy
- createdAt/updatedAt
- version
```

### Invariants

- coordinates are optional.
- a Place without coordinates is valid.
- M3 does not need a Maps/Geocoding Provider to deliver the Place Domain.
- Places can be related to Memories, HeartMoments, Milestones, Plans, and Chapters.

### Sensitive location data

`latitude`, `longitude`, free description, and potentially address can reveal sensitive location information. Therefore M3 already requires:

- no precise location data in logs, Analytics, Event payloads, or metric labels;
- no server-side URL/Provider enrichment in this milestone;
- partner access only through normal Space Authorization;
- classification as ProtectedPayload or another specifically protected field is **BLOCKING – M3-D06/M3-D28**.

### Deduplication

Automatic Place deduplication is not source-bound. A name or coordinate is not a stable global identifier. The preferred safe starting point is **no implicit merge**; the final decision is M3-D07.

## 8. Content Relations

### Source-bound architecture

Externally, a shared Relation Service may exist. Internally, real FKs and typed relation tables should be used. A universal relation

```text
targetType
targetId
```

without referential integrity is excluded.

The Master Spec names in particular:

```text
chapter_memories
chapter_heart_moments
chapter_milestones

place_memories
place_heart_moments
place_milestones
place_plans
place_chapters
```

### Security invariants

A Relation may be created only when:

1. Actor has active Membership in the Space,
2. Relation Parent and target belong to the same Space,
3. Actor may read the target,
4. Actor may modify the Relation on the Parent,
5. the target combination is allowed by the Domain.

A shared Chapter or Place must **not reveal OWNER_ONLY existence**. A private HeartMoment is therefore not visible or relationally provable through a shared Chapter/Place. Relation Create against an unreadable target responds Privacy-safely as “not found”.

### Relation lifecycle

For each relation table, the following must be defined:

- Unique Constraint,
- ordering/position field if required by the Domain,
- `ON DELETE` semantics,
- Concurrency/Reorder behavior,
- Event payload,
- behavior when target Privacy changes.

The concrete M3 relation surface is M3-D08/M3-D09/M3-D26.

## 9. Chapter

### Source-bound model

```text
Chapter
- id
- spaceId
- title
- description?
- startOn?
- endOn?
- placeId?
- createdBy
- createdAt/updatedAt
- version
```

Chapter groups:

- Memories,
- shared HeartMoments,
- Milestones.

### Source-bound Delete rule

```text
DELETE Chapter
  -> remove Chapter Relations
  -> DO NOT delete original Memory/HeartMoment/Milestone
```

This rule is already decided and is listed in the Decision Log as source-bound `DECIDED`.

### Open points

- partner write rights.
- `startOn <= endOn` and handling of empty bounds.
- ordering of Chapter content: chronologically derived or manually positionable?
- direct `placeId` column plus `place_chapters` appears partially redundant in the Master Spec; the canonical relation must be decided before migration.
- may one target belong to multiple Chapters? The source does not forbid it.

## 10. Collection / CollectionItem

### Source-bound model

```text
Collection
- id
- spaceId
- title
- createdAt/updatedAt

CollectionItem
- id
- collectionId
- title
- completed
- position
- createdBy
- createdAt/updatedAt
```

The product specification describes freely definable shared Lists with Completion, sorting, and multi-select. The Shopping List is explicitly **not** a Collection.

### Readiness gaps

Global project conventions require versioning for mutable objects, while the Master field list for Collection/Item does not name `version`. This conflict is not ignored: M3-D14/M3-D18 decide the Concurrency surface.

Still open in this draft:

- creator/ownership of the Collection itself,
- who may modify/delete Collection and Items,
- position strategy (dense integer, fractional rank, or similar),
- atomic Reorder and concurrent Reorder,
- whether multi-select is only a UI batch action or additional Domain semantics,
- Delete Collection -> Items: Parent Cascade preferred, but still BLOCKING.

## 11. PrivateNote

### Source-bound model

```text
PrivateNote
- id
- spaceId
- ownerId
- title
- body
- pinned
- createdAt/updatedAt
- version
```

### Hard invariants

- `OWNER_ONLY` without a partner exception.
- The partner receives no positive signal through ID, Lists, counts, Search, Dashboard, Deep Link, or error detail.
- `title` and `body` are sensitive user content and belong within the ProtectedPayload boundary or its later E2EE-ready structure.
- `ownerId` is immutable.

## 12. GiftIdea

### Source-bound model

```text
GiftIdea
- id
- spaceId
- ownerId
- title
- description?
- recipient?
- occasion?
- targetOn?
- priceText?
- url?
- status
- pinned
- createdAt/updatedAt
- version
```

**The specification defines no enum for `status`.** Code must not invent values. M3-D17 is BLOCKING.

Security boundaries:

- all Domain content is owner-only;
- `url` is stored only as user content in M3; no server-side Preview/Fetch resolution without a separate SSRF/Provider design and Reuse review;
- `priceText` remains free text while no monetary Domain decision exists; no currency logic may be inferred silently.

## 13. PrivateCollection / PrivateCollectionItem

### Source-bound core

```text
PrivateCollection
- spaceId
- ownerId
- title

PrivateCollectionItem
- title
- completed
- position
```

Both are `OWNER_ONLY`.

The field list is intentionally less complete than for other models (for example IDs/timestamps/version on the Item). M3-D18 must complete persistence and Concurrency conventions before migrations are created.

## 14. ProtectedPayload candidates

The architecture boundary is source-bound, not each individual M3 column. The following candidates are evaluated by the relevant decisions:

| Domain | Candidates |
|---|---|
| Wish | `title` and possible later free-text fields |
| Plan | `title`, `description` |
| Place | `name`, `description`, `address`, precise coordinates |
| Chapter | `title`, `description` |
| Collection | `title`; Item `title` |
| PrivateNote | `title`, `body` |
| GiftIdea | all content fields including URL/price text |
| PrivateCollection | `title`; Item `title` |

Status, technical IDs, versions, and safe enum-like states may remain outside the payload if they do not create unnecessary sensitive information. Final classification belongs in the relevant decisions.

## 15. Domain Events

M3 follows the existing M2 rule: Events carry IDs and safe state metadata, not protected content.

Proposed minimal envelope:

```text
eventId
eventType
occurredAt
spaceId
actorId
resourceType
resourceId
resourceVersion
safeState?
```

Not in Events:

- Wish/Plan/Chapter/Collection titles,
- PrivateNote/GiftIdea content,
- GiftIdea URL,
- address or coordinates,
- private Relation counts,
- arbitrary partner-private metadata.

M3-D23 freezes the Event contract before the first Event-producing slice.

## 16. Delete/Cascade matrix

| Operation | Source-bound | Still to decide |
|---|---|---|
| Delete Wish without Plan | no | Hard Delete/Retention/Event |
| Delete Wish with source Plan | no | block, unlink, or preserve Plan |
| Delete Plan | no | effect on source Wish/Place/Chapter |
| Delete Place | no | remove Relations vs. block Delete |
| Delete Chapter | **yes** | remove Relations, preserve originals |
| Delete Collection | no | preferably delete Items with Parent |
| Delete CollectionItem | no | position/Reorder afterward |
| Delete PrivateNote/GiftIdea | owner-only source-bound | Retention/Audit/Event |
| Delete PrivateCollection | no | preferably delete private Items with Parent |

DB Cascade must never delete domain originals outside the Parent aggregate.

## 17. Central race scenarios

Before runtime, at least these races must be represented in the test design:

- two parallel Wish->Plan conversions,
- Wish Delete vs. Wish->Plan,
- Plan Completion vs. Plan->Wish return,
- Relation Create vs. target Delete,
- Relation Create vs. HeartMoment `SHARED -> PRIVATE`,
- Chapter Delete vs. Relation Create,
- Place Delete vs. Relation Create,
- Collection Reorder vs. Item Delete/Completion,
- PrivateCollection Reorder vs. Item Delete,
- Owner Read vs. logout/Membership loss in Client caches (later M5).

The DB/service solution must make each race deterministic through constraints/locks/transactions, not merely happen to pass tests sequentially.
