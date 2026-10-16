# M2 Technical Readiness Package

**Status:** implementation preparation; not a replacement for OpenAPI or the Master Specification  
**Version:** 1.0  
**As of:** August 24, 2026

This package prepares **M2 – Memory Core** technically without interfering with the ongoing Foundation Issues #5–#11. It contains planning files only. Runtime code, Auth/Session, transport, CI, project scaffolding, OpenAPI, and Profiles remain untouched.

## Goal

After the M0/M1 gates are complete, M2 should be implementable in reviewable vertical slices without reopening foundational decisions:

```text
Memory + Media + HeartMoment + Milestone + Comment
                         │
                         └── Story Read Model
```

## Contents

- [Domain Model](./DOMAIN-MODEL.md) – entities, invariants, Privacy, and Events
- [API Design](./API-DESIGN.md) – operations, DTOs, errors, and Concurrency as an OpenAPI template
- [Media Pipeline](./MEDIA-PIPELINE.md) – upload, validation, Storage, and authorized reads
- [Security Test Matrix](./SECURITY-TEST-MATRIX.md) – Tenant, owner-only, Media, and leak tests
- [Delivery Plan](./DELIVERY-PLAN.md) – vertical slices and issue-ready work packages
- [Decision Log](./DECISION-LOG.md) – M2 decisions to close before code begins
- [Architecture diagram](./m2-architecture.svg) – human-readable overview

## Binding sources

1. [Clean-Room Master Specification](../../specification/CLEAN-ROOM-MASTER-SPEC.md), especially sections 14–21.
2. [Product Specification](../../specification/PRODUCT-SPEC.md).
3. [Security invariants](../SECURITY.md).
4. [Architecture](../ARCHITECTURE.md).
5. The versioned OpenAPI contract current for M2.

If sources conflict, the higher-ranked source applies. This package must not silently decide a domain gap.

## M2 scope

| Domain | M2 content |
|---|---|
| Memory | CRUD, author, domain date, multiple Media, Comments, Story |
| HeartMoment | text, emotion, `SHARED`/`PRIVATE`, optional Attachment, Story only when shared |
| Milestone | dedicated model, CRUD, Story, later Chapter/Recap |
| Attachment | MediaStore abstraction, upload lifecycle, validation, safe read URL/route |
| Comment | controlled targets, shared content only, Notification Event |
| Story | derived Read Model, filters, Search, ordering, Cursor Pagination |

## Not in M2

- real end-to-end encryption,
- Offline Write Sync,
- Chapter/Place implementation,
- Year Recap,
- public Share Links,
- AI image analysis or automatic content analysis,
- Shopping, Discovery, Location, and further Provider integrations,
- freely polymorphic Comments on arbitrary tables.

## Start conditions

M2 implementation starts only when:

- open Foundation/M1 Security gates are closed,
- owner-only Authorization exists server-side,
- the OpenAPI contract is versioned and contract-testable,
- ProtectedPayload boundaries can be technically enforced on sensitive models,
- Web/Android foundations exist for the planned client slices,
- decisions with priority `BLOCKING` in the Decision Log are closed.

## Definition of Ready

- [ ] every model has confirmed fields, Privacy class, and write permissions,
- [ ] every operation has Request, Response, error codes, and a Concurrency rule,
- [ ] Story filtering excludes private content server-side,
- [ ] Media limits and allowlist are decided,
- [ ] Attachment lifecycle and orphan Cleanup are specified,
- [ ] Domain Events contain no unnecessary plaintext payloads,
- [ ] Tenant/owner-only/Media test matrix is accepted,
- [ ] Delivery slices have unambiguous dependencies,
- [ ] no M2 statement claims that real E2EE exists.

## Working rule

A slice is complete only when Domain model, migration, Service, Authorization, API/OpenAPI, error codes, Unit/Integration/Cross-Tenant tests, Privacy tests, Export impact, client behavior, and documentation are satisfied together. A single working endpoint or screen is not sufficient.
