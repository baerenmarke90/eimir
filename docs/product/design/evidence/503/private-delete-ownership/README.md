# Private deletion settlement ownership

## Scope and decision

Refs #503. Baseline: `main@dda7c4a2a2100dd36be36db73dd43eec366c403b`.
Accepted final source commit: `6dea633c47cdc4b87b83309c4e61a96fb095e6c9`.
Initial ownership-only source: `fbef3f9fe501c1a29d29495a7bd399cbbccb5d3b`.

The [pre-implementation review](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6226366910) records reuse, design, business and cross-cutting decisions before runtime changes; the [conflicting-write extension](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6226488819) precedes its state-handling changes. This repairs whole-resource deletion of private notes, gift ideas and private collections. It does not complete #503/#508, activate final audit #946, or replace #1271's physical-device acceptance.

## Root cause and contract

Hook-level mutation callbacks can outlive the component that admitted them. The old DELETE callbacks unconditionally removed detail Queries, invalidated whole list prefixes and continued navigation. After cache clear or replacement, an old success could delete a fresh authorized Query and refresh a new session list. After deliberate navigation through the private tabs, it could redirect the independent current task. This is an in-memory lifecycle defect, not evidence of a server authorization bypass.

`capturePrivateDelete` reuses `captureAuthorizedQuery`, weak `captureQueryIdentity`, the installed TanStack mutation context and `useTaskEditorLifecycle.captureOwnership`:

- Capture owner, Space, resource ID and If-Match from the submitted resource.
- Recover only the original authorized list Query, exactly; sibling detail Queries keep their freshness and newer denied list reads are not refreshed away.
- Recheck the original authorized detail after list recovery and inside deferred editor history completion before removing it.
- Removed/replacement Queries and newer 401/403/404 detail reads remain authoritative.
- Actual confirmed deletion may evict its original cached detail after the person leaves the task; only the submitting task activation may navigate.
- Save and Delete are mutually exclusive per resource. Note/gift Save uses the existing delete-pending disable and submit guard; the collection submit handler also guards DELETE. Shared `DeleteConfirmation.disabled` blocks initial and already-open confirmation during a save without labeling it as deletion.
- Deep-linked deletion needs no previously cached list. Ordinary success, failure, explicit confirmation and retry retain their existing meanings.

Recovery precedes exact detail eviction so the initiating read remains available as an ownership anchor across the await and history handoff. No deleted detail is refetched merely because its list prefix was invalidated. No new store, persistence, telemetry, dependency/provider, API, migration, native capability, entitlement or offline queue is introduced. Private content remains Free/Core; owner-only isolation is non-paywallable, with identical Cloud/Self-Hosted behavior.

## Product contract

Product Reference v1 R5, Detail/Create-Edit, `PrivateAreaFrame`, focused note/gift editors and the inline collection editor remain. Preserve owner-only text/icon, shell and private navigation, explicit destructive confirmation, pending/disabled controls, failure recovery, Back/Cancel, keyboard/focus, touch targets, Light/Dark, reflow and reduced motion. This bounded behavior repair changes no content markup, style, copy, gesture or screen composition; native disabled states gain the missing conflicting-write meaning, so no new generated composition is required. Precise destructive language remains appropriate without a new celebration or relationship microcopy.

## Exact-source local verification — 2026-10-17

The cloud workspace was reconstructed from the retained current snapshot and compared against GitHub's complete current-main tree. The only initial byte mismatch was the Windows Gradle wrapper's line endings; its exact remote bytes were restored, and no Android file is part of this PR. The seven published runtime/test blob SHAs were individually checked against GitHub. Source files under `sources/` were not edited.

Local Node: 24.19.0. Browser acceptance uses the real Vite production bundle with synthetic authenticated API fixtures, Playwright 1.62.1 and isolated Chromium 153 (`@sparticuz/chromium` 153.0.0). This is not live-backend, native-device or final product acceptance. The canonical Playwright browser download produced a truncated archive in this executor; the isolated browser is an explicitly identified local fallback, while hosted Browser QA uses its canonical browser separately. No product/browser dependency or repository test configuration was changed for the fallback.

| Check | Result |
| --- | --- |
| Three production-deletion consumer matrix | 57/57 pass |
| Same final matrix on unchanged baseline runtime | 46 fail / 11 pass; normal confirmed deletes and failed-delete preservation pass |
| Complete Web suite | 1,641 pass / one existing skip |
| New production-preview journeys | 12/12 pass, zero retries |
| Same twelve journeys on separately built unchanged baseline | Six normal deletes pass; all six abandoned-task cases fail at unwanted navigation |
| Complete final affected private production-preview suite | 70/70 pass, one worker, zero retries/flakes |
| TypeScript, lint, format, tokens/PWA, Capacitor foundation, production build | Pass; existing lint warnings remain visible |
| Engineering/documentation language audits | Pass |
| Dependency audit at unchanged high-severity gate | Pass; three existing moderate Capacitor CLI/xcode/uuid findings remain visible |

The final matrix also covers direct form submission during DELETE and deletion during save with confirmation both closed and already open. Seven of these nine added cases fail on the ownership-only implementation; the collection already blocked both UI deletion controls during save.

The component matrix includes removed/replacement sessions, abandoned tasks, 401/403/404 detail and list reads, session/detail replacement during held list recovery, original/replacement lists, unrelated sibling details, deep links, normal confirmed deletion and failure. The browser matrix follows Open → Edit → confirm Delete → held response → normal result or deliberate private-tab navigation → old completion → observe → return to the original list. It verifies If-Match, one DELETE, pending disable, actual removed content, strict full-page Axe and no horizontal overflow.

The retained private suite also exercises 320/360/390/430 px, 200% text/reflow, sparse/dense/empty lists, Light/Dark, reduced motion, pointer/keyboard reordering, offline no-replay, create/edit ownership, denied reads and canonical sign-out. Its result is recorded separately above. It does not establish a whole-product or physical-device audit.

Initial browser-test fixture corrections kept the actual product assertions: supply the independently visited gift-list API instead of an unintended 500; assert the bodyless DELETE's 204 response and resulting UI rather than waiting for a response-body completion that never arrived in the fallback browser. The initial browser-case source at `fbef3f9f` passes against that ownership fix and exposes the intended six old-code navigation failures. The final source additionally asserts disabled Save during actual held note/gift DELETE; the final 57-case component counterfactual covers both defects on unchanged baseline. These identities are not conflated. No timeout, retry count, Axe assertion or product gate was relaxed.

## Production bundle fingerprints

- `index-BT04Jcc2.js` — SHA-256 `6a09315d335ca2aadde4059b50a4683ec8b734fdba0a6e0bb6492ca211374073`.
- `index-D46K-c7Q.css` — SHA-256 `5a0671f0169db7c9502f7709de7b79f2568b81e89a09a3ad57a6e77202b0d3f2`.

## Reviewed captures

All six complete-screen captures were inspected. The existing private composition, readable destructive confirmation/pending text, canonical empty result and independent destination remain clear. The private banner, tabs, shell and main actions remain usable at both sizes. [SHA256SUMS](SHA256SUMS) records exact image bytes.

| Capture | Observed result |
| --- | --- |
| [Compact pending deletion](private-delete-pending-390-light.png) | Explicit confirmation, disabled Save and disabled pending action; owner-only context retained |
| [Expanded Dark pending deletion](private-delete-pending-1280-dark.png) | Same destructive meaning and available content in the existing wide layout |
| [Compact confirmed result](private-delete-confirmed-390-light.png) | Canonical private note list with deleted content absent |
| [Expanded Dark confirmed result](private-delete-confirmed-1280-dark.png) | Equivalent canonical result and reachable next action |
| [Compact independent destination](private-delete-other-task-390-light.png) | Gift list and its content remain after the older note deletion completes |
| [Expanded Dark independent destination](private-delete-other-task-1280-dark.png) | Same retained destination in Dark |

