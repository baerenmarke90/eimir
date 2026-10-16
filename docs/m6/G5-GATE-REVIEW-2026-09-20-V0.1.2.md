# G5 Gate Review — final v0.1.2 closure — 2026-09-20

**Issue:** #525  
**Supersedes only the unresolved conclusion of:** `G5-GATE-REVIEW-2026-09-20.md`  
**Reviewed launch release:** `v0.1.2`  
**Source:** `9beb47317928be3b968e6f56775f7c4b9ce1b5c0`

## Final decision

**G5 — Launch-ready: PASS**

The earlier 2026-09-20 review remains a historical record of the correctly blocked
state on `v0.1.1`. It identified exactly one unresolved launch requirement:
G5-02 lacked the explicit release-owner approval required for protected publication.

#1123 has now produced direct successor-release evidence through that boundary. The
launch scope and application runtime are unchanged, so this focused re-review changes
only G5-02 and G5-19.

Final matrix:

- **18 PASS**
- **1 NOT_APPLICABLE**
- **0 FAIL**
- **0 BLOCKED**

## Certified launch scope

This G5 decision certifies:

- **Web**
- **Self-Hosted**
- the public Demo exposure/isolation boundary as retained G5 evidence
- commercial Entitlement source **ADMIN_GRANT**

The following are explicitly outside this launch certification:

- **Android store/package launch** — `NOT_APPLICABLE`; `v0.1.2` was published with
  `include_android=false`.
- **Cloud/Managed** — `NOT_APPLICABLE`; #797 and real managed-target launch evidence
  remain required before a later Cloud/Managed go-live.
- Entitlement sources `GOOGLE_PLAY`, `CLOUD_STRIPE` and `SELF_HOSTED_KEY`.

These are scope declarations, not waivers of requirements for those future channels.

## Reviewed release identity

| Field | Value |
| --- | --- |
| Release | `v0.1.2` |
| Source | `9beb47317928be3b968e6f56775f7c4b9ce1b5c0` |
| Candidate run | `35521880601` — success |
| Publish run | `35521890433` — attempt 2 success |
| GitHub Release | immutable, id `392492163` |
| Backend | `ghcr.io/baerenmarke90/eimir-backend:v0.1.2@sha256:42db20c2c045b7f956c3b105df547fa29de83c6ebf983826c1f8ddd5303149b4` |
| Web | `ghcr.io/baerenmarke90/eimir-web:v0.1.2@sha256:962afb65746ca3f44252bca77910426fb060b08de62013420ba265f05cf07e04` |
| Previous known good | `v0.1.1` |

The protected publication completed exact-byte attestation verification, final manifest
construction, digest-qualified GHCR publication, anonymous pulls from a clean daemon,
Self-Hosted bundle generation, checksums, immutable GitHub Release publication and
final published-identity verification.

## Runtime-diff review

The compare `v0.1.1...v0.1.2` is documentation/evidence-only. There is no change to
backend application code, Web application code, Android runtime, Compose/deployment
runtime or migrations.

Therefore:

- #916 launch-state Web accessibility evidence remains valid;
- #917 public Demo exposure/isolation evidence remains valid and stays truthfully bound
  to its immutable `v0.1.0` live deployment identity;
- #915 promotion/rollback evidence remains valid;
- #524 integrated rehearsal evidence remains valid;
- no broad rerun of those programs is required solely to close #1123.

## Focused #1123 closure

Evidence: `G5-EVIDENCE-DELTA-1123-2026-09-20.md`.

The release contract requires explicit release-owner approval on the GitHub Environment
`production-release`.

For publish run `35521890433`:

1. attempt 1 failed closed before publication because the candidate identity check was
   still pending;
2. after candidate run `35521880601` completed successfully, the failed publish path
   was rerun;
3. `Verify immutable release inputs` completed successfully;
4. `Sign and publish immutable release` entered GitHub's `waiting` state behind
   `production-release`;
5. GitHub's run approval history records reviewer `baerenmarke90`, state
   `approved`, environment `production-release`;
6. only after that review did the protected job execute and complete successfully;
7. immutable release `v0.1.2` was then published and verified.

This resolves the exact G5-02 blocker without weakening the release contract or
rewriting #914/#915 history.

## Criterion matrix

| Criterion | Final status | Evidence / rationale |
| --- | --- | --- |
| G5-01 — G4/Core release baseline | **PASS** | Unchanged from the prior review; G4 baseline remains accepted. |
| G5-02 — coherent immutable release identity / controlled publication | **PASS** | #1123 delta: candidate `35521880601`; protected publish `35521890433`; GitHub approval by `baerenmarke90` on `production-release`; immutable `v0.1.2`; exact OCI identities verified. |
| G5-03 — SBOM, attestations and provenance | **PASS** | `v0.1.2` publication verified retained attestations, final checksums and immutable release assets. |
| G5-04 — Self-Hosted backup/restore/upgrade/recovery | **PASS** | Unchanged from the prior review/#524 evidence. |
| G5-05 — Development→Production promotion, migration and rollback/forward-fix | **PASS** | #915 evidence remains valid; `v0.1.2` adds no runtime/migration change. |
| G5-06 — supported Cloud/Managed production topology | **NOT_APPLICABLE** | Cloud/Managed is excluded from this launch certification. #797 and real managed-target evidence remain prerequisites to later Cloud go-live. |
| G5-07 — registration, maintenance and ServerAdmin lockout safety | **PASS** | Unchanged from the prior review. |
| G5-08 — structured observability and redaction | **PASS** | Unchanged from the prior review. |
| G5-09 — incident detection, response and recovery drill | **PASS** | Unchanged from the prior review. |
| G5-10 — Relationship/Space offboarding and retention | **PASS** | Unchanged from the prior review. |
| G5-11 — Account deletion and restore reconciliation | **PASS** | Unchanged from the prior review. |
| G5-12 — accepted versioned commercial/Entitlement model | **PASS** | Unchanged; launch channel remains `ADMIN_GRANT`. |
| G5-13 — central Entitlement enforcement and launch source adapters | **PASS** | `ADMIN_GRANT` launch path accepted; non-selected provider sources remain outside scope. |
| G5-14 — Security/Privacy/Tenant Isolation | **PASS** | Unchanged from the prior review; no runtime diff invalidates the evidence. |
| G5-15 — final release-state Accessibility acceptance | **PASS** | #916 Web evidence carries forward because the runtime is unchanged; Android package launch remains outside scope. |
| G5-16 — launch-topology performance/capacity | **PASS** | Unchanged from the prior review; bounded evidence remains an acceptance input, not an SLA claim. |
| G5-17 — public Demo exposure/isolation boundary | **PASS** | #917 remains valid for the unchanged runtime; live Demo identity remains explicitly `v0.1.0`. |
| G5-18 — integrated launch rehearsal evidence complete | **PASS** | #524 plus dated deltas #914–#917 and #1123 form the complete evidence package. |
| G5-19 — final explicit G5 decision | **PASS** | This focused closure records the final decision after the sole blocker was resolved. |

## Security / privacy / recovery / administration conclusion

No required Security, Privacy, Tenant Isolation, deletion/data-rights, recovery,
administration, observability or selected-channel Entitlement criterion is waived by
this decision.

The successor release changes only evidence/governance documentation. The application
runtime accepted by the prior review is unchanged.

## Post-launch work

M7-M9 remain post-launch product expansion and are not pulled into G5.

Cloud/Managed remains uncertified. In particular, #797 and target-relevant managed
deployment/recovery evidence must be completed before that operating mode is presented
as launch-ready.

## Decision record

> **G5 — Launch-ready: PASS for Web + Self-Hosted on immutable release `v0.1.2`
> (`9beb47317928be3b968e6f56775f7c4b9ce1b5c0`).**
>
> Android store/package launch and Cloud/Managed are not part of this certification.
