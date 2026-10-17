# Today checklist response ownership — #508

Baseline: `dda7c4a2a2100dd36be36db73dd43eec366c403b`.
[Pre-implementation review and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/508#issuecomment-6229716824).

## Product and implementation contract

Preserve the existing R4 Today composition, checklist preview, progressive
disclosure, Add sheet, canonical list link, shell, keyboard/pressed semantics,
semantic feedback and reduced motion. This repairs the existing interaction;
there is no new feature, visual composition, copy, gesture or token requiring
a newly generated reference. The [existing Today contract](../../../references/508/today-checklist-offline-repair.md)
remains applicable. Either partner can complete practical work independently.

Reuse the existing authorized Query identity and extract the item field/version
reconciliation from the shared/private detail contract. Completion responses
never own independently versioned collection positions. Equal/newer authorized
items and removed/replacement/denied Queries remain authoritative. Capture the
submitted Account/Space/Collection and exact Query lifetime before admission,
recheck after cancellation and at queued dispatch, and never regress confirmed
item versions.

Retain deliberate rapid online intent serialization. When Today unmounts,
already dispatched work may still settle into its original authorized Query;
unsubmitted queued intents stop and their optimism settles to the confirmed
item. Feedback requires the current active task. A scope replacement cannot
inherit an older queue or its feedback. Offline attempts still end without
reconnect write replay. Creation and other mutation families remain outside
this repair.

No business/freemium impact: shared lists and basic interaction quality remain
Free/Core, with identical Cloud/Self-Hosted behavior. No entitlement, ownership,
cost, quota, storage/retention, downgrade, export/restore or matrix change.
No dependency, provider, API/schema, persistence, telemetry or native change.
The adopted MIT Query runtime remains in-memory without external data flow or
user/operator setup. No new synchronization engine or store is introduced.

## Reproducible identity and acceptance

[Source and bundle manifest](source-manifest.json) records SHA-256 values for
both runtime files and the component/browser tests. Bundle fingerprints hash
sorted lines of `<relative dist path> <file SHA-256>\n` for every file in each
separately built `web/dist`. [SHA256SUMS](SHA256SUMS) identifies the captures.
The containing Git commit binds this evidence without a circular self-SHA.

Local browser acceptance uses an isolated **Chromium 153.0.8010.0** extracted
from `@sparticuz/chromium@153.0.0`, outside product dependencies. The canonical
Playwright Chromium 151 download returned an invalid archive in this workspace.
The fallback is explicitly local evidence; hosted Browser QA uses the repository's
unchanged pinned browser and configuration. No test retry, timeout increase,
weakened assertion or Axe exclusion was introduced.

Validation at the manifest source:

- 36 production-component cases pass. All 18 new cases fail unchanged baseline;
  all 18 existing cases pass baseline. Coverage includes normal completion,
  rollback, rapid intent/version sequencing, independent items, offline admission
  and queued dispatch, authoritative achievements, newer/equal item reads,
  root-owned positions, removed/replacement/denied Queries, cancellation,
  Account/Space changes and unmount settlement.
- Full Web: 1,602 passed, one existing skip. Build/TypeScript, full lint/format,
  engineering/documentation language audits, tokens/PWA and Capacitor foundation
  pass. The unchanged high-severity dependency-audit threshold passes with three
  existing moderate transitive findings.
- The 40-case affected production-browser suite covers shared detail and Today
  checklist/pin behavior, rollback/retry, rapid online interaction, offline
  recovery, 360/390/430 px, 320 px with large text, Expanded, Light/Dark,
  reduced motion and full-page Axe. The four new journeys exercise both late
  success/failure in Compact Light and Expanded Dark. Against the independently
  built baseline, both success journeys fail at the retained newer-item assertion;
  both failure journeys pass as controls. Do not describe all four as old-code
  failures.

The new journey is **Open Today → check Milk → hold PATCH → receive newer
authorized item/order through the existing Add refresh → release old reply →
observe Oat milk, order and added Coffee → deliberately check again using
If-Match 5 → open canonical detail → return**. Recovery reads stay held during
late settlement so they cannot conceal a corrupt callback. Full-page Axe and
horizontal-overflow checks run before each capture.

## Captures

The rendered list retains the newer title, open state, collection-owned order
and independently added row after settlement. The quote-unavailable surface is
the existing fixture's separate module error state, not a result of this change.

| Outcome | Compact Light | Expanded Dark |
| --- | --- | --- |
| Late success | [390 px](today-newer-success-390-light.png) | [1280 px](today-newer-success-1280-dark.png) |
| Late failure | [390 px](today-newer-failure-390-light.png) | [1280 px](today-newer-failure-1280-dark.png) |

This bounded repair does not close #508, activate final #946 acceptance, satisfy
Draft #1271's physical-device gates or make a native release claim.
