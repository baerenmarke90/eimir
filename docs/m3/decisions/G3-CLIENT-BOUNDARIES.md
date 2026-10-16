# M3 G3, Client, Export, and Cache Boundaries

**Status:** `DECIDED` – effective with merge of this decision PR  
**Date:** August 26, 2026  
**Tracking:** #165  
**Covers:** M3-D21, D22, D24, D25, D27, D29

This document defines early which evidence G3 requires and what is deliberately implemented only in M5/G4. It contains no Runtime or Client code and does not change the existing M3 start condition.

## 1. Binding sources

- `specification/CLEAN-ROOM-MASTER-SPEC.md`
- `specification/PRODUCT-SPEC.md`
- `docs/ROADMAP.md`
- `docs/SECURITY.md`
- `docs/m3/README.md`
- `docs/m3/DELIVERY-PLAN.md`

Roadmap boundary:

- G3 verifies consistent Wishes/Plans/Places/Chapters/Collections, complete Private Area isolation, and understandable Delete/409 behavior.
- M5/G4 delivers complete Web/Android productization, parity, Read Cache, Export/Import, Accessibility, and Performance.

Therefore M3 must provide real Runtime/API/PostgreSQL evidence, but no premature complete Client parity.

## 2. M3-D24 – G3 Evidence

### Decision

G3 is a **Domain/API/PostgreSQL gate**. Thin Web/Android reference flows are not additionally mandatory for G3. Client parity and systematic Accessibility remain M5/G4.

G3 nevertheless requires real HTTP E2E flows against the production-like FastAPI/PostgreSQL stack, not only Unit Tests or Mock Repository tests.

### Required G3 E2E flows

At minimum these five flows must be demonstrably green on the final G3 commit:

1. **Wish -> Plan -> Complete**
   - create an OPEN Wish;
   - atomically convert it to a Plan;
   - schedule or complete the Plan spontaneously;
   - source Wish and Plan consistently COMPLETED;
   - cover Retry/Race/Version Conflict.

2. **Place + Relation**
   - Place without and with coordinates;
   - at least one typed Place Relation to existing Shared Content;
   - Cross-Space/private target negative path;
   - Place Delete preserves Domain originals.

3. **Chapter + Relation + Delete**
   - create Chapter;
   - connect Memory/SHARED HeartMoment/Milestone;
   - verify deterministic derived ordering;
   - delete Chapter;
   - original content remains readable.

4. **Shared Collection**
   - Collection + multiple Items;
   - Completion;
   - atomic Reorder;
   - stale/concurrent Reorder -> deterministic 409;
   - Delete Cascade only to Items.

5. **Private Area Owner/Partner negative path**
   - Owner creates PrivateNote, GiftIdea, and PrivateCollection with Item;
   - Owner can read/change;
   - partner sees neither GET nor LIST/Count/Item;
   - partner mutation returns Privacy-safe non-existence semantics;
   - Logout/session switch creates no server-side leak.

### Required negative tests

G3 blocks on failures in:

- Cross-Tenant Isolation;
- OWNER_ONLY Isolation;
- Relation to private/non-readable targets;
- Wish->Plan double submit/partial transactions;
- Relation/Privacy races;
- Collection Reorder consistency;
- Delete Cascades on Domain originals;
- Event/log leaks of protected content.

### Gate-blocking findings

G3 cannot pass with:

- an open `Critical` or `High` Security/Privacy/Tenant finding;
- **any actual Tenant or OWNER_ONLY leak**, regardless of any otherwise assigned Severity;
- data loss/Cascade of a Domain original outside documented Parent-Child semantics;
- a reproducible Race that creates an invalid Domain state;
- missing real PostgreSQL/HTTP evidence for any of the five required flows.

Medium/Low findings without a Tenant/Privacy leak may remain open only with a dedicated follow-up Issue and explicit risk acceptance in the G3 review.

### Evidence format

The final G3 review is a **new dated document** under:

```text
docs/reviews/YYYY-MM-DD-g3-gate-review.md
```

It names at least:

- final `main` commit SHA;
- relevant PRs/Issues;
- workflow run IDs;
- OpenAPI/Backend/PostgreSQL test status;
- the five E2E flows with result;
- open findings with Severity;
- explicit `G3: PASSED` or `G3: FAILED`.

Historical gate reviews are not rewritten.

## 3. G3 vs. M5/G4

G3 is deliberately a **milestone gate**, not the final project-wide Definition of Done for an M3 feature. The Web/Android portions, Export support, and complete Client product maturity required by the Product Specification are completed according to the Roadmap in M5/G4. `G3: PASSED` therefore does not mean "M3 is already a completely production-ready Client feature"; it means "M3 Domain, API, persistence, Authorization, and gate evidence are robust enough for the next milestone." The project-wide DoD for these functions is complete only once the later Client/Export portions are delivered.

### Required in G3

- Domain model/migration/API for M3;
- Tenant/owner Authorization;
- Optimistic Concurrency/races;
- real HTTP/PostgreSQL E2E evidence;
- Privacy/Security negative tests;
- current OpenAPI;
- documented Delete/409 semantics.

### Required only in M5/G4

- complete Web UI for all M3 functions;
- complete Android UI for all M3 functions;
- systematic Web/Android parity;
- Offline Read Cache;
- Export/Import implementation;
- Deep Links;
- comprehensive Accessibility acceptance;
- Client Performance Gate.

M3 may later build small technical reference surfaces when useful for development, but they are **not required for G3** and must not present M5 as complete.

## 4. M3-D21 – Export boundary

### Decision

M3 implements **no Export**. The following Privacy semantics are nevertheless already binding for M5.

There are conceptually two Export contexts:

### Shared Space Export

Contains:

- `SPACE_SHARED` data from the Space;
- jointly authorized Attachments/Relations according to the Export contract.

Never contains:

- PrivateNote;
- GiftIdea;
- PrivateCollection/Items;
- the partner's private HeartMoments;
- private Counts/manifest entries that reveal their existence.

### Personal Export

An authenticated Account may additionally receive **its own** `OWNER_ONLY` data in Personal Export.

- the Account's own PrivateNote/GiftIdea/PrivateCollection may be included;
- the partner's private data is excluded;
- owner assignment must be preserved in the neutral transfer format;
- manifest/checksums must not indirectly prove the other person's private resources to the partner.

The technical Bundle/Import implementation remains M5.

## 5. M3-D22 – Client Cache

### Decision

M3 introduces **no persistent Offline/Read Cache** for Private Area. Until M5, private data in technical reference clients remains only in process/memory state, if a Client exists at all.

For M5, the following namespace boundary is binding:

```text
accountId + spaceId + privacyContext
```

For `OWNER_ONLY`, at minimum:

```text
accountId + spaceId + ownerId
```

### Clear/isolation rules

Private cache data must be removed from the active Client context at least on:

- Logout;
- Session revoke / re-authentication;
- Account switch;
- Space switch;
- Owner context switch;
- local data deletion/reset.

### Web

Until the explicit M5 cache design:

- no Private Area payloads in `localStorage`;
- no uncontrolled persistence in IndexedDB;
- no Tokens/signed URLs as persistent cache keys;
- Query Caches must namespace Account/Space/Owner correctly and be cleared on Logout.

### Android

Persistent Room Read Cache for Private Area is M5 scope. Before then, no ad-hoc SharedPreferences/file persistence of private payloads.

The final encryption/Retention strategy is part of the M5 Security/cache review.

## 6. M3-D25 – Private Area Information Architecture

### Decision

Private Area is a **secondary personal area**, not shared primary navigation.

Canonical Client concept for M5, intentional de-DE product labels:

```text
Mehr / Mein Bereich
  -> Private Notizen
  -> Geschenkideen
  -> Private Listen
```

Routes may internally use a clearly personal namespace, for example:

```text
/private/notes
/private/gift-ideas
/private/collections
```

Rules:

- the UI describes this area as personal/for the current user only;
- shared Space surfaces show no private Counts/Badges;
- a Deep Link to a private resource re-authorizes server-side;
- hiding content in the Client is never the Security boundary;
- a partner must not be able to infer from navigation, Badges, or errors how many private resources exist.

Exact visual navigation/label polish remains M5; the Security and IA boundary is decided here.

## 7. M3-D27 – Plan Richness

### Decision

**Checklist, Plan Media, and further structured Plan notes are not pulled into M3.**

The M3 Plan remains the source-bound Core:

```text
title
description?
status
plannedStart?
plannedEnd?
experiencedOn?
placeId?
```

Therefore:

- no hidden Checklist modeled as a `Collection`;
- no `PlanChecklistItem` table in M3;
- no Plan Attachment relation in M3;
- `description` is the only general free-text field in the Plan Core;
- a later Richness extension requires its own scope, data model, API, Privacy, Media, and Reuse review.

M3-D27 is therefore deliberately decided as **later** and blocks no M3 runtime slice.

## 8. M3-D29 – Collection Multi-select

### Decision

"Multi-select" in M3 is **Client interaction state only**, not persisted Domain semantics.

- no `selected` column;
- no Selection table;
- Selection disappears on navigation/reload according to Client convention;
- Batch actions may later use multiple ordinary Domain operations or an explicit Batch endpoint;
- the server stores only Domain end states such as `completed`, not UI selection.

This creates no additional Sync/Privacy state solely for a UI interaction.

## 9. G3 preparation for M4

G3 requires only that M4 Read Model boundaries are **prepared**:

- M3 Events carry no ProtectedPayloads;
- OWNER_ONLY Events cannot accidentally enter Shared Activity/Dashboard;
- global full-text Search remains M4-A;
- M3 creates no private Search index in advance;
- IDs/status/Privacy classes are sufficient for later controlled Read Models where required by the Domain.

## 10. Reuse-before-build

Not relevant for this pure Gate/Client-boundary decision. Later Export, Cache, Deep Link, or Client technology must be reviewed again in its implementation PR for existing libraries/platform mechanisms and Security properties.
