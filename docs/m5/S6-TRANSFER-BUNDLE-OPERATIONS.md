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

Export workers assemble v1 archives in an anonymous Linux memfd or in
process memory on platforms without memfd. The writer checks entry, JSON,
total, compression and archive-size limits against the importer before
publishing a READY artifact. An oversized v1 export fails as
`TRANSFER_TOO_LARGE`. V1 has no multipart format.

The API streams each import into a spool. The configured private MediaStore receives the
completed stream and the database transaction schedules validation. A failed
transaction removes its object. Apply uses new target IDs, visible only once
the corresponding rows commit.

### Multipart format for larger collections

A future v2 bundle set uses a versioned index and numbered, individually bounded
parts. The index carries a random set ID, scope, source-space ID, total number
of parts, byte lengths and a SHA-256 digest per part. Each part carries the
same set ID and its sequence number. Domain records have stable source IDs
across parts. Media objects exceeding one part use numbered segments with a
declared full length and digest. An importer must validate every part and the
reassembled references before scheduling one apply transaction for the set.
Missing, duplicate or mismatched parts leave the set incomplete. Retry reuses
the same destination ID map. All staging objects inherit the same creator,
scope, expiry and deletion lifecycle as individual v1 transfers. The current
API accepts format v1 only.

## Member mapping

`accounts.json` carries neutral source member IDs and may carry a verified
email as a mapping aid. A verified email is not required: OIDC accounts without
an email claim and local accounts without a verified address remain portable.

PERSONAL exports additionally include the caller's `personalAppearance.appIconId`
in `accounts.json` (#1307), together with the other personal appearance choices
such as `memoryWorld` (#2283, only when chosen). SHARED exports omit these
owner-only selections. This is export-only settings metadata: additive import
ignores it and never activates a paid icon or other paid appearance choice or
changes installed-app metadata from an untrusted bundle. Existing
member mapping and source-member authorization remain unchanged.

PERSONAL exports also include `personalSettings` (the caller's Account-wide
choices under `account` and their choices in the exported Space under `space`,
with `schemaVersion`). SHARED exports omit it. Like `personalAppearance` it is
export-only: additive import ignores it.

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

### Skipped videos (#2141)

An import applied without its videos (`mode: WITHOUT_VIDEOS`) remembers each
skipped video in `transfer_skipped_videos`: the imported Memory or HeartMoment,
the owner, the gallery position, the source attachment ID and the manifest
checksum. The rows hold no content and are not part of an export. They are
removed when the video is recovered (`mode: VIDEOS_ONLY` with the same file),
when a member dismisses them, with their Memory or HeartMoment, by account
deletion of their owner or of the member who imported them, and by final Space
retention. Recovery matches the source ID and the checksum, so a changed file
recovers nothing.

Only the member who imported the bundle (`imported_by`) sees, recovers and
dismisses the remembered videos (Product Owner decision P7). The partner's
`getTransferSkippedVideos` reports nothing, their `dismissTransferSkippedVideos`
answers `404`, and their import of the same file offers nothing to recover
(`409 TRANSFER_NOTHING_TO_RECOVER`). `owner_id` stays the owner a recovered video
gets, which in a shared bundle is often the partner.

### Repeated imports never duplicate (#2141)

Importing the same file again adds only what the Space does not have. Each
source record and media item lands on a stable target ID derived from the
target Space and its source ID (a UUIDv7 that keeps the source's time prefix),
so a later import of the same file recognises what the earlier one added. For a
file exported from the same Space, the original row counts as present. A row
counts as present only when its owner matches what the file says, so a crafted
file cannot claim a partner's private row.

- Present records stay exactly as they are: they are never overwritten. A
  present Memory, HeartMoment or Plan keeps its current gallery, and a present
  list (Collection or private collection) keeps its current items and order.
- A record deleted since the earlier import comes back, once, under the same
  ID. Its photos are reused while they still exist; an attachment that is being
  deleted is left out and cut out like a skipped video.
- Media are copied only when a record the import adds refers to them.
- Any other unique conflict with an existing row (a link, a nickname, a
  reminder offset) keeps the existing row, and rows that depend on a row that
  was not added are left out too.
- The preview reports `alreadyPresentCount`. `videoCount`, `videoBytes` and
  `videosNeedPro` count only the videos the import would add, so a file whose
  videos the Space already has does not need Pro again. Skipped videos of a
  record that is already present stay recoverable through `VIDEOS_ONLY`.

Provenance does not survive a second hop: a file exported from a Space that
itself received the content by import carries that Space's IDs, which are new
to the original Space.

### Cloud storage quota (#2141)

On eimir. Cloud an import must fit the Space's storage quota (Freemium matrix,
"Cloud storage quota"); Self-Hosted is unmetered. What counts is the media the
import would actually add, at their size: media the Space already has (see
above) and thumbnails count nothing, so a repeated import of the same file needs
no room.

- The preview reports `storageNeeded` and `storageNeededWithoutVideos`, both
  fixed at validation, and reads `storageAvailable`, `storageQuotaExceeded` and
  `storageFitsWithoutVideos` live while the import is ready to apply.
  `recoverableVideoBytes` is what `VIDEOS_ONLY` would add.
- Applying refuses the whole bundle with `413 STORAGE_QUOTA_EXCEEDED` when it
  does not fit ("free up space or get Premium"), or with
  `413 STORAGE_QUOTA_EXCEEDED_FITS_WITHOUT_VIDEOS` when applying with
  `mode: WITHOUT_VIDEOS` would fit. Nothing changes and the import stays ready
  to apply.
- The apply job checks again under the Space's storage lock with exactly what it
  is about to add, after leaving out what the Space already has. If an upload
  took the room meanwhile, nothing is written and the import returns to ready to
  apply with that code as `errorCode`, so the member can free space and apply the
  same file again without uploading it once more.
- Recovering skipped videos (`VIDEOS_ONLY`) is checked the same way: the
  remembered videos found in the file must fit, or none is added.
- A Space over its quota, for example after a downgrade, keeps everything; only
  new bytes are refused.

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
source IDs to stable target IDs (see above), and executes inside the worker transaction. A
failed apply must not leave a readable partial Domain graph. Media objects
written before a database failure are deleted on the apply error path.

Bundles are not signed, so media metadata and bytes are untrusted. Validation
checks every photo with the upload decoder (declared type, pixels, dimensions,
size and a JPEG thumbnail of at most 512 px) and checks PDFs for PDF structure.
Photos keep their exact bytes, capture time and orientation, because a second
lossy encode would degrade every restore. Audio and video enter `VALIDATING`
and run the upload worker job. Photo and PDF checks need no media processor and
no Pro capability; restore stays non-paywallable.

## Self-Hosted capacity and monitoring

Self-Hosted operators should size three resources for portability workloads:

1. private `MediaStore` capacity for temporary ZIPs plus restored media;
2. worker temporary space for export ZIP assembly that spills above 16 MiB;
3. PostgreSQL/worker capacity for asynchronous validation and apply jobs.

The archive reader and upload path enforce compressed/uncompressed size,
member-count, JSON-entry, path, duplicate-entry, compression-ratio, encryption,
symlink/device, checksum, and relation/privacy limits before Domain apply.
These are abuse/safety controls, not commercial quotas.

The API streams each import into a spool. Up to 16 MiB stays in process
memory. Larger uploads roll into the API's private `/tmp` tmpfs in both
Compose profiles. The same mount protects temporary files used by regular
media uploads. The API allows transfer bodies up to 512 MiB. The Web
container's Nginx has a matching location, but only the local loopback test
uses that hop: in production `/api/` reaches the API directly through the TLS
reverse proxy, which must itself allow 512 MiB, must not buffer request bodies
and needs timeouts that cover a slow upload (see
[Request bodies and timeouts](../ARCANE.md#request-bodies-and-timeouts)). A
proxy refusal is an HTML `413` without an eimir. problem code, not
`TRANSFER_TOO_LARGE`; the Web UI names both as a file that is too large. Size
`EIMIR_API_TMPFS_SIZE` (default 1 GiB) and container memory for the number
of simultaneous uploads. Disable swap or use encrypted swap for plaintext
memory pages. A full mount fails the upload. Request cleanup closes its spool
on cancellation or failure.

Operational logs contain technical state such as transfer ID, scope, size or
media count and stable error codes. Bundle content, private titles, credentials,
storage keys, and signed URLs must not be logged.

When investigating a stuck transfer, check the corresponding PostgreSQL Job
state and worker logs first, then verify private `MediaStore` read/write/delete
availability and worker temporary-space capacity. Do not bypass authorization,
ZIP validation, checksum validation, privacy filtering, or cleanup gates as a
recovery shortcut.
