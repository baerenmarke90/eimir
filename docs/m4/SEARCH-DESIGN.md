# M4-A Search Design

> **Superseded in part by #797 ([ENCRYPTION-AT-REST.md](../ENCRYPTION-AT-REST.md), section 7).**
> Protected payloads are now encrypted, so PostgreSQL full-text search and the per-table
> GIN expression indexes described below no longer exist (revision `0069` drops them).
> Search authorizes in SQL, then decrypts and matches in the application. Authorization,
> target set, query normalization, ordering, cursor, result DTO, and log-privacy contracts
> in this document still apply unchanged; sections 5 to 6 (PostgreSQL strategy, index,
> query construction) are historical.

**Status:** blocking contract decisions `DECIDED`  
**Owning issue:** #272

## 1. Purpose

M4-A introduces one global Search surface over authorized eimir. content without creating a second domain truth or a new infrastructure service.

Public route:

```text
GET /api/v1/spaces/{spaceId}/search?q=...&type=...&limit=...&cursor=...
```

Search is a Read Model. It never changes source resources.

## 2. Authorization invariant

Authorization happens before ranking and projection.

Every shared branch of the SQL/repository query requires:

- authenticated Account;
- active Membership in `spaceId`;
- source row `space_id == spaceId`;
- source privacy state compatible with shared Search.

Every owner-only branch additionally requires:

```text
owner_id == currentAccountId
```

or, for child rows, an authorized join through an owner-only parent.

A partner's private row must not enter:

- the unioned candidate set;
- `ts_rank` evaluation that contributes to output ordering;
- result counts;
- cursor positions;
- snippets/excerpts;
- metrics/logs.

This is stricter than selecting private rows and filtering them in Python/client code.

## 3. Search target set

### Shared

| Result type | Searchable fields | Weighting |
|---|---|---|
| `MEMORY` | title; body | title A, body B |
| `HEART_MOMENT` | text | text A |
| `MILESTONE` | title; body | title A, body B |
| `WISH` | title | title A |
| `PLAN` | title; description | title A, description B |
| `PLACE` | name; description; address | name A, description/address B |
| `CHAPTER` | title; description | title A, description B |
| `COLLECTION` | title | title A |
| `COLLECTION_ITEM` | item title | title A |

`HEART_MOMENT` includes only `SPACE_SHARED` rows in the shared branch.

Wish is intentionally included even though the compact Product Spec does not name it in the minimum list. The Master Specification states an `at minimum` set; excluding Wishes while Plans are searchable would make the already-delivered planning Core inconsistent.

### Owner-only for the caller

| Result type | Searchable fields | Weighting |
|---|---|---|
| `HEART_MOMENT` | text | text A |
| `PRIVATE_NOTE` | title; body | title A, body B |
| `GIFT_IDEA` | title; description; recipient; occasion; price text | title A, remaining text B |
| `PRIVATE_COLLECTION` | title | title A |
| `PRIVATE_COLLECTION_ITEM` | item title | title A |

GiftIdea URL is deliberately not indexed. It is inert user content, but indexing opaque URLs creates poor user value and unnecessary token leakage into the derived index.

### Deferred

Not in the first global Search contract:

- Comments;
- Profile/Preference data;
- RelatedPerson;
- ImportantDate;
- Questions, until M6;
- Attachments by filename/metadata;
- coordinates or technical metadata.

Adding a target later requires the same authorization, ProtectedPayload, API and index review.

## 4. Query contract

### Normalization

Before binding the request and cursor:

1. Unicode normalize to NFC;
2. trim leading/trailing Unicode whitespace;
3. collapse internal whitespace runs to one ASCII space;
4. validate length after normalization.

Allowed length:

```text
2 <= normalized query characters <= 200
```

Failure returns a validation response with a stable code such as:

```text
SEARCH_QUERY_INVALID
```

The precise Problem Details status follows the repository's existing FastAPI validation convention.

### Type filter

`type` may be repeated. If absent, all current Search target types are eligible.

The server canonicalizes the filter to a unique sorted set before cursor binding. Unknown types are rejected; they are not silently ignored.

### Page size

```text
default = 25
minimum = 1
maximum = 50
```

Offset/page-number pagination is not supported.

## 5. PostgreSQL FTS strategy

### Configuration

Use PostgreSQL text-search configuration:

```text
simple
```

Rationale:

- user-generated couple content may mix languages;
- eimir. must not infer the content language merely from UI locale;
- language-specific stop words can make meaningful short relationship terms disappear;
- `simple` keeps the first contract deterministic across Self-Hosted and Cloud.

The tradeoff is reduced stemming. Locale-aware stemming or multi-config indexing may be evaluated later behind the Search abstraction based on real quality evidence.

### Search vector

Use per-table weighted expressions over the existing JSONB ProtectedPayload fields, conceptually:

```sql
setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') ||
setweight(to_tsvector('simple', coalesce(payload->>'body', '')), 'B')
```

Each actual table uses only its approved fields.

### Index

Create a matching per-table GIN **expression index**.

Do not create:

- a universal `search_documents` table;
- a copied plaintext column solely for Search;
- an outbox-fed secondary Search database;
- a client-side Search index containing partner-private data.

The PostgreSQL index contains sensitive derived lexemes and is treated as part of the protected database state. It is not application data, is not exported, and is rebuilt from source rows when necessary.

### Existing data / migration

Index creation scans existing rows; there is no data-copy backfill.

The runtime migration must choose a production-safe PostgreSQL index-build strategy appropriate for non-empty installations and prove clean upgrade/rollback-forward behavior in CI. Search remains unavailable until the migration/index exists rather than silently falling back to unbounded table scans.

## 6. Query construction

The Search repository may use PostgreSQL `websearch_to_tsquery('simple', normalizedQuery)` or an equivalent bounded PostgreSQL helper.

The public API does **not** promise PostgreSQL parser operators as a stable language. Clients send a normal user query string and must not construct SQL/tsquery syntax.

No raw query fragment is interpolated into SQL.

## 7. Ranking and deterministic order

Primary rank is weighted PostgreSQL coverage/density, e.g. `ts_rank_cd` over the approved vector.

Do **not** add a recency boost in v1. Relationship history is inherently long-lived; old content must not be systematically buried merely because it is old.

For stable keyset pagination, normalize rank to a deterministic SQL value suitable for cursor comparison. The exact storage representation is internal, but it must not rely on client-supplied floating-point values.

Order contract:

1. normalized rank descending;
2. `created_at` descending;
3. result type ascending;
4. resource ID ascending.

Using `created_at` for every result type deliberately avoids mixing `DATE` and `TIMESTAMPTZ` semantics in one cross-domain keyset. Domain event dates may still be returned for presentation but do not drive Search pagination.

Child items use their own `created_at` for the secondary key.

The rank value is **not** returned to clients.

## 8. Cursor contract

Reuse the repository's signed opaque cursor mechanism.

Binding must include at least:

```text
accountId
spaceId
normalizedQuery
canonicalTypeFilter
sortContractVersion = search-v1
```

`accountId` is mandatory because the authorized private result set differs between partners in the same Space.

Position contains only server-derived order keys needed to continue the keyset:

```text
normalizedRank
createdAt
resultType
resourceId
```

A cursor from:

- another Account;
- another Space;
- another query;
- another type filter;
- another sort-contract version

is invalid through the existing uniform `INVALID_CURSOR` behavior.

## 9. Result DTO

Conceptual shape:

```text
SearchResult
- type
- id
- parentId?        # collection child rows only
- scope            # SHARED | PRIVATE, server-derived
- title?           # plain text
- excerpt?         # bounded plain text
- occurredOn?      # domain DATE where meaningful

SearchPage
- items[]
- nextCursor?
```

Rules:

- no HTML snippets/highlighting;
- no raw ProtectedPayload object;
- no rank score;
- no coordinates;
- no owner IDs merely for Search presentation;
- excerpt length is bounded server-side and must not split/emit more content than required for result recognition;
- private result DTOs are returned only to the owner.

The final OpenAPI schema may use generated enum/model names consistent with repository conventions while preserving these semantics.

## 10. Consistency model

Because expression indexes are maintained by PostgreSQL in the same write transaction as the source row:

- a committed write is searchable immediately from the database consistency perspective;
- a rolled-back write never enters Search;
- delete/privacy transitions update Search visibility transactionally;
- no queue lag/reindex worker status is exposed.

The M4-A runtime must prove in PostgreSQL tests that `SHARED -> PRIVATE` HeartMoment transition removes the row from the partner's Search immediately while retaining owner Search eligibility.

## 11. Observability and abuse resistance

Never log:

- query text;
- snippets/excerpts;
- raw Search result IDs associated with query content;
- ProtectedPayload fields;
- private result counts broken down by sensitive type.

Allowed operational measurements may include content-free values such as:

- request duration;
- total result count bucket where safely aggregated;
- database timing;
- timeout/error code counts.

Search runtime must have a bounded query length, bounded result limit, index-backed execution and the normal authenticated rate-limit/abuse review. Do not add an external unauthenticated Search surface.

## 12. Cache and client behavior

HTTP response is private and `no-store` in v1. Persistent offline Search index is not introduced in M4-A.

Full Search UI, local Read Cache behavior and complete Web/Android parity belong to M5 unless a later M4 issue explicitly scopes a thin evidence flow.

## 13. Freemium boundary

Basic authorized Search described here is **Free/Core**.

Potential future separately classified capabilities include:

- semantic/vector Search;
- AI-assisted query interpretation;
- saved Search views;
- analytical cross-domain discovery;
- advanced smart collections.

They must not be smuggled into or used to narrow the Free Search contract.

## 14. Mandatory runtime tests

At minimum S1 must prove:

- each included shared result type can match its approved fields;
- Wish is searchable;
- each owner-only type is searchable by its owner;
- partner-private and Cross-Tenant rows never enter results;
- PRIVATE HeartMoment owner/partner behavior;
- private child authorization through parent join;
- type filtering;
- query validation boundaries;
- deterministic order across equal-rank results;
- signed cursor tampering rejection;
- cursor Account/Space/query/filter binding;
- committed update becomes searchable and rollback does not;
- delete/privacy transition removes unauthorized Search visibility;
- query plan uses intended indexes on representative data;
- no Search query/plaintext enters application logs in negative-path tests.
