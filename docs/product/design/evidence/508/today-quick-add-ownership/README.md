# Today quick-add response and draft ownership — #508

Baseline: `87725bbe75eade6ce7e79296bf8e98b6eb5559c6`.
[Pre-implementation review and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/508#issuecomment-6231069362).

## Product and implementation contract

Retain Product Reference v1 R4/Today, the checklist preview, reachable plus,
short one-field task, canonical list link, shell, native modal/history/discard
behavior, localized errors, semantic motion and reduced motion. This bounded
repair introduces no new capability, composition, copy, gesture, styling or
token. The [existing Today contract](../../../references/508/today-checklist-offline-repair.md)
and whole-screen visual references remain representative. Compact is normative;
Expanded adapts the same practical task. No additional relationship microcopy or
celebration belongs in failed-save feedback.

Reuse TanStack Query, authorized Query identity, online admission, ShortTaskSheet
and ProblemState. A local activation token owns only asynchronous work; the shared
sheet continues to own modal/history behavior. Capture the submitted
Account/Space/Collection, exact detail Query, overview identity, title, draft and
root version. Admit one pending create synchronously, reject offline dispatch
without pausing/retry/reconnect replay, and stop undispatched abandoned work.
Dispatched work may settle into its original authorized detail after unmount,
without closing or focusing another task. Removed/replacement/denied detail
Queries and scope changes reject late settlement. Overview lifetime never gates
completion of the original sheet.

The item create response has no parent version. Append only to the unchanged
captured root; retain an already-present newer item or an item absent from a newer
read, then recover the exact canonical detail. Later-authored text stays open and
is never submitted by an old callback. An error remains visible in its current
sheet, but cannot mark newer text invalid or steal focus. Ordinary unchanged
success closes and restores the trigger; unchanged failure retains text and
focuses the field. Both partners retain independent access to practical work.

No business/freemium impact: shared lists and reliable basic interaction remain
Free/Core, with Cloud/Self-Hosted parity. No entitlement, relationship ownership,
managed cost, quota, storage/retention, downgrade, export/restore or matrix change.
No dependency, provider, API/schema/migration, persistence, telemetry, deployment
or native change. Existing MIT Query remains in memory, without an external data
flow, user/operator setup or a new synchronization engine.

## Reproducible identity and acceptance

[Source and bundle manifest](source-manifest.json) identifies the runtime and
component/browser tests. Bundle fingerprints hash sorted lines of
`<relative dist path> <file SHA-256>\n` for every file in separately built
`web/dist` directories. [SHA256SUMS](SHA256SUMS) binds all six inspected captures.
The containing Git commit binds evidence without a circular self-SHA.

Local production-browser acceptance uses isolated **Chromium 153.0.8010.0**
from `@sparticuz/chromium@153.0.0`, outside product dependencies. The repository's
canonical Playwright Chromium 151 download returned invalid archives in this
workspace. Hosted Browser QA uses the unchanged pinned browser/configuration;
local evidence does not replace that gate. No test retry, timeout increase,
weakened assertion or Axe exclusion is introduced.

Validation at the manifest source:

- 53 Today component cases pass. The 17 added cases include 16 failures against
  unchanged baseline and one positive post-unmount settlement control. All 36
  existing cases pass baseline. Coverage includes both offline signals, dispatch
  recheck, synchronous duplicate admission, newer drafts on success/failure,
  Account/Space changes, removed/replacement/401/403/404 detail Queries,
  independent overview lifetime and later authoritative roots/items.
- Full Web: 1,619 passed and one existing skip. Production build/TypeScript,
  lint/format, language audits, token/PWA and Capacitor foundation checks pass.
  Changed-file lint has no diagnostics. The high-severity dependency-audit gate
  passes with three unchanged moderate transitive findings.
- All 46 affected production-browser cases pass. The six new journeys cover
  late success/failure and offline/reconnect/manual retry in Compact Light and
  Expanded Dark. All six fail against the independently built unchanged baseline
  at the preserved-draft/error assertion. Existing coverage retains 360/390/430 px,
  320 px with 200-percent text, sparse/dense content, Light/Dark, reduced motion,
  keyboard/focus, discard behavior and full-page Axe/reflow checks.

New journeys: **Open Today → add Butter → hold POST → type Rice and press Enter →
release success/failure → retain Rice and one submitted request → deliberately
save Rice → observe canonical detail → return**; and **Open → type Butter → go
offline → submit → retain text and localized error → reconnect without a POST →
deliberately retry → observe saved row and restored trigger focus**.

## Captures

| State | Compact Light | Expanded Dark |
| --- | --- | --- |
| New draft after success | [390 px](today-add-draft-success-390-light.png) | [1280 px](today-add-draft-success-1280-dark.png) |
| New draft after failure | [390 px](today-add-draft-failure-390-light.png) | [1280 px](today-add-draft-failure-1280-dark.png) |
| Offline attempt | [390 px](today-add-offline-390-light.png) | [1280 px](today-add-offline-1280-dark.png) |

The quote-unavailable card behind the modal is the existing fixture's independent
module error. No final #946 acceptance, closure of broader #508, or satisfaction
of Draft #1271's physical-device gates is claimed.
