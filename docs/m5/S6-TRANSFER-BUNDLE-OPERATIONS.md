# M5 S6 - Transfer Bundle Operations

- **Status:** IMPLEMENTED
- **Date:** 2026-08-31
- **Owning issue:** #345
- **Decision source:** `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`

This document describes the operational behavior of the versioned Transfer
Bundle runtime. It applies equally to eimir. Cloud and Self-Hosted. The
runtime has no hidden managed-service dependency: it reuses the configured
PostgreSQL Job/Worker queue and the configured private `MediaStore`.

## Storage lifecycle

Transfer artifacts are private server-side objects. They are never public URLs
and a transfer ID is never a bearer credential. Every API access is authorized
again against Account + Space + active membership + transfer creator.

The configured `MediaStore` contains temporary artifacts under these logical
keys:

```text
spaces/{spaceId}/transfers/exports/{exportId}/bundle.zip
spaces/{spaceId}/transfers/imports/{importId}/bundle.zip
```

Export assembly uses a Python `SpooledTemporaryFile`: up to 16 MiB remains in
worker memory and larger archives may spill into the worker host's operating
system temporary directory while the ZIP is being assembled. The completed
archive is then copied into the configured private `MediaStore`; the spool is
closed by the worker after the copy attempt. Operators therefore need normal
writable OS temporary space for the worker in addition to `MediaStore`
capacity.

Import uploads are staged directly in the private `MediaStore`. Domain data is
not mutated during staging or validation. Media restored by an apply receives
new target IDs and remains unreachable through the application until the
matching database rows commit.

## Member mapping

`accounts.json` carries neutral source member IDs and may carry a verified
email as a mapping aid. A verified email is not required: OIDC accounts without
an email claim and local accounts without a verified address remain portable.

PERSONAL exports additionally include the caller's `personalAppearance.appIconId`
in `accounts.json` (#1307). SHARED exports omit this owner-only selection. This
is export-only settings metadata: additive import ignores it and never activates
a paid icon or changes installed-app metadata from an untrusted bundle. Existing
member mapping and source-member authorization remain unchanged.

New v1 exports also record `exportedBySourceId` in `manifest.json`. During
import that source member must map to the currently authenticated target member.
For a normal eimir. couple Space, which is limited to at most two active
members, one remaining unmapped source member can then be mapped uniquely to
one remaining active target member. Verified-email matches are still used as
additional deterministic evidence and conflicting hints fail closed with a
stable member-mapping error.

For PERSONAL bundles, `personalOwnerSourceId` must map to the authenticated
requester and, when `exportedBySourceId` is present, both identifiers must
refer to the same source member. Source IDs and mapping hints are never treated
as authorization credentials; target Account + Space membership is rechecked
before validation and again before apply.

Existing target `SpaceProfile` and `PartnerProfile` singleton rows are reused
during additive apply. Source profile IDs are remapped to those existing target
IDs so dependent portable rows can keep valid relations without violating the
target Space's uniqueness constraints.

## Retention and cleanup

Exports and staged imports receive an `expires_at` timestamp 24 hours after
creation. The Transfer cleanup job is kept scheduled by the worker and runs on
a 30-minute cadence.

Cleanup is idempotent:

- expired export archives are deleted and the export becomes `EXPIRED`;
- expired non-completed import archives are deleted and the import becomes
  `EXPIRED`;
- after a successful import apply, the staged source archive is deleted
  immediately and its recorded artifact size becomes zero;
- if that immediate post-apply delete fails, the completed import keeps a
  non-zero artifact size and scheduled cleanup retries deletion once the
  24-hour retention boundary is reached;
- repeated cleanup does not recreate, expose, or re-apply a transfer.

The local `MediaStore` implementation uses missing-safe deletion. Other
providers must preserve the same logical idempotency contract.

## Failure and retry behavior

Transfer work is asynchronous and survives the initiating HTTP connection.
The worker rechecks active membership before export generation, import
validation, and import apply.

Storage availability failures (`OSError`) during export, validation, apply, or
scheduled cleanup are classified as retryable Job failures. The existing Job
retry policy handles them; no second queue or provider-specific retry system is
introduced.

Validation and policy failures are terminal for that transfer attempt and use
stable `TRANSFER_*` error codes. Examples include unsupported format versions,
unsafe ZIP entries, resource-limit violations, checksum mismatches, invalid
relations, invalid privacy scope, and invalid member mapping. A failed
validation never reaches Domain apply.

Export generation uses a dedicated PostgreSQL `REPEATABLE READ` transaction so
all exported Domain rows come from one deterministic snapshot. Import apply is
additive, revalidates the staged bundle immediately before mutation, maps
source IDs to new target IDs, and executes inside the worker transaction. A
failed apply must not leave a readable partial Domain graph. Media objects
written before a database failure are deleted on the apply error path.

## Self-Hosted capacity and monitoring

Self-Hosted operators should size three resources for portability workloads:

1. private `MediaStore` capacity for temporary ZIPs plus restored media;
2. worker temporary space for export ZIP assembly that spills above 16 MiB;
3. PostgreSQL/worker capacity for asynchronous validation and apply jobs.

The archive reader and upload path enforce compressed/uncompressed size,
member-count, JSON-entry, path, duplicate-entry, compression-ratio, encryption,
symlink/device, checksum, and relation/privacy limits before Domain apply.
These are abuse/safety controls, not commercial quotas.

Operational logs contain technical state such as transfer ID, scope, size or
media count and stable error codes. Bundle content, private titles, credentials,
storage keys, and signed URLs must not be logged.

When investigating a stuck transfer, check the corresponding PostgreSQL Job
state and worker logs first, then verify private `MediaStore` read/write/delete
availability and worker temporary-space capacity. Do not bypass authorization,
ZIP validation, checksum validation, privacy filtering, or cleanup gates as a
recovery shortcut.
