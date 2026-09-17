# Issue #971 Slice 2 Discover query-plan validation

**Validated:** 2026-09-17
**Database:** PostgreSQL 17
**Scope:** canonical backend Discover candidate queries only

## Synthetic archive

The validation database was migrated from empty to revision `0057` and populated with one
large Space containing:

- 30,000 Memories;
- 30,000 HeartMoments, including 1,500 `OWNER_ONLY` rows;
- 30,000 Milestones;
- 6,000 ready image Attachments bound to Memories;
- 10,000 current-viewer Story-view aggregates;
- 7,500 active-partner Story-view aggregates.

Tables were analyzed before measurement. The measurement called the production
`generate_candidates()` path for the same viewer, Space, local day, and algorithm version used
by a real request. SQLAlchemy's executed SQL and bound parameters were captured, then replayed
through `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`.

The final pass executed 33 bounded candidate/partner queries in about 300 ms on the local
development database and returned 119 small descriptors to the selector. No Story DTO or
ProtectedPayload was materialized by candidate generation. Every archive-facing statement
contained an explicit `LIMIT`; the final application-memory population is therefore bounded by
the named pool constants rather than total archive size.

## Representative final plans

Times below are local single-run execution times and are evidence about plan shape, not a
service-level latency promise.

| Candidate family | Source | SQL limit / rows | Representative plan | Execution |
|---|---|---:|---|---:|
| Exact / near date | Memory | 12 / 12 | `Limit -> Sort -> Seq Scan` | 11.800 ms |
| Exact / near date | HeartMoment | 12 / 12 | `Limit -> Sort -> Seq Scan` | 14.444 ms |
| Exact / near date | Milestone | 12 / 12 | `Limit -> Sort -> Seq Scan` | 12.389 ms |
| Long unseen / own recency | Memory | 12 / 12 | `Limit -> Sort -> Hash Join` | 19.368 ms |
| Long unseen / own recency | HeartMoment | 12 / 12 | `Limit -> Sort -> Hash Join` | 11.766 ms |
| Long unseen / own recency | Milestone | 12 / 12 | `Limit -> Sort -> Hash Join` | 12.368 ms |
| Early history | Memory | 6 / 6 | `Limit -> Sort -> Seq Scan` | 8.072 ms |
| Early history | HeartMoment | 6 / 6 | `Limit -> Incremental Sort -> Index Scan` | 0.079 ms |
| Early history | Milestone | 6 / 6 | `Limit -> Incremental Sort -> Index Scan` | 0.096 ms |
| Photo-backed Memory | Memory | 12 / 12 | `Limit -> Sort -> Hash Join` | 14.260 ms |
| Serendipity temporal window | Memory | 2 / 2 | `Limit -> Sort -> Seq Scan` | 7.429 ms |
| Serendipity temporal window | HeartMoment | 2 / 0 | `Limit -> Incremental Sort -> Index Scan` | 0.075 ms |
| Serendipity temporal window | Milestone | 2 / 0 | `Limit -> Incremental Sort -> Index Scan` | 0.105 ms |
| Partner affinity | Memory | 6 / 6 | `Limit -> Sort -> Hash Join` | 18.141 ms |
| Partner affinity | HeartMoment | 6 / 0 | `Limit -> Sort -> Nested Loop` | 0.058 ms |
| Partner affinity | Milestone | 6 / 0 | `Limit -> Sort -> Nested Loop` | 0.055 ms |

The exact/near family intentionally compares recurring month/day values across prior years. A
normal `happened_on` B-tree cannot satisfy that extraction predicate, so adding another ordinary
date index would not improve that plan. The small bounded output is sorted in PostgreSQL; only
the selected descriptors cross into application memory.

Long-unseen and affinity ranking deliberately order by low-resolution aggregate state. Their
plans scan or hash the relevant authorized/aggregate subsets in PostgreSQL and still return only
12 or 6 descriptors per source. Adding broad score/expression indexes for these local 12–19 ms
plans was not justified.

## Index decision

The first pass showed HeartMoment early-history and temporal-window queries using
`Limit -> Sort -> Seq Scan` at approximately 4–10 ms because HeartMoment lacked the
`(space_id, happened_on)` index already present for Memory and Milestone. The final query shape
uses the non-null HeartMoment/Milestone `happened_on` column directly rather than wrapping it in
an unnecessary `coalesce`.

Migration `0057` therefore adds only:

```text
ix_heart_moments_space_id_happened_on (space_id, happened_on)
```

Afterward, the representative HeartMoment early-history plan became
`Limit -> Incremental Sort -> Index Scan` at 0.079 ms, and the temporal-window plan became the
same shape at 0.075 ms. No additional speculative index was added.

## Privacy and boundedness observations

- Every source statement begins from the canonical authorization predicate.
- HeartMoment statements add `SPACE_SHARED` before limiting or counting; the 1,500 synthetic
  `OWNER_ONLY` rows affected neither result count nor fallback shape.
- Affinity joins only the other current `ACTIVE` member's aggregate rows back into the already
  authorized Story universe.
- Candidate statements project only identity, effective date, creation time, and the narrowly
  required own/partner aggregate columns. They never project Memory/HeartMoment/Milestone
  protected payloads or HeartMoment emotion.
- Final protected Story projection occurs only for the surviving snapshotted references after
  live authorization revalidation.
