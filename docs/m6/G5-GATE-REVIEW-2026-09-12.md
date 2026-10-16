# G5 gate review — 2026-09-12

Issue: #525  
Review baseline: `dde33076e64a3c8c2264b4a4221bcfb460dcd7de`  
Historical integrated rehearsal: `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md`  
Living evidence matrix: `docs/m6/G5-EVIDENCE.md`  
Post-rehearsal deltas: #910/#911 and #912/#913

## Decision

**G5 — Launch-ready: BLOCKED**

The current repository and post-rehearsal evidence close several historical gaps, including the #670 former-member privacy semantics and the #676 Self-Hosted ServerAdmin bootstrap failure. They do not yet establish a complete launch-ready release.

No criterion is waived in this review. Historical G1-G4 and the 2026-09-05 G5 rehearsal remain unchanged.

## Release identity reviewed

The SHA above is the **review baseline**, not a declared launch release candidate.

At review time:

- no GitHub Release is published for the repository;
- no launch release version/tag has been frozen and published;
- therefore there is no published artifact set to which final SBOM/attestation/signing evidence can be bound;
- open product work, including PR #818, means the current `main` should not be treated implicitly as a frozen release candidate.

#914 owns the missing protected release-publication evidence. #525 must be re-evaluated against the exact version and commit selected by #914 rather than against a moving branch.

## Launch scope

### Commercial entitlement source

The first-launch commercial source remains **`ADMIN_GRANT`**. `GOOGLE_PLAY`, `CLOUD_STRIPE` and `SELF_HOSTED_KEY` remain not applicable to this launch unless the accepted launch-channel decision changes.

### Operating mode

The final first-launch operating mode has **not yet been explicitly approved** in #525 evidence.

Consequences:

- **Self-Hosted** is technically the only currently plausible first-launch operating mode for the next gate review.
- **Cloud/Managed must not be declared launch-ready now.** If Cloud/Managed is included, #797 must be completed before Cloud go-live and the still-missing real managed restore/promotion/runtime-digest evidence from #521/#668 must be executed.
- If Product Owner scope is explicitly frozen to **Self-Hosted-only**, Cloud/Managed-specific G5 requirements may be classified `NOT_APPLICABLE` for that reviewed launch, with an explicit statement that Cloud itself is not launch-ready.

This review does not silently make that Product Owner scope decision.

### Client/distribution channels

Web and Android remain part of the existing release model. The exact first-launch distribution-channel set must be frozen with #914. If Android is intentionally excluded from the first launch, #525 must record that exclusion explicitly before Android-specific release/manual-acceptance evidence can be `NOT_APPLICABLE`.

## Criterion review

| Criterion | Current status | Review result / evidence | Remaining owner |
| --- | --- | --- | --- |
| G5-01 — G4/client baseline remains valid | `PASS` | Reuse the accepted G4/#192 baseline. No evidence was found that invalidates it; final launch-state manual accessibility is tracked separately by G5-15. | — |
| G5-02 — immutable release identity and publication | `BLOCKED` | #519 implemented the release/signing contract, but no real launch release/version has been published. | #914; #827 before market launch where its Self-Hosted released-image contract applies |
| G5-03 — SBOM/attestation/provenance bound to published artifacts | `BLOCKED` | The #193 mechanism exists, but there is no published launch artifact set against which final provenance can be verified. | #914 |
| G5-04 — Self-Hosted recovery/upgrade boundary | `PASS` | Historical #524 evidence and delivered recovery work remain the accepted target-relevant baseline; no new contradictory evidence was found. | — |
| G5-05 — Development-to-launch promotion and rollback identity | `BLOCKED` | Promotion mechanics/contracts exist, but the exact published candidate has not been exercised through the real launch/staging-equivalent promotion boundary. | #915 after #914 |
| G5-06 — Cloud/Managed topology and target recovery | `BLOCKED` | First-launch operating mode is not yet frozen. If Cloud/Managed is selected, real managed restore/promotion/runtime-digest evidence is still missing and #797 is a launch-blocking Cloud security requirement. If Self-Hosted-only is explicitly selected, the managed-only portion may become `NOT_APPLICABLE`. | #525 scope decision; #797/#668/#915 if Cloud is selected |
| G5-07 — registration, maintenance and ServerAdmin lockout safety | `PASS` | #912/#913 re-exercised the exact historical #676 failure path on a fresh Self-Hosted Compose stack: registration -> pre-verification 403 -> log-mail verification -> confirmed email -> ServerAdmin 200. | — |
| G5-08 — observability redaction / diagnostics | `PASS` | Historical integrated evidence remains valid; no later change reviewed here weakens the safe-diagnostics contract. | — |
| G5-09 — incident response / recovery drill | `PASS` | Historical #524/#522 evidence remains the accepted bounded drill evidence. | — |
| G5-10 — entitlement lifecycle / failure recovery | `PASS` | The accepted first-launch `ADMIN_GRANT` boundary is covered; provider adapters not selected for launch remain outside this launch channel. | — |
| G5-11 — data lifecycle / privacy / deletion / offboarding | `PASS` | Historical evidence plus post-rehearsal #670 semantic former-member evidence covers retained shared history without leaking deleted profile identity. | — |
| G5-12 — tenant isolation / OWNER_ONLY / privileged-boundary safety | `PASS` | Existing synthetic cross-Space and privacy evidence remains valid; no contrary finding emerged in this review. | — |
| G5-13 — commercial model/source boundary | `PASS` | `ADMIN_GRANT` is the accepted first-launch source. Other provider-specific sources remain not applicable unless launch channels change. | — |
| G5-14 — non-paywallable trust/data-rights behavior | `PASS` | Security, privacy, deletion, accessibility and essential portability remain outside commercial denial. | — |
| G5-15 — final manual launch-state accessibility acceptance | `BLOCKED` | Automated G4 evidence exists, but the required release-candidate Web keyboard/focus and applicable Android TalkBack/large-text/back-navigation spot-check has not been recorded. | #916 after #914 |
| G5-16 — bounded launch-topology performance/capacity evidence | `PASS` | The bounded historical evidence is retained as launch-planning evidence; no broader SLA is claimed. Re-evaluate only if the selected launch topology materially differs. | — |
| G5-17 — public Demo live exposure/isolation | `BLOCKED` | A real HTTPS Demo endpoint now exists, but no revision-addressable live-domain rehearsal tied to the frozen release candidate is currently recorded. | #917 after #914 |
| G5-18 — integrated evidence package is reviewable | `PASS` | #524 plus the #910/#911 and #912/#913 deltas form a traceable evidence package sufficient to identify the remaining blockers without rewriting historical evidence. | — |
| G5-19 — final G5 gate decision | `BLOCKED` | Required criteria above are still blocked. G5 cannot be declared `PASS`. | #525 |

## Newly confirmed launch blockers

### Release publication and provenance — #914

The release implementation from #519 is not equivalent to a real release publication. #914 must freeze one exact candidate, execute the protected publication path and retain its manifest/digests/signing/SBOM/attestation evidence.

### Real promotion / rollback identity — #915

After #914, the same immutable candidate must be exercised through the intended Development -> launch target path. Cloud digest evidence is required only if Cloud/Managed is actually selected.

### Manual launch-state accessibility — #916

This is intentionally a small manual release-acceptance pass, not a rerun of M5/G4 accessibility automation.

### Public Demo live-domain rehearsal — #917

The public Demo must be exercised on its real HTTPS/domain boundary with revision-addressable isolation/reset/entitlement evidence.

### Cloud/Managed — #797 and target evidence

#797 is an explicit Cloud-before-go-live security requirement: sensitive database payloads and media/object-storage content must have eimir.-controlled encryption-at-rest semantics, including backup/recovery and key-management behavior. Cloud/Managed cannot be included in a G5 `PASS` while that issue and the target-environment evidence remain open.

## Pre-market release hardening

#827 is explicitly marked P2 / Pre-Launch and requires released Self-Hosted deployments to consume versioned prebuilt OCI images rather than building application images on the target host, plus simplification of the normal runtime topology. It must be completed before the first public/commercial release as specified by its Product Owner direction.

This review does not silently upgrade #827 into unrelated M7-M9 scope. It is listed because its own accepted timing is pre-market launch and it intersects the final released Self-Hosted installation model.

## What is not a blocker anymore

- #670 former-member/deleted-author semantics: post-rehearsal evidence is accepted for the relevant G5-11 behavior.
- #676 Self-Hosted log-mail verification bootstrap defect: #912/#913 provide a real fresh-Compose regression pass and remove it as the current G5-07 blocker.
- #529 ServerAdmin expansion: not required merely because it exists; the delivered #335 launch baseline remains the relevant G5 administration boundary unless a separate current criterion proves otherwise.
- M7-M9 feature expansion: not part of G5.

## Minimal path to the next G5 review

1. Finish intended product changes and freeze the release candidate/channel/operating-mode scope.
2. Complete #827 before public/commercial Self-Hosted launch where applicable.
3. Execute #914 protected release publication and provenance capture.
4. Execute #915 promotion/rollback evidence on that exact release.
5. Execute #916 manual launch-state accessibility acceptance on that exact release.
6. Execute #917 public Demo live-domain rehearsal on that exact release.
7. If Cloud/Managed is in scope, complete #797 and the #668/#521 real managed target evidence. Otherwise record Self-Hosted-only explicitly and classify managed-only criteria `NOT_APPLICABLE` without claiming Cloud launch readiness.
8. Re-run #525 against the exact released version and commit. Declare `PASS` only if every required criterion is `PASS` or legitimately `NOT_APPLICABLE`.

## Gate conclusion

The project is substantially beyond the 2026-09-05 rehearsal state, and the former G5-07 failure is resolved. However, the absence of a real frozen/published release, real candidate promotion evidence, final manual launch-state accessibility evidence and traceable live Demo rehearsal means **G5 remains BLOCKED** on 2026-09-12.

#525 must remain open until those blockers are resolved and the launch operating mode/channel scope is explicitly frozen.