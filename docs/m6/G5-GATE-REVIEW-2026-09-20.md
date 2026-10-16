# G5 gate review — 2026-09-20

Issue: #525  
Review baseline: `main@87584fe26c3039b427bae648c9206bb59b3fd257`  
Reviewed launch release: `v0.1.1`  
Release source: `33939ad42f94ea81256ef858a0f7ccbe5fe0966f`  
Candidate run: [35518425837](https://github.com/baerenmarke90/eimir/actions/runs/35518425837)  
Publish run: [35519359638](https://github.com/baerenmarke90/eimir/actions/runs/35519359638)  
Living evidence matrix: `docs/m6/G5-EVIDENCE.md`  
Historical integrated rehearsal: `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md`

## Decision

**G5 — Launch-ready: BLOCKED**

The reviewed Web/Self-Hosted release is technically complete across the runtime,
recovery, accessibility, privacy, Demo and artifact-provenance dimensions covered by
G5. One launch-critical release-governance control remains incomplete: the repository's
authoritative release contract requires explicit release-owner approval on the
`production-release` GitHub Environment, while the retained #914/#915 evidence records
that the environment had no required reviewer when `v0.1.0` and `v0.1.1` were
published.

That gap is owned by #1123. It is not waived by this review and it is not retroactively
rewritten as if the approval had happened. Consequently G5-02 remains `BLOCKED` and
the final G5 decision cannot be `PASS`.

No Security, Privacy, Tenant, data-rights, recovery, administration, observability,
Entitlement, accessibility or Demo requirement is being deferred merely to make the
gate green.

## Reviewed release identity

| Field | Reviewed value |
| --- | --- |
| Release | `v0.1.1` |
| Source revision | `33939ad42f94ea81256ef858a0f7ccbe5fe0966f` |
| GitHub Release | immutable, not draft, not prerelease |
| Candidate run | `35518425837`, attempt 1, `success` |
| Publish run | `35519359638`, attempt 1, `success` |
| Backend | `ghcr.io/baerenmarke90/eimir-backend:v0.1.1@sha256:22e5069d62b9ae69cf53055257b317af32252196aa545a6beb2038f45ea8ec28` |
| Web | `ghcr.io/baerenmarke90/eimir-web:v0.1.1@sha256:44f2ed5cab65fe943c6135a5a77b4fc2a5b34d72812f89e0f0f12f2655be63b0` |
| Previous known-good | `v0.1.0` / `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` |
| Schema head | `0061` in both `v0.1.0` and `v0.1.1` |
| Android | excluded from the release manifest; no APK/AAB or Android signing claim |

The `v0.1.1` publication contains the release manifest, evidence index, exact
Self-Hosted image identity, deterministic operator bundle, runtime archives, SPDX
SBOMs, provenance/SBOM attestation material, trusted roots, release notes and
checksums. #915 independently verified the complete published checksum set and the
published archive attestations.

## Launch scope frozen by this review

### In scope

- **Web** — launch client.
- **Self-Hosted** — launch operating mode.
- **Public Demo boundary** — G5 exposure/isolation evidence, while remaining an
  independent Demo deployment rather than a Production staging substitute.
- **Commercial source: `ADMIN_GRANT` only** — the accepted first-launch source from
  `docs/m6/ENTITLEMENT-BOUNDARY.md`.

### `NOT_APPLICABLE` for this launch

- **Android store/package launch** — `v0.1.1` explicitly records
  `android.included=false`; the current Web-first/Capacitor distribution track does
  not make an Android store artifact part of this release.
- **Cloud/Managed** — not part of the reviewed first launch. This review does **not**
  certify Cloud/Managed as launch-ready. #797 and the still-missing real managed
  promotion/restore/runtime evidence remain mandatory before a later Cloud/Managed
  go-live.
- **`GOOGLE_PLAY`, `CLOUD_STRIPE`, `SELF_HOSTED_KEY`** — not selected launch
  Entitlement sources. They are not implicitly implemented or certified.

This is a scope decision, not a waiver. M7-M9 feature expansion and native store
feature parity remain outside G5 unless a future decision creates a real launch-safety
dependency.

## `v0.1.0` → `v0.1.1` runtime-diff review

The actual tag comparison is seven commits and eight changed paths:

- `.github/workflows/release-candidate.yml`;
- `.github/workflows/release-publish.yml`;
- `docs/IMPLEMENTATION-STATUS.md`;
- `docs/SELF-HOSTING.md`;
- `docs/m6/G5-EVIDENCE-DELTA-914-2026-09-20.md`;
- `docs/m6/G5-EVIDENCE-DELTA-916-2026-09-20.md`;
- `docs/m6/G5-EVIDENCE.md`;
- `tools/ci/test_release_publish_workflow.py`.

There is **no** change under `backend/`, `web/`, `android/`, `design/`,
`deploy/`, no change to `compose.yaml`, and no migration/runtime schema change.
The schema head is `0061` for both releases.

Therefore runtime-behavior evidence from #916 and #917 may be carried forward to the
reviewed `v0.1.1` release without rerunning the full accessibility or public-Demo
program. Release/publication identity evidence is **not** carried forward from
`v0.1.0`; it is replaced by the direct `v0.1.1` publication and promotion evidence
in the #915 delta.

### Candidate versus publication bytes

The candidate and publication runs independently invoke the #193 evidence build for
the same source SHA, so their Docker archives are not required to be byte-identical.
The final publication run then loads and pushes the exact archives built and attested
inside that publication run without another application rebuild. The authoritative
release identity is the published manifest/archive hashes and registry digests, not
the candidate archive hash.

The phrase **build once** in the release documentation therefore applies to the
selected artifact set **within the final publication run**, not to byte equality
between the independent candidate and publication runs. This review adds a narrow
documentation clarification to make that boundary explicit. It does not weaken the
published-byte attestation requirement.

## Evidence transfer and focused rechecks

### #914 — release publication

The `v0.1.0` publication identity itself is not reused as proof for `v0.1.1`.
Instead, #915 records and verifies the direct `v0.1.1` candidate/publication runs,
immutable Release, assets, checksums, SBOMs, attestations and exact OCI digests.

The unresolved approval-policy finding from #914 **does** remain relevant and was
observed again for `v0.1.1`; it is now isolated in #1123.

### #915 — promotion / rollback

New release-specific evidence is accepted directly for `v0.1.1`:

- exact published digests accepted in isolated Development;
- persistence across restart;
- released standalone operator bundle works without repository/workaround;
- Production-mode guard before migration before runtime;
- authenticated Production-mode flow;
- exact API/Web source revision;
- application rollback `v0.1.1 -> v0.1.0`;
- roll-forward `v0.1.0 -> v0.1.1`;
- no database rollback; schema stays `0061`;
- invalid release/version/image combinations fail closed;
- incompatible-schema rollback rehearsal fails closed.

### #916 — accessibility

The complete `v0.1.0` release-state Web acceptance remains valid for `v0.1.1`
because no Web or backend runtime source changed between the tags. It covers all 10
launch-state scenarios, keyboard/focus, 320 CSS px, 200% reflow, maintenance/admin/
Entitlement states, and zero Axe critical/serious findings.

No Android transfer is claimed because Android is outside this launch release.

### #917 — public Demo

The live #917 evidence remains valid for the G5-17 behavior/isolation boundary because
no Demo/backend/Web/Compose runtime source changed between `v0.1.0` and `v0.1.1`.
The public Demo evidence remains explicitly bound to immutable **`v0.1.0`**; this
review does **not** claim the public Demo is currently deployed as `v0.1.1`.

That is acceptable for G5-17 because Demo is an independent deployment identity and
the relevant runtime implementation is identical. The retained #917 proof covers
HTTPS/TLS, exact immutable Demo identity, separate resources, Production fail-closed,
single-use entry proof/no reusable public password, CORS, authoritative Entitlements,
live reset and post-reset verification. A complete #917 rerun would add no new
runtime evidence for `v0.1.1`.

## Complete final G5 criteria matrix

| ID | Final status | Review basis |
| --- | --- | --- |
| G5-01 — G4 Core Release Candidate baseline | `PASS` | Accepted G4/#192 baseline plus the later M6 evidence package; no current release-scope evidence invalidates the Core baseline. |
| G5-02 — coherent immutable release identity / controlled publication | `BLOCKED` | `v0.1.1` has coherent immutable artifact identity, but the required `production-release` release-owner approval was absent. #1123 owns the missing control. |
| G5-03 — SBOM, attestations and provenance | `PASS` | Published `v0.1.1` runtime archives have SPDX/provenance material; published checksums and attestations verify against source `33939ad42...`. |
| G5-04 — Self-Hosted backup/restore/upgrade/recovery | `PASS` | #190/#524 real restore evidence plus the release-source `Backup, Restore, and Upgrade` and upgrade/rollback rehearsal checks; selected topology remains Self-Hosted single-host. |
| G5-05 — Development→Production promotion, migration and rollback/forward-fix | `PASS` | #915 `v0.1.1` delta: published digests, Development acceptance, Production-mode promotion, authenticated smoke, app rollback and roll-forward, no DB rollback. |
| G5-06 — supported Cloud/Managed production topology | `NOT_APPLICABLE` | Cloud/Managed is explicitly excluded from this first launch. #797 and real managed target evidence remain required before any later Cloud go-live. |
| G5-07 — registration, maintenance and ServerAdmin lockout safety | `PASS` | #912/#913 re-exercised the historical #676 failure path on fresh Self-Hosted Compose; maintenance/lockout evidence from #524 remains valid. |
| G5-08 — structured observability and redaction | `PASS` | #189/#524 incident evidence produced actionable sanitized diagnostics without ProtectedPayload, tokens or private-content leakage. |
| G5-09 — incident detection, response and recovery drill | `PASS` | #522/#524 controlled readiness-loss/recovery drill and runbooks remain the accepted launch-topology evidence. |
| G5-10 — relationship/Space offboarding and retention | `PASS` | #518 lifecycle and #524 offboarding/cache/job/privacy evidence remain current; release-source integration/security checks are green. |
| G5-11 — Account deletion and restore reconciliation | `PASS` | #520/#524 plus #670 post-rehearsal former-member semantics cover deletion, retained shared history, privacy projection and restore reconciliation. |
| G5-12 — accepted versioned commercial/Entitlement product model | `PASS` | ADR 0006 / Feature Matrix v1.1 / #262 are frozen; downgrade and trust/data-rights boundaries are explicit. |
| G5-13 — central Entitlement enforcement and launch source adapters | `PASS` | #523 backend-authoritative capability enforcement and `ADMIN_GRANT` lifecycle evidence cover the only selected launch source; unselected providers are explicitly N/A. |
| G5-14 — final Security/Privacy/Tenant Isolation | `PASS` | #524 cross-Space/OWNER_ONLY/ServerAdmin negative evidence plus deletion/offboarding deltas; release-source Backend Integration, Secret Scan and CodeQL are green. |
| G5-15 — final release-state Accessibility acceptance | `PASS` | #916 Web evidence transfers from `v0.1.0` because the tag diff has no Web/backend runtime change. Android is outside the launch channel. |
| G5-16 — launch-topology performance/capacity | `PASS` | #524 bounded single-host Self-Hosted synthetic evidence remains topology-relevant. No SLA or hyperscale claim is made. |
| G5-17 — public Demo exposure/isolation boundary | `PASS` | #917 live HTTPS `v0.1.0` evidence transfers for the unchanged runtime; the Demo identity remains explicitly `v0.1.0`, not falsely relabeled as `v0.1.1`. |
| G5-18 — integrated launch rehearsal evidence complete | `PASS` | #524 plus the 2026-09-12 and 2026-09-20 focused deltas form a traceable package; this review consumes them additively. |
| G5-19 — final explicit G5 decision | `BLOCKED` | This dated review is complete, but G5 cannot be `PASS` while G5-02/#1123 remains unresolved. |

## Security / Privacy / Tenant / data-rights conclusion

No current evidence reviewed here identifies a launch-scope Cross-Tenant or
`OWNER_ONLY` leak, ServerAdmin private-content bypass, deletion/offboarding restore
gap, or diagnostics leak of ProtectedPayload/tokens/signed URLs. The release source
also passed Backend Integration, CodeQL, Secret Scan and supply-chain checks.

Essential Security, Privacy, Accessibility, Account deletion and portability remain
non-paywallable. `ADMIN_GRANT` cannot broaden authorization; Entitlement evaluation
remains downstream of authentication, membership/ownership and Tenant/Privacy checks.

## Recovery / release conclusion

The supported launch topology is Self-Hosted. Recovery evidence covers coordinated
database/media restore and upgrade semantics; the release-specific #915 exercise covers
published-image promotion, application rollback and roll-forward. No evidence or
documentation claims that selecting an older application image rewinds the database.

The actual release source passed the repository's Self-Hosted start, backup/restore/
upgrade and release-entry-point checks before publication.

## Administration / incident conclusion

Registration/verification/ServerAdmin bootstrap, maintenance access, redacted
observability and the controlled incident drill have traceable evidence. No host shell
or private-content browser is introduced through ServerAdmin.

## Commercial-runtime conclusion

The launch commercial source is `ADMIN_GRANT` only. The normalized backend
Entitlement core is authoritative. Downgrade/revocation is non-destructive and
Security/Privacy/data-rights operations stay available. No absent payment provider is
invented as launch evidence.

## Open blocker

### #1123 — protected publication lacks required release-owner approval

The technical `v0.1.1` artifact set is coherent and verified. The blocker is the
authorization control around **creating** that immutable release:

- `docs/m6/IMMUTABLE-RELEASES.md` requires `production-release` to have explicit
  release-owner approval before Production publication;
- #914 recorded that the Environment existed without a protection rule / required
  reviewer;
- #915 records that the same approval gate was still absent for `v0.1.1`.

The gate review does not weaken that rule. #1123 must either produce a launch release
through the required approved boundary or drive an explicit Product Owner/release-
governance decision that deliberately changes the contract. Historical #914/#915
evidence must remain unchanged.

## Non-blocking observations

1. Candidate and publication archives differ because candidate and publish are
   independent builds of the same source. The final publish run separately generates,
   attests and then promotes its own exact archives. Candidate-byte equality is not used
   as release identity.
2. Published images are currently `linux/amd64`; this is a supported artifact fact,
   not a G5 blocker for the reviewed Self-Hosted launch.
3. The public Demo evidence is intentionally retained on immutable `v0.1.0`; G5-17
   reuses it only because the `v0.1.0...v0.1.1` runtime diff is empty.
4. M7 work, including the open #432 stack, is post-launch product expansion and does
   not alter this gate.
5. #797 remains a real Cloud security requirement, but Cloud/Managed is not certified
   by this review and is not part of the selected first launch.

## Exit condition

#525 remains open. The next G5 review should be narrow:

1. consume #1123 evidence;
2. bind the reviewed launch identity to the release that crossed the approved
   publication boundary (or to an explicit accepted release-governance contract
   revision);
3. re-evaluate G5-02 and G5-19 only, unless the release source/runtime or launch scope
   changed;
4. do **not** rerun #916/#917 or the full #524 program when the runtime remains
   unchanged.

Until then, the authoritative decision is:

> **G5 — Launch-ready: BLOCKED.**
