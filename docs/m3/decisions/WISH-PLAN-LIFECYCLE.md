# M3 Wish/Plan Lifecycle – Binding Decisions

**Status:** `DECIDED` – effective with merge of this decision PR  
**Date:** August 26, 2026  
**Tracking:** #162  
**Covers:** M3-D01, M3-D02, M3-D03, M3-D04, M3-D05, M3-D30

This document closes the blocking M3 decisions for Wish and Plan. It contains only Domain, API, persistence, Concurrency, and test decisions. It does **not release M3 runtime code**; the gate rule from `docs/m3/README.md` remains in force.

## 1. Binding sources

The decisions build on the following source-bound boundaries:

- `specification/CLEAN-ROOM-MASTER-SPEC.md`
- `specification/PRODUCT-SPEC.md`
- `docs/SECURITY.md`
- `docs/m3/README.md`
- `docs/m3/DOMAIN-MODEL.md`
- `docs/m3/API-DESIGN.md`
- `docs/m3/SECURITY-TEST-MATRIX.md`

In particular, the following remain source-bound:

- Wish is `SPACE_SHARED` with `OPEN | PLANNED | COMPLETED`.
- Plan is `SPACE_SHARED` with `IDEA | PLANNED | COMPLETED`.
- `Plan.sourceWishId` is optional.
- Wish -> Plan -> Completed -> optional Chapter is intended.
- a non-completed source-bound Plan can be returned to the Wish state.
- mutable resources use version/`If-Match`; conflicts return HTTP 409.
- Cross-Tenant access remains Privacy-safe.

## 2. M3-D01 – Shared Write Ownership

### Decision

For the shared M3 Domains **Wish, Plan, Place, Chapter, and Collection**, the baseline rule is **collaborative write**:

- both active Space members may create and read shared resources and, where allowed by the respective Domain state, modify and delete them;
- `createdBy` serves Attribution/Audit and is **not** an ACL;
- `createdBy`, `spaceId`, and technical ownership fields cannot be overridden by clients;
- Domain-specific state, Delete, or Relation rules may block a concrete mutation despite active Membership;
- missing Membership, foreign Space, or foreign resource ID remains Privacy-safe according to the existing Tenant convention.

This rule does **not** change author-only rules in other Domains such as Memory. It applies only to the named collaborative M3 planning/list resources.

### Wish/Plan specifically

- both partners may change the Wish title regardless of who created the Wish;
- both partners may change Plan title, description, and Place association;
- status fields are never set through normal PATCH;
- Wish and Plan remain separate Domain objects after conversion: changing a Wish title does not automatically synchronize the Plan title, and vice versa;
- `createdBy` remains unchanged.

### API/Audit consequences

- no creator-only 403 for Wish/Plan;
- forbidden lifecycle actions are Domain conflicts (`409`), not permission errors;
- clients may display `capabilities`, but only the server decides whether a mutation is allowed;
- Audit/Event keeps Actor ID, Resource ID, timestamp, action, and result, but no Domain titles/descriptions.

## 3. Wish lifecycle – binding derivation from D02/D03/D04

Wish has exactly this state machine:

```text
OPEN
  | convert-to-plan
  v
PLANNED
  | plan complete
  v
COMPLETED

PLANNED -- return-to-wish --> OPEN
```

Binding rules:

- `OPEN -> PLANNED` only through the atomic Wish->Plan operation;
- `PLANNED -> OPEN` only through `return-to-wish` on the originating Plan;
- `PLANNED -> COMPLETED` only through Completion of the originating Plan;
- `COMPLETED` is terminal for the state machine;
- there is no direct Wish Complete route;
- there is no free Wish status PATCH;
- normal title corrections remain versioned content updates and do not change status.

## 4. M3-D02 – Wish -> Plan cardinality, atomicity, and idempotency

### Decision

A Wish may have **at most one originating Plan at a time**.

Persistence:

- `Plan.sourceWishId` is nullable;
- when set, it references a Wish in the same Space;
- `sourceWishId` is unique;
- a returned Plan is deleted, so the same Wish may later be converted again into a new Plan.

### Operation

```text
POST /api/v1/spaces/{spaceId}/wishes/{wishId}/plan
If-Match: "<wish-version>"
```

Request:

```text
WishToPlanRequest
- title?        # optional Plan title; default = current Wish title
- description?
- placeId?
```

Not client-settable:

```text
sourceWishId
status
createdBy
spaceId
version
plannedStart
plannedEnd
experiencedOn
```

First successful call:

```text
201 Created
WishToPlanResponse
- wish
- plan
```

The operation creates:

```text
Wish.status       = PLANNED
Plan.status       = IDEA
Plan.sourceWishId = Wish.id
```

### Idempotent retry

If the Wish is already `PLANNED` and exactly the originating Plan exists, a repeated Convert call returns the same Plan:

```text
200 OK
WishToPlanResponse
- same wish
- same plan
```

The Retry **never** creates a second Plan. A differing request does not overwrite the existing Plan; subsequent changes happen through the Plan itself.

If the Wish is already `COMPLETED`, another conversion is not a Retry and returns a Domain conflict.

### Transaction flow

In one PostgreSQL transaction:

1. verify active Membership;
2. load the Wish Space-scoped and lock it `FOR UPDATE`;
3. check for an existing originating Plan;
4. when `PLANNED` + existing Plan, return the same Plan idempotently;
5. when `OPEN`, verify `If-Match`;
6. optionally validate `placeId` as Same-Space/authorized;
7. create Plan with `sourceWishId=wish.id`, status `IDEA`, and its own version;
8. set Wish to `PLANNED` and increment its version;
9. write safe Outbox/Audit metadata;
10. commit exactly once.

Rollback at any point leaves neither a Plan nor a half-completed Wish transition.

### Race contract

Two parallel Convert requests on the same OPEN Wish deterministically result in:

- exactly one Plan in the database;
- one request creates the Plan;
- the second waits for the Wish lock and then receives the same originating Plan as an idempotent response;
- DB Unique is the final integrity boundary.

## 5. M3-D03 – Plan -> Wish return

### Decision

`return-to-wish` is allowed only for **non-completed originating Plans**:

- `sourceWishId != null`;
- Plan status is `IDEA` or `PLANNED`;
- source Wish is `PLANNED`.

A Direct Plan without `sourceWishId` cannot be returned to a Wish. The user must explicitly create a new Wish instead.

### Semantics

The return operation:

1. reactivates **the same original Wish** with status `OPEN`;
2. increments the Wish version;
3. deletes the non-completed Plan;
4. removes only Plan-owned Relation/Join rows;
5. never deletes Place, Chapter, or other Domain originals;
6. does **not** automatically copy Plan title, description, or Plan dates back to the Wish.

This avoids silently overwriting divergent ProtectedPayloads. Plan-specific data is discarded by the explicitly chosen return operation; the UI must explain this destructive consequence clearly before confirmation.

### Operation

```text
POST /api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish
If-Match: "<plan-version>"
```

Response:

```text
200 OK
PlanReturnToWishResponse
- wish
- removedPlanId
```

Afterward the Plan is no longer readable under its ID.

## 6. M3-D04 – Plan lifecycle and date invariants

### Binding state machine

```text
IDEA -- schedule --> PLANNED
IDEA -- complete --> COMPLETED
PLANNED -- unschedule --> IDEA
PLANNED -- complete --> COMPLETED
```

Allowed:

- `IDEA -> PLANNED`
- `PLANNED -> IDEA`
- `IDEA -> COMPLETED`
- `PLANNED -> COMPLETED`

Forbidden:

- every transition from `COMPLETED` to another status;
- freely setting `status` through normal `PATCH`;
- status self-transitions as dedicated operations.

`return-to-wish` is **not a Plan status edge**, but a dedicated Domain operation under M3-D03 that removes the Plan and reactivates the Wish.

### Time semantics

For the runtime slice:

- `plannedStart`: `TIMESTAMPTZ`, optional;
- `plannedEnd`: `TIMESTAMPTZ`, optional;
- `experiencedOn`: `DATE`, optional outside COMPLETED, required when COMPLETED.

Invariants:

- `plannedEnd` may be set only when `plannedStart` is set;
- if both are set: `plannedEnd >= plannedStart`;
- `IDEA` has no binding schedule: `plannedStart = null`, `plannedEnd = null`;
- `PLANNED` requires `plannedStart`; `plannedEnd` remains optional;
- `COMPLETED` requires `experiencedOn`;
- `experiencedOn` may not be in the future relative to the acting Account's local calendar day;
- Completion from `PLANNED` preserves planned times as history;
- Completion from `IDEA` is allowed for spontaneous experiences and requires no planned times.

### Lifecycle operations

```text
POST /api/v1/spaces/{spaceId}/plans/{planId}/schedule
POST /api/v1/spaces/{spaceId}/plans/{planId}/unschedule
POST /api/v1/spaces/{spaceId}/plans/{planId}/complete
```

All require `If-Match`.

`schedule`:

```text
- plannedStart   # required
- plannedEnd?    # optional
```

- on `IDEA`: status becomes `PLANNED`;
- on `PLANNED`: schedule is versionedly updated, status remains `PLANNED`.

`unschedule`:

- only on `PLANNED`;
- sets status to `IDEA`;
- clears `plannedStart/plannedEnd`.

`complete`:

```text
- experiencedOn # required
```

For an originating Plan, Completion additionally transitions the original Wish from `PLANNED` to `COMPLETED` and increments its version in the same transaction. For a Direct Plan, no Wish is created or changed.

### Normal PATCH

`PATCH Plan` may not set `status`. It may modify non-lifecycle Domain fields, in particular:

- `title`
- `description`
- `placeId`

A `COMPLETED` Plan may still be versionedly edited for Domain corrections; this does **not** reopen its status. `experiencedOn` may be versionedly corrected on a completed Plan as long as the date is not in the future.

## 7. M3-D05 – Delete semantics

### Baseline rule

Delete removes only the selected aggregate and its own Join/Child rows. No operation deletes Place, Chapter, Memory, or another Domain original as a side effect.

### Wish matrix

| Wish state | Originating Plan | DELETE Wish |
|---|---|---|
| `OPEN` | no | allowed, `204` |
| `OPEN` | yes | inconsistent state -> `409`, no mutation |
| `PLANNED` | yes | blocked; use active Plan or `return-to-wish` |
| `PLANNED` | no | integrity violation -> `409`, no mutation |
| `COMPLETED` | yes | blocked while originating Plan exists |
| `COMPLETED` | no | allowed, `204` |

A completed lifecycle can therefore be removed completely by first deleting the completed Plan and then explicitly deleting the remaining completed Wish. There is no hidden Wish -> Plan Cascade.

### Plan matrix

| Plan type/status | DELETE Plan |
|---|---|
| Direct Plan (`sourceWishId=null`), `IDEA` | allowed |
| Direct Plan, `PLANNED` | allowed |
| Direct Plan, `COMPLETED` | allowed |
| Source Plan, `IDEA` | blocked; use `return-to-wish` |
| Source Plan, `PLANNED` | blocked; use `return-to-wish` |
| Source Plan, `COMPLETED` | allowed; source Wish remains `COMPLETED` |

When deleting a Plan:

- Plan Relation/Join rows are removed;
- referenced Places/Chapters/other originals remain;
- a completed source Wish remains and may then be deleted separately.

## 8. M3-D30 – Direct Plan Create

### Decision

A Plan may exist without a Wish because `sourceWishId` is source-bound optional.

Direct Create always produces a Plan with:

```text
sourceWishId   = null
status         = IDEA
plannedStart   = null
plannedEnd     = null
experiencedOn  = null
```

Request:

```text
PlanCreateRequest
- title        # required
- description?
- placeId?
```

Not allowed in Create request:

```text
sourceWishId
status
plannedStart
plannedEnd
experiencedOn
createdBy
spaceId
version
```

A Direct Plan is scheduled only through `/schedule` or completed spontaneously through `/complete`.

## 9. API contract – binding operation form

Wish:

```text
POST   /api/v1/spaces/{spaceId}/wishes
GET    /api/v1/spaces/{spaceId}/wishes
GET    /api/v1/spaces/{spaceId}/wishes/{wishId}
PATCH  /api/v1/spaces/{spaceId}/wishes/{wishId}
DELETE /api/v1/spaces/{spaceId}/wishes/{wishId}
POST   /api/v1/spaces/{spaceId}/wishes/{wishId}/plan
```

Plan:

```text
POST   /api/v1/spaces/{spaceId}/plans
GET    /api/v1/spaces/{spaceId}/plans
GET    /api/v1/spaces/{spaceId}/plans/{planId}
PATCH  /api/v1/spaces/{spaceId}/plans/{planId}
DELETE /api/v1/spaces/{spaceId}/plans/{planId}
POST   /api/v1/spaces/{spaceId}/plans/{planId}/schedule
POST   /api/v1/spaces/{spaceId}/plans/{planId}/unschedule
POST   /api/v1/spaces/{spaceId}/plans/{planId}/complete
POST   /api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish
```

Status fields are read-only in normal PATCH requests.

## 10. Stable error codes

At minimum:

```text
WISH_NOT_FOUND                    404
PLAN_NOT_FOUND                    404
PLACE_NOT_FOUND                   404
RESOURCE_VERSION_CONFLICT         409
WISH_STATUS_TRANSITION_INVALID    409
WISH_ALREADY_COMPLETED            409
WISH_HAS_ACTIVE_PLAN              409
WISH_HAS_COMPLETED_PLAN           409
WISH_PLAN_STATE_CONFLICT          409
PLAN_STATUS_TRANSITION_INVALID    409
PLAN_SOURCE_WISH_REQUIRED         409
PLAN_HAS_SOURCE_WISH              409
PLAN_SCHEDULE_START_REQUIRED      422
PLAN_DATE_RANGE_INVALID           422
PLAN_EXPERIENCED_ON_REQUIRED      422
PLAN_EXPERIENCED_ON_IN_FUTURE     422
```

Unreadable/foreign resources remain Privacy-safe 404. No separate Cross-Space error code is introduced.

## 11. DB constraints and locking

At minimum:

- FK `plans.source_wish_id -> wishes.id`;
- Same-Space enforcement for `(source_wish_id, space_id)` through a composite integrity boundary or equivalently robust DB enforcement;
- `UNIQUE(source_wish_id)`; PostgreSQL permits multiple `NULL` values for Direct Plans;
- Check: `plannedEnd IS NULL OR plannedStart IS NOT NULL`;
- Check: `plannedEnd IS NULL OR plannedEnd >= plannedStart`;
- status/date invariants also in the Domain service and, where appropriate, as DB checks.

When Wish and source Plan are affected together, the canonical lock order is:

```text
Wish -> Plan
```

A Plan service may initially resolve the Plan ID without a lock, but must then lock the source Wish and afterward lock/revalidate the Plan again in the same transaction. This order applies to Completion, Return, and source-bound Delete checks.

Concurrency principles:

- `DELETE Wish`, `DELETE Plan`, Convert, Return, Schedule, Unschedule, and Complete use `If-Match`;
- stale mutation -> `409 RESOURCE_VERSION_CONFLICT`;
- Delete vs. Convert/Complete/Return is resolved deterministically through locks + FK/Unique + revalidation;
- no race may leave a `PLANNED` Wish without an originating Plan or create a second originating Plan.

## 12. Mandatory PostgreSQL/HTTP tests

### Shared writes / Tenant

- both active partners can mutate/delete Wish/Plan according to Domain state;
- `createdBy` remains immutable;
- Wish and Plan titles may be changed independently;
- Account without Membership / ID from another Space -> no data mutation, Privacy-safe error;
- stale `If-Match` -> 409.

### Wish lifecycle

- Create -> `OPEN`;
- no free status PATCH;
- OPEN -> PLANNED only through Convert;
- PLANNED -> OPEN only through Return;
- PLANNED -> COMPLETED only through source Plan Completion;
- COMPLETED has no status return edge.

### Wish -> Plan

- OPEN Wish -> 201 + exactly one Plan + Wish PLANNED;
- Plan starts IDEA;
- identical Retry while PLANNED -> 200 with same Plan ID;
- differing Retry does not overwrite existing Plan;
- two parallel Convert requests -> exactly one Plan;
- failure between Plan insert and Wish update -> complete rollback;
- stale OPEN Wish -> 409 and no Plan;
- COMPLETED Wish -> 409;
- foreign `placeId` -> 404 and no Plan.

### Plan lifecycle

For every allowed edge, test Happy Path + stale version.

Explicit negative tests:

- `COMPLETED -> IDEA` forbidden;
- `COMPLETED -> PLANNED` forbidden;
- PLANNED without `plannedStart` forbidden;
- `plannedEnd < plannedStart` forbidden;
- future `experiencedOn` forbidden;
- Completion from IDEA allowed;
- Completion from PLANNED allowed and preserves planned times;
- Reschedule PLANNED -> PLANNED changes only schedule + version;
- Unschedule clears planned times.

### Source Wish completion

- source Plan Complete -> Plan COMPLETED + Wish COMPLETED in one commit;
- failure after either mutation -> complete rollback;
- parallel Complete/Return/Delete -> deterministic result without half lifecycle.

### Return-to-Wish

- source IDEA/PLANNED -> Wish OPEN + Plan deleted;
- Direct Plan -> 409;
- COMPLETED source Plan -> 409;
- Plan payload is not automatically copied back into Wish;
- Plan Join rows disappear, original targets remain.

### Delete

Every row of the Wish/Plan Delete matrix receives an HTTP and PostgreSQL test. Additionally:

- Delete vs. Convert;
- Delete vs. Complete;
- Delete vs. Return;
- no original-resource Cascade;
- after deleting a completed source Plan, Wish remains COMPLETED and separately deletable.

## 13. Privacy/Telemetry consequences

Wish and Plan titles/descriptions do not belong in logs, Analytics, Error Context, or Domain Event payloads. Technical IDs, Actor, Space, version, Event type, and safe status values are permitted according to later-finalized M3-D23.

## 14. Consequences for M3-S1/S2

After the repository-defined M3 runtime release, Wish/Plan runtime slices may rely on this contract. Still outside this decision scope:

- Place field classification and Relation details (#163),
- Collections/Private Area (#164),
- G3/client/Export/cache boundaries (#165),
- global Search,
- Plan checklist/Attachments,
- complete Web/Android productization.
