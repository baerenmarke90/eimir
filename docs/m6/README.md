# M6 — Operate & Launch

**Status:** readiness contract for #437  
**Gate:** G5 — Launch-ready  
**Planning baseline:** `main` at `7564800df85f53f9f0c9a99a7414de22906ade73` (2026-09-01)

M6 turns the G4 Core Release Candidate into an operable, recoverable, observable,
administrable and commercially enforceable launch product. This package freezes the
launch boundary before M6 runtime work is split across focused issues.

M6-S0 is documentation and issue planning only. It introduces no backend, Web or
Android runtime behavior.

## 1. Milestone boundary

| Area | M5 / G4 | M6 / G5 | M7-M9 |
|---|---|---|---|
| Client completion | Web (packaged for Android via Capacitor), cache, deep links, accessibility automation, release-candidate client behavior | only final release-state/manual evidence not already proven by G4 | optional product expansion |
| Operations | prerequisites may exist | supported deployment, recovery, administration, observability, incident response | later scale/operational sophistication |
| Commercial model | no ad-hoc gating | accepted #262 model becomes centralized Entitlement runtime | later commercial/channel evolution |
| Product features | Core Release Candidate | no feature expansion merely to enrich launch | Relationship Depth, Discovery/Integrations and Context expansion |

M7, M8 and M9 are explicitly **not** G5 prerequisites unless a future decision
proves that a specific item is required for launch safety rather than product scope.

## 2. G5 definition

G5 is evidence-testable. Launch-ready means all required items below have traceable
`PASS` evidence for one exact release candidate and declared launch topology:

1. G4 client/release-candidate baseline is passed.
2. Backend/Web/Android release artifacts have a coherent immutable identity,
   controlled signing/versioning and rollback selection.
3. SBOM/attestation/provenance is attached to the released artifact set.
4. Self-Hosted and Cloud/Managed launch modes have documented supported operating
   contracts, with explicit environment/data/secret isolation.
5. Backup, restore, upgrade, migration and rollback/forward-fix boundaries are
   demonstrated on the supported launch topology.
6. Registration, maintenance and ServerAdmin behavior cannot create unrecoverable
   lockout or private-content browsing privileges.
7. Logs, correlation, metrics and incident tooling are operationally useful and do
   not expose ProtectedPayload, `OWNER_ONLY`, tokens, signed URLs or provider
   secrets.
8. Account/Space offboarding, retention and complete Account deletion responsibilities
   are resolved and restore-safe.
9. The accepted Free/Premium model is implemented through one centralized,
   provider-neutral, backend-authoritative Entitlement boundary.
10. Every commercial source used at launch has focused restore/reconciliation/outage
    evidence; provider concepts do not leak into Domain feature code.
11. Final Security/Privacy/Tenant, accessibility, performance/capacity and public
    Demo boundaries are validated against the release candidate.
12. A controlled incident/recovery drill and integrated launch rehearsal pass.
13. #525 records the dated G5 decision.

`docs/m6/G5-EVIDENCE.md` is the criterion/evidence index. A criterion is never
`PASS` merely because an issue is closed.

## 3. Workstream inventory

| Workstream | Owner(s) | Readiness status | S0 treatment |
|---|---|---|---|
| M6-A Release engineering | #519, #193 | OPEN | #194 and #375 reused; publication/signing and provenance remain |
| M6-B Operations/recovery/data lifecycle | #190, #518, #520 | PARTIAL | #190 reused; retention/offboarding/Account deletion remain |
| M6-C Deployment/environments | #375, #521, #304 | RESOLVED | Self-Hosted promotion, Demo and Cloud/Managed launch topology (`CLOUD-MANAGED-TOPOLOGY.md`) all frozen; `#524` performs the integrated rehearsal |
| M6-D Administration | #334, #335 | OPEN | registration/maintenance before ServerAdmin integration |
| M6-E Observability/incidents | #189, #522 | OPEN | safe diagnostics first, incident runbooks/drill second |
| M6-F Entitlements | #262, #523, provider-specific follow-ups | RESOLVED | #262/#523 core done; first launch uses `ADMIN_GRANT` only (`ENTITLEMENT-BOUNDARY.md` §7.1), real payment providers `NOT_APPLICABLE` for V1 |
| M6-G Integrated evidence/gate | #524, #525 | PARTIAL | #524 evidence package complete (`G5-EVIDENCE-REPORT-2026-09-05.md`) with real PASS/FAIL/BLOCKED results; #525 final decision remains open |

### Delivered evidence reused by M6

- **#190** — `SELF-HOSTED-RECOVERY.md`, PostgreSQL + LocalMediaStore backup,
  restore and upgrade evidence, Alembic roll-forward and S3/operator boundary.
- **#194** — final Android application ID `de.sidebyside.app`, debug separation,
  publisher-supplied `versionCode` and repository-external signing material.
- **#304** — isolated canonical public Demo environment/data/reset/authentication
  boundary.
- **#375** — persistent isolated Development, immutable revision identity,
  Development-before-Production migration/smoke gates and rollback/forward-fix
  contract.

M6 must not create competing implementations for these capabilities.

## 4. Operating model vs. product tier

Two independent axes remain binding:

```text
Operating model: Self-Hosted | Cloud/Managed
Product tier:    Free/Core   | Premium (and lifecycle states accepted by #262)
```

Cloud/Managed may have operational responsibilities, resource accounting and
provider integrations that Self-Hosted does not. Those differences belong at
operations/provider boundaries. They do not create contradictory Domain behavior
or authorize access to user data.

Security, Privacy, Accessibility, Account/data deletion and essential portability
remain non-paywallable.

## 5. Environment model

The existing #375/#304 contract remains authoritative:

```text
Local / PR -> persistent Development -> Production
                    X
                    |
                   Demo
```

Demo is independent, uses fictional data, and is not a release gate. Development,
Demo and Production do not share databases, media stores, signing/session secrets
or provider credentials.

Cloud/Managed launch topology is completed by #521. It must preserve the same
revision, migration, isolation and smoke invariants.

## 6. Backup is not portability

Operational backup/recovery (#190) restores a supported service instance and may
contain PostgreSQL, media and protected operator configuration.

The M5 Transfer Bundle (#345) is a user-facing, authorization-scoped portability
artifact. `SHARED`/`PERSONAL` export semantics cannot replace an operational
recovery point, and an operator backup cannot be exposed as a user export.

## 7. Entitlement freeze rule

#262 remains the authoritative product/architecture decision. Until it is resolved:

- do not broadly paywall existing features;
- do not encode provider SKU/store concepts in Domain services;
- do not assume relationship vs. purchaser ownership;
- do not invent trial/grace/grandfathering states in runtime;
- do not select a Self-Hosted licensing behavior by accident.

#523 implements only the accepted model. Each actual launch entitlement source
(Google Play, hosted subscription, Self-Hosted commercial license, promotion, or
other accepted source) receives its own focused adapter issue after #262 selects the
required launch channels.

## 8. Parallelism and Android isolation

#437 itself is intentionally safe to execute while M5 Android work continues: this
branch changes only `docs/m6/` and issue planning.

After S0, the roadmap entry condition for M6 runtime remains G4. In particular,
client-visible entitlement/paywall work must not race the active M5 Android delivery
chain. Release, deployment, admin and observability slices also refresh `main` and
open PRs before implementation and keep their issue/file scope narrow.

## 9. Non-goals

M6/G5 does not add:

- M7 Relationship Depth features;
- M8 Discovery/Integration features merely for launch polish;
- M9 location/context features;
- E2EE;
- a host/container shell inside ServerAdmin;
- custom payment processing;
- a second backup/export architecture;
- Kubernetes, Redis/Celery/Kafka or another platform without a demonstrated launch
  need and Reuse-before-build evidence;
- rewritten historical G1-G4 reviews.

## 10. Package index

- `DECISION-LOG.md` — frozen, blocking, before-release and later decisions.
- `DELIVERY-PLAN.md` — ordered small slices and dependencies.
- `OPERATIONS-RECOVERY.md` — #190 reuse and remaining G5 gaps.
- `ACCOUNT-DELETION-RETENTION.md` — #520 Account deletion/retention matrix and restore-reconciliation contract.
- `DEPLOYMENT-RELEASE.md` — release artifacts, environments, promotion and rollback.
- `CLOUD-MANAGED-TOPOLOGY.md` — #521 frozen Cloud/Managed v1 topology, deployment representation and recovery mapping.
- `ADMIN-OBSERVABILITY.md` — privileged administration and diagnostic boundaries.
- `ENTITLEMENT-BOUNDARY.md` — provider-neutral runtime boundary feeding #523.
- `G5-EVIDENCE.md` — criterion/evidence ownership and final gate inputs.
