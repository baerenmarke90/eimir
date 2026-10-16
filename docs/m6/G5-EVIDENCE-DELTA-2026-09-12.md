# G5 Post-Rehearsal Evidence Delta — 2026-09-12

**Owner:** #910  
**Consumed by:** `docs/m6/G5-EVIDENCE.md`, #525  
**Reviewed baseline:** `735e37c26000991e0365ff360a6b8af69e691199` (`main`)  
**Historical rehearsal retained unchanged:** `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md`

This document records launch-readiness evidence that became available **after** the
2026-09-05 integrated #524 rehearsal. It is additive evidence only. It does not
rewrite the dated rehearsal, does not retroactively attribute later behavior to that
run, and does not make the final G5 decision owned by #525.

The delta is intentionally limited to #668 and #670.

## 1. #670 / G5-11 — former-member presentation

### Result

`PASS` for the post-rehearsal #670 semantic delta.

This result covers only the former-member projection and client-presentation
requirement introduced by #670. The complete G5-11 criterion still also consumes
#520 deletion, retention and restore-reconciliation evidence from the existing G5
package.

### Revision identity

- issue: #670;
- implementation PR: #909;
- tested PR head: `9a500ccd6e652b38f92a1cb67d1d5d33e2d2b2e6`;
- merged `main` revision: `735e37c26000991e0365ff360a6b8af69e691199`.

### Proven contract

The merged implementation:

- derives `AuthorSummary.isFormerMember` server-side from the authoritative
  `AccountDeletion` lifecycle rather than display-name matching;
- treats an `AccountDeletion` row as deletion state only after the irreversible
  deletion acceptance boundary defined by #520;
- does not interpret ordinary Account suspension (`disabled_at`) as deletion;
- suppresses the stored display name and profile attachment immediately for a
  former member, including while asynchronous deletion cleanup is still converging;
- preserves normal active/suspended-but-not-deleted author presentation;
- lets Web and Android render localized neutral former-member copy from the
  semantic API state;
- proves the clients do not infer deletion by comparing against the persistence
  tombstone text `Deleted account`;
- prevents Web avatar retrieval when the semantic former-member state suppresses
  the profile attachment identity.

### Revision-addressable automated evidence

The following pull-request workflows completed successfully on the #909 head:

| Workflow | Run | Result |
|---|---:|---|
| CI | `34711952942` | `success` — Backend, generated-client contract and all four Backend Integration shards passed |
| Web S8 | `34711952973` | `success` — typecheck, lint, formatting, tests and production build passed |
| Android S8 | `34711952975` | `success` — unit/semantics/contract tests, lint and reproducible debug build passed |
| G2 Client E2E | `34711952952` | `success` |
| Web Browser QA | `34711952937` | `success` |
| CodeQL SAST | `34711952996` | `success` |
| Product Design Review | `34711952943` | `success` |
| Reuse Review | `34711952961` | `success` |

Focused integration and client tests cover:

- retained `SPACE_SHARED` content authored by a deleted Account;
- fail-closed suppression of stale display-name/avatar identity before cleanup;
- a disabled-but-not-deleted Account remaining an ordinary author;
- localized former-member presentation on Web and Android;
- negative cases proving the literal `Deleted account` value does not create
  former-member state in either client.

### Evidence boundary

The 2026-09-05 #524 rehearsal did **not** execute this behavior because #670 was
implemented later. #525 must consume this delta alongside the historical #520/#524
G5-11 evidence rather than rewriting the historical rehearsal status.

## 2. #668 / G5-02, G5-05 and G5-06 — Cloud runtime artifact identity

### Result

`PASS` for the repository/CI deployment-identity contract.  
`BLOCKED` for real Cloud/Managed operator/environment evidence **if Cloud/Managed is
in the reviewed launch operating scope**.

Only #525 may decide that Cloud/Managed is outside the first reviewed launch scope
and therefore classify the corresponding environment evidence `NOT_APPLICABLE`.
Such a decision must explicitly state that G5 does not certify Cloud/Managed as
launch-ready.

### Revision identity

- issue: #668;
- implementation PR: #908;
- tested PR head: `a23dc3ae1cfc585b2c6bad3a6e8abd24bfcee878`;
- merged `main` revision: `6df50babd19e87a87687ad6166e78dc3b6fd5632`.

### Proven repository contract

The merged #668 contract proves that Cloud/Managed Production and rollback identity:

- requires digest-qualified OCI references (`image@sha256:<digest>`);
- rejects tag-only identities, including `latest`, `main`, SemVer and arbitrary
  custom tags;
- permits convenience/publish tags to coexist outside the Production identity
  boundary without treating them as immutable evidence;
- requires `cloud-api`, `cloud-worker` and `cloud-migrate` to use the same exact
  backend image identity;
- requires `cloud-web` to use an exact Web image digest;
- rejects missing image identity and every Cloud `build:` fallback;
- reuses the #519 release manifest/artifact identity as the product release source
  of truth rather than introducing a second release manifest;
- records registry digest identity as deployment evidence;
- requires previous-known-good rollback selection to carry exact backend/Web OCI
  digest identity instead of re-resolving a mutable tag.

### Revision-addressable automated evidence

The following workflows completed successfully on the #908 head:

| Workflow | Run | Result |
|---|---:|---|
| CI | `34709048681` | `success` |
| Self-Hosted Deployment Guard | `34709048675` | `success` — includes canonical Compose/deployment-contract validation |
| Runtime Environment Drift Guard | `34709048677` | `success` |
| CodeQL SAST | `34709048710` | `success` |
| Reuse Review | `34709048682` | `success` |
| Product Design Review | `34709048689` | `success` |
| Immutable Release Candidate | `34709048804` | `success` for the release-manifest contract job |
| Publish Immutable Release | `34709048864` | `success` for the publication-contract job |

Focused #668 tests include the release-manifest Cloud deployment binding and the
Cloud runtime image identity contract. Negative cases cover tag-only identities,
missing identity, backend-role divergence and Cloud source-build fallback.

The two release workflows above must not be misread as publication evidence. On the
PR-triggered runs, their real candidate build/binding and sign/publish jobs were
`skipped`; only the contract jobs executed.

## 3. Missing operator/environment evidence for Cloud/Managed

The repository contract is stronger after #668, but repository tests cannot prove
which bytes a real managed runtime is actually running.

As of this 2026-09-12 delta audit:

- the repository has no published GitHub Release;
- no protected real #519 signed-release publication has produced the artifact set
  required for a managed promotion;
- the 2026-09-05 #524 rehearsal explicitly had no real managed Cloud account and
  therefore could not exercise a managed deployment, restore or runtime-digest
  observation;
- PR #908 explicitly scoped real Production promotion and provider provisioning
  out of its implementation slice.

If Cloud/Managed is included in the launch scope reviewed by #525, G5 still needs
traceable operator/environment evidence that:

1. a real protected #519 signed release was published, with exact backend/Web
   artifact identities and associated #193 SBOM/attestation evidence;
2. those verified build-once artifacts were promoted to the selected registry
   without rebuild;
3. the canonical Cloud deployment consumed digest-qualified backend/Web OCI
   references;
4. the retained `cloud-deployment-identity.json` binds those registry digests to
   the selected #519 release manifest without retaining secrets from resolved
   Compose configuration;
5. the actually deployed API/worker/migrate runtime resolves to the recorded exact
   backend digest and Web resolves to the recorded exact Web digest;
6. post-deploy revision/health smoke succeeds against that selected release;
7. for a non-initial release, previous-known-good rollback selection uses the
   recorded exact backend/Web digests and is exercised without tag re-resolution;
8. the target-relevant Cloud/Managed recovery/capacity evidence required by G5-06
   is completed rather than inferred from the repository contract.

Until that evidence exists, #668 must not be used to turn the historical G5-06
`BLOCKED` result into `PASS` merely because the implementation issue is closed.

## 4. Launch-scope consequence for #525

This delta does not choose the first launch operating mode.

For the final #525 gate there are only two honest paths:

- **Cloud/Managed included:** the missing evidence in §3 remains a required blocker
  and must be produced before G5 can pass for that operating mode.
- **Cloud/Managed excluded from the reviewed first launch:** #525 may classify the
  Cloud/Managed-only environment proof `NOT_APPLICABLE` with an explicit rationale,
  while retaining the #668 repository contract as delivered future operating-mode
  groundwork. The final gate record must then state that the G5 decision certifies
  the declared launch scope only and does **not** certify Cloud/Managed as
  launch-ready.

The first-launch commercial source decision (`ADMIN_GRANT` only) is independent of
this operating-mode choice and does not by itself include or exclude Cloud/Managed.

## 5. Gate status

This document does **not** declare G5 `PASS`.

It contributes:

- post-rehearsal `PASS` evidence for the #670-specific semantic portion of G5-11;
- post-rehearsal `PASS` evidence for the #668 repository deployment-identity
  contract;
- an explicit `BLOCKED` operator/environment boundary for #668 when Cloud/Managed
  is launch-supported;
- a precise scope decision that remains owned by #525.

All other G5 criteria and blockers remain governed by `docs/m6/G5-EVIDENCE.md`, the
historical #524 report and any later focused evidence records.