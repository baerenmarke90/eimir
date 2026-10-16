# M4-A Privacy and Test Matrix

**Status:** mandatory evidence contract for M4-A runtime  
**Owning issue:** #272

This matrix defines the negative/privacy evidence required for Search and Dashboard. It is not a replacement for existing Tenant Guard, authorization or domain tests.

## 1. Search authorization matrix

| Source | Caller is member | Caller ownership | Expected Search eligibility |
|---|---:|---:|---|
| shared resource in requested Space | yes | any | eligible |
| shared resource in another Space | yes/no | any | never eligible |
| PRIVATE HeartMoment in requested Space | yes | owner | eligible only in owner's Search |
| PRIVATE HeartMoment in requested Space | yes | partner | never enters candidate set |
| PrivateNote in requested Space | yes | owner | eligible |
| PrivateNote in requested Space | yes | partner | never enters candidate set |
| GiftIdea in requested Space | yes | owner | eligible |
| GiftIdea in requested Space | yes | partner | never enters candidate set |
| PrivateCollection root in requested Space | yes | owner | eligible |
| PrivateCollection root in requested Space | yes | partner | never enters candidate set |
| PrivateCollectionItem | yes | owner of authorized parent | eligible through parent join |
| PrivateCollectionItem | yes | partner of parent owner | never enters candidate set |
| any resource when caller lacks active Membership | no | any | no Search access; privacy-safe absence |

### Search non-generation rule

Tests must prove partner-private rows are absent **before** projection. A test that retrieves private rows and filters them in Python is insufficient.

At least one PostgreSQL-level or repository-query test must assert that the SQL-visible authorized candidate set cannot contain another owner's private row.

## 2. Search cursor/privacy matrix

| Scenario | Required result |
|---|---|
| cursor replay by the other partner in the same Space | `INVALID_CURSOR` because Account is bound |
| cursor replay in another Space | `INVALID_CURSOR` |
| cursor replay with changed query | `INVALID_CURSOR` |
| cursor replay with changed type filters | `INVALID_CURSOR` |
| cursor tampering | `INVALID_CURSOR` |
| source row changes from SHARED to PRIVATE between pages | partner cannot receive it on a later page |
| private source is deleted between pages | no stale result; continuation remains safe |

Search does not promise immutable snapshot pagination. It does promise that every page re-applies current authorization and cannot cross its signed request boundary.

## 3. Search content exposure matrix

Allowed in a Search DTO only after authorization:

- result type;
- resource ID;
- parent ID for collection child results;
- server-derived shared/private scope;
- bounded title/label/text excerpt;
- approved domain date.

Forbidden:

- raw ProtectedPayload object;
- coordinates;
- authentication/session metadata;
- owner identity solely because the result is private;
- ranking score;
- HTML generated from user content;
- URLs as GiftIdea search lexemes/result excerpt unless a later explicit contract adds them;
- query text in logs/metrics.

## 4. Dashboard authorization matrix

Dashboard is a shared-only surface.

| Source | Shared | Owner-only | Dashboard eligibility |
|---|---:|---:|---|
| Memory | yes | no | eligible |
| Milestone | yes | no | eligible |
| HeartMoment SHARED | yes | no | eligible |
| HeartMoment PRIVATE | no | yes | never eligible, including for owner |
| Wish | yes | no | eligible in recent shared |
| Plan | yes | no | eligible in recent/upcoming as applicable |
| Place | yes | no | eligible in recent shared; coordinates not projected |
| Chapter | yes | no | eligible in recent shared |
| Collection | yes | no | eligible in recent shared |
| PrivateNote | no | yes | never eligible |
| GiftIdea | no | yes | never eligible |
| PrivateCollection / Item | no | yes | never eligible |

## 5. Indirect Dashboard leakage tests

Tests must create private data that would sort before/after visible shared data if it were considered and prove it has no effect on:

- `recentShared` item count;
- `recentShared` ordering;
- retrospective existence;
- retrospective candidate choice;
- upcoming item count/order;
- top-level section presence;
- response timestamps or counts if later added.

Creating more private data for one partner must not change the other partner's Dashboard response except for unrelated concurrent shared changes.

## 6. Retrospective tests

Required cases:

- no matching historical shared content -> section absent;
- exact month/day Memory match;
- exact month/day Milestone match;
- exact month/day SHARED HeartMoment match;
- multiple prior years -> most recent prior year wins;
- equal-year tie -> deterministic type/ID order;
- PRIVATE HeartMoment exact date match -> ignored for both Dashboard callers;
- Cross-Tenant exact date match -> ignored;
- February 29 on non-February-29 current date -> no remapping.

## 7. Upcoming tests

Required cases:

- future PLANNED Plan included;
- IDEA and COMPLETED Plans excluded;
- past planned start excluded;
- repeating ImportantDate produces next occurrence;
- non-repeating past ImportantDate excluded;
- RelatedPerson birthday with unknown year preserves unknown-year semantics;
- relationship anniversary derives only from shared SpaceProfile data;
- caller timezone controls date-only `today` boundary;
- same upcoming instant ties by type/ID deterministically;
- Cross-Tenant date rows excluded.

## 8. Recent shared tests

Required cases:

- each approved shared root type may appear;
- creation time, not update time, drives ordering;
- editing/reordering an old resource does not make it newest;
- Comments and CollectionItems are not top-level recent cards;
- owner-only resources are excluded;
- PRIVATE HeartMoment excluded;
- section limit is deterministic.

## 9. Search index consistency tests

Required PostgreSQL evidence:

- existing row is searchable after index migration;
- inserted row is searchable after commit;
- updated searchable text replaces prior lexemes after commit;
- rolled-back insert/update is not reflected;
- deleted row disappears;
- HeartMoment SHARED -> PRIVATE becomes unavailable to partner Search in the same committed transition;
- private owner Search remains allowed after that transition;
- query plans for representative indexed target tables use the intended GIN search path or otherwise demonstrate bounded index-backed execution on representative data.

## 10. Observability tests

At least one failure/validation path must prove that logs do not contain:

- Search query text;
- Memory/PrivateNote/GiftIdea protected text;
- Dashboard recognition text;
- coordinates;
- private resource payloads.

Stable error codes and request/correlation identifiers remain allowed.

## 11. API and generated-client evidence

Each runtime slice must:

- update `backend/openapi.json` through the normal authoritative generation path;
- regenerate TypeScript/Kotlin API clients;
- keep generated clients runtime-neutral according to existing gates;
- prove new DTO enums/optional fields match the published contract;
- avoid hardcoded user-visible English/German backend strings as client UI contracts.

## 12. Performance/resource evidence

Search S1 must include representative PostgreSQL execution evidence for:

- bounded `limit`;
- GIN-backed FTS target query;
- multi-target union pagination without unbounded materialization where practical;
- no N+1 payload loading for result projection.

Dashboard S2 must include evidence for:

- bounded section sizes;
- bounded query count or documented query plan;
- no per-item follow-up query loops;
- no accidental full-space table scan for recent/upcoming/retrospective sections where appropriate indexes exist or should be added.

Performance optimization must not replace authorization predicates or move Privacy filtering to the client.
