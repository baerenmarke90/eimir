# M3 Security Test Matrix

**Status:** binding readiness matrix; concrete expected values follow decisions  
**As of:** August 30, 2026

This matrix defines the minimum test classes required for an M3 slice. It does not replace slice-specific tests, but prevents Tenant, owner-only, Relation, or race cases from first surfacing at the gate.

## 1. Test levels

| Level | Purpose |
|---|---|
| Domain Unit | state machines, validation, safe pure rules |
| PostgreSQL Integration | constraints, FKs, locks, races, cascades, Tenant/Owner queries |
| HTTP Integration | real Auth/Membership/API/Problem Details/ETag semantics |
| Contract/OpenAPI | DTOs, enums, error codes, generatable contract |
| Client/Gate | according to M3-D24; no implicit assumption before decision |

SQLite is not a substitute for PostgreSQL race/constraint evidence.

## 2. Shared Tenant matrix

For **Wish, Plan, Place, Chapter, Collection** at minimum:

| Case | Expected result |
|---|---|
| active member, own Space, GET | allowed |
| active member, own Space, List | own Space only |
| ID from foreign Space in own route | Privacy-safe 404 |
| foreign `spaceId` without Membership | 404/standardized Tenant response |
| mutation against foreign Space | no row change |
| Delete against foreign Space | no row change |
| cursor/filter from another Space | not reusable / no foreign data |

The concrete partner-write expectation depends on M3-D01 and is added after the decision.

## 3. Wish

### CRUD / Concurrency

- Create derives `createdBy` from Auth Context, not request.
- Request cannot override `createdBy`, `spaceId`, or `version`.
- Update with current version succeeds.
- stale Update -> 409, no partial change.
- stale Delete -> 409 if Delete is versioned.
- invalid status patch is not accepted as a normal Update if a Transition API is decided.

### Wish -> Plan

Mandatory cases:

1. OPEN Wish -> Plan succeeds.
2. Wish + Plan visible in the same DB transaction.
3. failure after Plan insert before Wish update -> complete rollback.
4. two parallel conversions -> exactly according to M3-D02, never two disallowed Plans.
5. identical retry after successful commit -> deterministic idempotency/conflict semantics.
6. stale `If-Match` -> no Plan created.
7. foreign Space Wish -> 404.
8. Place from foreign Space in conversion request -> 404, no Plan.
9. Wish Delete concurrent with conversion -> exactly one domain-valid ordering wins.

## 4. Plan

### Status

For every transition edge allowed by M3-D04:

- Happy Path,
- stale version,
- duplicate transition,
- invalid source/target combination,
- date validation,
- Cross-Space Place,
- partner write according to M3-D01.

For every forbidden edge, provide an explicit negative test.

### Completion

- `COMPLETED` sets/validates `experiencedOn` according to the decision.
- parallel Completion is idempotent or a deterministic Conflict.
- Completion vs. Return-to-Wish is serialized.
- Completion changes the source Wish only according to an explicit decision; no implicit Cascade.

### Return-to-Wish

After M3-D03, test:

- only permitted non-completed states,
- behavior with/without `sourceWishId`,
- no silent payload overwrite,
- Plan/Wish versions remain consistent,
- race with Plan Update/Delete/Complete.

## 5. Place

### Validation

- Place without coordinates is allowed.
- coordinates outside permitted bounds are rejected.
- pair/null semantics according to M3-D06.
- address/Description do not appear in error/audit/Event logs.

### Tenant / Write

- Cross-Space CRUD is rejected.
- partner write according to M3-D01.
- no automatic deduplication of similarly named Places if M3-D07 confirms this.

### Delete / Relation

- Delete against existing Relation according to M3-D05/D26.
- Delete vs. concurrent Relation Create using a real PostgreSQL race.
- no dangling FK row.

## 6. Content Relations

For **every actually approved Relation type**, apply the same baseline matrix:

| Case | Expected result |
|---|---|
| Parent + target same Space, authorized | link allowed |
| Parent foreign Space | 404 |
| target foreign Space | 404 |
| target unknown | 404 |
| target owner-only/unreadable | 404, no existence disclosure |
| duplicate link | deterministic Conflict/idempotency according to contract |
| unlink nonexistent | defined safe semantics |
| target Delete | Join row removed according to FK/lifecycle or Delete blocked |
| Parent Delete | Join row removed |
| Relation Create vs. target Delete | no phantom link |
| Relation Create vs. Privacy revoke | no private link after commit |

### HeartMoment Privacy race

Mandatory PostgreSQL test:

1. shared HeartMoment is `SHARED`;
2. transaction A attempts Relation to Chapter/Place;
3. transaction B sets HeartMoment to `PRIVATE`;
4. after both commits, no shared Read Model/Relation may reveal the existence of the private HeartMoment.

## 7. Chapter

### CRUD

- Tenant matrix.
- `startOn/endOn` according to M3-D11.
- partner write according to M3-D01.
- stale update/delete -> 409.

### Delete invariant

Mandatory test:

1. link Chapter with Memory, shared HeartMoment, and Milestone.
2. delete Chapter.
3. Join rows are removed.
4. Memory, HeartMoment, and Milestone remain unchanged.
5. their versions are not incremented by Chapter Delete.
6. no Delete Events for targets.

### Private target

- attempting to link a private HeartMoment ID -> safe 404.
- partner cannot infer private target population from Chapter count/response.

## 8. Collection / CollectionItem

### Shared ownership

After M3-D13:

- creator/partner actions positive/negative as defined,
- `createdBy` cannot be manipulated,
- Cross-Space Parent ID.

### Completion

- Item Completion with current Item/Parent version.
- stale Completion -> 409.
- parallel toggle -> no Lost Update.

### Reorder

Mandatory cases regardless of strategy:

- valid complete Reorder,
- unknown Item ID,
- Item from another Collection,
- duplicate Item ID in order request,
- missing IDs if full list is required,
- Reorder vs. Item Delete,
- two parallel Reorders,
- Reorder vs. Item Create,
- no duplicate/invalid positions after commit.

### Parent Delete

After M3-D15:

- Collection Delete handles own Items as decided,
- no effect on Shopping or other Domain objects,
- no orphaned Items.

## 9. PrivateNote

Mandatory matrix:

| Actor | Operation | Expected result |
|---|---|---|
| Owner | create/list/get/update/delete | allowed |
| Partner in same Space | list | own Notes only; never the partner's Notes |
| Partner with foreign Note ID | get/update/delete | identical 404 |
| Account without Space Membership | all | 404/Tenant denial |
| Owner from another Space | get through wrong Space | 404 |

Additionally:

- `ownerId` only from Auth Context.
- Request cannot change Privacy to shared.
- Title/Body not in Domain Event.
- Title/Body not in Audit/log representation.
- stale update/delete -> 409.

## 10. GiftIdea

Same as PrivateNote plus:

- every enum value from M3-D17 positively tested,
- unknown status -> Validation Error,
- `url` is stored but triggers **no outbound HTTP request** from Backend/Worker,
- URL/recipient/occasion/priceText not in Events/logs,
- partner receives no GiftIdea counts/existence indicators.

A test may store an intentionally unreachable/internal URL and confirm that network access is not part of the operation.

## 11. PrivateCollection / PrivateCollectionItem

### Owner isolation

- Owner CRUD/List.
- partner sees only their own private Collections in their private List.
- partner ID access to foreign PrivateCollection/Item -> identical 404.
- Item cannot be referenced from a foreign PrivateCollection.
- Cross-Space negative cases.

### Reorder / Completion

Use the same Concurrency matrix as Shared Collection, plus:

- no shared position space,
- no IDs from the partner's private data set in Conflict/Validation details,
- Parent owner condition is part of every Child query.

## 12. Privacy leak matrix

For every `OWNER_ONLY` Domain, test:

- GET by ID
- List
- pagination/cursor
- Count, if present
- ordering
- error details
- Relation create/unlink
- Deep Link/API direct navigation where a client exists
- Events
- Audit
- Logs/Error Tracking
- Export later as a Contract-test checkpoint
- Search later as an M4 checkpoint

Negative tests should compare not only status codes but also response body/form where existence leaks are possible.

## 13. Event/Outbox tests

For every Event-producing M3 slice:

- Event and Domain mutation are atomic.
- rollback -> no Event.
- Event contains only M3-D23 envelope.
- JSON snapshot contains no Domain titles/text.
- no address/lat/lon.
- no GiftIdea URL/recipient/priceText.
- no PrivateNote/Collection titles.
- Consumer Retry causes no duplicate Domain effect.

## 14. Delete/Cascade races

Mandatory races:

- Wish Delete vs. Convert-to-Plan.
- Plan Delete vs. Complete.
- Place Delete vs. Relation Create.
- Chapter Delete vs. Relation Create.
- Target Delete vs. Chapter/Place Link.
- Collection Delete vs. Item Create/Reorder.
- PrivateCollection Delete vs. Item Create/Reorder.

Tests must use real independent PostgreSQL transactions, not only sequential service calls.

M3-S9 closes the final Collection Parent-Delete race gap through
`backend/tests/integration/test_collection_parent_delete_races.py`, covering
both shared and private Collection aggregates against Item Create and Reorder.

## 15. API/OpenAPI tests

Every M3 API slice:

- generated OpenAPI is deterministic,
- no unintended free string enums for status-like fields,
- `If-Match` documented,
- 409 documented,
- Privacy-safe 404 documented,
- unknown fields/contract rules follow project standard,
- Web/Android generator remains functional once the client surface consumes the contract.

## 16. G3 evidence checklist

The exact gate form is decided by M3-D24. The executable evidence map is
[`G3-EVIDENCE.md`](./G3-EVIDENCE.md). The S9 evidence pass demonstrates:

- [x] Wish->Plan real HTTP/PostgreSQL flow including race.
- [x] Plan lifecycle with all allowed/forbidden transitions.
- [x] Place + approved Relation types through the real API.
- [x] Chapter Delete preserves all original targets.
- [x] Collection Reorder/Completion concurrency.
- [x] PrivateNote/GiftIdea/PrivateCollection owner-only negative matrix.
- [x] Cross-Space Relation tests.
- [x] Private HeartMoment cannot leak through M3 Relation.
- [x] Events/logs contain no sensitive M3 payloads.
- [x] OpenAPI/PostgreSQL/CI evidence is green for the S9 implementation head; S10 revalidates the final `main` gate state.
- [x] M3-D24 requires no additional Client/Accessibility evidence for G3; systematic client parity and Accessibility remain M5/G4.

The checklist records available evidence only. It does **not** declare G3 passed;
that decision belongs to the new dated S10 gate review.

## 17. Merge rule

A runtime PR that introduces a new M3 Domain or Relation is not merge-ready if the corresponding row of this matrix is neither implemented nor justified as demonstrably not relevant.
