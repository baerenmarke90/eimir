# M2 Project Control

**As of:** August 26, 2026  
**Status:** M2 complete; G2 passed; M3 released  
**Current `main`:** `3a7adc28643ef00de51db678ec77a82be652283d` (merge of #170)

## Binding gate state

The dated [final G2 Gate Review](../reviews/2026-08-26-g2-final-gate-review.md) is the current gate decision:

- **G2: PASSED**
- **M2: COMPLETE**
- **M3: RELEASED**
- M3-S0 readiness is complete; all M3-D01 through M3-D32 are `DECIDED`
- M3 runtime slices may start according to `docs/m3/README.md` and `docs/m3/DELIVERY-PLAN.md` once the respective production REST/OpenAPI contract is concretely contract-testable
- public/Managed exposure is not yet released; #59 and #60 remain Pre-Exposure gates
- #25 remains Repository Hardening

Older dated reviews remain historical snapshots and are not rewritten. In particular, the earlier G2 interim review remains unchanged as evidence of the then-incomplete gate state.

## Milestone boundaries

### M2 – Memories / Story Alpha

M2 delivers Domain and API for Attachment, Memory, HeartMoment, Milestone, Comment, and Story plus **minimal vertical reference flows** on Web and Android. These reference flows prove the critical end-to-end contract; they do not yet provide full client parity.

The minimum G2 evidence was fully delivered:

- M2 Domain and versioned API contract complete for the G2 scope; Attachment/Media is limited to images,
- Tenant/owner-only/Media Security gates green,
- real critical Memory/Media/Story flow on Web and Android validated against the same eimir. stack,
- no high/critical open M2 Security/Privacy/data-integrity gap,
- current CI, Secret Scan, Supply Chain, and Deployment gates green.

Manual Accessibility acceptance is deliberately **no longer a G2 blocker**. It was not claimed as passed and remains part of M5/G4 as final client/release QA.

Global full-text Search is not part of G2. Story requires `type`, `year`, `order`, `cursor`, and `limit` for G2; global Search belongs to M4-A.

### M3 – Planning & Private Area

Wishes, Plans, Places, Chapters, Collections, and Private Area. Domain-level S0 readiness is complete; all M3-D01 through M3-D32 are `DECIDED`. The binding next source is the [M3 Technical Readiness Package](../m3/README.md) with the [M3 Delivery Plan](../m3/DELIVERY-PLAN.md).

Private Area is a Security Domain with hard `OWNER_ONLY` semantics, not merely a visual folder. Runtime starts slice by slice and only with an unambiguously contract-testable production REST/OpenAPI contract.

### M4 – Engagement

The milestone remains one coherent domain scope but is internally split into three deliverable slices:

- **M4-A:** Search + Dashboard Read Models
- **M4-B:** Activity + Notifications
- **M4-C:** Reminders + Rules

### M5 – Client Completion & Parity

M5 completes Web and Android: complete Domain integration, navigation, Deep Links, Read Cache, Export/Import, Accessibility, Performance, and systematic feature parity. The M2 reference flows are completed to production readiness here; the deferred manual Accessibility acceptance takes place here.

### M6–M9

M6 Rich Features, M7 Integrations, M8 optional Context, and M9 Productization remain in their existing order. M9 is the launch gate for Managed/Self-Hosted operation including Pre-Exposure hardening, Backup/Restore, Update/Rollback, Retention/deletion, Monitoring, Entitlements, and support readiness.

## Privacy terminology

- `SHARED` / `PRIVATE`: public domain values where a resource exposes a user visibility choice.
- `SPACE_SHARED` / `OWNER_ONLY`: internal Authorization/Privacy classes.
- Clients do not redundantly write `privacyClass` as a second source of truth.
- `PRIVATE` is enforced server-side as `OWNER_ONLY`; client filters are not a security boundary.

## M2-S0 — complete

1. **#67 Planning** — synchronized project control to G1=passed and the milestone boundaries defined here.
2. **#68 Domain/Privacy** — closed Memory, Comment, HeartMoment, and Event/Delete decisions.
3. **#69 Media** — closed Attachment relation, limits, validation, Retention, upload transport, and orphan rules.
4. **#70 API** — moved routes, DTOs, error codes, Concurrency, Pagination, and Story sorting into the versioned contract.
5. **#78 Media metadata** — decided M2-D14 (strip on ingest) and M2-D15 (one derived variant, no Transcoding). Both were classified as `BEFORE_CLIENTS`, but affected the ingest path and were therefore promoted to `BLOCKING`.
6. **#85 Media sequence** — M2-D23: images first with Pillow and pillow-heif. Video was initially planned as its own slice and has since been moved outside M2/G2 to Future Backlog #88.

The `BLOCKING` decisions relevant to M2 were closed before their respective runtime code. `BEFORE_CLIENTS` items for Notification Preview, Export/Backup, Client Cache, and Search Index are handled in their respective later milestones.

During implementation, four additional `BLOCKING` decisions emerged that became visible only in code or in the next slice. All were closed before the code relying on them, as required by the runtime start rule:

- **M2-D23** (#85) — order and parsers for Media processing.
- **M2-D24** (#79) — read access to unbound Attachments.
- **M2-D25** (#94) — write permissions for Milestone.
- **M2-D22** (#104) — owner view for private HeartMoments. It was classified as `BEFORE_CLIENTS`, but shapes the Story route and was therefore promoted to `BLOCKING` before S7. Superseded post-M2 by #1021 (`/timeline` became viewer-authorized instead of a separate owner view); see `DECISION-LOG.md`.

## Runtime start rule

A runtime slice starts only when **all BLOCKING Decisions relevant to exactly that slice** are `DECIDED` and its versioned OpenAPI contract is available in contract-testable form. Runtime code does not silently answer an open question: when a slice encounters an unresolved question, it is closed as a Decision Log entry rather than answered in code.

This rule also applies to M3 and later milestones. Completion of a milestone gate does not replace slice-specific contract and Reuse review.

## M2 delivery state

### Delivered

- #71 — Memory CRUD without media (PR #77). Validates M2 migration style, ProtectedPayload boundary, Tenant Guard, author rule, Optimistic Concurrency, and signed Keyset Cursor on a media-free surface.
- #80 — HeartMoment with owner-only Privacy (PR #84). First type with a real user visibility choice; `SHARED -> PRIVATE` as a dedicated atomic operation, emotion as ProtectedPayload.
- #79 — Attachment lifecycle for images (PR #89). State machine, LocalMediaStore, asynchronous validation with stripping per M2-D14 and Thumbnail per M2-D15, authorized reads, Retention, and Cleanup. Video remains fail-closed and is tracked outside M2/G2 in #88.
- #90 — Bind Attachments to Memory and HeartMoment (PR #93). `MemoryAttachment` with stable `position`, HeartMoment with at most one Attachment, atomic Bind/Unbind inside the binding window from M2-D20, no Cross-Space or multiple binding per M2-D03.
- #94 — Milestone Domain and API (PR #95). Dedicated model instead of a type flag on Memory; M2-D25 preserves the author rule from M2-D01 here as well.
- #97 — Comments, Outbox, and Notification Hook (PR #98). Create/List nested under the parent, Update/Delete space-scoped, enumerated targets, atomic Outbox entry, and idempotent Retry. Closes the commitment from #80.
- #87 — S3-compatible MediaStore adapter (PR #100). Presigned Upload and Read URL with TTLs from M2-D13, against the same contract test as the local adapter.
- #113 — Story Read Model and `/timeline` (PR #114). Derived Timeline over Memory, Milestone, and HeartMoment; sort key `(effectiveDate, createdAt, kindRank, id)` and Keyset Cursor per M2-D08. No persisted Read Model. At the time, private HeartMoments were never Story Items, including for their owner (M2-D22); #1021 later superseded that rule and made `/timeline` viewer-authorized, so an account's own private HeartMoment is now part of their own Timeline.
- S8 — thin Web/Android reference flows: delivered.
- #144 — real Web/Android G2 E2E evidence against API, Worker, PostgreSQL, and LocalMediaStore: delivered.
- #147 / PR #170 — final G2 Gate Review: **G2: PASSED**.

### Future backlog outside M2/G2

- #88 — `Future: Video uploads and poster frames`

#88 is not implemented now. Prototype #109 was deliberately closed without merge because of a production image of roughly 755 MiB and the additional ffmpeg operational, Supply Chain, and Security burden. `main` remains fail-closed for MP4 and QuickTime. Resuming this work requires a new Architecture and Security decision that in particular evaluates a separate optional processing model instead of an inflated shared image.

### Commitment from #80 — fulfilled

The atomic Comment Delete required by M2-D07 when transitioning `SHARED -> PRIVATE` depended on `_delete_dependent_comments` and could not be demonstrated without Comments. With #97, the cascade is wired — additionally protected by the mapper listeners in `comments/cascades.py` — and demonstrated in `test_shared_to_private_loescht_comments_und_resurrected_nichts`. This follow-up item is therefore closed.

## G2 — complete

The binding decision source is the [final G2 Gate Review](../reviews/2026-08-26-g2-final-gate-review.md). It explicitly evaluates G2 as **PASSED**.

M2 is therefore formally complete. M3 is the released next milestone. The first planned runtime slice is M3-S1 **Wish Foundation**; its contract and verification are governed by the M3 package.

## Active status sources

The living status sources are synchronized to the same state:

- [`README.md`](../../README.md)
- [`docs/ROADMAP.md`](../ROADMAP.md)
- [`docs/IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md)
- [`docs/m2/PROJECT-CONTROL.md`](./PROJECT-CONTROL.md)

Current M3 project control:

- [`docs/m3/README.md`](../m3/README.md)
- [`docs/m3/DELIVERY-PLAN.md`](../m3/DELIVERY-PLAN.md)

Historical reviews deliberately remain unchanged and may therefore contain earlier gate states.
