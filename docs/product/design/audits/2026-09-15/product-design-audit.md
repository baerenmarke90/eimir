# Product design audit — 2026-09-15

**Classification: HISTORICAL.** This is a compact English record of the supplied audit, not current product requirements or a fresh audit. [Product Reference v1](../../product-reference-v1.md) and [#955](https://github.com/baerenmarke90/eimir/issues/955) govern conflicts. The audit's local wave labels and proposals do not override the accepted implementation roadmap.

## Scope and method

The supplied audit examined the independently implemented eimir. repository at `9a13f67c88be514f85b500aa905763750697b530`: Web and Android sources, routes, domain/server contracts, tokens, localization, tests, governance and prior references. Its chapters cover product direction, relationship content, planning, Android, shared surfaces, an eleven-dimension assessment, remediation and evidence limits.

It reports 58 namespaced findings, 41 target designs and 48 local remediation slices consolidated into 27 execution groups. These are dossier counts, not independent root causes or new issues to recreate. No repository-wide P0 was established. Qualitative ratings are design judgments, not numerical user-research results.

## Findings that explain the accepted direction

| Systemic problem | Evidence and qualification | Consequence accepted in #955 |
| --- | --- | --- |
| Weak capture/find/return continuity | Fixture probes lost an unsaved Memory title after navigation and reset Search input after Back. This concerns client state, not deletion of saved backend records. | Protected task lifecycle, canonical saved result, visible scope and restored origin. |
| Reading displaced by management | Source review identified permanent edit/status controls, relation-management-first content and title/metadata-first capture. The existing Memory title was already optional. | Content-first capture, read-before-edit and contextual actions; preserve useful current capability. |
| Inconsistent modal/state semantics | Compact notification preview focus stayed outside its sheet; a confirmed HTTP 500 rendered as an empty state in a targeted fixture. Gallery/native findings had separate evidence. | Complete focus/Back contracts and distinct loading, empty, failure and success. |
| Repetitive surfaces and weak content priority | Current Timeline, private and Settings compositions contained redundant framing or long utility stacks; Today and several existing references already had strengths. | Natural composition, purposeful boundaries, calm utility and stronger personal content. |
| Role drift rather than a broken palette | A specific Light transfer explanation measured 3.2774:1 contrast; Dark measured 6.0783:1. Other helper fixes were already present. | Preserve the palette; assign readable semantic roles and verify actual consumers. |
| Android journey gaps | Source/contract review found route/callback, visible-error and premature-reset problems. No native runtime was available. | Experience parity with device/emulator evidence, not a visual-only port. |
| Privacy and permission meaning | Source analysis called for owner-only retrieval, accurate sharing consequences and server-consistent editing rights. | Preserve privacy boundaries, explain consequences and never infer authorization from presentation. |

The strongest existing qualities were the four-destination shell, warm material/type foundation, Today orchestration, meaningful story-summary grouping, differentiated Moments content and useful Planning capability. The audit did not justify a wholesale rebrand or a second design discovery phase.

## Recorded execution and limits

The audit ran a Vite/Chromium application with fictional API fixtures at 360×844, 390×844, 430×844 and 1440×900 in Light/Dark. Eight capture cases passed their reflow/mock assertions, producing 104 full-page and 26 additional viewport captures. Representative images were visually inspected; the dossier does not claim every image received an independent detailed review.

The selected existing Web suite initially recorded 55 passes and one screenshot timeout; that unchanged case passed in isolation. A targeted journey probe and a contrast-measurement probe each passed. A passing measurement probe is not a passing accessibility assessment. Harness corrections and the unsuccessful first run are preserved in the source package.

Android findings are source-led: no configured emulator/device, TalkBack, native IME, native geometry or performance acceptance was run. The full backend/native suites, real billing/push, production networked deployment, representative-user research and complete WCAG acceptance were not executed. The audit did not inspect prohibited predecessor source or use real couple data.

## What follows from this evidence

Use the [accepted roadmap](../../implementation-roadmap.md), not the historical 27-group backlog, to prepare work. Reproduce relevant failures against each slice's current baseline before fixing them. New runtime evidence must identify the actual commit, environment, fixtures, states and limits. An old P1 is not automatically resolved because the documentation was adopted, and an old screenshot is not proof of a current defect.

[Source archive fingerprints and decision chronology](evidence-and-decisions.md) identify the full retained package and explain why binaries are not duplicated in git.
