# M3 Privacy Threat Model

**Status:** readiness foundation for M3  
**As of:** August 26, 2026

M3 significantly expands the privacy surface: shared planning content is joined by several intentionally private owner-only domains and precise location data. This document defines the threats that must be considered in models, APIs, and tests before runtime code is implemented.

## 1. Protected assets

### Shared M3 content

- Wish and status
- Plan, description, schedule/experience dates
- Place, address, and coordinates
- Chapter and relations
- Collection and items

These resources are `SPACE_SHARED`, but **not public**. Only active members of the same Space may receive them.

### Owner-only content

- PrivateNote
- GiftIdea
- PrivateCollection
- PrivateCollectionItem

For these resources, the partner must not learn not only the content but, where possible, even **their existence**.

### Particularly sensitive metadata

- exact coordinates and address,
- GiftIdea URL, recipient, occasion, and price text,
- titles/free text of private notes and lists,
- relations from which private interests or locations could be inferred,
- counts/order positions if they could reveal hidden private entries.

## 2. Trust boundaries

```text
Web / Android
    |
    | HTTPS + Bearer/Auth
    v
FastAPI / Authorization
    |
    +--> PostgreSQL
    |
    +--> Outbox/Worker
    |
    +--> Logs/Metrics/Error Tracking
```

M3 introduces **no new external provider boundary**. In particular, Maps, Geocoding, URL previews, and Discovery are not invoked server-side.

## 3. Central invariants

### T1 — Space first

No M3 read/write is resolved from a Resource ID alone. Always:

1. authentication,
2. active Membership in `spaceId`,
3. query within that Space,
4. additional owner/write rule.

### T2 — Owner-only in the query

Private Area data is not loaded and then discarded in the service. The owner condition is part of the query/Authorization boundary.

### T3 — No indirect private disclosure

`OWNER_ONLY` must not become visible through:

- foreign GET-by-ID,
- lists,
- counts,
- relations,
- error messages,
- ordering gaps,
- Search/Autocomplete,
- Chapter/Place,
- Dashboard/Activity/Notifications,
- Export,
- Domain Events,
- Logs/Metrics,
- Deep Links.

### T4 — A relation never extends rights

A relation is not a Capability token. Reading a Chapter or Place never grants access to a Target that would otherwise be unreadable.

### T5 — No Shared-to-Private mixed domain

Wish/Plan/Collection are not turned into private storage through a privacy flag. PrivateNote/GiftIdea/PrivateCollection remain separate Domain models. This prevents a misinterpreted shared filter from exposing private data.

## 4. Threats and controls

### M3-T01 — Private Area ID enumeration

**Attack:** The partner guesses a `noteId`, `giftIdeaId`, or private Collection ID and compares responses.

**Controls:**

- owner-scoped query,
- identical privacy-safe 404 for unknown, foreign, other-Space, or deleted resources,
- no differing error message,
- no preceding existence query without the owner filter.

**Tests:** A partner ID sweep against existing and non-existing IDs produces semantically the same response class.

### M3-T02 — Cross-Space ID substitution

**Attack:** A valid ID from Space A is used in a route for Space B.

**Controls:**

- Membership in the route Space first,
- resource query contains `space_id`,
- relation tables enforce Space consistency at the service and constraint layers.

**Tests:** All M3 domains and all relation types.

### M3-T03 — Cross-Space relation

**Attack:** A Place/Chapter from Space A is linked to a Memory/Plan from Space B.

**Controls:**

- load both Targets Space-scoped,
- DB constraints where possible,
- transaction re-checks before insert,
- externally return 404 without disclosing the foreign Space.

### M3-T04 — Private HeartMoment through shared Chapter/Place

**Attack:** A user knows a private HeartMoment ID and attempts to link it to a shared Chapter/Place; the partner could infer existence from a relation or count.

**Controls:**

- Target must be readable and linkable for the Actor in the shared context,
- an `OWNER_ONLY` HeartMoment is treated as not found for a shared relation,
- an existing relation must be removed atomically/serially during `SHARED -> PRIVATE`, or prevented before commit — final semantics are defined by M3-D09/M3-D26.

### M3-T05 — Relation race against privacy change

**Attack:** `link shared HeartMoment -> Chapter` and `SHARED -> PRIVATE` occur concurrently.

**Risk:** The relation remains after the privacy commit and reveals the private resource's existence.

**Controls:**

- Row Lock/serialized order on Target/relation,
- re-check privacy before commit,
- the privacy transition must include M3 relations in its cascade/listener boundary once that domain exists.

### M3-T06 — Wish->Plan double submit

**Attack/error:** Two devices or a retry create two Plans from one Wish.

**Controls:**

- defined cardinality,
- DB Unique Constraint,
- Row Lock/atomic transaction,
- stable conflict/idempotency response.

### M3-T07 — Delete-vs-relation race

**Attack/error:** A Target is deleted while a relation is being created.

**Controls:**

- FK prevents a dangling relation,
- the domain service translates the Integrity/Lock outcome into a stable error,
- no catch-and-ignore logic that confirms a phantom relation.

### M3-T08 — Partner edits creator-owned shared content

**Attack:** The client does not show the action, but the partner sends the request manually.

**Controls:**

- M3-D01 defines the write policy server-side,
- Capabilities are presentation only,
- query/service enforces the rule.

### M3-T09 — Private count leakage

**Attack:** A shared response contains, for example, `privateItemCount`, a total count, or pagination behavior from which the partner can infer private content.

**Controls:**

- shared endpoints count only the shared domain,
- Private Collections have separate owner-only lists,
- no combined Shared+Private Collection list with client-side filtering.

### M3-T10 — Ordering/position leakage

**Attack:** Visible shared items have positions `1,4,7` because private items were ordered in the same table.

**Control:** Shared and Private Collections use separate tables/aggregates; position spaces are not mixed.

### M3-T11 — Location leakage through telemetry

**Attack/error:** Coordinates/address appear in Logs, Metrics, Analytics, Error Context, or Outbox.

**Controls:**

- structured Redaction,
- Events without location payload,
- request logging must not capture unsanitized Bodies,
- tests of Event/log representations.

### M3-T12 — Location leakage through relation/read model

**Attack:** A Place is later projected into Dashboard/Search and reveals more than the authorized Parent.

**Control in M3:** No new Dashboard/Search projections. Later Read Models must reapply the Space/privacy rule; M3 stores no "public" Place variant.

### M3-T13 — GiftIdea URL SSRF/tracking

**Attack:** A user stores an internal URL; the Backend fetches a Preview or metadata and becomes an SSRF proxy.

**Control:** M3 stores the URL only as content and performs no server-side fetch.

A later Preview requires its own Security/Reuse design, including URL allow/block rules, DNS rebinding, redirects, content limits, and privacy.

### M3-T14 — GiftIdea URL in the partner client

**Attack/error:** A shared client prefetches or instruments URLs from an owner-only GiftIdea.

**Control:** The partner never receives the GiftIdea. The owner client may open the URL only through deliberate interaction; automatic external requests are not part of M3.

### M3-T15 — Private content in Domain Events

**Failure:** An Event contains title/body for the convenience of a consumer.

**Controls:** Event envelopes contain IDs and safe states only; no ProtectedPayloads. Consumers load authorized data only in their own context or operate without content.

### M3-T16 — Private content in Audit

Audit may retain necessary security metadata but must not duplicate private plaintext. Allowed examples include Actor, action, Resource ID, timestamp, and result. Title/body, GiftIdea details, and coordinates do not belong there.

### M3-T17 — Partner export of private content

M3 does not implement Export, but its data architecture must allow M5 to make a clear distinction:

- owner Export may contain the owner's own private resources,
- shared/partner Export never contains the other person's owner-only resources,
- relation tables must not reveal private Targets in shared bundle metadata.

### M3-T18 — Cache after logout/Space change

M3 does not implement the M5 Read Cache. Nevertheless, the following remain architectural prerequisites:

- do not persist private DTOs in uncontrolled browser storage,
- future Android caches are scoped by Account + Space + owner,
- logout, Session revocation, and Space change require secure cache-clear rules (M3-D22/M2-D18).

### M3-T19 — Chapter delete causes data loss

**Failure:** A DB Cascade deletes Memory/HeartMoment/Milestone instead of the Join row.

**Control:** FK direction and `ON DELETE` apply only to the Join parent; an Integration Test verifies that the original resources remain.

### M3-T20 — Duplicate Chapter/Place source of truth

**Failure:** `chapter.place_id` points to Place A while `place_chapters` contains Place B.

**Control:** M3-D31 decides exactly one canonical model before migration.

## 5. Privacy classification

| Data | Shared/Private | Sensitivity | Telemetry |
|---|---|---|---|
| Wish title | shared | relationship/interests | no plaintext |
| Plan title/description | shared | plans/dates | no plaintext |
| plannedStart/End | shared | scheduling | no high-cardinality raw telemetry |
| Place name/address | shared | potential location | no plaintext |
| lat/lon | shared but highly sensitive | precise location | strictly forbidden |
| Chapter title/description | shared | relationship content | no plaintext |
| Collection/Item title | shared | interests/checklists | no plaintext |
| PrivateNote | owner-only | highly sensitive | strictly forbidden |
| GiftIdea | owner-only | highly sensitive | strictly forbidden |
| PrivateCollection | owner-only | highly sensitive | strictly forbidden |

## 6. Error semantics

### Not readable

Foreign Space, the partner's private resource, an unknown ID, and a deleted private resource are not distinguished externally.

### Readable but not writable

If M3-D01 decides on creator-only writes, a 403 may be domain-correct for a shared visible resource, consistent with the existing Security convention. It confirms nothing that the partner is not already allowed to read.

### Relations

Unreadable Target -> 404. No `RELATION_TARGET_PRIVATE` or similar code.

## 7. Logging / Analytics / Error Tracking

M3 may count technical events such as:

```text
wish_created
plan_transition_completed
relation_create_failed
private_note_create_failed
```

Allowed dimensions are coarse technical classes only, for example `result`, stable Error Code, and platform/app version.

Not allowed:

- Resource ID as an Analytics dimension,
- title/text,
- exact dates/times in sensitive flows,
- address/coordinates,
- URL,
- recipient/occasion/priceText,
- private Item counts.

## 8. Provider and network boundary

M3 has no domain need for outgoing requests caused by Place/GiftIdea content.

Therefore:

- no Geocoding API,
- no map-tile integration,
- no Link Preview,
- no URL validation through Fetch,
- no automatic Location resolution.

A later Provider slice requires `REUSE-BEFORE-BUILD`, privacy/cost/ToS/Self-Hosted assessment, and its own threats.

## 9. Security Gate for an M3 slice

A slice is not merge-ready if:

- a Cross-Tenant negative test is missing,
- an owner-only negative test is missing for a private domain,
- a relation enables a Target-Authorization bypass,
- a race is protected only by "probably sequential" behavior instead of a DB/transaction primitive,
- an Event/Log copies sensitive content,
- a Delete Cascade is not tested against loss of original data,
- new external data transfer is introduced without explicit scope.

## 10. G3 privacy minimum evidence

Before G3, at minimum the following must be demonstrated reliably:

- all shared M3 domains are Cross-Tenant isolated,
- every Private Area domain is owner-only for List/GET/mutation,
- no private resource can be proven through a shared relation,
- Wish->Plan and relevant relation/delete races are tested with PostgreSQL,
- Chapter Delete preserves original content,
- Events/Logs contain no protected M3 payloads,
- Place coordinates do not appear in telemetry,
- G3-specific client/E2E evidence is documented according to M3-D24.
