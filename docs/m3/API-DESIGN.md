# M3 API Design

**Status:** `PROPOSED` – template for later decisions and OpenAPI work  
**As of:** August 26, 2026

This file does **not** change the production OpenAPI contract. It describes a consistent target surface so that M3-S0 decisions can be made concretely against routes, DTOs, errors, and transactions.

## 1. Binding API principles

M3 adopts the existing project conventions:

- REST under `/api/v1/...`;
- all Domain resources are Space-scoped;
- UUIDv7 IDs;
- external JSON fields use `camelCase`;
- consistent Problem Details with stable `code`;
- Membership is checked before resource resolution;
- Privacy-safe 404 for unreadable/owner-only resources;
- 403 only for known readable resources where the action is not permitted;
- mutable resources use `version`/ETag and `If-Match`;
- stale mutation -> `409 RESOURCE_VERSION_CONFLICT`;
- no client Authorization as a security boundary;
- no polymorphic universal relation without a server-side target allowlist and DB FKs.

## 2. List and pagination convention

`PROPOSED`: growing M3 Lists use the same opaque cursor convention as existing APIs.

Common parameters where meaningful for the Domain:

```text
limit
cursor
order
```

Domain filters:

- Wish: `status`, optionally `createdBy`
- Plan: `status`, optionally `createdBy`, optionally a date range
- Place: no global full-text Search in M3; simple stable ordering
- Chapter: optional date range
- Collection: no global content Search in M3
- Private Area: owner scope only; no partner view

A `q` parameter for global full-text Search is **not part of M3**. Search belongs to M4-A.

## 3. Wish API

### Proposed routes

```text
POST   /api/v1/spaces/{spaceId}/wishes
GET    /api/v1/spaces/{spaceId}/wishes
GET    /api/v1/spaces/{spaceId}/wishes/{wishId}
PATCH  /api/v1/spaces/{spaceId}/wishes/{wishId}
DELETE /api/v1/spaces/{spaceId}/wishes/{wishId}
```

Whether `PATCH` may perform arbitrary status changes is explicitly **not** decided here. Domain-specific status changes through dedicated operations are preferred where relations/transactions are affected.

### Proposed DTO

```text
WishCreateRequest
- title

WishUpdateRequest
- title?

WishResponse
- id
- spaceId
- title
- status
- createdBy
- createdAt
- updatedAt
- version
- capabilities?
```

`capabilities` may later reduce UI round trips (`canEdit`, `canDelete`, `canConvertToPlan`) but never replaces server Authorization.

## 4. Wish -> Plan as a dedicated Domain operation

Conversion is not a normal `PATCH status=PLANNED`, because at least two Domain objects and a relation are affected atomically.

### Proposed route

```text
POST /api/v1/spaces/{spaceId}/wishes/{wishId}/plan
If-Match: "<wish-version>"
```

Request, depending on M3-D02/D04:

```text
WishToPlanRequest
- title?          # if deviation from Wish title is allowed
- description?
- plannedStart?
- plannedEnd?
- placeId?
```

Response:

```text
WishToPlanResponse
- wish: WishResponse
- plan: PlanResponse
```

### Transaction contract

A successful request must, in **one commit**:

1. authorize the Wish and verify the current version,
2. create exactly one permitted Plan or apply the idempotency decision,
3. set `sourceWishId`,
4. transition the Wish into the decided follow-up state,
5. write safe Domain Events.

Two concurrent confirmations must never create two Plans.

### Proposed error codes

```text
WISH_NOT_FOUND                  404
WISH_NOT_EDITABLE               403 or 404 according to final ownership rule
WISH_STATUS_TRANSITION_INVALID  409
WISH_ALREADY_PLANNED            409 or idempotent 200/201 – M3-D02
RESOURCE_VERSION_CONFLICT       409
PLACE_NOT_FOUND                 404
```

The exact idempotent response remains open in this readiness draft.

## 5. Plan API

### Proposed routes

```text
POST   /api/v1/spaces/{spaceId}/plans
GET    /api/v1/spaces/{spaceId}/plans
GET    /api/v1/spaces/{spaceId}/plans/{planId}
PATCH  /api/v1/spaces/{spaceId}/plans/{planId}
DELETE /api/v1/spaces/{spaceId}/plans/{planId}
```

Direct `POST /plans` creates a Plan without `sourceWishId` and is not excluded by the product specification.

### Transition routes – proposed

```text
POST /api/v1/spaces/{spaceId}/plans/{planId}/schedule
POST /api/v1/spaces/{spaceId}/plans/{planId}/complete
POST /api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish
```

Why dedicated operation routes are proposed:

- status changes can enforce date invariants;
- Completion may set `experiencedOn`;
- Return-to-Wish affects at least two resources;
- Events and races are more explicit than with a free `PATCH status`.

M3-D03/D04 decide which of these routes actually enter v1.

### Proposed Plan DTO

```text
PlanCreateRequest
- title
- description?
- plannedStart?
- plannedEnd?
- placeId?

PlanUpdateRequest
- title?
- description?
- plannedStart?
- plannedEnd?
- placeId?

PlanResponse
- id
- spaceId
- sourceWishId?
- title
- description?
- status
- plannedStart?
- plannedEnd?
- experiencedOn?
- placeId?
- createdBy
- createdAt
- updatedAt
- version
- capabilities?
```

Status is preferably not freely set in normal Update requests.

## 6. Plan -> Wish return

### Proposed route

```text
POST /api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish
If-Match: "<plan-version>"
```

The response depends on M3-D03. Possible semantics:

- reactivate the original `sourceWishId` and keep the Plan,
- reactivate the original Wish and delete the Plan,
- create a new Wish and keep the Plan as history.

Until this decision is `DECIDED`, no route may be added to the production OpenAPI contract on the basis of this draft alone.

## 7. Place API

### Proposed routes

```text
POST   /api/v1/spaces/{spaceId}/places
GET    /api/v1/spaces/{spaceId}/places
GET    /api/v1/spaces/{spaceId}/places/{placeId}
PATCH  /api/v1/spaces/{spaceId}/places/{placeId}
DELETE /api/v1/spaces/{spaceId}/places/{placeId}
```

### Proposed DTO

```text
PlaceCreateRequest
- name
- description?
- address?
- latitude?
- longitude?

PlaceResponse
- id
- spaceId
- name
- description?
- address?
- latitude?
- longitude?
- createdBy
- createdAt
- updatedAt
- version
```

M3 provides **no** endpoint family such as `/geocode`, `/nearby`, `/map-search`, or Provider proxy. Such surfaces require separate Reuse/Privacy/Provider decisions later.

### Validation – proposed

- `latitude` and `longitude` together or explicitly individually? **M3-D06**
- numeric values within geographic bounds;
- no requirement to provide coordinates;
- `address` is user content, not a Provider record validated by the server.

## 8. Content Relations API

The DB side remains typed. Two shapes are conceivable for the external API.

### Option A – typed nested routes

```text
PUT    /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{memoryId}
DELETE /api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{memoryId}

PUT    /api/v1/spaces/{spaceId}/places/{placeId}/plans/{planId}
DELETE /api/v1/spaces/{spaceId}/places/{placeId}/plans/{planId}
```

Advantages:

- contract and Authorization are very explicit,
- no uncontrolled discriminator,
- simple OpenAPI types.

Disadvantage: more routes.

### Option B – shared controlled Relation Service

```text
POST /api/v1/spaces/{spaceId}/relations
```

with a strictly enumerated union, for example:

```text
{ relation: "CHAPTER_MEMORY", chapterId, memoryId }
{ relation: "PLACE_PLAN", placeId, planId }
```

Internally, separate FK tables still apply.

Advantage: one shared client entry point.  
Risk: must not degrade into free `targetType/targetId` polymorphism.

**M3-D08 decides A/B or a justified mixed form.**

### Relation security response

If a target belongs to a foreign Space or is `OWNER_ONLY`/unreadable:

```text
404 RELATION_TARGET_NOT_FOUND
```

No response may distinguish whether the ID exists, is private, or belongs to another Space.

## 9. Chapter API

### Proposed routes

```text
POST   /api/v1/spaces/{spaceId}/chapters
GET    /api/v1/spaces/{spaceId}/chapters
GET    /api/v1/spaces/{spaceId}/chapters/{chapterId}
PATCH  /api/v1/spaces/{spaceId}/chapters/{chapterId}
DELETE /api/v1/spaces/{spaceId}/chapters/{chapterId}
```

### Proposed DTO

```text
ChapterCreateRequest
- title
- description?
- startOn?
- endOn?
- placeId?

ChapterResponse
- id
- spaceId
- title
- description?
- startOn?
- endOn?
- placeId?
- createdBy
- createdAt
- updatedAt
- version
- relationSummary?  # safe shared counts only; M3-D10
```

A relation count must never include private targets. The simpler safe starting point is to count only actually relationable shared targets or omit counts initially.

Delete Chapter responds 204 and removes only the Chapter plus its relation entries. Original content remains intact.

## 10. Collection API

### Proposed routes

```text
POST   /api/v1/spaces/{spaceId}/collections
GET    /api/v1/spaces/{spaceId}/collections
GET    /api/v1/spaces/{spaceId}/collections/{collectionId}
PATCH  /api/v1/spaces/{spaceId}/collections/{collectionId}
DELETE /api/v1/spaces/{spaceId}/collections/{collectionId}

POST   /api/v1/spaces/{spaceId}/collections/{collectionId}/items
PATCH  /api/v1/spaces/{spaceId}/collections/{collectionId}/items/{itemId}
DELETE /api/v1/spaces/{spaceId}/collections/{collectionId}/items/{itemId}
```

### Reorder – proposed

Do not send a sequence of N individual `PATCH position` requests. Prefer one atomic operation:

```text
PUT /api/v1/spaces/{spaceId}/collections/{collectionId}/item-order
If-Match: "<collection-or-order-version>"

{
  "itemIds": ["...", "...", "..."]
}
```

or a rank-based single-move model. M3-D14 decides the strategy.

### Completion

`completed` may be modeled as a normal Item mutation if Item versioning is decided. With parent-based versioning, the whole Collection state must remain conflict-safe.

## 11. Private Area routing

All routes remain Space-scoped even though the current Account is implicitly the owner. This keeps Tenant Isolation visible and prevents an Account with multiple Spaces from referencing a private resource from the wrong Space.

### Proposed PrivateNote

```text
POST   /api/v1/spaces/{spaceId}/private/notes
GET    /api/v1/spaces/{spaceId}/private/notes
GET    /api/v1/spaces/{spaceId}/private/notes/{noteId}
PATCH  /api/v1/spaces/{spaceId}/private/notes/{noteId}
DELETE /api/v1/spaces/{spaceId}/private/notes/{noteId}
```

### Proposed GiftIdea

```text
POST   /api/v1/spaces/{spaceId}/private/gift-ideas
GET    /api/v1/spaces/{spaceId}/private/gift-ideas
GET    /api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}
PATCH  /api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}
DELETE /api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}
```

`status` remains domain-undetermined for Create/Update in this readiness draft until M3-D17 defines an enum.

### Proposed PrivateCollection

```text
POST   /api/v1/spaces/{spaceId}/private/collections
GET    /api/v1/spaces/{spaceId}/private/collections
GET    /api/v1/spaces/{spaceId}/private/collections/{collectionId}
PATCH  /api/v1/spaces/{spaceId}/private/collections/{collectionId}
DELETE /api/v1/spaces/{spaceId}/private/collections/{collectionId}

POST/PATCH/DELETE .../{collectionId}/items[/...]
PUT .../{collectionId}/item-order
```

### Privacy contract

Partner access to known or guessed private IDs:

```text
404 PRIVATE_RESOURCE_NOT_FOUND
```

The same safe response applies to:

- unknown ID,
- partner's private ID,
- ID from another Space,
- resource after deletion.

No distinct `detail` text, timing-optimized existence check, or count may make these cases distinguishable.

## 12. ETag / If-Match

Proposed standard:

```text
ETag: "<version>"
If-Match: "<version>"
```

Required for:

- Update/Delete of mutable root resources,
- transition operations,
- relational Reorder operations where they mutate root state.

For child Items, M3-D14/M3-D18 decide whether an Item version or Parent version protects consistency.

## 13. Error-code catalog – proposed

General:

```text
RESOURCE_VERSION_CONFLICT       409
INVALID_CURSOR                  400
RELATION_TARGET_NOT_FOUND       404  # unifies unknown/private/foreign Space
RELATION_ALREADY_EXISTS         409
RELATION_NOT_FOUND              404
STATUS_TRANSITION_INVALID       409
```

For Relation targets there is deliberately **no** separate Cross-Space error code. Foreign Space, `OWNER_ONLY`/unreadable, and unknown ID remain indistinguishable externally.

Wish:

```text
WISH_NOT_FOUND
WISH_TITLE_REQUIRED
WISH_ALREADY_PLANNED
WISH_STATUS_TRANSITION_INVALID
```

Plan:

```text
PLAN_NOT_FOUND
PLAN_TITLE_REQUIRED
PLAN_STATUS_TRANSITION_INVALID
PLAN_DATE_RANGE_INVALID
PLAN_ALREADY_COMPLETED
```

Place:

```text
PLACE_NOT_FOUND
PLACE_NAME_REQUIRED
PLACE_COORDINATES_INVALID
PLACE_IN_USE                   # only if Delete is blocked; M3-D05/D26
```

Chapter:

```text
CHAPTER_NOT_FOUND
CHAPTER_TITLE_REQUIRED
CHAPTER_DATE_RANGE_INVALID
```

Collection:

```text
COLLECTION_NOT_FOUND
COLLECTION_ITEM_NOT_FOUND
COLLECTION_TITLE_REQUIRED
COLLECTION_ORDER_INVALID
```

Private:

```text
PRIVATE_RESOURCE_NOT_FOUND
PRIVATE_NOTE_TITLE_REQUIRED
GIFT_IDEA_TITLE_REQUIRED
GIFT_IDEA_STATUS_INVALID
PRIVATE_COLLECTION_NOT_FOUND
PRIVATE_COLLECTION_ITEM_NOT_FOUND
```

The final list becomes binding only with OpenAPI/Domain decisions.

## 14. Delete semantics

The API must not turn `DELETE` into a generic cascade switch. Each Domain decides in advance:

- which own child rows are deleted,
- which external Relations are only removed,
- which linked originals remain,
- whether `If-Match` is required.

For Chapter it is source-bound: Delete removes Relations, not original content.

## 15. No server-side fetching of GiftIdea URLs

`GiftIdea.url` is a stored string in the M3 Core. M3 introduces **no** URL Preview, OpenGraph, screenshot, or metadata fetcher.

Reason:

- SSRF surface,
- tracking/Privacy egress,
- additional Provider/parser/Supply Chain scope.

A later Preview needs its own Reuse/Security design.

## 16. No Maps/Geocoding API in M3

`Place` is not mixed with technical endpoints for maps or Search. M3 stores only Domain data provided by the user/client through the normal contract. Provider integration follows separately later.

## 17. G3 API evidence – unresolved in this readiness draft

Before G3, it must be decided whether Backend/OpenAPI/PostgreSQL evidence alone is sufficient or whether — analogous to M2 — a thin Web/Android reference flow is required. M5 remains complete client productization.

This question is **M3-D24** and must not first appear during the Gate Review.
