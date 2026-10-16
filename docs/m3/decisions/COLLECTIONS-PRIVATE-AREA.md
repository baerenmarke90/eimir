# M3 Collections and Private Area – Binding Decisions

**Status:** `DECIDED` – effective with merge of this decision PR  
**Date:** August 26, 2026  
**Tracking:** #164  
**Covers:** M3-D13, D14, D15, D16, D17, D18, D19, D23, D32

This document closes the blocking M3 decisions for shared Collections and the hard `OWNER_ONLY` Private Area. It contains no runtime code and does not change the existing M3 gate rule.

## 1. Binding sources

- `specification/CLEAN-ROOM-MASTER-SPEC.md`
- `specification/PRODUCT-SPEC.md`
- `docs/SECURITY.md`
- `docs/ROADMAP.md`
- `docs/m3/README.md`
- `docs/m3/DOMAIN-MODEL.md`
- M3-D01 from #162: collaborative write for shared M3 resources

Source-bound:

- `Collection`/`CollectionItem` are `SPACE_SHARED`.
- ShoppingList/ShoppingItem remain separate later Domains.
- `PrivateNote`, `GiftIdea`, `PrivateCollection`, `PrivateCollectionItem` are `OWNER_ONLY`.
- Owner-only must be enforced server-side; partner access must not leak existence.
- mutable Domain objects use Optimistic Concurrency.
- `GiftIdea.status` exists, but its values were not previously source-bound.

## 2. M3-D13 – Collection ownership and shared writes

### Decision

Shared Collections use the M3-D01 **collaborative write** rule.

Persistence:

```text
Collection
- id
- spaceId
- title
- createdBy
- createdAt
- updatedAt
- version

CollectionItem
- id
- collectionId
- title
- completed
- position
- createdBy
- createdAt
- updatedAt
- version
```

Rules:

- `createdBy` is set server-side on both root and Item and remains immutable;
- both active Space members may change Collection title;
- both may create, rename, complete, and delete Items;
- both may delete the entire Collection;
- `createdBy` is Attribution/Audit, not an ACL;
- ShoppingList is not modeled as a special Collection.

## 3. M3-D14 – Collection Concurrency, versioning, and Reorder

### Two Concurrency boundaries

M3 separates **Item content** from **aggregate order**:

- `Collection.version` protects root fields plus Item-list order/structure;
- `CollectionItem.version` protects Item content (`title`, `completed`).

`position` is an order field managed by the Collection aggregate. Reorder therefore requires the Collection version, not N independent Item versions.

### Position

- integer, non-null;
- canonical contiguous `0..n-1` per Collection;
- Unique Constraint `(collection_id, position)`;
- Create appends at the end and increments `Collection.version`;
- Delete compacts positions transactionally and increments `Collection.version`.

Runtime must not violate the Unique boundary during Reorder through naive sequential position updates. The PostgreSQL slice must therefore either use a `DEFERRABLE` Unique Constraint until transaction end or an equivalent collision-free temporary renumbering strategy within the same transaction. Only canonical order `0..n-1` is visible and valid after commit.

### Atomic Reorder

```text
PUT /api/v1/spaces/{spaceId}/collections/{collectionId}/order
If-Match: "<collection-version>"

{
  "itemIds": ["...", "...", "..."]
}
```

Contract:

- request must contain **exactly** all currently existing Item IDs once;
- no foreign/Cross-Collection ID;
- lock Collection `FOR UPDATE`;
- revalidate the current Item set within the same transaction;
- rewrite all positions atomically;
- increment `Collection.version` exactly once;
- no visible intermediate state with duplicate/missing positions.

### Item Update

```text
PATCH /collections/{collectionId}/items/{itemId}
If-Match: "<item-version>"
```

- changing Title/Completed increments `CollectionItem.version`;
- Completion alone does not automatically change Collection order or root version.

### Item Delete

Item Delete changes the Item set and therefore the order aggregate:

- lock Collection `FOR UPDATE`, then lock Item;
- `If-Match` checks the Item version;
- delete Item;
- compact positions;
- increment `Collection.version`.

A separate Collection version in the Delete request is not required: the Collection lock serializes Delete against Reorder/Add/Delete. If Delete commits first, a Reorder already started with the old root version fails with `409`; if Reorder commits first, a subsequent Delete may succeed when the Item version is still current and must compact the new order consistently again.

## 4. M3-D15 – Collection Delete

### Decision

`CollectionItem` is a true Child of the Collection aggregate.

```text
DELETE Collection
  -> delete CollectionItems with it
  -> delete no other Domain resources
```

- FK `collection_items.collection_id -> collections.id` with `ON DELETE CASCADE` is allowed;
- Items are not referenced outside their Collection;
- Collection Delete is versioned (`If-Match`);
- there are no hidden Relations to ShoppingList or other original resources.

## 5. M3-D16 – ProtectedPayload for Private Area

### PrivateNote

Protected content:

- `title`
- `body`

Structural owner-only metadata:

- `pinned`
- technical IDs/timestamps/version

`pinned` is not public/safe; despite structural storage it remains strictly owner-only.

### GiftIdea

Protected content:

- `title`
- `description`
- `recipient`
- `occasion`
- `targetOn`
- `priceText`
- `url`

Structural owner-only metadata:

- `status`
- `pinned`
- technical IDs/timestamps/version

Structural fields also must never be disclosed to partners, Shared counts, logs, or Events.

`url` is stored user content only. M3 performs **no server-side fetch, Preview, OpenGraph call, or Redirect check**.

### PrivateCollection

Protected content:

- root `title`
- Item `title`

Structural owner-only metadata:

- Item `completed`
- Item `position`
- technical IDs/timestamps/version

## 6. M3-D17 – GiftIdea status

### Enum

M3 uses exactly:

```text
IDEA
BOUGHT
GIVEN
```

Initial state:

```text
IDEA
```

Allowed transitions:

```text
IDEA   -> BOUGHT
IDEA   -> GIVEN       # e.g. handmade, experience, no purchase
BOUGHT -> IDEA        # undo purchase / correction
BOUGHT -> GIVEN
GIVEN  -> BOUGHT      # pure status correction
```

Not allowed:

```text
GIVEN -> IDEA
```

For a complete reset to a new idea, create a new GiftIdea or use a deliberate two-step correction. There is no `ARCHIVED` in the M3 Core; Delete/Pinning cover these baseline cases.

Status change is an explicit versioned Domain operation or a strictly validated field update; free unknown enum values are invalid.

## 7. M3-D18 / D32 – PrivateCollection persistence and Authorization

### Root

```text
PrivateCollection
- id
- spaceId
- ownerId
- title
- createdAt
- updatedAt
- version
```

### Item

```text
PrivateCollectionItem
- id
- collectionId
- title
- completed
- position
- createdAt
- updatedAt
- version
```

### Owner/Space persistence decision

`PrivateCollectionItem` does **not** duplicate `ownerId` and `spaceId`.

Owner/Space are derived exclusively through the authorized Parent. This avoids two potentially contradictory sources of truth.

Every Item access must therefore use a query semantically equivalent to at least:

```text
item
JOIN private_collection parent
  ON item.collection_id = parent.id
WHERE parent.id = :collectionId
  AND parent.space_id = :spaceId
  AND parent.owner_id = :currentAccountId
```

A direct query on `item.id` without an owner-scoped Parent is forbidden.

### Private Reorder

PrivateCollection uses the same Concurrency model as Shared Collection:

- root version protects order/Item set;
- Item version protects Title/Completed;
- positions contiguous `0..n-1`;
- atomic full-list Reorder with the same collision-free PostgreSQL strategy;
- Item Delete locks root -> Item, checks Item version, compacts positions, and increments root version;
- owner-only.

### Delete

`PrivateCollectionItem` is Parent-Child and may be deleted by FK Cascade when the root is deleted. No other Domain resource is deleted with it.

## 8. M3-D19 – Private API

### Route namespace

Private resources remain Space-scoped; owner is **always derived from Auth Context**:

```text
/api/v1/spaces/{spaceId}/private/notes
/api/v1/spaces/{spaceId}/private/gift-ideas
/api/v1/spaces/{spaceId}/private/collections
```

Examples:

```text
GET    /private/notes
POST   /private/notes
GET    /private/notes/{noteId}
PATCH  /private/notes/{noteId}
DELETE /private/notes/{noteId}

GET    /private/gift-ideas
POST   /private/gift-ideas
GET    /private/gift-ideas/{giftIdeaId}
PATCH  /private/gift-ideas/{giftIdeaId}
DELETE /private/gift-ideas/{giftIdeaId}

GET    /private/collections
POST   /private/collections
GET    /private/collections/{collectionId}
PATCH  /private/collections/{collectionId}
DELETE /private/collections/{collectionId}
```

Child routes are nested beneath the authorized Parent.

Not allowed in request bodies:

```text
ownerId
spaceId
privacyClass
```

### 404 rule

For the current Account, these cases must be semantically indistinguishable:

- unknown ID;
- partner's private resource;
- private resource in another Space;
- Item under a foreign private Parent.

Response: Privacy-safe `404` without confirming additional details.

### Lists, counts, and pagination

- Lists contain only `ownerId=currentAccount`;
- counts/pagination totals are calculated only **after owner filtering**;
- no Shared Dashboard/Collection count mentions private resources;
- M3 builds no global private Search index.

## 9. M3-D23 – Domain Events and Redaction

### Envelope

M3 freezes the following minimal envelope:

```text
eventId
eventType
occurredAt
spaceId
actorId
resourceType
resourceId
resourceVersion
privacyClass
safeState?
```

### Shared resources

For `SPACE_SHARED`, `safeState` may carry only small, non-content enum/lifecycle values when a concrete consumer requires them.

### OWNER_ONLY resources

For `OWNER_ONLY`:

- `privacyClass=OWNER_ONLY`;
- `actorId` is the Owner/Actor;
- `safeState` is `null` by default;
- no status, pin, count, title, URL, price, recipient, or other Domain information in the Event;
- consumers must explicitly handle `OWNER_ONLY` and must not create partner notifications, Shared Activity, or Dashboard visibility from it.

### Never in Events/logs

- Collection/Item titles;
- PrivateNote title/body;
- GiftIdea fields including `status`, `url`, `priceText`, `recipient`;
- PrivateCollection/Item titles or Completion;
- Place address/coordinates;
- private counts.

## 10. Error codes

At minimum:

```text
COLLECTION_NOT_FOUND                    404
COLLECTION_ITEM_NOT_FOUND               404
COLLECTION_ORDER_CONFLICT               409
COLLECTION_ORDER_INVALID                422
PRIVATE_NOTE_NOT_FOUND                  404
GIFT_IDEA_NOT_FOUND                     404
GIFT_IDEA_STATUS_TRANSITION_INVALID     409
PRIVATE_COLLECTION_NOT_FOUND            404
PRIVATE_COLLECTION_ITEM_NOT_FOUND       404
RESOURCE_VERSION_CONFLICT               409
```

There is no error code such as `PRIVATE_RESOURCE_OWNED_BY_PARTNER`.

## 11. Mandatory tests

### Shared Collection

- both partners may write root and Items;
- `createdBy` remains immutable;
- Item Completion with stale version -> 409;
- Reorder with stale Collection version -> 409;
- Reorder must contain exactly the current Item set;
- parallel Reorder -> exactly one wins;
- Reorder vs. Item Delete -> deterministic 409/success, no duplicate positions;
- Parent Delete cascades only Items;
- Cross-Tenant CRUD/Item access -> fail closed.

### PrivateNote / GiftIdea

- Owner CRUD works;
- partner GET/LIST/PATCH/DELETE -> Privacy-safe 404/no List entry;
- foreign Space ID is semantically identical;
- counts/pagination leak nothing;
- GiftIdea starts in IDEA;
- all allowed/forbidden status edges tested;
- URL is never fetched server-side.

### PrivateCollection

- owner-only root and Child;
- Item query without authorized Parent is impossible in Service/Repository;
- Reorder/Delete Concurrency same as Shared Collection;
- Parent Delete cascades Child Items;
- partner learns neither Parent nor Item existence through IDs/counts/errors.

### Events

- Shared Events contain no ProtectedPayloads;
- Private Events contain no `safeState` with Domain data;
- no partner notification/Shared Activity from OWNER_ONLY Events;
- log/Error-capture tests redact private content.

## 12. Reuse-before-build

Not relevant for this pure Domain/Privacy decision. If later ordering/ranking requires a technical helper component, a current Reuse review is performed before in-house implementation. The M3 model requires only PostgreSQL transactions, FKs, Unique Constraints, and Optimistic Concurrency for the baseline.
