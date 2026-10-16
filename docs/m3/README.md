# M3 Technical Readiness Package

**Status:** S0 and runtime complete; G3 passed  
**As of:** August 30, 2026  
**Tracking:** #159, #162, #163, #164, #165, #261, #264

This package records the technical and domain foundation for **M3 – Shared Life / Planning & Private Area**. The M3-S0 decisions are complete, runtime slices S1 through S9 are delivered, and M3-S10 concluded **G3: PASSED** in the [final G3 Gate Review](../reviews/2026-08-30-g3-gate-review.md).

## Gate rule

Planning was allowed before G2 completed. **Completing the M3-S0 decisions did not automatically release M3 runtime work.**

Under the documented project rule, runtime work started only when:

1. the final G2 review explicitly evaluated G2 as `PASSED` (#147),
2. the subsequent status sync #146 listed M3 as a released milestone,
3. the affected REST/OpenAPI contract for the respective runtime slice was concretely contract-testable.

Items 1 and 2 were satisfied before M3 runtime began. Item 3 remained a condition **for each slice** and was satisfied in the respective runtime PR. The runtime delivery sequence is now complete through S9, and S10 completed the formal G3 decision.

All M3-D01 through M3-D32 are `DECIDED`; domain-level S0 readiness therefore adds no remaining blocker.

## Binding sources and precedence

If sources conflict, the following order applies:

1. `specification/CLEAN-ROOM-MASTER-SPEC.md`
2. `specification/PRODUCT-SPEC.md`
3. `docs/SECURITY.md`
4. published OpenAPI contract
5. `docs/INFORMATION-ARCHITECTURE.md`, `docs/USER-FLOWS.md`, `docs/API-UI-CONTRACTS.md`
6. explicitly `DECIDED` M3 decision documents
7. remaining readiness drafts in `docs/m3/`

**Important:** Older `OPEN`/`PROPOSED` wording in `DOMAIN-MODEL.md` or `API-DESIGN.md` is readiness history. For points that have since been decided, the current [Decision Log](./DECISION-LOG.md) and the decision documents are binding.

## M3 scope

| Area | M3 content | Privacy basis |
|---|---|---|
| Wish | shared Wishes and atomic Wish->Plan lifecycle | `SPACE_SHARED` |
| Plan | concrete planning, schedules, Completion, optional origin from Wish | `SPACE_SHARED` |
| Place | shared Place, optional coordinates, no Provider requirement | `SPACE_SHARED`, location data sensitive |
| Content Relations | typed relations with real FKs | target Authorization remains binding |
| Chapter | bundle of existing Memories, SHARED HeartMoments, and Milestones | `SPACE_SHARED` |
| Collection | shared List with Items, Completion, and atomic Reorder | `SPACE_SHARED` |
| PrivateNote | private personal note | `OWNER_ONLY` |
| GiftIdea | private gift idea | `OWNER_ONLY` |
| PrivateCollection | private List and Items | `OWNER_ONLY` |

Shared Planning, shared Collections, and Private Area remain separate Domain models. There is no universal table for all content.

## S0 decisions

### #162 – Wish / Plan

[`decisions/WISH-PLAN-LIFECYCLE.md`](./decisions/WISH-PLAN-LIFECYCLE.md)

Defined, among other things:

- collaborative write;
- Wish/Plan state machines;
- atomic, idempotent Wish->Plan conversion;
- Return-to-Wish;
- Direct Plan Create;
- date invariants;
- Delete/Concurrency matrix.

### #163 – Place / Relations / Chapters

[`decisions/PLACE-RELATIONS-CHAPTERS.md`](./decisions/PLACE-RELATIONS-CHAPTERS.md)

Defined, among other things:

- protection and precision of location data;
- no automatic Place deduplication;
- typed relation tables;
- `Plan.placeId` and `Chapter.placeId` as canonical single-Place FKs;
- no relations to private targets;
- derived Chapter ordering;
- relation/Delete/Privacy races.

### #164 – Collections / Private Area

[`decisions/COLLECTIONS-PRIVATE-AREA.md`](./decisions/COLLECTIONS-PRIVATE-AREA.md)

Defined, among other things:

- Shared Collection write/versioning model;
- atomic Reorder;
- parent-child Delete;
- ProtectedPayload boundaries for Private Area;
- GiftIdea `IDEA | BOUGHT | GIVEN`;
- PrivateCollection root/item schema;
- owner-scoped `/private/...` API;
- redacted M3 Event contract.

### #165 – G3 / client boundaries

[`decisions/G3-CLIENT-BOUNDARIES.md`](./decisions/G3-CLIENT-BOUNDARIES.md)

Defined, among other things:

- G3 as a Domain/API/PostgreSQL gate;
- five mandatory real HTTP E2E flows;
- full client parity/Accessibility only in M5/G4;
- Export/cache Privacy boundaries for later implementation;
- Private Area as the secondary intentional de-DE product area `Mein Bereich`;
- Plan checklist/media deliberately later;
- multi-select only as client state.

## Additional M3 documents

- [Domain Model](./DOMAIN-MODEL.md) – original model/risk draft; for decided points, the decision documents apply
- [API Design](./API-DESIGN.md) – original API target surface; concrete operation semantics are bound by decisions and the published OpenAPI contract
- [Decision Log](./DECISION-LOG.md) – current compact matrix of all M3-D01 through D32
- [Privacy Threat Model](./PRIVACY-THREAT-MODEL.md) – tenant, owner-only, relation, and location leaks
- [Security Test Matrix](./SECURITY-TEST-MATRIX.md) – negative paths, races, and Privacy evidence
- [Delivery Plan](./DELIVERY-PLAN.md) – completed S1-S10 delivery sequence
- [G3 Evidence Map](./G3-EVIDENCE.md) – executable real HTTP/PostgreSQL and negative evidence assembled in S9
- [Final G3 Gate Review](../reviews/2026-08-30-g3-gate-review.md) – immutable S10 decision: **G3: PASSED**

## Do not pull forward into M3

- global full-text Search / general Search Read Model – M4-A;
- Dashboard, Activity, Notifications, Reminders, and Rules – M4;
- complete Web/Android productization, parity, Read Cache, Export/Import, Deep Links, comprehensive Accessibility/Performance – M5/G4;
- Questions, Check-in, and Recaps – M7 Relationship Depth;
- Discovery, Shopping, Recipe, Event, and other Providers – M8 Discover & Integrations;
- Maps/Geocoding Providers, Geofencing, Presence, and active location context – M9 Context & Presence;
- ShoppingList/ShoppingItem – separate later Domain;
- real E2EE – MX;
- video – Future Backlog #88;
- Plan checklist and Plan Attachments – later explicit scope.

`Place` in M3 means Domain + stored location data + relations, not address search, map view, or Geocoding.

## Definition of Ready for an M3 runtime slice

The following checklist was the per-slice readiness rule used during M3 runtime delivery:

- [x] G2 formally passed and M3 was released through #146;
- [x] relevant BLOCKING decisions were `DECIDED`;
- [x] model fields, Privacy class, creator/owner, and write permissions were settled from a domain perspective;
- [x] status/Delete/relation/Concurrency boundaries for the affected M3 Core were settled;
- [x] production Request/Response/OpenAPI contracts were implemented or unambiguously contract-testable in each delivered slice;
- [x] mandatory Cross-Tenant/Privacy/race tests were specified and implemented;
- [x] Event payloads require no sensitive plaintext;
- [x] Reuse-before-build was addressed in each concrete runtime PR where relevant.

## G3 result

G3 required at minimum:

- consistent Wishes/Plans/Places/Chapters/Collections;
- complete Private Area isolation;
- deterministic Delete/409/race effects;
- five real HTTP/PostgreSQL E2E flows according to `G3-CLIENT-BOUNDARIES.md`;
- no open High/Critical Security/Privacy findings and no Tenant/`OWNER_ONLY` leak.

M3-S9 assembled the executable evidence in [G3-EVIDENCE.md](./G3-EVIDENCE.md). M3-S10 reviewed the merged S9 `main` tree, exact successful workflow runs, all five mandatory flows, the negative/race/redaction/contract evidence, and the current open finding set.

The immutable [final G3 Gate Review](../reviews/2026-08-30-g3-gate-review.md) concludes:

**G3: PASSED**

M3 is complete for its defined Domain/API/PostgreSQL scope. The next roadmap milestone is M4 — Engage; no M4 implementation is part of this M3 package or the S10 gate review.
