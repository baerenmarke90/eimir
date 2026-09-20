# G5 Launch-Readiness Evidence Matrix

**Readiness owner:** #437  
**Integrated evidence owner:** #524  
**Final gate decision:** #525  
**S0 baseline:** `main` at `7564800df85f53f9f0c9a99a7414de22906ade73`  
**2026-09-05 integrated rehearsal:** `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md` (candidate `d0a4f2030a22f775a22679f7f225117bf51e91df`)  
**2026-09-12 post-rehearsal delta:** `docs/m6/G5-EVIDENCE-DELTA-2026-09-12.md` (baseline `735e37c26000991e0365ff360a6b8af69e691199`)  
**2026-09-12 G5-07 bootstrap delta:** `docs/m6/G5-EVIDENCE-DELTA-G5-07-2026-09-12.md` (product baseline `298af42a5a8ed162b49afbbc045e89781628eb2a`)  
**2026-09-20 #914 release publication delta:** `docs/m6/G5-EVIDENCE-DELTA-914-2026-09-20.md` (release `v0.1.0`, source `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`)  
**2026-09-20 #916 manual launch accessibility delta:** `docs/m6/G5-EVIDENCE-DELTA-916-2026-09-20.md` (release `v0.1.0`, source `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`)

This matrix is the authoritative M6 index for **G5 — Launch-ready** evidence. It
separates reusable repository baselines from final release-candidate proof.

A closed issue or merged PR is not, by itself, evidence that the launch topology
passed the integrated gate.

The 2026-09-05 rehearsal status column is a dated historical record. For #668 and
#670, #525 must also consume the general 2026-09-12 post-rehearsal delta. For the
specific #676/G5-07 bootstrap failure, #525 must also consume the focused G5-07
delta. Later evidence may close a current requirement without rewriting what was or
was not exercised during the historical rehearsal.

## 1. Status vocabulary

Every final G5 criterion uses exactly one status:

- `PASS` — traceable evidence for the reviewed release candidate exists;
- `FAIL` — the requirement was exercised and is not met;
- `BLOCKED` — required work/evidence is incomplete;
- `NOT_APPLICABLE` — excluded only with an explicit rationale consistent with the
  declared launch target.

At S0, criteria that depend on future G4/M6 runtime/rehearsal work are intentionally
`BLOCKED`. Delivered baselines are marked as available inputs, not pre-emptive
`PASS` results.

## 2. Evidence record identity

Before #524 starts the integrated rehearsal, record:

- exact release candidate commit SHA;
- product release version/tag;
- backend/Web/Android artifact identities/digests as applicable;
- Android application ID/version/signing channel;
- database/Alembic revision;
- persistent Development revision;
- launch Production/staging-equivalent revision;
- declared launch operating modes: Self-Hosted and/or Cloud/Managed;
- selected commercial/Entitlement source adapters required for those launch
  channels;
- Demo revision when it is included in release regression evidence;
- test date/time and environment;
- evidence/report revision.

Do not record secrets, receipts, license keys, tokens, private content or production
user fixtures in the evidence report.

## 3. Reusable baseline inputs

| Baseline | Available evidence | Final-G5 limitation |
|---|---|---|
| #190 | repository Self-Hosted PostgreSQL + LocalMediaStore backup/restore/upgrade contract and tests | #524 must exercise target-relevant restore/upgrade/recovery |
| #194 | Android identity/version/signing code boundary | #519/#524 must prove actual release publication/signing operations |
| #304 | isolated canonical public Demo foundation | #524 must regression-test Demo isolation/hardening on the reviewed release |
| #375 | persistent Development, immutable revision, promotion/smoke and rollback/forward-fix contract | #524 must exercise the real candidate through the launch path |
| #192 / G4 | browser/a11y automation and client gate evidence when complete | M6 reuses it; #524 adds only final release-state/manual gaps |

These inputs reduce duplicated work but do not waive the integrated G5 checks.

Post-rehearsal privacy hardening under #670 is part of the current G5-11 evidence
contract: retained `SPACE_SHARED` history must expose a semantic former-member
author state, suppress removed profile identity, and let Web/Android localize the
neutral label without rendering the technical persistence tombstone. The
2026-09-12 delta records revision-addressable automated evidence for that semantic
requirement. This updates the living evidence requirement only; it does not rewrite
the historical 2026-09-05 rehearsal result.

Post-rehearsal deployment hardening under #668 is likewise additive. The 2026-09-12
delta records `PASS` repository/CI evidence for digest-pinned Cloud/Managed runtime
identity, while keeping real managed promotion/runtime/rollback evidence distinct.
If Cloud/Managed is included in the launch scope, that environment evidence remains
required. If it is excluded, only #525 may record the corresponding explicit
`NOT_APPLICABLE` scope decision.

Post-rehearsal #912 evidence re-exercises the exact Self-Hosted log-mail bootstrap
path that made historical G5-07 fail under #524/#676. On product baseline
`298af42a5a8ed162b49afbbc045e89781628eb2a`, a fresh canonical Compose stack passed
first-account registration, fail-closed pre-verification ServerAdmin access, log-mail
verification delivery/consumption and verified ServerAdmin access. This removes #676
as the current G5-07 blocker without rewriting the historical `FAIL`; #525 still owns
the final criterion decision.

Post-rehearsal #916 evidence exercises the final release-state Web accessibility
acceptance on published release `v0.1.0` (source
`8bb0c1eadbeb4864788d277a25a3673c79f5e46f`, Web digest
`sha256:edd2f5f88bafe8fde5a2dd6223507b3fb71d14474d0c5f7162d2696324be12f1`, Backend
digest
`sha256:f3b5f7ea23aad99844ed558dd4a148d4196cb1b52c6ceed3a0d8636a9715ddd1`). Manual
and spot acceptance verified release identity, Demo Entry, Standard Entry, Authenticated
Shell & Skip Link, Quick Create overlay, Games Entitlement shelf, ServerAdmin
unauthorized access gate & authorized settings/maintenance toggle, maintenance mode
presentation, and 320px responsive touch targets with zero critical or serious Axe WCAG
violations. Android is documented as `NOT_APPLICABLE` for the Web-/Self-Hosted-first
launch scope of `v0.1.0` (consistent with #914). See
`docs/m6/G5-EVIDENCE-DELTA-916-2026-09-20.md`. This provides the missing evidence to
close G5-15 for #525.

## 4. G5 criteria

| ID | Criterion | Required evidence / owner | S0 status | 2026-09-05 rehearsal status |
|---|---|---|---|---|
| G5-01 | G4 Core Release Candidate baseline | final M5/G4 review, including #192 where applicable; exact candidate reused by M6 | `BLOCKED` — G4 must pass | `PASS` — M5 client issues (#295, #350) closed; #192 automation green in CI on this lineage |
| G5-02 | Coherent immutable release identity and controlled Android signing/versioning | #194 baseline, #519 release manifest/artifacts; #668 exact OCI deployment binding when Cloud/Managed is in scope; #524 plus later delta/release verification | `BLOCKED` | `BLOCKED` — no release published yet; needs real signing secrets + operator-approved `release-publish.yml` run (report §1) |
| G5-03 | SBOM, attestations and provenance | #193 bound to exact #519 artifact/release identity; #524 verification | `BLOCKED` | `BLOCKED` — same as G5-02; mechanism contract-tested and green, nothing published to verify yet (report §2) |
| G5-04 | Self-Hosted backup/restore/upgrade/recovery | #190 baseline plus #524 real restore/upgrade/recovery evidence | `BLOCKED` — repository baseline available | `PASS` — real backup→fresh-target restore→migrate→smoke cycle executed, data/history integrity verified (report §4) |
| G5-05 | Development-to-Production promotion, migration and rollback/forward-fix | #375 baseline, #519 release identity, #668 exact Cloud runtime/previous-known-good identity where managed launch is in scope; #524 plus later delta candidate evidence | `BLOCKED` — repository baseline available | `BLOCKED` — mechanics (migration-before-traffic, revision consistency, smoke) proven live and in CI; genuine two-host promotion needs real infrastructure (report §3) |
| G5-06 | Supported Cloud/Managed production topology | #521 deployment contract, #668 digest-pinned runtime/rollback identity, recovery/capacity evidence and #524 plus 2026-09-12 delta when managed launch is in scope | `BLOCKED` | `BLOCKED` — #521 topology/recipe frozen and contract-tested; no real managed cloud account available to exercise a real restore (report §11) |
| G5-07 | Registration, maintenance and ServerAdmin lockout safety | #334, #335, #524 privileged-flow and negative-access evidence; #676/#912 focused post-rehearsal log-mail bootstrap evidence | `BLOCKED` | `FAIL` — maintenance/lockout mechanics confirmed live; documented log-mail bootstrap path is broken by over-redaction, filed as #676 (report §5) |
| G5-08 | Structured observability and redaction | #189 logs/correlation/metrics plus #524 redaction/diagnostic evidence | `BLOCKED` | `PASS` — live incident drill produced sanitized logs/correlation IDs throughout, no secret/ProtectedPayload leakage (report §6) |
| G5-09 | Incident detection, response and recovery drill | #522 runbooks + controlled drill, integrated/recorded by #524 | `BLOCKED` | `PASS` — full database-readiness-loss drill executed live with real timestamps (report §6) |
| G5-10 | Relationship/Space offboarding and retention | #518 lifecycle contract and #524 old-Membership/cache/job/privacy evidence | `BLOCKED` | `PASS` — verified against merged code/tests when #518 closed this session; `test_space_offboarding*.py` family green in CI (report §8) |
| G5-11 | Complete Account deletion and restore reconciliation | #520 retention/deletion matrix and minimal pseudonymous recovery-metadata classification; #670 semantic former-member projection and 2026-09-12 delta for retained shared history; #524 deletion/restore evidence | `BLOCKED` | `PASS` — `test_account_deletion*.py` (12 files, incl. reconciliation/restore-replay) green in `Backend Integration` this session; not separately re-executed live (report §8) |
| G5-12 | Accepted versioned commercial/Entitlement product model | #262 final capability matrix, ownership, lifecycle, downgrade and launch-channel decisions | `BLOCKED` | `PASS` — ADR-0006 + Feature Matrix v1.1 authoritative; launch channel declared (`ENTITLEMENT-BOUNDARY.md` §7.1) |
| G5-13 | Central Entitlement enforcement and launch source adapters | #523 plus one focused adapter per source selected by #262; #524 lifecycle/outage/restore evidence | `BLOCKED` | `PASS` for `ADMIN_GRANT` (grant/downgrade/audit exercised live end to end); `NOT_APPLICABLE` for `GOOGLE_PLAY`/`CLOUD_STRIPE`/`SELF_HOSTED_KEY` (report §7) |
| G5-14 | Final Security/Privacy/Tenant Isolation | G4 baseline plus #524 synthetic cross-Space, `OWNER_ONLY`, admin/ops and data-lifecycle negative tests | `BLOCKED` | `PASS` — live cross-tenant probe (404) and ServerAdmin content-boundary check both confirmed (report §8) |
| G5-15 | Final release-state Accessibility acceptance | G4/#192 automation reused; #524 manual keyboard/focus/TalkBack/large-text launch-state gaps only; #916 manual launch acceptance delta (`docs/m6/G5-EVIDENCE-DELTA-916-2026-09-20.md`) | `BLOCKED` | `BLOCKED` — automation green in CI; manual keyboard/TalkBack spot-check of maintenance/entitlement states not performed this session (report §9). *Post-rehearsal delta: PASS for Web / NOT_APPLICABLE for Android on v0.1.0.* |
| G5-16 | Launch-topology performance/capacity | #521 assumptions and #524 bounded synthetic API/worker/database/media evidence | `BLOCKED` | `PASS` — bounded single-host synthetic check recorded, explicitly not an SLA claim (report §10) |
| G5-17 | Public Demo exposure/isolation boundary | #304 baseline plus #524 release regression for DB/media/secrets/reset/auth/Entitlement isolation | `BLOCKED` — repository baseline available | `BLOCKED` — config-layer hardening (signing key, HTTPS) confirmed fail-closed live; full live rehearsal needs a real TLS/domain (report §11) |
| G5-18 | Integrated launch rehearsal evidence complete | #524 dated report with every criterion linked to an artifact/test/drill/decision or blocker; later focused delta records remain additive | `BLOCKED` | `PASS` — this report and table constitute that package |
| G5-19 | Final explicit G5 decision | #525 review of this matrix, the #524 report and post-rehearsal delta records against the exact reviewed release candidate | `BLOCKED` | `BLOCKED` — reserved for #525; not decided here |

## 5. Evidence expectations by criterion class

### Automated repository evidence

Appropriate evidence includes successful, revision-addressable results for:

- normal repository CI;
- security/privacy/Tenant negative tests;
- migration/schema drift;
- OpenAPI/generated-client consistency;
- release artifact identity checks;
- SBOM/attestation verification;
- backup/restore helpers where automated;
- structured-log/redaction tests;
- Entitlement lifecycle/provider-sandbox tests;
- Demo isolation guards.

A green CI run must correspond to the reviewed candidate or an explicitly identical
artifact/source identity.

### Operator / environment evidence

Required where the repository cannot prove real environment facts:

- actual Development/Production secret and datastore separation;
- protected TLS/ingress behavior;
- managed database/media restore;
- signing/publishing key custody and successful release publication;
- maintenance/Admin recovery access;
- incident response drill;
- measured restore and capacity observations;
- external provider outage/restore behavior for selected launch sources.

For Cloud/Managed, repository-level digest validation is not a substitute for
observing and retaining the exact digest identity used by the real/staging-equivalent
managed runtime. When that operating mode is in scope, the evidence must bind the
running backend/Web digests and previous-known-good rollback identity to the exact
#519 release without retaining deployment secrets.

Record the result and revision, not sensitive credentials or private data.

### Manual client evidence

M6 does not rerun the complete G4 client program. Manual G5 evidence is limited to
release/launch states automation cannot fully prove, for example:

- Web critical release flow keyboard/focus spot-check;
- Android TalkBack/large-text/back-navigation on the actual release artifact where
  required by G4;
- accessibility of maintenance, locked/Premium and recovery states introduced in
  M6;
- final store/install/update smoke where applicable.

## 6. Security / Privacy evidence invariants

The final report must explicitly show that launch operations do **not** weaken:

- Tenant Guard / privacy-safe cross-Space behavior;
- partner `OWNER_ONLY` isolation;
- Account/Space-bound client cache clearing/reconciliation;
- non-paywallable Account deletion and essential portability;
- separation of ServerAdmin/host operations from private-content browsing;
- redaction of ProtectedPayload, `OWNER_ONLY`, tokens, cookies, signed URLs,
  receipts/license secrets and raw provider payloads;
- Demo/Development/Production data and secret isolation.

Deletion-journal evidence follows the same minimization rule: do not record raw
private payloads, email addresses, tokens, credentials, or relationship content.
The journal itself is not classified as ordinary non-personal metadata merely
because those fields are absent; its stable Account UUID and acceptance timestamp
remain pseudonymous/account-linkable recovery metadata.

No G5 criterion can be waived by classifying a trust/data-rights gap as Premium or
post-launch polish.

## 7. Entitlement evidence rule

G5 only requires provider adapters for the commercial sources #262 explicitly
selects for the declared first launch channels.

For every selected source, #524 must exercise as applicable:

- activation;
- restore/reconciliation;
- expiry/grace;
- downgrade without data loss;
- refund/revocation;
- outage/stale evidence;
- relationship/account ownership transitions;
- Self-Hosted offline behavior;
- deterministic Development/Demo behavior;
- server-authoritative enforcement;
- absence of provider secrets/private content in logs and clients.

An unselected provider is not silently a blocker. It may be `NOT_APPLICABLE` only
when #262/#525 explicitly define the launch channel scope.

The commercial-source scope and operating-mode scope are independent. Selecting
`ADMIN_GRANT` as the first-launch Entitlement source does not by itself include or
exclude Cloud/Managed from G5.

## 8. Recovery evidence rule

A backup configuration or provider claim is not sufficient. #524 must demonstrate a
usable restore for the supported launch topology and show:

- database/media consistency expectations;
- application/schema compatibility;
- previous-known-good release selection;
- rollback vs. forward-fix vs. restore decision;
- post-recovery health/revision smoke;
- deletion reconciliation through the newest protected forward journal when the
  restored snapshot predates an Account deletion required by #520;
- the journal classified as **minimal pseudonymous recovery metadata**: content-free
  and data-minimized, but account-linkable and recovery-sensitive rather than
  identity-free operational metadata.

Record measured recovery timing honestly; do not infer an untested SLA/RPO/RTO.

## 9. Performance/capacity evidence rule

G5 requires bounded evidence appropriate to the initial launch target, not a
hyperscale architecture.

Record:

- tested topology/resources;
- synthetic workload shape;
- representative API latency/error behavior;
- worker queue/backlog/recovery behavior;
- database/media bottleneck observations;
- any known safe launch limits/assumptions.

Do not use real relationship content as load-test data and do not make performance
claims beyond the measured environment.

## 10. Dated integrated report and later deltas

#524 produces one dated launch-rehearsal report linked from this matrix. For every
G5 ID it must provide:

- status;
- release/environment identity;
- evidence link/reference;
- concise result;
- blocker/follow-up owner if not `PASS`;
- `NOT_APPLICABLE` rationale when used.

Later focused evidence records may add proof for requirements implemented or
re-exercised after that rehearsal. They must identify their exact baseline and may
not edit historical statuses to make the dated run appear greener.

Failures create or reopen focused owning issues. Do not implement unrelated fixes in
the evidence report itself.

## 11. Final #525 gate

#525 reviews the exact #524 report, applicable post-rehearsal delta records and the
final reviewed release candidate. G5 passes only when:

- every required criterion is `PASS`;
- every `NOT_APPLICABLE` entry has an honest launch-scope rationale;
- the final record explicitly names the certified operating mode(s), so an excluded
  Cloud/Managed mode is not accidentally presented as launch-ready;
- there is no unresolved launch-critical Security/Privacy/Tenant/Data-Rights,
  recovery, release, admin, observability or required Entitlement gap;
- M7-M9 scope has not been pulled into the gate merely as optional product polish.

Only after #525 records `PASS` may authoritative roadmap/status documentation mark
**G5 — Launch-ready** as passed.
