# M5 G4 Gate Review — Core Release Candidate

**Date:** September 3, 2026  
**Gate:** G4 — Core Release Candidate  
**Reviewed `main`:** `61ff4b059f7538fa055fe6c26ace5c0bca829bdb`  
**Reviewed tree:** `87f430dcfc7cd1b104444439378c27ea15a91522`  
**M5-Web:** Issue #295  
**M5-Android:** Issue #350  
**Parity audit:** Issue #295 comment of 2026-09-02, findings #603-#608  
**Decision:** **G4: PASSED**

This file is the immutable dated M5 gate snapshot. Later status changes must be recorded in living status documents or a new dated review; this review is not rewritten retroactively.

## 1. Review boundary

G4 is the Core Release Candidate gate defined in `docs/ROADMAP.md`. It evaluates the completed M5 client-completion runtime: Web and Android productization of the M0-M4 Core, Read Cache, Export/Import, Deep Links, Design System and automated Accessibility semantics, and systematic Web/Android parity.

G4 deliberately does **not** require launch readiness. Cloud/Managed and Self-Hosted launch topology, Backup/Restore/Upgrade demonstration, release artifact identity and signing, retention and complete-deletion lifecycle, Entitlements/Billing runtime, incident processes, and final release QA remain M6/G5. No M7-M9 Relationship Depth, Discovery, or expansion domain is part of this gate.

Two scope reductions recorded on 2026-09-02 in `docs/IMPLEMENTATION-STATUS.md` and `docs/ROADMAP.md` apply to this review and are not reopened here:

- manual Accessibility acceptance testing is **not** a G4 requirement; the per-slice automated Accessibility semantics stand as the accepted evidence;
- dedicated Performance evidence is **not** a separate G4 requirement; the per-PR Cross-Cutting Quality review covers query count, payload size, and resource impact.

No new production capability, dependency, provider, service, migration, or API operation is introduced by this review.

## 2. Reviewed repository state

The reviewed `main` commit is the merge of PR #614, the last of the six parity-audit fixes:

- `61ff4b059f7538fa055fe6c26ace5c0bca829bdb`

The validated PR #614 head was:

- `c40eeaddc5926454f2fa22921c428ffc042d281f`

Both resolve to the same tree:

- `87f430dcfc7cd1b104444439378c27ea15a91522`

Therefore the exact tree evaluated by the PR #614 workflows is the tree reviewed for this G4 decision.

The client workflows are `pull_request`-scoped with path filters, so they do not re-run on pushes to `main`. The Android client workflows last ran on PR #612 (merge commit `b86753f62c34b8045c719181abdd3066aa167dca`). `git diff b86753f6 main -- android/` is empty: every change merged after that point touches `web/**` only. The Android client evidence from PR #612 therefore applies unchanged to the reviewed tree, and the Web client evidence from PR #614 applies to the identical reviewed tree.

## 3. Authoritative workflow evidence

Workflows on the reviewed `main` commit `61ff4b05`:

| Workflow | Run ID | Result |
|---|---:|---|
| CI | `33693930733` | success |
| CodeQL SAST | `33693930771` | success |
| Self-Hosted Deployment Guard | `33693930722` | success |
| Self-Hosted Recovery | `33693930808` | success |

The CI run's jobs all succeeded: Change Detection, Backend, Backend Integration, API Clients, Secret Scan, Supply Chain, Provenance, Self-Hosted Start. Backend Integration ran the PostgreSQL migrations and the full integration suite rather than skipping.

Client workflows on the identical reviewed tree (PR #614) and on the last Android-touching tree (PR #612):

| Workflow | Run ID | Source | Result |
|---|---:|---|---|
| Web Reference Flow | `33693491942` | PR #614 | success |
| Playwright + axe | `33693491965` | PR #614 | success |
| Real Web and Android client flow | `33693491918` | PR #614 | success |
| Reuse Review | `33693491876` | PR #614 | success |
| Android Reference Flow | `33691670951` | PR #612 | success |
| Real Web and Android client flow | `33691670795` | PR #612 | success |

Independent local verification of the reviewed tree:

- `./gradlew :app:testDebugUnitTest` — 438 tests across 72 classes, 0 failures;
- `npm run test` (Web) — 194 passed, 1 skipped (`referenceFlow.e2e.test.ts`, which requires a live server and is skipped by design outside the E2E job).

No existing gate was disabled, weakened, bypassed, or replaced for M5 or this review.

## 4. G4 criteria

The authoritative criteria are `docs/ROADMAP.md` section "G4 — Core Release Candidate".

### 4.1 Web and Android are domain-equivalent for the Core: PASS

The parity audit required by the criterion was performed on 2026-09-02 against actual code rather than documentation claims, covering Story (Memory/HeartMoment/Milestone/Comments/attachments), Shared Planning (Wish/Plan/Place/Chapter/Collection), Private Area (PrivateNote/GiftIdea/PrivateCollection), Today/Search/Activity/Notifications, Portability/S6, Accessibility, and Localization. It is recorded in full on Issue #295.

It found six real functional gaps and no others. All six are now closed and merged:

| Finding | Direction | Delivered by |
|---|---|---|
| #603 HeartMoment content editing | Android missing | PR #609 |
| #604 Comment editing | Web missing | PR #613 |
| #605 Wish/Plan editing, direct Plan creation, real schedule/complete dates, Chapter place | Android missing | PR #611 |
| #606 Collection and PrivateCollection icon field | Web missing | PR #614 |
| #607 Collection and PrivateCollection item renaming | Android missing | PR #612 |
| #608 Search type filter, and pagination for Search/Activity/Notifications | Android missing | PR #610 |

The audit separately confirmed as already equivalent: Memory and Milestone full lifecycle plus comments; Place, Chapter content-linking, PrivateNote, GiftIdea and PrivateCollection CRUD; Today/dashboard including Thinking-of-You; Notifications read-state, unread count and open-target resolution; Activity feed content; Transfer Bundle Export and Import; read cache behaviour; and localization coverage.

Both clients are built against the same canonical OpenAPI contract, and the API Clients job in CI proves the generated TypeScript and Kotlin clients remain synchronized with it.

### 4.2 Read Cache/offline-read works without pretending Offline Write exists: PASS

The binding contract is `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`, frozen by #303.

- Retention: both clients enforce the seven-day maximum age — `web/src/client/productReadCache.ts:34` (`PRODUCT_READ_CACHE_MAX_AGE_MS`) and `android/.../cache/ProductReadCache.kt:71` (`MAX_AGE_MILLIS`), each applied at read time.
- Scope: Web persists approved `SPACE_SHARED` snapshots only and blocks non-shared payloads (`canPersistProductReadPayload`); Android protects owner-only payloads behind the M2-D18 Keystore boundary (`AndroidKeystoreProtectedPayloadCipher`, AES/GCM with a non-exportable `AndroidKeyStore` key) and fails closed to memory-only when the cipher is unavailable.
- Clearing: both clients clear the cache on logout, account change, and Space change.
- No Offline Write: the S6 decision states that every write remains disabled or offline-failed while the server is unavailable and that SideBySide does not queue writes for later synchronization in M5. The clients match this — the cached presentation is read-only and dated, comment creation is gated on `!offline`, and no write queue or sync engine exists in either client.

Cache behaviour is covered by `web/src/client/productReadCache.test.ts` and the Android cache suites, both green on the reviewed tree.

### 4.3 Export/Import is versioned and tested: PASS

Transfer Bundle v1 is server-owned and explicitly versioned: `backend/src/sidebyside/transfer/archive.py:17` defines `FORMAT_VERSION = 1`, it is written into every manifest, and import rejects any other value with `TRANSFER_FORMAT_UNSUPPORTED`.

Twenty tests cover it across three suites, all inside the green Backend and Backend Integration jobs:

- `tests/unit/test_transfer_archive.py` (10) — valid bundle acceptance, unsafe path rejection, non-portable security/entitlement/cache entries, duplicate and symlink entries, checksum mismatch, unsupported format, `SHARED` bundles refusing private entries, and archive-bomb bounds (entry-size pre-check and compression ratio);
- `tests/unit/test_transfer_privacy.py` (2) — `SHARED` and `PERSONAL` imports rejecting account-scoped configuration;
- `tests/integration/test_transfer.py` (8) — creator-bound export descriptors, privacy-safe foreign-Space ids, worker re-checking active membership, `SHARED` excluding `OWNER_ONLY` while `PERSONAL` keeps only the requester's own, a shared round trip, idempotent personal apply, owner-mapping refusal, and idempotent physical deletion of expired staged imports.

Both clients expose the flow end to end: Web through `TransferPanel`, Android through `DataExportScreen` and `DataImportScreen` with an explicit stage-validate-apply sequence in which apply is never automatic.

### 4.4 Deep Links and route identity are stable: PASS, with a declared boundary

`docs/decisions/0003-primary-navigation-and-route-model.md` fixes the route model; `web/src/client/routes.ts` is the canonical registry and states that Web and Android use the same stable route IDs. Android's route constants carry doc comments naming the Web path they mirror.

Stability is enforced by tests, green on the reviewed tree:

- `routes.test.ts` (12) — stable id resolution, at most five primary destinations in the documented order, sub-route activity, encoded Story and planning deep-link builders, `LEGACY_ROUTE_REWRITES` rewriting every destination that moved, shared content deep links continuing to work, whole-segment-only replacement, and current paths left untouched;
- `deepLinks.test.ts` (3) — canonical targets carrying opaque identity for shared and owner-only resources, app-relative return targets accepted only in canonical form, and external, legacy, normalized or content-bearing return targets rejected.

**Declared boundary:** Android does not register an OS-level App Link (`VIEW`/`BROWSABLE` intent filter), so the app cannot currently be opened from an external URL. This is not an unmet requirement but a scope decision already recorded in the binding S6 document, which names "future Android App Links" as later work and specifies that Notifications/Activity and those future App Links should resolve from a small logical target tuple. Android already implements that tuple resolution (`engagementTargetRoute`), so the contract this gate requires to be stable is implemented on both clients; only the OS-level entry point remains future work. This review records the boundary explicitly rather than treating it as satisfied.

### 4.5 Design System verified and automated Accessibility semantics delivered: PASS

Design System verification, all green on the reviewed tree:

- `webLayout.test.ts` (13) — bounded main region and documented content width, breakpoint-driven content zones, context rail placement without document reordering, overview columns from one tunable minimum, reading measure on wide pages, compact-viewport header stacking, the layout scale used by the primitives, resolution of **every** custom property the stylesheets consume, single-stylesheet ownership of the bottom navigation grid, and consistent control surfaces for selects, checkboxes and radios;
- `theme.test.ts`, `themeBootstrap.test.ts`, `themePreference.test.ts`, `themeResponsive.test.ts`, `shellResponsive.test.ts`;
- Android design tokens in `SideBySideDimensions.kt`/`SideBySideTheme`, including `MinimumTouchTarget = 48.dp` applied across interactive surfaces.

Automated Accessibility semantics:

- `themeContrast.test.ts` (5) — primary and secondary text at WCAG AA in both schemes, readable primary actions, entry copy across every hero gradient stop, status text on its semantic surface, and the focus indicator above the 3:1 UI contrast threshold;
- the Playwright + axe browser QA workflow, green on the reviewed tree (run `33693491965`), delivering the automated Accessibility gate that #192 asked for;
- twenty Android Compose UI test classes exercising semantics, among them the dedicated `AppNavigationAccessibilityTest`, `AppShellSemanticsTest`, `EntryScreenSemanticsTest`, `StoryScreenSemanticsTest` and `ReferenceFlowScreenSemanticsTest`, covering screen-reader names, headings, focus order and touch targets.

Manual acceptance testing is deprioritized by the recorded 2026-09-02 decision and is not claimed here.

### 4.6 Privacy and Security gates pass: PASS

On the reviewed tree:

- CodeQL SAST succeeded for java-kotlin, javascript-typescript and python;
- Secret Scan, Supply Chain and Provenance succeeded in CI;
- Backend and Backend Integration succeeded, including `tests/integration/test_tenant_isolation.py` (18 tests) and `OWNER_ONLY` coverage spread across 17 backend test files;
- Self-Hosted Deployment Guard and Self-Hosted Recovery succeeded.

The client-side privacy boundaries the M5 slices introduced hold as specified: Web never persists `OWNER_ONLY` payloads, Android encrypts them behind the Keystore boundary, `SHARED` Transfer Bundles exclude either member's `OWNER_ONLY` data, and both clients state owner-only visibility in product copy rather than relying on server ACLs alone.

### 4.7 No M7 domain is required to declare the Core client-complete: PASS

ADR 0006 and #433 keep M7 Relationship Depth out of M5 and move the Entitlement/Billing runtime boundary to M6/#262. The reviewed clients contain no M7 domain runtime.

The clearest structural evidence is the reserved Discover area: `routes.ts` declares `RESERVED_DISCOVER_ROUTE` so the path and label cannot be reused, deliberately does not route it, and `routes.test.ts` pins that it "reserves Discover without routing it before its domain exists". Every M7, M8 and M9 issue remains open and unstarted.

## 5. Gate-blocking negative evidence

| G4 requirement | Result | Evidence boundary |
|---|---|---|
| Web/Android domain equivalence for the Core | PASS | Issue #295 parity audit; #603-#608 closed via PRs #609-#614 |
| Generated client/contract synchronization | PASS | API Clients job, CI `33693930733` |
| Read cache retention and scope rules | PASS | `productReadCache.ts:34`, `ProductReadCache.kt:71`, Keystore cipher, cache suites |
| Cache cleared on logout/account/Space change | PASS | Web `App.tsx` session and Space effects; Android `logout`/`clearSpaceBoundState` |
| No Offline Write promised or queued | PASS | S6 decision; read-only cached presentation; no sync engine in either client |
| Transfer Bundle versioning enforced | PASS | `FORMAT_VERSION`, `TRANSFER_FORMAT_UNSUPPORTED`, `test_unsupported_format_is_rejected` |
| Transfer privacy scoping (`SHARED` vs `PERSONAL`) | PASS | `test_transfer_privacy.py`, `test_shared_export_excludes_owner_only_...` |
| Transfer archive hardening (paths, symlinks, bombs, checksums) | PASS | `test_transfer_archive.py` |
| Route identity and legacy deep-link stability | PASS | `routes.test.ts` (12) |
| Deep-link opacity and return-target validation | PASS | `deepLinks.test.ts` (3) |
| Design System token and layout integrity | PASS | `webLayout.test.ts` (13), theme suites, Android design tokens |
| Automated Accessibility semantics | PASS | `themeContrast.test.ts` (5), Playwright + axe `33693491965`, 20 Compose semantics classes |
| Cross-tenant isolation | PASS | `test_tenant_isolation.py` (18) in Backend Integration |
| `OWNER_ONLY` isolation / no existence leak | PASS | owner-only coverage across 17 backend suites; client privacy copy |
| SAST / supply-chain / secret / provenance guards | PASS | CodeQL `33693930771`, CI `33693930733` |
| Self-Hosted regression and recovery guards | PASS | `33693930722`, `33693930808` |
| Core client-completeness without M7 | PASS | reserved-but-unrouted Discover; all M7-M9 issues open |

No evidence shows a state forbidden by the M5 decisions, a Tenant or `OWNER_ONLY` leak, or a client promising a capability it does not have.

## 6. Open finding audit

The 89 open GitHub issues were reviewed for the gate-blocking class: an actual Critical or High Security, Privacy, or Tenant finding, or a known Tenant/`OWNER_ONLY` leak. GitHub priority is not treated as vulnerability severity.

**No open issue documents such a G4-blocking finding.**

The security and operations backlog the G3 review listed as non-blocking has since largely closed: #188 Responsible Disclosure, #189 structured logging, #190 automated Backup/Restore/Upgrade evidence, #192 browser E2E and automated Accessibility gates, #194 Android release identity, and #138 Passkey tooling are all closed.

Notable open work that remains non-blocking for G4:

- #193 — SBOM and build attestations: explicitly M6 release hardening;
- #518 and #520 — Space offboarding and complete account deletion/retention: M6/G5 privacy lifecycle scope. #518 documents that the existing membership lifecycle (`ACTIVE`/`LEFT`/`REMOVED` with retained history) and the Transfer Bundle scoping already behave correctly, and asks for a richer product flow rather than reporting a defect;
- #565 — push notification delivery: a deliberately deferred enhancement; in-app notification list, read state and unread count are delivered and at parity;
- #568, #578, #492, #498, #501, #513 — explicitly Post-G4 client polish and onboarding work;
- #490 — CI process streamlining;
- #519, #521, #522, #524, #525, #529, #549, #551 — M6/G5 launch readiness and ServerAdmin;
- the M7-M9 product backlog, outside this gate by design.

These remain real backlog and are not reclassified as completed by this review. They simply do not satisfy the G4 blocking conditions.

## 7. Gate assessment

The M5 client runtime and evidence set satisfy the G4 contract:

- Web and Android are domain-equivalent for the Core; the required parity audit was performed, its six real findings were closed rather than accepted, and no gap remains open;
- offline read works within the frozen retention and scope rules, and neither client pretends Offline Write exists;
- Export/Import is version-gated, privacy-scoped, hardened against hostile archives, and tested end to end;
- route identity and the canonical Deep Link contract are stable and tested, with the OS-level Android App Link entry point explicitly recorded as future work under its own binding decision;
- the Design System resolves every token its stylesheets consume, and the automated Accessibility semantics are delivered on both clients and gated in CI;
- Privacy and Security gates pass on the reviewed tree, with tenant and owner-only isolation covered by integration evidence;
- no M7 domain was needed to reach Core client-completeness.

The M6/G5 launch-readiness requirements remain explicitly open and are not used to inflate this G4 result.

## 8. Decision and consequence

**G4: PASSED**

M5 — Client Completion & Parity is complete for its defined milestone and gate. Web and Android are a Core Release Candidate.

The next roadmap milestone is **M6 — Operate & Launch**, whose scope is already broken out in #519, #520, #521, #522, #524, #529 and the ServerAdmin slices, and whose gate is G5 (#525).

This review does not start or implement M6. M6 work requires its own scoped issues, decisions, branches, pull requests, Reuse review where relevant, and unchanged repository gates.
