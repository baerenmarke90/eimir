# Decision 0020: Remove the Transfer Bundle self-service feature

**Status:** Proposed; becomes accepted when the Product Owner merges the pull request  
**Date:** November 23, 2026  
**Owning issue:** [#2243](https://github.com/baerenmarke90/eimir/issues/2243)  
**Builds on:** [Decision 0017](0017-pro-plugin-seam.md) (Pro plugin seam),
[Decision 0018](0018-cloud-first-self-hosted-later.md) (Cloud first, Self-Hosted later),
[Decision 0019](0019-repository-split-and-cutover.md) (repository split and the cut-over day),
[`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md) and [`FREEMIUM-FEATURE-MATRIX.md`](../FREEMIUM-FEATURE-MATRIX.md)  
**Amends (in later slices, not in this pull request):** Decision 0017 (decision 4 and row C14: the
`export_account_document` hook and `ExportRule`), the Transfer Bundle decisions of M2-D17 and #303
([`m5/S6-CACHE-PORTABILITY-DECISIONS.md`](../m5/S6-CACHE-PORTABILITY-DECISIONS.md))  
**Related issues:** [#345](https://github.com/baerenmarke90/eimir/issues/345) (original Transfer Bundle API, closed),
[#2141](https://github.com/baerenmarke90/eimir/issues/2141) (storage quota and video gate),
[#2173](https://github.com/baerenmarke90/eimir/issues/2173) (named failures and split exports),
[#2188](https://github.com/baerenmarke90/eimir/issues/2188) (proxy body limit),
[#2053](https://github.com/baerenmarke90/eimir/issues/2053) (open work touching the Transfer service),
[#2182](https://github.com/baerenmarke90/eimir/issues/2182) and [#2183](https://github.com/baerenmarke90/eimir/issues/2183)
(Phase 2 relocation and the cut-over)

## Context

The Transfer Bundle is the self-service way for a couple to export a Space and import it elsewhere (Web UI, eight API
routes, background jobs, three tables, three notification kinds). It is the largest self-contained feature in Core:
roughly 4,600 lines of backend source, 21 dedicated test files, about 13 Web files, the generated API client, three
Alembic migrations and 16 error codes, plus hooks in notifications, account deletion, Space offboarding and the Pro
plugin seam.

Three observations led to the Product Owner's decision of November 23, 2026:

- **It does not work for real data today.** The export is built in memory and capped at 512 MiB
  (`MAX_COMPRESSED_BYTES`). The Product Owner's own Space has roughly 600 MB of media and fails to export
  ([#2173](https://github.com/baerenmarke90/eimir/issues/2173)). Raising the limit safely means a parts format, a
  new upload path and proxy changes, which was planned and judged large for a feature that few couples will use.
- **It is expensive to carry.** Every new feature has to be "thought into" the bundle. About 30 Core tests and the
  portability allowlist exist only to keep new tables and columns in step with the bundle. The proxy limit, the
  upload spool, the video gate and the quota paths all have Transfer-specific branches.
- **The legal duty is to hand over the data, not to build self-service.** Art. 15 and Art. 20 GDPR require that data
  subjects receive their data in a structured, commonly used, machine-readable format. They do not require a
  self-service export with a matching import. An operator-provided copy on request meets the duty, and there are no
  real users yet, so the product promise can be reworded before launch at the lowest cost. The reasoning is not legal
  advice; the Product Owner decided to proceed without a prior legal review (see "Risks").

The Product Owner also wants the new export and import code to stay out of the public repository from now on.
[Decision 0019](0019-repository-split-and-cutover.md) already plans a private Pro and release repository, so the
retained tool belongs in the Pro package.

## Decision

The Product Owner decided on November 23, 2026:

1. **Remove the self-service feature.** The Transfer Bundle (Web UI, API, jobs, notifications, skipped-video
   recovery, parts-export plan, tables) is removed from Core.
2. **Keep an operator-only export.** The export core remains as a command-line tool run by the operator: no API, no
   UI, no jobs, no Transfer tables. It writes to a file on disk instead of a memory buffer, so the 512 MiB limit
   becomes an operator parameter.
3. **Keep a small operator-only import** (variant A: the full hostile-archive validation of the current import,
   roughly 2,500 lines including the export core). It stays idempotent as in
   [#2150](https://github.com/baerenmarke90/eimir/issues/2150) (stable target IDs, existing rows are skipped, one lock
   per Space). "Delete the import" is superseded; the lighter variant B (manifest and checksum validation only) was
   rejected.
4. **Place and time (W2).** The tool is built now in `backend/pro` as the `eimir_pro/portability` sub-package, runs
   from the Core wheel's public interfaces only, and moves with the Pro package into the private repository at the
   cut-over. It does not have to live in the public repository. The existing public history stays public and cannot
   be recalled (see "What this does not protect").
5. **Garden included, games excluded.** The six garden tables are added to the allowlist as their own slice (S1b)
   right after the base tool. Games are not included. One-time messages, location, calendar sync, photo sources and
   notifications are **set up again in the target** and are not exported.
6. **Seam change (S1c).** The `export_account_document` hook and `ExportRule` are removed from Core, the Pro plugin
   method is removed, `PLUGIN_SEAM_VERSION` goes from 6 to 7 and Decision 0017 is amended. Core changes first, then
   Pro, in one pull request with two commits and before the cut-over, in the same repository. The tool reads the Pro
   tables directly, so Core needs no hook.
7. **Guards in the tool.** A **schema-version guard** makes the command refuse to run when the source or target
   Alembic revision differs from the revision the tool was verified against; the export manifest carries an
   additive `schemaRevision` field so an old file is recognised in a newer instance. An **allowlist guard test** (a
   Pro test, option A) reflects over every Core table and requires each to be either exported or deliberately
   excluded. Core holds no export knowledge; a gap surfaces in the nightly run of the private repository. S1b extends
   the test with the six garden tables.
8. **Operator limits.** The operator export and import bypass the Cloud storage quota and the Pro video gate; the
   operator is responsible for the resulting storage. **Imported video still passes the same validation as an upload**
   (status `VALIDATING`, the same worker job) and is never trusted unchecked.
9. **Self-Hosted statement.** Operators running Core without Pro have no export or import tool; the solution is
   decided when Self-Hosted starts. The matrix and the legal texts say exactly this, and "identical" no longer
   describes the Self-Hosted column of the portability row.
10. **Wording.** The matrix (rule 6, the portability row, the downgrade section, the quota row), the terms of use,
    the privacy policy and the website FAQ are reworded from "self-service export" to "a copy on request to the
    operator". This happens in S3, not in this pull request. The wording was approved by the Product Owner without a
    prior legal review.
11. **Specification.** `specification/PRODUCT-SPEC.md` and `specification/CLEAN-ROOM-MASTER-SPEC.md` change
    "Versioned Transfer Bundle" to "operator tool" in their own pull request, touching only the feature-scope
    statement; the Clean-Room rules stay unchanged.
12. **Order against the cut-over.** S3 (close UI and API) lands **before** the cut-over snapshot. S4 (remove Core
    backend code) may land after it. S5 (drop the tables) comes last, after a waiting period and with its own go. Until
    S4 the transfer code exists twice (Core and `eimir_pro`), and the first public Core snapshot still contains the
    backend code, without UI and API.
13. **Inert leftovers.** Notification kinds, targets, events and error codes of the Transfer feature stay in place,
    inert. No second migration narrows the constraints now. S6 is optional and later.
14. **Approved texts.** The German and English texts for account deletion, leaving a Space, the Storage page
    (including the Self-Hosted sentence), storage-quota promises and the passport note were approved by the Product
    Owner. A reference image or HTML mock-up remains mandatory before the first UI code in S3.
15. **Old documents stay.** The three S6 documents, `m5/transfer-export-parts-plan.md` and the 27 evidence images of
    #2173 are kept and get a "removed by ADR 0020" note in S4. Nothing is deleted.
16. **Git tag.** An annotated tag `transfer-bundle-last-selfservice` marks the last revision with self-service. The
    lead or Product Owner sets it immediately before the merge of S3; it is a go condition for S3. A tag lives only in
    the current public repository; the fresh Core history after the cut-over does not carry it, and the old archived
    repository and the local `git bundle` of Decision 0019 keep that state.
17. **Moving the Product Owner's own Space** is a separate later task through the console (the operator route). It is
    not self-service, does not precede the removal and is no gate for S3. The method (operator export and import, or a
    copy of the whole instance) is chosen in that task.
18. **Open work.** After the Product Owner has merged this decision, #2173 and #2188 are closed as superseded by ADR
    0020, #2141 stays open and is trimmed to the quota part, and #2053 is brought up to date before S4. #1887 needs
    nothing. Each of these needs its own go and none is done by this pull request.
19. **Working rule.** Every slice gets its own Product Owner go and ships as its own small pull request.

### Slice order

| Slice | Content | Go condition | Way back |
| --- | --- | --- | --- |
| **S0** | Documentation and tracker only: this ADR, the tracker issue, status and architecture notes | Given for S0 | Revert the docs |
| **S1** | Operator tool (export and import, variant A) in `eimir_pro/portability/`, limits as parameters, schema-version guard, allowlist guard test, runbook; no Core deletion | S0 merged; own go; rehearsal export and import on a test database; extraction dry-run green | Revert (new files only) |
| **S1b** | Garden: six tables in the allowlist, member mapping extended, import only into an empty garden of a connected pair | S1 delivered; own go | Revert |
| **S1c** | Seam v7: remove the hook and `ExportRule`, amend Decision 0017 | S1 delivered; own go (contract change) | Revert the whole pull request |
| S2 | Move the Product Owner's own Space (console, later) | Own task and go; no gate | Old instance stays unchanged until confirmed |
| **S3** | Close UI and API; legal texts, matrix and website live; specification pull request alongside | **Before the cut-over snapshot**; S1, S1b, S1c delivered; reference image or mock-up before UI code; tag set; own go | Revert (code and tables still exist) |
| Wait | At least 24 hours plus one cleanup run; the operator confirms no `QUEUED`, `RUNNING` or `READY` rows and no objects under `.../transfers/...` | Operator confirmation | n/a |
| **S4** | Remove Core backend code (all of `eimir/transfer/` except `models.py`, API, jobs, deletion hooks, `images.inspect`, tests); "removed by ADR 0020" notes | Wait passed; #2053 updated first; own go; allowed after the snapshot | Revert (tables still exist) |
| **S5** | Drop the three tables, delete `transfer.*` job rows, delete the models in the same pull request, regenerate the schema fingerprint | Last; waiting period; own go; operator confirms nothing more needs to be pulled | **Data irreversibly gone**; only empty tables in `downgrade`; code via revert or tag |
| **S6** | Optional cleanup of inert notification kinds, constraints, error codes, push texts, catalog; deletes no documents | Only if the effort is wanted; own go | Revert |

## Alternatives considered

| Alternative | Why it was not chosen |
| --- | --- |
| Keep the feature and finish [#2173](https://github.com/baerenmarke90/eimir/issues/2173) part C (parts export) | Large new format, upload and proxy work for a rarely used path, and the carrying cost of the feature stays. |
| Remove everything, including operator export and import | Leaves no repeatable way to answer an access or portability request or to move a Space; hand-written SQL and media copies are slow and risk leaking private partner content. |
| Operator export only, delete the import | Rejected by the Product Owner: moving a single Space needs a matching import. |
| Lighter import (variant B, manifest and checksum validation only) | The deep validation also feeds the rewrite of the graph, and the safety would depend on only ever importing files the operator produced. |
| Keep the tool in Core as a hidden command | Keeps export code and its upkeep in the public Core; rejected in favour of `eimir_pro`. |
| Keep the seam hook and `ExportRule` | The tool reads the Pro tables directly, so the hook would have no caller. |
| Guard option B: a data-only list in Core plus a Core test | Leaves export metadata in the public repository. |
| Runbook only (SQL and media copy) | Fragile for encrypted payload columns and the partner-privacy rules the current export already tests. |

## What this does not protect

- **The transfer code that is already public stays public.** It has been in the public history since August 2026
  (#345), the format is documented, and copies, forks and caches cannot be recalled. The decision only keeps the *new*
  tool, new commits and the new Core snapshot after the cut-over from the public repository, and bounds what is left
  in the first snapshot (item 12).
- **A tool outside the public repository does not protect the format.** The export format contains no secrets.
- **An operator export is plaintext on the operator's disk.** The current export deliberately never writes plaintext
  to a worker disk; the tool trades that for the removal of the memory limit, so the runbook requires secure handling
  and deletion of the file.

## Business and freemium review

**Business/freemium impact reviewed.** The matrix row "Essential data portability / Transfer Bundle & account export"
is **Non-paywallable** and stays so. What changes is the delivery mechanism, from self-service to an operator-provided
copy. This pull request changes **no** matrix, legal or specification text; each of them is changed in a later slice
with a versioned rationale and an "Earlier revision" entry (no silent reinterpretation of a row).

- **Free, Premium or Mixed:** unchanged (non-paywallable); the right to a copy never depends on a plan.
- **Self-Hosted versus Cloud:** the Cloud delivers a copy on request. For Self-Hosted the exact statement of item 9
  applies. The change is not made to promote the Cloud; its cause is the Product Owner's wish to keep the export code
  out of the public repository, and the Self-Hosted offering is not live (Decision 0018). The Self-Hosted solution is
  decided at Self-Hosted start, and the matrix must say so.
- **Quota and downgrade:** matrix text that refuses "Transfer imports" and "recovered videos" after a downgrade, and
  the Cloud storage quota row, are updated in S3. The operator import checks no Space quota and no Pro video
  capability; the operator is responsible. Video still goes through the upload validation.
- **Existing data:** nothing is deleted by this decision; table data is deleted only in S5, with its own go.

## Cross-cutting consequences

- **Security and privacy:** the hostile-archive tests move with the tool and keep running; the tool prints only names
  and counts, never content. `OWNER_ONLY` and partner-private data stay excluded exactly as in the current export.
  Account deletion and Space offboarding hooks are removed last (S4) so no object is orphaned; artifacts older than
  24 hours are already cleaned up by the existing job.
- **Data lifecycle and migrations:** no migration in S0. The three Transfer migrations stay in the chain; S5 adds a
  drop migration (number checked with `alembic heads`) and the schema fingerprint is regenerated. Models and the drop
  migration fall in the same pull request, because the models-versus-migrations drift check requires it.
- **API and contracts:** S3 and S4 remove eight routes and their schemas (a breaking change); `openapi.json` and the
  generated client are regenerated. Old routes must answer 404 in tests. The seam version rises to 7 in S1c.
- **Operations:** proxy-limit notes, the large-body location in `web/nginx.conf` and the Arcane hints go in S3/S4.
  Recovery documentation distinguishes operational backup from the operator tool.
- **Observability:** the counter `transfer_artifacts_removed` disappears with S4.
- **Testing:** about 40 tests fall away, about 50 remain (archive, privacy, target IDs, re-import, image revalidation),
  and the allowlist guard replaces about 30 scattered Core tests. The browser spec is split so the storage tests
  survive; `test-groups.json` and `test-impact.json` are updated together.
- **i18n and accessibility, design:** no user-facing change in this pull request. S3 changes the Data settings,
  account-deletion and Space-leave texts and needs the reference image or mock-up and the usual visual evidence.
- **Not affected in S0:** code, schema, API, UI.

## Risks

- **No legal review.** The Product Owner decided that the legal texts may go live without a prior legal review. The
  reasoning about Art. 15 and Art. 20 GDPR above is the project's own reading and is unverified; no real users exist
  yet, which keeps the cost of wording changes low.
- **Allowlist drift.** With the tool in Pro, a Core pull request that adds a table sees no red test; a gap surfaces
  only in the nightly run of the private repository (accepted, item 7).
- **Core migrations can break the import silently.** The schema-version guard and the pinned Core revision are the
  protection; every Core migration needs a conscious re-verification of the tool.
- **Duplicate code until S4.** The code exists in Core and in `eimir_pro`; changes in the meantime belong in one place
  only and #2053 must be updated before S4.
- **Irreversible drop.** S5 loses the data of the three tables for good; the code is recoverable through the tag and
  revert, the rows are not.
- **The Product Owner's Space** cannot move by bundle today (it exceeds the limit) and moves later through the
  operator route (item 17).

## Consequences

- The tracker [#2243](https://github.com/baerenmarke90/eimir/issues/2243) lists every slice with its dependency and
  states that each needs its own go.
- [#2173](https://github.com/baerenmarke90/eimir/issues/2173), [#2188](https://github.com/baerenmarke90/eimir/issues/2188)
  and the Transfer part of [#2141](https://github.com/baerenmarke90/eimir/issues/2141) are handled as in item 18,
  after this decision is merged.
- `docs/m5/transfer-export-parts-plan.md` becomes obsolete with the decision and keeps a note in S4.
- [`IMPLEMENTATION-STATUS.md`](../IMPLEMENTATION-STATUS.md) marks the Transfer feature as scheduled for removal, and
  [`ARCHITECTURE.md`](../ARCHITECTURE.md) states where data portability lives from now on.

## Open points

- The date of the cut-over (not found in any document) decides whether S3 and S4 straddle the snapshot as planned.
- The method of moving the Product Owner's Space (S2).
- The Self-Hosted solution (tool shipped with the Pro image, delivered separately, or moved back into Core), decided
  when Self-Hosted starts.
- Whether S6 is ever worth its effort.
