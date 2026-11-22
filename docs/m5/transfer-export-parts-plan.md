# Transfer export: named failures and part sets for large Spaces

- **Status:** IN PROGRESS. Slice A1 is delivered (#2178 merged 2026-11-22, #2190 merged 2026-11-22); the logging PR #2171 is open as a draft; slices C0 to C4 are planned. Slices are delivered one PR at a time, each with its own Product Owner go.
- **Date:** 2026-11-22 (synchronized with `main` 27abe8aa7)
- **Owning issue:** #2173
- **Related:** #2171 (worker logging and size-limit test), #2141 (Cloud storage quota, skipped-video recovery), #2150 (re-import adds only what is missing)
- **Binding sources:** `docs/FREEMIUM-FEATURE-MATRIX.md` (row "Essential data portability / Transfer Bundle": Non-paywallable), `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`, `docs/m5/S6-TRANSFER-BUNDLE-OPERATIONS.md`

## 1. Problem

A Transfer export of a Space with more than about 512 MiB of media fails. Observed on eimir-test (Cloud, 2026-11-22): 599.9 MB used, export `FAILED`, job listed as succeeded, nothing in the worker log.

Cause: `MAX_COMPRESSED_BYTES = 512 MiB` (`backend/src/eimir/transfer/archive.py`) is enforced by `ExportWriter` while writing and again by `validate_zip`. Media does not compress, so the bundle is as large as the media. The Cloud quota (5 GB Free, 50 GB Premium) does not count Transfer archives and is unrelated to this limit. The export and import limits are one contract (an export must be importable again), so a single-file raise would have to move the writer, the reader and the API upload together.

Related limits any solution must respect:

| Limit | Value | Consequence |
| --- | --- | --- |
| Compressed bundle (writer, reader, API upload) | 512 MiB | the limit hit here |
| Uncompressed total | 2 GiB | next wall |
| Entries | 4096 | every media object is two entries (original and thumbnail): about 2,000 photos regardless of size |
| Single entry | 512 MiB | not an issue (a video is at most 250 MiB) |
| Export assembly | whole archive in an anonymous memfd (RAM); `cloud-worker` has no `mem_limit` | memory grows 1:1 with the bundle size |
| Import upload | `SpooledTemporaryFile` into `/tmp`, a 1 GiB RAM-backed tmpfs in Cloud | import is physically bounded near 1 GiB |

The matrix promises that the right to leave with one's data does not depend on a tier, and that existing media stays exportable after a downgrade. For Free Spaces between about 500 MB and the 5 GB quota this is not met.

## 2. Decision (Product Owner, 2026-11-22)

Do both A and C, so that failures are also named (Product Owner, in German; paraphrased here).

- **A:** the Web UI names every Transfer failure with its own German text instead of the generic failure text (`transfer.genericFailure`).
- **C:** a large export is split into several bundle parts. Each part stays within today's limits. Import takes the parts in any order and stays additive.

Raising the single-file limits, a records-only export as a separate product, and doing nothing were considered and not chosen (see section 6).

## 3. Slice A1: name every Transfer failure (Web) - delivered

**Delivered** in #2178 (merged as `f71f965c8`) and #2190 (merged as `7a410e4bf`, #2188). The Product Owner approved the wording and the mock-up on 2026-11-22: all proposed rows as written, one shared text for the four file errors (manifest invalid, archive unsafe, checksum mismatch, relation invalid), and no outlook on splitting in the "too large" text until slice C exists. #2190 also names a `413` without a problem code on import (a reverse proxy refusing the body, #2188) with the same "too large" text and documents the proxy body limit in `docs/ARCANE.md`. The conflict codes `TRANSFER_NOT_READY`, `TRANSFER_EXPIRED` and `TRANSFER_ALREADY_APPLIED` stayed out of the slice and still show the shared conflict state. Evidence: `docs/product/design/evidence/2173-transfer-failures/`. The text below is the plan as it was written; where it differs, the merged code and the evidence README are authoritative.

Today (before the slice) `TransferPanel.tsx` shows `transfer.genericFailure` for every `FAILED` export, and the import section shows one generic `failed` text. `errorCode` is already stored and returned by the API (`TransferExportDetail.errorCode`, `TransferImportDetail.errorCode`), so this slice needs no API or contract change.

- Map each `ErrorCode.TRANSFER_*` to its own i18n key for export and import: `TRANSFER_TOO_LARGE`, `TRANSFER_FORMAT_UNSUPPORTED`, `TRANSFER_MANIFEST_INVALID`, `TRANSFER_ARCHIVE_UNSAFE`, `TRANSFER_CHECKSUM_MISMATCH`, `TRANSFER_RELATION_INVALID`, `TRANSFER_MEMBER_MAPPING_REQUIRED`, `TRANSFER_MEMBER_MAPPING_INVALID`, `TRANSFER_PRIVACY_SCOPE_INVALID`, `TRANSFER_NOT_READY`, `TRANSFER_EXPIRED`, `TRANSFER_ALREADY_APPLIED`, `TRANSFER_EXPORT_FAILED`, `TRANSFER_IMPORT_FAILED`. Codes that already have dedicated handling (`TRANSFER_VIDEOS_NEED_PRO`, `TRANSFER_NOTHING_TO_RECOVER`, the quota refusal) keep it. Unknown or missing codes keep the current generic text as a safe fallback.
- Related codes may share a text where the member's next step is the same (for example damaged or incomplete file). The grouping and the exact German wording are the Product Owner's decision and are proposed in the PR, not decided here.
- Wording follows the writing guideline: no app "wir", the Space is not named, the partner is referred to by nickname, then name, then "dein Partner" where relevant. Every text says what happened, what the member can do next, and that nothing was changed where that is true. For `TRANSFER_TOO_LARGE` the text must not promise a workaround that does not exist yet; after slice C3 it points to the part download.
- Before any UI work: a rendered HTML mock-up of the failure states (Compact, Light and Dark) with the proposed texts goes to the Product Owner. Implementation starts after approval.
- Tests: a unit test that every `TRANSFER_*` code has a text in every shipped locale; component tests for known, unknown and missing codes; no hard-coded German outside i18n.
- Business/freemium: no impact (copy only). Reuse: existing i18n layer and result-text components. Cross-cutting: i18n, accessibility (the message is announced like the current failure text), no technical code shown to couples.

## 4. Slices C0 to C4: part sets

### 4.1 Proposed design (to be settled in C0)

- A part is a valid ZIP bundle with its own `manifest.json`, checksums and `media/index.json`, within today's limits: at most the part budget in bytes (operator setting, default about 400 MiB) and well below 4096 entries (the budget counts bytes and entries). The entry cap is therefore respected per part and needs no change.
- Exports that fit one file keep writing a plain v1 bundle, unchanged. Only a Space that needs several files produces a **part set**. Part sets use `formatVersion` 2 with additive manifest fields `partSetId`, `partIndex`, `partCount`. An older server then answers `TRANSFER_FORMAT_UNSUPPORTED` (clear) instead of a relation error. The v1 reader stays as it is.
- **Records in every part (deviation from the literal wording, to be confirmed by the Product Owner).** The decision says part 1 carries all records and later parts carry media only. "Any order" import without staging bytes needs every part to be importable alone, because media cannot be attached to parents that do not exist yet and orphan media is rejected by the reader. The simplest design that meets the member-visible goal: every part carries the same record documents (stable source IDs, identical bytes) and its own subset of media. Importing a part adds the records that are missing, attaches the media it holds, and leaves references to media that are in other parts as "missing, can be completed". The records JSON is small compared with the media budget; if a Space's records ever approach a significant share of a part, C0 falls back to parent records only for the media a part holds.
- Import reuses what exists: the re-import of the same records adds nothing twice (#2150); `_without_media` already removes references to any set of media IDs (it is not video-specific); skipped videos are remembered per importing member and recovered from the matching file by source ID and manifest checksum (#2141). C1 generalizes "skipped video" to "media not yet imported" for photos, voice notes and documents, with the same privacy rules (only the importing member sees and completes it; the partner sees nothing; deletion follows the parent, owner and Space on every server). The video gate (`media.video_upload`) is unchanged: parts with videos behave as a single bundle with videos does today.
- Completion is by recognition, never by position: a part is recognized by `partSetId`, and a media item by source attachment ID and manifest checksum. A part imported twice, in another order, or never leaves the Space consistent and additive.
- Export storage: one `TransferExport` owns N artifacts, keys `.../exports/{exportId}/part-{k}.zip`, with one retention and deletion lifecycle. The API detail lists the parts (index, size, download link). The worker streams each part and never holds more than one part in memory (this also removes the whole-archive RAM buffer). Part files are temporary and are not counted against the Cloud storage quota, as archives are not today.
- Operator setting: part budget in bytes, documented for Self-Hosted and Cloud, default about 400 MiB. The import API limit and tmpfs size are not changed.
- Proxy body limit: `docs/ARCANE.md` (#2190) tells operators to allow request bodies of at least 512 MiB on `/api/`. A part stays within that bound by construction (budget plus bundle overhead is well below it), so part sets need no new proxy setting. If an operator raises the budget above 512 MiB the setting is refused at startup instead of producing parts that no import can accept.

### 4.2 Slices

| Slice | Content | Notes |
| --- | --- | --- |
| C0 | Design decision record in `docs/m5` for the part format (manifest fields, format version, record placement, operator setting) and a rewrite of the "Multipart format for larger collections" paragraph in `docs/m5/S6-TRANSFER-BUNDLE-OPERATIONS.md`. | That paragraph describes a different future design (a versioned index, all parts validated together, one atomic apply). The Product Owner's additive, any-order decision supersedes it; C0 records the supersession and the reason, including that an atomic set would force all parts to be uploaded and staged before anything is imported. Docs only. |
| C1 | Backend reader and importer: accept a `formatVersion` 2 part, generalize skipped videos to skipped media (migration), recognize and complete by source ID and checksum. | v1 behavior unchanged. Migration numbers race on `main`: check `alembic heads` after every merge. |
| C2 | Backend export: split by byte and entry budget, N artifacts per export, API detail with parts, operator setting, per-part streaming. | Order after C1 so every produced part set is importable. |
| C3 | Web and Android: download several parts, import several files at once or one by one, a calm "missing parts" notice. | Needs a PO-approved mock-up first (Compact and Expanded). Browser-only controls stay hidden in the native app. |
| C4 | Operations and status documentation, test-channel verification on eimir-test with a Space above 512 MiB. | |

Each slice is its own PR. The Product Owner's go is needed before each merge. Auto-fix is switched on for every PR.

## 5. Per-PR checklist (AGENTS.md)

- **Business/freemium:** matrix row "Essential data portability / Transfer Bundle" is Non-paywallable and stays so; Free, Premium and Self-Hosted behave the same; no quota or entitlement change; downgrade, export and existing data behavior improve (existing media becomes exportable). Part files are temporary storage for the existing retention period.
- **Reuse review:** considered: splitting with the ZIP spanning format (not valid per file, not supported by `zipfile`, not importable per part), a single larger bundle with direct streaming upload (large change, does not cover 5 to 50 GB), tus or resumable uploads (extra protocol and server surface for one feature), a records-only export (still needs importer support for absent photos, which is the same work as part sets). Selected: independently valid bundle parts that reuse the existing importer, the idempotent re-import and the skipped-media recovery. Custom code is limited to splitting and the part-set marker; no new third-party component.
- **Cross-cutting:** privacy (every part carries the same scope and never leaks the other scope's private entries; logs stay content-free), security (hostile-archive limits apply per part; part-set IDs are random and not credentials), concurrency (two parts importing at the same time must not duplicate: the idempotent apply path is reused, and a test covers two parts applied concurrently; C1 verifies that the current locking is sufficient), resilience (a failed or missing part leaves a consistent Space), performance (bounded memory per part), i18n and accessibility (all texts through the localization layer), API/contract (additive detail fields and a new format version), operations (operator setting, retention, cleanup of N artifacts).
- **Product design:** A1 and C3 are user-facing and need the baseline review of the actual Settings screen (the data and portability section) on current `main`, a PO-approved mock-up, and visual evidence before merge.

## 6. Alternatives not chosen

- **Raise the limits for a single file.** Needs direct streaming uploads, bigger tmpfs or object-store staging, and still cannot cover 5 GB (Free) or 50 GB (Premium) in one file on a phone.
- **Records-only export plus separate media.** Needs the importer to accept records whose photos are absent, which is the main work of part sets anyway.
- **Atomic multi-file import (the earlier future design).** Requires all parts to be present and staged before anything is imported, and gives the member nothing until the last file is uploaded.
- **Do nothing structural.** Conflicts with the Non-paywallable classification.

## 7. Open points for the Product Owner (asked one at a time)

1. Is a set of several files acceptable for a 50 GB Premium Space (about 125 parts at 400 MiB), or should very large Spaces get another mechanism later?
2. Confirm the deviation in 4.1: every part carries the records, instead of "part 1 all records, later parts media only". Not decided until the Product Owner answers; C0 and later slices must not assume it before then.

The wording of the error texts (slice A1) was point 3 and is decided (section 3).
