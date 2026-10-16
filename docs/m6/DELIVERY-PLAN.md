# M6 Delivery Plan

**Parent:** #437  
**Gate:** G5 — Launch-ready

The plan uses one clear issue/branch/PR per slice. M6-S0 may run while M5 Android
work continues because it is documentation/issue planning only. Runtime M6 starts
from the G4 Core Release Candidate and refreshes `main`, open PRs and the relevant
owning decisions before every slice.

## 1. Entry criteria

M6 runtime entry requires:

- #437 merged;
- G4 passed for the intended Core Release Candidate;
- no unresolved blocking decision for the specific slice;
- current `main` and open PRs checked for scope/file conflicts;
- Reuse-before-build and business/freemium review recorded where relevant.

A backend/ops-only slice may be technically parallelizable with late M5 work, but
roadmap ordering remains G4 -> M6. Do not use technical parallelism to make an M6
runtime change silently part of M5.

## 2. Ordered slices

### M6-S0 — Readiness contract

**Owner:** #437  
**Type:** documentation/architecture  
**Runtime:** none

Deliver this `docs/m6/` package, classify existing work, create missing focused
owners and freeze the boundary. This is the only active M6 slice before G4 by
default.

---

### M6-A-S1 — Release artifacts and signing

**Owner:** #519  
**Depends on:** G4, #194, #375  
**Feeds:** #193, #524

Create one immutable release identity across backend/API/worker/migrate, Web and
Android; release manifest/checksums; controlled Android publishing/signing
operations; deterministic previous-known-good selection.

Keep Android changes limited to release/build mechanics. Do not mix M5 client UI or
Domain behavior into this slice.

### M6-A-S2 — SBOM and attestations

**Owner:** #193  
**Depends on:** artifact set from #519 sufficiently frozen  
**Feeds:** #524

Generate machine-readable SBOM/provenance for the exact launch artifact set and
make verification part of release evidence. May be developed in parallel with the
later part of #519 once artifact names/identity are stable.

---

### M6-B-S1 — Relationship/Space offboarding lifecycle

**Owner:** #518  
**Depends on:** G4 identity/cache/portability contracts where touched  
**Feeds:** #520, #524

Freeze and implement leaving/removing/ending-Space semantics, old Membership access,
private/shared content behavior, pending jobs/caches and retention of a Space with
no active members. Reuse #345; no breakup-specific export format.

### M6-B-S2 — Complete Account deletion/retention

**Owner:** #520  
**Depends on:** #518 lifecycle boundary; reuses #190 and #345  
**Feeds:** #524

Implement the account-wide deletion/retention matrix, session/auth revocation,
private/shared/media cleanup and restore-after-deletion reconciliation.

#518 and #520 may share decision work, but their runtime PRs remain separate so
Space offboarding cannot accidentally become Account deletion.

### M6-B baseline — Recovery/upgrade

**Owner:** delivered #190  
**New implementation:** none unless #524 finds a target-specific gap

Do not create another backup system. #524 repeats/extends evidence only where the
actual launch topology requires it.

---

### M6-C baseline — Persistent Development and Self-Hosted promotion

**Owner:** delivered #375  
**New implementation:** none unless #524 finds a target-specific gap

Reuse its immutable revision, migration, smoke and rollback/forward-fix contract.

### M6-C-S1 — Cloud/Managed launch topology

**Owner:** #521  
**Depends on:** #375/#190; release identity from #519 for final promotion wiring  
**Feeds:** #524

Define and validate the supported managed topology, data/secret isolation,
database/media responsibility, rollout, recovery, capacity assumptions and one
versioned deployment representation. Preserve the same Domain/Privacy contracts as
Self-Hosted.

### M6-C baseline — Public Demo

**Owner:** delivered #304  
**New implementation:** none unless #524 finds a release regression

Demo remains isolated and outside the Development -> Production chain.

---

### M6-D-S1 — Registration and maintenance controls

**Owner:** #334  
**Depends on:** G4 auth/admin baseline  
**Feeds:** #335, #522, #524

Persist/administer registration and maintenance policy, public capability state,
audit changes and preserve ServerAdmin/bootstrap recovery access.

### M6-D-S2 — ServerAdmin dashboard

**Owner:** #335  
**Depends on:** #334; consumes #189 health/diagnostic state where available  
**Feeds:** #524

Provide privacy-safe application operations: aggregate status, maintenance controls,
safe read-only config, worker/job failure view and audit. No relationship-content
browser, host shell or container/filesystem orchestration.

---

### M6-E-S1 — Structured observability

**Owner:** #189  
**Depends on:** G4 runtime baseline  
**Feeds:** #335, #522, #524

Request/correlation IDs, job/outbox correlation, structured logs, redaction and
minimal safe health/job/latency/error metrics. No mandatory external telemetry SaaS
for Self-Hosted.

### M6-E-S2 — Incident response and runbooks

**Owner:** #522  
**Depends on:** #189; reuses #190/#375 and #334 when delivered  
**Feeds:** #524

Define alert/detection boundary, privacy-safe incident evidence and executable
runbooks; perform a controlled incident/rollback-or-forward-fix drill.

#334/#335 and #189 can proceed in parallel once G4 is stable. #522 follows the
signals/admin actions it consumes.

---

### M6-F-S0 — Commercial product/architecture decision

**Owner:** #262  
**Type:** product + architecture  
**Hard blocker for:** #523 and provider adapters

Freeze the versioned feature matrix, capability ownership, lifecycle, downgrade,
existing-user migration, Self-Hosted behavior and launch commercial channels.

### M6-F-S1 — Central Entitlement/Capability core

**Owner:** #523  
**Depends on:** completed #262  
**Feeds:** provider adapters, #524

Implement normalized source evidence -> Entitlement -> Capability evaluation with
backend authority, tenant-safe ownership, non-destructive downgrade, generated
client read contract, deterministic Development/Demo states and restore behavior.

### M6-F-S2+ — One focused adapter per selected launch source

**Owner:** create after #262 selects required launch channels  
**Depends on:** #262, #523

Do **not** create one omnibus provider PR. Create one issue/branch/PR for each
accepted source, for example only where selected:

- Google Play purchase/restore/refund adapter;
- hosted subscription/webhook/reconciliation adapter;
- Self-Hosted commercial-license validation/offline adapter;
- promotional/manual grant adapter if it is part of launch operations.

Each adapter performs its provider-specific Reuse-before-build/legal/privacy review
and maps into #523. Provider SDKs/SKUs/receipts never enter Domain feature code.

Client paywall/restore UI follows only after the normalized contracts and selected
sources are stable; do not race the M5 Android delivery chain.

---

### M6-G-S1 — Integrated launch rehearsal/evidence

**Owner:** #524  
**Depends on:** G4 and every required M6 launch slice/source adapter  
**Feeds:** #525

Run one exact release candidate through release provenance, Development promotion,
launch topology, restore/upgrade, admin lockout, observability/incident,
entitlement failure/recovery, data lifecycle, final accessibility and bounded
capacity evidence. Use fictional/synthetic data.

Failures spawn focused owning issues; #524 does not absorb runtime fixes.

### G5 Gate — Final dated decision

**Owner:** #525  
**Depends on:** #524 complete

Review `docs/m6/G5-EVIDENCE.md` and the dated #524 report. G5 passes only when every
required criterion is `PASS` or legitimately `NOT_APPLICABLE` for the explicitly
declared launch target.

## 3. Dependency graph

```text
M5 -> G4
       |
       v
     #437 (S0, may be done earlier as docs-only)
       |
       +--> #519 ----> #193 ----------------------+
       |      |                                   |
       |      +----------> #521 ------------------|
       |                                          |
       +--> #518 ----> #520 ----------------------|
       |                                          |
       +--> #334 ----> #335 ----------------------|
       |       \                                  |
       |        +--> #522 <---- #189 -------------|
       |                                          |
       +--> #262 ----> #523 ----> source adapters-|
                                                  v
                                                #524
                                                  |
                                                  v
                                                #525
                                                  |
                                                  v
                                              G5 PASS
```

Delivered #190/#304/#375 and the #194 decision feed the graph as reusable baseline
evidence rather than new slices.

## 4. Parallel work lanes after G4

Reasonable parallel lanes after current-main/conflict checks:

- **Lane A:** #519 -> #193;
- **Lane B:** #518 -> #520;
- **Lane C:** #521, coordinating release identity with #519;
- **Lane D:** #334 -> #335;
- **Lane E:** #189 -> #522;
- **Lane F:** #262 decision work, then #523 and source adapters.

Do not start #524 until all required lanes are complete for the declared launch
target.

## 5. Per-slice Definition of Done

Every M6 runtime slice requires:

1. current `main` and open PRs refreshed before implementation;
2. one clear issue/branch/PR scope;
3. Reuse-before-build result recorded when relevant;
4. business/freemium impact recorded;
5. Security/Privacy/Tenant/Audit implications reviewed;
6. OpenAPI/generated clients synchronized when contracts change;
7. deterministic tests plus targeted negative/privacy tests;
8. no secrets/private content in logs, artifacts or docs;
9. normal repository CI green;
10. owning docs/evidence index updated without editing historical gate records.

## 6. What does not block M6

The following do not become implicit launch requirements:

- M7 Relationship Depth;
- M8 Discovery/Integrations;
- M9 location/context features;
- E2EE;
- arbitrary host orchestration;
- mandatory external APM;
- a second queue/cache/backup/export platform;
- a payment provider not selected by #262 for launch.
