# Legacy Reference Audit

- **Issue:** #218
- **Audit date:** 2026-09-01
- **Audited baseline:** `main` at `ffe676f24f408a6e6c5d87b1864010583822c4c4`
- **Scope:** active repository content only

## Purpose

eimir. is an independent new implementation maintained in its own
repository and implemented from its own written specification. Active product
and engineering content must not present the current codebase as a fork,
rebrand, successor, continuation, or incremental evolution of a previous
application.

This audit records the repository-wide terminology review required by #218 and
documents why the small number of remaining historical references are retained.
It does not rewrite Git history, closed issues, merged pull-request discussions,
old commit messages, legal/provenance evidence, or immutable historical review
snapshots.

The project's provenance record intentionally does not claim a strict or formal
clean-room process classification because it documents prior exposure of the
initial implementing session. That factual disclosure remains authoritative and
must not be weakened by terminology cleanup.

## Search scope

The active default branch was reviewed for the legacy project names and for
phrasing that could imply current code lineage. Searches included at least:

- `SharedMoments`
- `Shared Moments`
- `eimir. Classic`
- legacy repository owner/name and `.git` URL patterns
- `fork`
- `rebrand`
- `successor`
- migration/predecessor wording
- equivalent framing that could describe eimir. as derived from a
  previous implementation

Generated or dependency-owned text was not edited merely because a generic term
matched. Ordinary technical uses of words such as `fork` or `successor` were
classified by context rather than by string alone.

## Findings

No obsolete active reference was found that presents eimir. as a fork,
rebrand, successor, continuation, or incremental evolution of a previous
codebase. No active legacy repository URL was found. Current deployment and
build configuration points to the `eimir` repository.

The following remaining references are intentional exceptions:

| Location | Classification | Reason retained |
| --- | --- | --- |
| `PROVENANCE.md` | Provenance / legal-development record | Names the historical applications to state explicitly that their source code was not copied and to preserve the documented prior-exposure disclosure. Removing the names would make the provenance statement less precise. |
| `specification/CLEAN-ROOM-MASTER-SPEC.md` | Normative specification / historical boundary | Identifies the legacy codebases only to forbid reading, copying, porting, or using them as implementation templates. This is a clean-room boundary, not a lineage claim. |
| `docs/reviews/2026-08-24-spec-gap-review.md` | Immutable historical review snapshot | The document explicitly identifies itself as a dated review snapshot that must not be retrospectively rewritten. Its legacy references describe the state and process reviewed on that date. |
| `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md` | Narrow migration / portability exception | Refers to a future external legacy exporter only to require conversion into the neutral eimir. transfer format while forbidding the Next importer from reading foreign source code or schema. It does not describe the current implementation as derived from that application. |
| `docs/DESIGN-PRINCIPLES.md` | False positive | The lower-case phrase “shared moments” is ordinary product-language prose meaning moments shared by the couple. It is not the legacy project name and contains no code-lineage claim. |
| `docs/BUSINESS-MODEL.md` | False positive | “Community forks” describes ordinary GitHub contribution forks of the current eimir. repository. It does not refer to a predecessor project. |
| `backend/src/eimir/jobs/maintenance.py` and related tests | False positive | “Successor” describes a maintenance job scheduling its next queue job. It is unrelated to project history. |

This file is the canonical exception ledger for #218 and therefore intentionally
contains the legacy terminology needed to identify and justify the exceptions.

## Required framing going forward

New active engineering, product, configuration, governance, and documentation
content must follow these rules:

1. Describe eimir. as an independent new implementation with its own
   source tree, architecture, contracts, clients, and documentation.
2. Do not call the current codebase a fork, rebrand, successor, continuation, or
   migration of an older implementation.
3. Do not add legacy repository URLs or owner/repository references to active
   configuration, examples, package metadata, product copy, or developer
   instructions.
4. Retain a legacy project name only when it is necessary for legal/provenance
   accuracy, an explicit historical record, or a narrowly scoped migration
   boundary.
5. When a legacy name is retained, make the historical/legal/migration context
   explicit so the text cannot reasonably be read as a current code-lineage
   claim.
6. Do not manually edit generated/vendor content when the authoritative source
   should be changed instead.

## Audit result

The active repository content at the audited baseline satisfies the cleanup
intent of #218. The remaining legacy-name occurrences are justified exceptions
or contextual false positives, not stale branding or implementation-lineage
claims.

Any future change that introduces a new legacy reference must be reviewed
against the rules above and either removed/reworded or added here with a narrow,
explicit justification.
