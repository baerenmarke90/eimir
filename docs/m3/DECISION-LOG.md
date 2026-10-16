# M3 Decision Log

**As of:** August 26, 2026  
**S0 status:** all M3-D01 through M3-D32 are `DECIDED`  
**Rule:** No fundamental M3 question is decided silently in runtime code.

This log is the compact overview. The complete contracts are in the linked decision documents.

## Status

- `OPEN` – decision missing.
- `PROPOSED` – preferred option documented, but not binding.
- `DECIDED` – binding through source or explicit project decision.

## Priority

- `BLOCKING` – decide before the first affected runtime slice.
- `BEFORE_CLIENTS` – decide before stable Web/Android integration.
- `BEFORE_GATE` – decide before final G3 evidence.
- `LATER` – decision may deliberately move implementation to a later scope.

## Decision matrix

| ID | Priority | Status | Topic | Binding decision |
|---|---|---|---|---|
| M3-D01 | BLOCKING | DECIDED | Shared Writes | Wish, Plan, Place, Chapter, and shared Collection use collaborative write for both active Space members; `createdBy` is Attribution, not an ACL. #162 |
| M3-D02 | BLOCKING | DECIDED | Wish -> Plan | At most one originating Plan per Wish; atomic conversion with Wish Row Lock + Unique; retry on PLANNED returns the same Plan. #162 |
| M3-D03 | BLOCKING | DECIDED | Plan -> Wish | Source-bound IDEA/PLANNED only; reactivate the same Wish to OPEN, delete the Plan, and do not copy payload back. #162 |
| M3-D04 | BLOCKING | DECIDED | Plan Lifecycle | IDEA->PLANNED, PLANNED->IDEA, IDEA/PLANNED->COMPLETED; COMPLETED terminal; explicit operation routes. #162 |
| M3-D05 | BLOCKING | DECIDED | Wish/Plan Delete | State-based Delete matrix; no cascade onto domain originals. #162 |
| M3-D06 | BLOCKING | DECIDED | Place Privacy | Place content including address/coordinates is protected shared content; exact values only within the authorized Space, no telemetry. #163 |
| M3-D07 | BLOCKING | DECIDED | Place Identity | No automatic/implicit deduplication or merge. #163 |
| M3-D08 | BLOCKING | DECIDED | Relation Contract | Typed FK relations; Plan/Chapter use canonical `placeId`, content relations use dedicated Join tables; external API is typed. #163 |
| M3-D09 | BLOCKING | DECIDED | Relation Privacy | No relation to OWNER_ONLY/private targets; unreadable targets return Privacy-safe 404; SHARED->PRIVATE removes Relations atomically. #163 |
| M3-D10 | BLOCKING | DECIDED | Chapter Ordering | No persisted manual ordering in M3; deterministically derived from event date/createdAt. #163 |
| M3-D11 | BLOCKING | DECIDED | Chapter Dates | `startOn`/`endOn` independently optional; if both are set: `endOn >= startOn`. #163 |
| M3-D12 | BLOCKING | DECIDED | Chapter Delete | Chapter Delete removes Relations, never Memory/HeartMoment/Milestone originals. Source-bound. |
| M3-D13 | BLOCKING | DECIDED | Collection Ownership | Root receives `createdBy`; Root/Items use collaborative write; Attribution is not an ACL. #164 |
| M3-D14 | BLOCKING | DECIDED | Collection Concurrency | Root version protects structure/order, Item version protects content; atomic full-list Reorder with contiguous integer positions. #164 |
| M3-D15 | BLOCKING | DECIDED | Collection Delete | CollectionItem is a Child; Parent Delete may cascade Items, no other originals. #164 |
| M3-D16 | BLOCKING | DECIDED | Private Payload | PrivateNote title/body; GiftIdea content fields; PrivateCollection/Item titles are protected owner-only content. #164 |
| M3-D17 | BLOCKING | DECIDED | GiftIdea Status | `IDEA | BOUGHT | GIVEN` with explicitly validated transitions. #164 |
| M3-D18 | BLOCKING | DECIDED | Private Collection | Complete root/item schema with IDs/timestamps/version; root version for order, Item version for content. #164 |
| M3-D19 | BLOCKING | DECIDED | Private API | Space-scoped `/private/...`; Owner only from Auth Context; foreign/unknown/partner cases all return identical 404. #164 |
| M3-D20 | LATER | DECIDED | Search | No global full-text Search in M3; M4-A. Domain-local filters remain allowed. Roadmap. |
| M3-D21 | BEFORE_CLIENTS | DECIDED | Export | M3 does not implement Export; shared Export never contains owner-only content, personal Export later includes only the caller's own Private Area. #165 |
| M3-D22 | BEFORE_CLIENTS | DECIDED | Client Cache | No persistent Private read cache in M3; M5 must namespace by Account+Space+Owner and clear on logout/switch. #165 |
| M3-D23 | BLOCKING | DECIDED | Events | Minimal redacted Event envelope; OWNER_ONLY without domain `safeState`; no ProtectedPayloads/private counts. #164 |
| M3-D24 | BEFORE_GATE | DECIDED | G3 Evidence | G3 is a Domain/API/PostgreSQL gate with five real HTTP E2E flows; full client parity/Accessibility remains M5/G4. #165 |
| M3-D25 | BEFORE_CLIENTS | DECIDED | Private IA | Secondary personal area `Mehr / Mein Bereich`; no shared counts/badges; Security remains server-side. #165 |
| M3-D26 | BLOCKING | DECIDED | Relation Races | Relation Create locks Parent->Target, revalidates Privacy, and is protected by FK/Unique; Delete/Privacy races are deterministic. #163 |
| M3-D27 | LATER | DECIDED | Plan Richness | Checklist/Plan media/structured additional notes are deliberately not pulled into M3; later explicit scope. #165 |
| M3-D28 | BLOCKING | DECIDED | Location Leakage | Lat/Lon as a pair, ranges and max. 6 decimal places; no logs/Analytics/Events/Provider enrichment. #163 |
| M3-D29 | BEFORE_CLIENTS | DECIDED | Collection Multi-select | Pure client batch-selection state; no persisted Domain field/selection model. #165 |
| M3-D30 | BLOCKING | DECIDED | Direct Plan Create | Allowed; always starts as IDEA without `sourceWishId`, Plan dates, or `experiencedOn`. #162 |
| M3-D31 | BLOCKING | DECIDED | Chapter/Place | `Chapter.placeId` is the single canonical truth; no parallel `place_chapters` table. #163 |
| M3-D32 | BLOCKING | DECIDED | Private Item Auth | PrivateCollectionItem does not duplicate owner/space; Authorization always goes through the owner-scoped Parent Join. #164 |

## Binding decision documents

### Wish / Plan – #162

[`decisions/WISH-PLAN-LIFECYCLE.md`](./decisions/WISH-PLAN-LIFECYCLE.md)

Contains:

- Wish/Plan state machines;
- Wish->Plan atomicity and idempotency;
- Return-to-Wish;
- Direct Plan Create;
- Delete matrix;
- locking, DB constraints, error codes, and mandatory tests.

### Place / Relations / Chapters – #163

[`decisions/PLACE-RELATIONS-CHAPTERS.md`](./decisions/PLACE-RELATIONS-CHAPTERS.md)

Contains:

- Place Protected Content and coordinate rules;
- no automatic deduplication;
- approved typed relation tables;
- canonical Plan/Chapter Place FKs;
- Relation Privacy and SHARED->PRIVATE Cleanup;
- Chapter dates and derived ordering;
- Delete/race matrix and tests.

### Collections / Private Area – #164

[`decisions/COLLECTIONS-PRIVATE-AREA.md`](./decisions/COLLECTIONS-PRIVATE-AREA.md)

Contains:

- Shared Collection write/ownership model;
- atomic Reorder/versioning contract;
- Collection Delete cascade;
- Private ProtectedPayload boundaries;
- GiftIdea status enum;
- PrivateCollection root/child schema;
- owner-scoped Private API;
- M3 Event/Redaction contract.

### G3 / Clients / Export / Cache – #165

[`decisions/G3-CLIENT-BOUNDARIES.md`](./decisions/G3-CLIENT-BOUNDARIES.md)

Contains:

- five mandatory real G3 E2E flows;
- gate-blocking Privacy/Security criteria;
- G3 vs. M5/G4 boundary;
- later Export/cache Privacy contracts;
- Private Area IA;
- Plan Richness deliberately later;
- multi-select as client state.

## Source-bound decisions

### M3-D12 – Chapter Delete

Deleting a Chapter removes its Relations. Memories, HeartMoments, and Milestones remain as original resources.

Consequences:

- no FK cascade from Chapter to original content;
- Join rows may use `ON DELETE CASCADE` toward the Chapter;
- tests prove originals remain readable after Chapter Delete.

### M3-D20 – Global Search

Global full-text Search is not pulled into M3. The Roadmap assigns Search to M4-A. M3 may provide Domain-local filtering/sorting but must not build a general Search Read Model.

## S0 completion

With merge of Decision PRs #162 and #163/#164/#165:

- all `BLOCKING` decisions are `DECIDED`;
- all `BEFORE_CLIENTS`/`BEFORE_GATE` boundaries are defined early;
- deliberately later features are explicitly decided as such;
- no runtime slice must invent core Domain semantics.

**Important:** S0 completion is not automatic M3 runtime release. The project/gate start conditions documented in `docs/m3/README.md` remain separately binding.

## Closure rule for later changes

A semantics already marked `DECIDED` is not silently changed in a runtime PR. A change requires at least:

- explicit new project decision/ADR or Decision PR;
- persistence/API impact;
- Delete/Concurrency consequence;
- Privacy/Tenant consequence;
- mandatory tests;
- migration/compatibility review if runtime already exists.
