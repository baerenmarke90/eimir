# Private full-resource edit settlement ownership

## Scope and baseline

Refs #503. Baseline main: `01f101f58ebb13e9d36a29f6a7451577ddf7acd2`.

The [pre-implementation review](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6214528696) records the design, reuse, business and cross-cutting decisions before runtime edits. This is a bounded repair of existing private note, gift idea and collection full-resource editors (including inline collection title editing). It does not complete #503, activate final audit #946, or change the independent device acceptance for #1271.

## Reproduction and root cause

Two initial production-component characterizations failed on unchanged main: after a pending note edit's component unmounts and the QueryClient is cleared, its successful response recreates the private note cache entry; if a new Query at the same key already exists, the old response overwrites it. These observations concern in-memory settlement ownership, not a demonstrated server authorization bypass.

Hook-level mutation callbacks may outlive their initiating component. The editors unconditionally wrote the returned full DTO, invalidated lists and continued navigation. Owner/Space keys alone cannot distinguish a removed Query from a later Query at the same key.

## Implementation contract

Reuse the existing weak `captureQueryIdentity` primitive through a small private-domain helper:

- Only the exact authorized detail Query that initiated the edit may accept its response.
- Removed/replaced Queries, missing data and current 401/403/404 reads reject settlement.
- A higher current resource version remains authoritative.
- Preserve equal-version current projections rather than replacing them.
- Capture the submitted resource's owner, Space, ID and If-Match version; never derive write scope from a later render.
- Recheck ownership after awaited list recovery and inside deferred editor-close continuations.

No new store, persistence, logs, dependency, API/schema or entitlement. Private data stays memory-only; this is no promise of native screen capture protection or additional authentication. Private content remains Free/Core and privacy isolation is non-paywallable, with equal Cloud/Self-Hosted behavior.

Create/delete and collection item/reorder mutation lifecycles are outside this full-resource edit slice; this document does not claim a global mutation audit.

## Product contract

Product Reference v1, R5 private area, existing Detail View/Create-Edit, PrivateAreaFrame, owner-only context, fields, Save/Cancel/Back and shell remain. No markup, styles, product copy, affordance or composition changes, so no new generated visual composition is required. No celebration, new relationship microcopy, blur or security promise suits this race repair.

## Local acceptance — 2026-10-16

The expanded component matrix covers all four editors: removed/replaced Query after unmount, 401/403/404 reads, newer versions, normal authorized save and deferred-list-recovery session clear where the editor awaits recovery.

The Cloud executor disconnected before runtime implementation; the initial implementation was published through GitHub. Local Codex execution then completed the tests and visual acceptance. The original test draft returned the pre-save DTO during normal recovery, asserted before queued React notifications/history completion, and referenced a nonexistent unavailable-state translation. The test fixtures now model persisted state and observe the actual UI completion without changing assertions, retry counts or timeouts.

### Source and build identity

- Baseline: `main@01f101f58ebb13e9d36a29f6a7451577ddf7acd2`.
- Accepted runtime/component-test and browser journey tree: [`90491ff39e7eb9590dab95ea0a6893cb09e966e1`](https://github.com/baerenmarke90/eimir/commit/90491ff39e7eb9590dab95ea0a6893cb09e966e1).
- Final denied-read test strengthening: [`7f524ced4a5debc2a658d636fccfca41d62550c2`](https://github.com/baerenmarke90/eimir/commit/7f524ced4a5debc2a658d636fccfca41d62550c2). Its production runtime and component tests are identical to `90491ff3`.
- The actual Vite production bundle was served by preview, with the locked Playwright 1.62.1 / Chromium revision 1234. The API responses and Account are synthetic authorized fixtures; this is not live-backend or physical-device acceptance.
- JavaScript `index-B98ZCW-L.js`: SHA-256 `a5be991a467843ef1ed3ec266cd117e2dd736f928779d60ea111ceaddcfa83b0`.
- CSS `index-Q8xtaXd9.css`: SHA-256 `16204959ebfa000c8c81317cc24eb28c2e4179c757fa5a258ab8c2e9e9cc51fa`.

### Results and regression proof

| Check | Actual result |
| --- | --- |
| Four production-editor component matrix | 31/31 pass; the same matrix fails 27/31 on unchanged main, with all four normal saves passing there |
| Complete Web suite, Node 24.19.0 | 1,514 pass; one existing skip |
| Affected production-preview browser suite | 36/36 pass, one worker, zero retries |
| Final denied-read strengthening | Both Compact and Expanded cases pass; both fail on unchanged main while recovery is deliberately held |
| Signed-out-session regression | Both cases pass with the fix and fail on unchanged main at the unwanted late navigation assertion |
| Build, TypeScript, tokens, PWA, Capacitor foundation | Pass |
| Lint, formatting, internal visual-proof typecheck | Pass; pre-existing lint warnings remain visible |
| Engineering and documentation language audits | Pass |

An initial local Node 22 full-suite run exposed an unrelated synchronous assertion in the unchanged Games StrictMode test. The same test and complete suite pass under Node 24, matching CI's Node major. Neither the Games source nor its test was changed.

The denied-read journey uses the test clock to cross the production 15-second Query freshness window before revisiting the detail. It first observes an actual 404, then releases the older successful PATCH while any recovery read is held. Immediate recovery had hidden the old UI's transient plaintext restoration, so a passing eventual error assertion alone was insufficient. The final test requires the unavailable state and absence of private title/body throughout the held recovery, then exercises explicit Retry. No arbitrary sleep or relaxed assertion is used.

The original sign-out journey held the PATCH, signed out through the real account menu, released the old response and verified both the login screen and unchanged destination. It signed the same Account in again and observed a fresh unavailable read with no old title/body. That run did not explicitly distinguish a committed logout reload from a beforeunload/history cancellation; see the follow-up qualification below. The normal save journey checks If-Match, pending/duplicate-submit state, persisted title/body, canonical detail and return to the updated note list.

### Inspected visual evidence

| Capture | Observed result |
| --- | --- |
| [Compact Light saved note](private-area-note-saved-390-light.png) | Updated authored title/body, private context, Edit and Back remain clear |
| [Expanded Dark saved note](private-area-note-saved-1280-dark.png) | Same content hierarchy and result with the established wide shell |
| [Compact denied read](private-area-note-denied-390-light.png) | Unavailable state and explicit Retry; no old note title/body |
| [Expanded denied read](private-area-note-denied-1280-dark.png) | Same authoritative unavailable state in Dark |
| [Compact after sign-out/sign-in](private-area-session-ended-390-light.png) | New session remains unavailable; old completion cannot restore its content |
| [Expanded after sign-out/sign-in](private-area-session-ended-1280-dark.png) | Same result and reachable recovery in Dark |
| [320 px Dark, 200% text](private-list-pending-320-dark-200pct.png) | Existing private-list text wraps without horizontal page overflow; pending state remains textual |

All seven complete-screen captures were visually inspected. [SHA256SUMS](SHA256SUMS) records their exact bytes. The surrounding existing suite also covers 360/390/430 px, sparse/dense/empty lists, title validation/focus, keyboard/pointer reorder, failed reads, conflicts, offline no-replay and reduced motion. Strict full-page WCAG 2.2 AA Axe checks remain enabled. No markup, style, copy or interaction pattern is introduced by this repair.

Current-head hosted checks remain a separate pre-merge gate. These bounded checks do not close #503 or final audit #946 and do not replace #1271's device acceptance.

## Sign-out evidence qualification — 2026-10-16 follow-up

Later [private-create acceptance](../private-create-ownership/README.md) traced the actual `AppShell.logout` contract: it assigns the public document at `/`. Editor cleanup could concurrently request Back, aborting that navigation; Playwright could also dismiss beforeunload. The original passing and counterfactual sign-out results above therefore establish the observed retained-document scenario, not deterministic full-document logout. They must not be generalized into a claim that logout normally stays in the same document.

The follow-up repairs that shared history handoff and changes both edit browser cases to await the real public document, then sign the same Account in and deliberately read the denied resource. Destroyed-document requests need not receive a browser response. The original 31-case component matrix and held denied-read journeys remain the in-memory settlement regression proof; the follow-up adds actual in-document replacement-task coverage for creates. Historical capture bytes remain unchanged. Main's complete 471-case browser regression passed before this follow-up; that green run does not remove the later demonstrated history race.
