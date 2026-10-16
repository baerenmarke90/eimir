# M3 Delivery Plan

**Status:** S0 complete; S1 through S10 delivered; G3 passed
**As of:** August 30, 2026

## 1. Gate before runtime

This plan describes the completed sequence **after runtime release**.

Before the first M3 runtime commit, the project rule required:

1. the final G2 review on current `main` to determine `G2: PASSED` (#147),
2. #146 to synchronize the status sources and release M3,
3. each concrete runtime PR to address the production OpenAPI contract and Reuse-before-build cleanly.

Items 1 and 2 were satisfied before runtime started. Item 3 remained a condition for every runtime PR and was satisfied throughout the delivered S1-S9 sequence.

The domain-level S0 decisions are complete: M3-D01 through M3-D32 are `DECIDED`.

## 2. S0 – complete

### #162 Wish / Plan

- collaborative write;
- atomic/idempotent Wish->Plan conversion;
- Return-to-Wish;
- Plan lifecycle and date invariants;
- Delete matrix;
- Direct Plan Create.

Contract: [`decisions/WISH-PLAN-LIFECYCLE.md`](./decisions/WISH-PLAN-LIFECYCLE.md)

### #163 Place / Relations / Chapters

- Place Privacy and coordinates;
- no automatic deduplication;
- typed relation surface;
- `Plan.placeId`/`Chapter.placeId` as canonical single-Place FKs;
- Relation Privacy and races;
- Chapter dates, derived ordering, and Delete.

Contract: [`decisions/PLACE-RELATIONS-CHAPTERS.md`](./decisions/PLACE-RELATIONS-CHAPTERS.md)

### #164 Collections / Private Area

- Shared Collection root/item versioning;
- atomic Reorder;
- Private ProtectedPayload;
- GiftIdea status;
- PrivateCollection schema/Auth;
- owner-scoped Private API;
- M3 Event Redaction.

Contract: [`decisions/COLLECTIONS-PRIVATE-AREA.md`](./decisions/COLLECTIONS-PRIVATE-AREA.md)

### #165 G3 / Clients / Export / Cache

- G3 as a Domain/API/PostgreSQL gate;
- five mandatory real HTTP E2E flows;
- M5/G4 boundary for clients/Accessibility/Performance;
- later Export/cache Privacy;
- Private IA;
- Plan Richness later;
- multi-select as client state.

Contract: [`decisions/G3-CLIENT-BOUNDARIES.md`](./decisions/G3-CLIENT-BOUNDARIES.md)

## 3. Target model

```text
Wish OPEN
  -> Plan IDEA
  -> PLANNED optional
  -> COMPLETED
  -> optional Chapter

Plan --------> Place (max. one primary Place)
Chapter -----> Place (max. one primary Place)

Memory -----------+
SHARED HeartMoment+---- typed Relations ----> Chapter / Place
Milestone --------+

Shared Collection
  -> CollectionItems + atomic Reorder

PrivateNote / GiftIdea / PrivateCollection
  -> OWNER_ONLY, completely separate Query/API boundary
```

## 4. S1 – Wish Foundation – delivered

Scope:

- Wish model + migration;
- `OPEN | PLANNED | COMPLETED`;
- title/createdBy/version;
- CRUD/List;
- collaborative write;
- `If-Match`/409;
- Tenant Guard;
- safe Events;
- PostgreSQL/HTTP/Cross-Tenant tests.

Exit:

- Wish is robust as an independent Shared Domain;
- no free status mutation can bypass the Wish->Plan contract.

Implemented. The two points left open in S1 — the first real status transition and the Plan-dependent rows of the Delete matrix — were completed in S2.

## 5. S2 – Plan + Wish->Plan – delivered

Scope:

- Plan model + migration;
- `IDEA | PLANNED | COMPLETED`;
- Direct Plan Create;
- Plan CRUD/List;
- schedule/unschedule/complete;
- `sourceWishId` + Unique/FK;
- atomic Wish->Plan operation;
- Return-to-Wish;
- Wish/Plan lock order;
- race/rollback tests.

Mandatory evidence:

```text
Wish Create
-> Convert
-> exactly one Plan
-> Complete
-> Wish + Plan consistently COMPLETED
```

Implemented, including the mandatory race and rollback tests from the decision document: parallel Convert creates exactly one Plan, a failure between Plan insert and Wish transition leaves nothing behind, and Delete vs. Convert or Complete vs. Return ends deterministically without a half lifecycle.

Not included and explicitly deferred to S3: `Plan.placeId`. M3-D02 and M3-D30 name the field for Create, PATCH, and conversion; without a Place Domain it could point to nothing, and a contract with an unusable field would promise an association the server could not establish.

## 6. S3 – Place Foundation – delivered

Scope:

- Place model + migration;
- `name/description/address/latitude/longitude`;
- lat/lon as a pair, max. 6 decimal places;
- CRUD/List;
- no automatic deduplication;
- no Maps/Geocoding Provider;
- Redaction in logs/Events;
- Delete sets Plan/Chapter Place FKs to NULL and removes only Join Relations;
- add `Plan.placeId` as field, migration, and contract surface (moved from S2).

Implemented. Two execution details:

- Place Delete unlinks assigned Plans **versionedly in the service** rather than relying only on `ON DELETE SET NULL`. A Plan whose Place disappears has changed; without a new version, a partner could continue writing from a state that still shows a Place that no longer exists. The foreign key remains as the integrity boundary.
- Log Redaction became more than a Domain rule: bound parameters had previously appeared in every database error message and therefore in the application log. This affected coordinates as well as all existing ProtectedPayloads. Fixed at the engine level.

`Chapter.placeId` remains in S5 — without a Chapter Domain there is no column.

## 7. S4 – Typed Content Relations – delivered

This slice implements:

```text
place_memories
place_heart_moments
place_milestones
```

The three `chapter_*` Relations are listed in section 8 under S5 and had previously been carried here by mistake. They are not buildable in S4: the `chapters` table is created only with the Chapter Domain, so a foreign key would have no target until then. This is the same reasoning used when `Plan.placeId` was moved from S2 to S3.

Technical rules:

- real FKs + Unique Constraints;
- no free `(targetType,targetId)` polymorphism;
- Same-Space enforcement;
- SHARED HeartMoments only;
- typed REST routes;
- Relation Create locks/revalidates Parent->Target;
- Privacy transition SHARED->PRIVATE removes Relations atomically;
- Delete/Privacy races tested with PostgreSQL.

`place_plans` and `place_chapters` are not built; `Plan.placeId` and `Chapter.placeId` are canonical.

Implemented. Three execution details:

- Same-Space became a schema property rather than a service rule. The Join row carries `space_id` once, and *the same* column participates in both composite foreign keys. A Cross-Space relation is therefore not merely forbidden; it cannot be represented.
- Excluding private HeartMoments also lives in the schema. `place_heart_moments` carries the target Privacy class as part of the foreign key, with `ON UPDATE CASCADE` and a CHECK for `SPACE_SHARED`. If a moment changes to `OWNER_ONLY` without first removing its Relations, the transaction fails. The service removes them in the same transaction and therefore never hits the guard; the guard protects code paths that do not yet exist.
- `change_visibility` now locks the HeartMoment exclusively instead of merely authorizing it. Without the lock, there was a window between removing Relations and changing the class in which a concurrent Relation Create could still insert its row as shared.

## 8. S5 – Chapter – delivered

Scope:

- Chapter model + migration;
- CRUD/List;
- optional `startOn`/`endOn`, with `endOn >= startOn` when both are set;
- `placeId`;
- typed Content Relations (`chapter_memories`, `chapter_heart_moments`, `chapter_milestones`) using the same Join shape as S4;
- derived chronological presentation;
- multiple Chapters may reference the same target;
- Delete removes only Chapter + Relations.

Mandatory test:

```text
Chapter + Memory + SHARED HeartMoment + Milestone
-> DELETE Chapter
-> Relations gone
-> all originals remain readable unchanged
```

Implemented. Chapter CRUD/List is exposed through the versioned REST/OpenAPI contract with `If-Match`/409 semantics; all four decided date shapes and the invalid-range error are covered. `Chapter.placeId` is canonical and Same-Space, Place deletion detaches it versionedly, and the three typed relation families reuse the S4 integrity/privacy/locking model. Derived content ordering is computed from original resources without a persisted position. Chapter deletion removes relation rows only and preserves Memory, SHARED HeartMoment, Milestone, and Place originals.

## 9. S6 – Shared Collections – delivered

Scope:

- Collection + CollectionItem;
- `createdBy` Attribution, collaborative write;
- root version for structure/order;
- item version for Title/Completed;
- positions `0..n-1`;
- atomic full-list Reorder;
- Item Delete + compaction;
- Parent Delete cascades only Items;
- Cross-Tenant/Concurrency tests.

Not included: ShoppingList and persisted multi-select state.

Implemented. Collection CRUD/List and Item Create/Update/Delete are collaborative within the Space while `createdBy` remains immutable server attribution. The Collection root version protects root fields plus list structure/order; Item versions protect title/completed independently. Item Create appends, Item Delete compacts positions transactionally, and full-list Reorder is atomic under the root `If-Match` with a deferrable `(collection_id, position)` uniqueness constraint. Real PostgreSQL races cover competing Reorders and Reorder against Create/Delete/Completion; Cross-Tenant and foreign parent/item IDs fail closed. Collection and Item titles remain outside event payloads. ShoppingList and persisted multi-select state remain outside S6.

## 10. S7 – PrivateNote + GiftIdea – delivered

Scope:

- separate tables/services;
- owner-only CRUD/List;
- `/spaces/{spaceId}/private/...`;
- PrivateNote title/body as Protected Content;
- GiftIdea `IDEA | BOUGHT | GIVEN`;
- no URL Preview/server Fetches;
- Privacy-safe 404;
- Event/log Redaction;
- partner negative tests.

Implemented. PrivateNote and GiftIdea use dedicated owner-only tables/services and derive Space, owner, and `OWNER_ONLY` on the server. Protected content remains behind `ProtectedPayload`; list cursors are bound to Space and owner before pagination. Both roots use `If-Match`/409. GiftIdea starts in `IDEA` and enforces the decided `IDEA | BOUGHT | GIVEN` transition graph, including rejection of `GIVEN -> IDEA`. GiftIdea URLs are inert stored content and trigger no server fetch or preview. Unknown, partner-owned, and foreign-Space IDs are privacy-safe 404s, private content and structural state stay out of persistent event payloads, and PostgreSQL/HTTP tests cover owner CRUD, partner/Cross-Tenant isolation, concurrency, lifecycle transitions, and the no-network URL invariant. OpenAPI and generated TypeScript/Kotlin clients are synchronized.

## 11. S8 – PrivateCollection – delivered

Scope:

- PrivateCollection root with id/space/owner/version;
- Items with Parent FK, id/version/position;
- authorize owner/space exclusively through Parent;
- owner-only Reorder/Completion;
- Parent Delete cascades only Items;
- partner/Cross-Space negative tests.

Shared Collection and PrivateCollection share neither a table nor an unsafe query path.

Implemented in Issue #259 / PR #260 with dedicated owner-only root and Item persistence, ProtectedPayload-backed title/icon content, and server-derived Space/owner/privacy. Item rows deliberately duplicate neither `spaceId` nor `ownerId`; every child operation authorizes through the owner-scoped Parent. Root `version` protects Item-set/order structure, Item `version` protects title/completion, Create appends, Delete compacts positions, and exact-set Reorder is atomic under the root version using the proven collision-safe PostgreSQL strategy. Partner, Cross-Space, unknown-Parent, stale-version, cascade, event-redaction, and real PostgreSQL race coverage is included. The canonical OpenAPI snapshot and generated TypeScript/Kotlin clients are synchronized.

## 12. S9 – Integrated M3 backend/API evidence – delivered

The five mandatory G3 flows are demonstrated against the real eimir. API + PostgreSQL:

1. Wish -> Plan -> Complete;
2. Place + typed Relation + Delete;
3. Chapter + Relations + Delete without original loss;
4. Collection Completion + Reorder + Conflict;
5. PrivateNote/GiftIdea/PrivateCollection with partner negative path.

Additionally, Cross-Tenant, race, Event/log Redaction, and Delete suites run.

Implemented in Issue #261 / PR #263. The executable evidence index is
[`G3-EVIDENCE.md`](./G3-EVIDENCE.md). S9 adds an integrated Chapter
HTTP/PostgreSQL flow that proves derived ordering and original preservation, an
owner -> partner -> owner authorization-context switch across the complete
Private Area, and the previously missing real-PostgreSQL Parent Delete vs. Item
Create/Reorder races for both shared and private Collection aggregates. Existing
S1-S8 acceptance suites are reused for the remaining G3 evidence instead of
being duplicated. No production API, Domain model, dependency, service, secret,
or configuration is added by S9.

S9 establishes the evidence set only; the final gate decision is recorded by S10.

## 13. S10 – G3 Review – delivered

M3-S10 / Issue #264 created the immutable dated review:

[`../reviews/2026-08-30-g3-gate-review.md`](../reviews/2026-08-30-g3-gate-review.md)

The review freezes the post-S9 `main` state at
`fdaa4402ba59bc3532fedab44d5e64fdf68c2727`, verifies the exact successful S9
workflow runs, evaluates all five mandatory M3-D24 flows and the binding
Cross-Tenant/`OWNER_ONLY`/race/delete/redaction/contract evidence, and audits the
current open findings against the G3 blocker definition.

The review concludes:

```text
G3: PASSED
```

G3 does not require complete Web/Android product flows. Systematic client parity, Accessibility, Read Cache, Export/Import, Deep Links, and Performance remain M5/G4.

## 14. Dependency graph

```text
G2 PASSED + #146
        |
        v
S1 Wish
  |
  v
S2 Plan + Conversion
  |
  +------> S3 Place
  |           |
  |           v
  |        S4 Relations
  |           |
  |           v
  |        S5 Chapter
  |
  +------> S6 Shared Collections
  |
  +------> S7 PrivateNote/GiftIdea
              |
              v
           S8 PrivateCollection

S2 + S3 + S4 + S5 + S6 + S7 + S8
              |
              v
           S9 E2E
              |
              v
           S10 G3 ✓
```

The M3 delivery chain is complete and G3 has passed. The next roadmap milestone is M4 — Engage. This delivery plan does not start or implement M4.
