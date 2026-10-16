# M3 G3 Gate Review — Shared Everyday Use

**Date:** August 30, 2026  
**Gate:** G3 — Shared everyday use  
**Reviewed `main`:** `fdaa4402ba59bc3532fedab44d5e64fdf68c2727`  
**Reviewed tree:** `6ed0e1008bfb35e388c5a1da3f6f748e5f9cbef9`  
**M3-S9:** Issue #261 / PR #263  
**M3-S10:** Issue #264  
**Decision:** **G3: PASSED**

This file is the immutable dated M3-S10 gate snapshot. Later status changes must be recorded in living status documents or a new dated review; this review is not rewritten retroactively.

## 1. Review boundary

G3 is the Domain/API/PostgreSQL gate frozen by M3-D24 in `docs/m3/decisions/G3-CLIENT-BOUNDARIES.md`. It evaluates the completed M3 Planning & Private Area runtime, the five mandatory real HTTP/PostgreSQL flows, and the binding Security/Privacy/Concurrency/Delete/contract evidence.

G3 deliberately does **not** require complete Web/Android productization, systematic client parity, persistent read cache, Export/Import, Deep Links, final Accessibility acceptance, or client performance. Those remain M5/G4. M4 Search/Dashboard/Activity/Notifications/Reminders/Rules implementation is also outside this review.

No new production capability, dependency, provider, service, migration, API operation, or client feature is introduced by M3-S10.

## 2. Reviewed repository state

M3-S9 was merged through PR #263 into `main` as merge commit:

- `fdaa4402ba59bc3532fedab44d5e64fdf68c2727`

The validated S9 PR head was:

- `5b4ffb5e881f82664c1fbc087afe168c5d44baed`

Both the validated PR head and the post-merge `main` commit resolve to the same tree:

- `6ed0e1008bfb35e388c5a1da3f6f748e5f9cbef9`

Therefore the exact repository tree evaluated by the S9 pull-request workflows is the tree reviewed for this G3 decision. PR #263 closed Issue #261 after the successful merge.

## 3. Authoritative S9 workflow evidence

All workflows attached to the exact S9 head completed successfully:

| Workflow | Run | Run ID | Result |
|---|---:|---:|---|
| CI | #1018 | `33303226921` | success |
| Reuse Review | #772 | `33303227006` | success |
| Self-Hosted Deployment Guard | #715 | `33303226982` | success |
| CodeQL SAST | #510 | `33303226984` | success |
| G2 Client E2E regression guard | #404 | `33303226941` | success |

The CI run includes the unchanged repository gates for backend lint/format/type checking, canonical OpenAPI, generated API clients, PostgreSQL integration, Secret Scan, Provenance, Supply Chain, and Self-Hosted startup. The final Backend Integration job completed successfully after migrations and the full PostgreSQL integration test step.

No existing gate was disabled, weakened, bypassed, or replaced for S9 or S10.

## 4. Mandatory M3-D24 G3 flows

The executable mapping is authoritative in `docs/m3/G3-EVIDENCE.md`. The following five mandatory flows are all satisfied against the production-like FastAPI/PostgreSQL integration stack.

### Flow 1 — Wish -> Plan -> Complete: PASS

Evidence includes:

- `test_wish_to_plan.py::TestRequiredFlow::test_wish_becomes_plan_and_is_completed`;
- retry/idempotency and stale-version coverage in `test_wish_to_plan.py`;
- Plan lifecycle coverage in `test_plans.py`;
- independent-transaction double-submit, rollback, Delete-vs-Convert, and Complete-vs-Return races in `test_wish_plan_races.py`.

The evidence proves exactly one Plan is created, retries are deterministic, stale writes do not leave partial state, and Wish/Plan completion cannot end in a half lifecycle.

### Flow 2 — Place + typed Relation + Delete: PASS

Evidence includes:

- Place CRUD with and without coordinates in `test_places.py`;
- typed Memory/SHARED HeartMoment/Milestone relation paths in `test_place_relations.py`;
- Cross-Space and private-target fail-closed behavior;
- Place deletion removing relation rows without deleting Domain originals;
- real PostgreSQL relation/delete and privacy-transition races in `test_place_relation_races.py` and `test_place_races.py`.

The shared relation boundary does not extend target read rights, and private/non-readable targets do not become observable through relations.

### Flow 3 — Chapter + Relations + Delete: PASS

Primary integrated evidence:

- `test_m3_g3_evidence.py::test_g3_chapter_relations_delete_preserves_originals_over_http`.

The test creates a Chapter plus Memory, SHARED HeartMoment, and Milestone through the real API, links all three typed relation families, verifies deterministic derived cross-type ordering, deletes the Chapter, and proves every original remains readable at the unchanged version. Additional privacy, ordering, preservation, and race evidence remains in the Chapter relation suites.

### Flow 4 — Shared Collection: PASS

Evidence includes:

- Item content/version separation, completion, atomic full-list reorder, and deterministic stale conflicts in `test_collections_api.py`;
- Parent Delete cascading only to Collection Items;
- competing Reorder and Reorder-vs-Create/Delete/Completion races in `test_collection_races.py`;
- Parent Delete vs. Item Create/Reorder races in `test_collection_parent_delete_races.py::TestSharedCollectionParentDeleteRaces` using independent PostgreSQL transactions.

The aggregate retains contiguous positions and deterministic root/item version semantics under concurrency.

### Flow 5 — Private Area owner/partner negative path: PASS

Primary integrated evidence:

- `test_m3_g3_evidence.py::test_g3_private_area_owner_partner_owner_session_switch_is_isolated`.

Using the same ASGI client, the owner creates and mutates PrivateNote, GiftIdea, and PrivateCollection/Item; authorization then switches to the partner, where lists remain empty and direct/mutation paths fail with privacy-safe absence semantics; switching back to the owner proves the private state remained intact.

Additional owner-only CRUD, event-redaction, reorder, and Parent Delete race evidence remains in `test_private_area_api.py`, `test_private_collections_api.py`, `test_private_collection_races.py`, and `test_collection_parent_delete_races.py`.

## 5. Gate-blocking negative evidence

| G3 requirement | Result | Evidence boundary |
|---|---|---|
| Cross-Tenant isolation | PASS | central tenant suites, endpoint matrix, and M3 foreign-Space tests |
| `OWNER_ONLY` isolation / no existence leak | PASS | private authorization/API suites plus integrated Flow 5 |
| Wish/Plan lifecycle, idempotency, rollback, races | PASS | `test_wish_to_plan.py`, `test_plans.py`, `test_wish_plan_races.py` |
| Relation to private/non-readable targets | PASS | Place and Chapter relation API suites |
| Relation/privacy/delete races | PASS | Place/Chapter real PostgreSQL race suites |
| Shared Collection structural consistency | PASS | API, reorder races, Parent Delete races |
| PrivateCollection structural consistency | PASS | API, reorder races, Parent Delete races |
| Delete preservation outside Parent-Child ownership | PASS | Place/Chapter preservation tests and integrated Flow 3 |
| Protected/private event and log redaction | PASS | M3 slice-specific Outbox/log assertions mapped by S9 |
| OpenAPI / ETag / privacy-safe errors | PASS | canonical contract and M3 API suites |
| Generated TypeScript/Kotlin client compatibility | PASS | API Clients job in CI #1018 |
| PostgreSQL migrations/integration | PASS | Backend Integration job in CI #1018 |
| SAST / supply-chain / secret / provenance guards | PASS | CodeQL #510 and CI #1018 |
| Self-Hosted regression guard | PASS | Self-Hosted Deployment Guard #715 and CI #1018 |

No test evidence shows a state forbidden by the M3 decisions, a Tenant/`OWNER_ONLY` leak, or data loss outside the documented Parent-Child cascade semantics.

## 6. Open finding audit

The open GitHub issues were reviewed at the S10 checkpoint for the M3-D24 blocker class: actual Critical/High Security, Privacy, or Tenant findings, or a known Tenant/`OWNER_ONLY` leak.

**No open issue currently documents such a G3-blocking finding.** GitHub priority is not treated as vulnerability severity.

Notable open work that remains non-blocking for G3 includes:

- #188 — Responsible Disclosure / Private Vulnerability Reporting: a security-process and reporting-channel gap, not a documented vulnerability or Tenant/Privacy leak;
- #189 — structured logging and request correlation: later Observability hardening; it does not report an existing protected-content disclosure, while current M3 redaction evidence is green;
- #190 — automated Backup/Restore/Upgrade evidence: Operations/Release hardening, not a demonstrated M3 Domain data-loss defect;
- #192 and #65 — browser/Accessibility and client UX work explicitly assigned to M5/G4;
- #193 and #194 — release artifact/Android identity hardening;
- #138 — generated Android Passkey model tooling limitation outside the M3 G3 runtime boundary;
- #88, #58, #218, and #262 — future/product/cleanup work outside the frozen G3 scope.

These items remain real backlog and are not reclassified as completed by this review. They simply do not satisfy the specific G3 blocking conditions.

## 7. Gate assessment

The M3 runtime and evidence set satisfy the G3 contract:

- Wishes/Plans/Places/Chapters/Collections are consistent under the tested lifecycle and concurrency rules;
- Private Area data remains owner-only and fail-closed across partner and authorization-context changes;
- Delete, relation, version-conflict, rollback, and race effects are deterministic and preserve Domain originals where required;
- protected/private payloads remain outside shared/event/log surfaces covered by the gate;
- the canonical OpenAPI and generated clients remain synchronized;
- the exact S9 tree passed CI, PostgreSQL integration, CodeQL, Reuse Review, deployment, supply-chain, provenance, secret-scan, and client-regression guards;
- no actual open Critical/High Security/Privacy/Tenant finding or known Tenant/`OWNER_ONLY` leak blocks the gate.

The M5/G4 client-completion requirements remain explicitly open and are not used to inflate this G3 result.

## 8. Decision and consequence

**G3: PASSED**

M3 — Planning & Private Area is complete for its defined Domain/API/PostgreSQL milestone and G3 gate. The next roadmap milestone is M4 — Engage, whose first defined delivery boundary is M4-A Search + Dashboard Read Models.

This review does not start or implement M4. M4 work requires its own scoped issues, decisions, branches, pull requests, Reuse review where relevant, and unchanged repository gates.