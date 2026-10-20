# Private create ownership and sign-out history handoff

## Scope and authority

Refs #503. Baseline main: `4bb9ea10b367203a05688eae3018badb3e38cba7`, including #1321. Main's complete post-merge [browser regression](https://github.com/baerenmarke90/eimir/actions/runs/38900865616) passed 471 cases without flakes before this follow-up.

The [initial preflight](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6215661073), [supporting contrast repair](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6215747054), [refined list/task contract](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6215884161), and [demonstrated sign-out history race](https://github.com/baerenmarke90/eimir/issues/503#issuecomment-6215996165) record decisions before the respective runtime edits.

This repairs the existing private note, gift idea and collection create handlers and the shared editor-to-document handoff used by sign-out. It does not close the broader #503, activate #946, or replace #1271's independent physical-device acceptance. Private delete/item/reorder settlement and other product families are not a global audit claim.

## Reproduction and contract

Hook-level mutation callbacks outlive the component that submitted them. Unchanged main invalidated a private list and redirected to a created result even after the editor's session ended or another private task replaced it.

Keep two responsibilities distinct:

- The exact original list Query owns recovery. Reuse weak `captureQueryIdentity` through `capturePrivateCreate`; an existing same-session list still becomes stale after its create finishes, even if the person left the task. Removed/replaced Queries are not invalidated. A deep-linked create needs no list Query.
- The submitting task activation owns close/navigation. The shared `useTaskEditorLifecycle.captureOwnership` expires on unmount/deactivation and cannot revive on a later activation. Recheck after awaited list recovery and inside deferred history completion.

A second real race appeared during browser acceptance: `AppShell.logout` assigned the public document while editor unmount cleanup concurrently requested `history.back()`. Traces showed GET `/` aborted. The existing history primitive now releases only its editor marker, preserves Router/other state, and returns any already-pending entry-removal promise. AppShell clears authentication immediately, then assigns the canonical public route after that existing work settles. No timer, second navigation stack or new session store is used.

Leaving a task or signing out does not promise to cancel a write already received by the server. A later authorized read may show that saved resource. It must not reopen the abandoned task or carry old content into a new editor/session.

## Product, reuse and business review

Product Reference v1 R5, Create/Edit, Detail View, PrivateAreaFrame, the owner-only context and existing native controls remain. Content fields and one Save remain focal; Back/Cancel, validation, pending/dirty exit, private navigation, shell, feedback and reduced motion remain. This bounded repair adds no feature, composition, product copy or gesture, so no newly generated composition is required. No new celebration or relationship microcopy suits the repair.

Strict Axe exposed existing gift URL help text at 4.31:1 on white in Compact Light. Private editor helper text now uses the existing semantic secondary-text token. No palette values or global styling change. Both themes and the full form are covered.

Reuse React effects/refs, TanStack mutation context, weak Query identity and the existing editor history contract. No dependency, provider, persistence, telemetry, backend authorization, API/schema, migration, deployment or native/FCM change. No private content is added to logs, events or URLs.

No business/freemium impact: private content remains Free/Core and privacy/session isolation non-paywallable. Cloud/Self-Hosted, ownership, capabilities, managed cost/resources, quotas, retention, downgrade/trial, export/restore and the authoritative matrix remain unchanged.

## Accepted source and build

- Runtime and tests: `e3ecc6ac0031b1707b303d4001723978c87d17f3`.
- Node 24.19.0, locked dependencies, Playwright 1.62.1 / Chromium revision 1234.
- Actual production Vite preview, synthetic authorized Account/API fixtures; not live-backend or physical-device acceptance.
- JavaScript `index-CqB4UOSn.js`: SHA-256 `0ba31de14753ad2a3ada2fc94e62be37127b82978328bc68dceb3b42b70f78d4`.
- CSS `index-D46K-c7Q.css`: SHA-256 `5a0671f0169db7c9502f7709de7b79f2568b81e89a09a3ad57a6e77202b0d3f2`.

## Local acceptance — 2026-10-16

| Check | Result |
| --- | --- |
| Three production creators | 21 cases pass: normal save; removed/replaced session; awaited recovery; deferred history; abandoned-task list recovery; deep-link/later-list isolation |
| Counterfactual component matrix | Same 21 cases on unchanged main: 18 fail, all three ordinary creates pass |
| Shared task ownership | Unmount and reactivation contract cases pass alongside existing task tests |
| Document history handoff | Preserve unrelated history state, avoid competing cleanup Back, await existing removal; all pass |
| Complete Web suite | 1,540 pass, one existing skip; 202 passing files and one skipped file |
| Affected production-preview browser suite | 50/50 pass, one worker, zero retries |
| Counterfactual browser regression | All six replacement-task cases fail on unchanged main at unwanted navigation |
| Real sign-out/re-entry | All four create/edit Compact/Expanded journeys pass after the history fix |
| Production build, TypeScript, tokens/PWA | Pass |
| Lint/format, browser/visual-proof types, Capacitor foundation | Pass; 25 pre-existing lint warnings and 13 information messages, no new diagnostics in changed files |

The six replacement-task journeys submit a held POST, use existing private navigation to open another area, release the old response, retain that destination, then explicitly reopen the original list and a fresh empty editor. They also verify that the still-authorized original list recovers the saved resource. Ordinary creation covers pending/duplicate-submit lock, result, and return for all three resource types at 390 Light and 1280 Dark.

The initial browser draft incorrectly assumed sign-out always retained the document. In reality AppShell assigns `/`; Playwright's default beforeunload dismissal and the competing cleanup Back made that observation inconsistent. Initial runs exposed the contrast failure, then aborted-response/navigation failures. The final sign-out cases explicitly accept any real beforeunload prompt, await the public document and exercise same-Account re-entry. A deliberately held server response may finish after its browser request was aborted by logout; the fixture observes its own completion instead of requiring a response event from a destroyed document. The component matrix and in-document replacement-task journeys establish late-callback isolation separately. No retries, timeout increases, softened accessibility checks or production delays were added.

The existing surrounding coverage retains 320/360/390/430 px, 200% reflow/large text, sparse/dense/empty lists, title validation/focus, keyboard/pointer reorder, current denied reads, conflicts, offline no replay, reduced motion and strict full-page WCAG 2.2 AA Axe.

## Visual evidence

| Capture | Observed contract |
| --- | --- |
| [Created note, Compact Light](private-create-notes-saved-390-light.png) | Authored title and private context, Edit and Back |
| [Created note, Expanded Dark](private-create-notes-saved-1280-dark.png) | Same hierarchy in the wide shell |
| [Created gift idea, Compact Light](private-create-gift-ideas-saved-390-light.png) | Private authored result and existing status |
| [Created gift idea, Expanded Dark](private-create-gift-ideas-saved-1280-dark.png) | Same result and reachable actions |
| [Created private list, Compact Light](private-create-collections-saved-390-light.png) | Title, item count, empty state and disclosed Edit |
| [Created private list, Expanded Dark](private-create-collections-saved-1280-dark.png) | Same content-first hierarchy |
| [Fresh gift editor, Compact Light](private-create-gift-ideas-fresh-task-390-light.png) | No abandoned draft; readable URL help and existing fields/actions |
| [Fresh gift editor, Expanded Dark](private-create-gift-ideas-fresh-task-1280-dark.png) | Same fields and readable help in Dark |
| [Fresh note after sign-out/re-entry, Compact Light](private-create-session-ended-390-light.png) | Empty new task after the actual public-document handoff |
| [Fresh note after sign-out/re-entry, Expanded Dark](private-create-session-ended-1280-dark.png) | Same fresh-session result |

All ten complete-screen images were visually inspected. [SHA256SUMS](SHA256SUMS) records their exact bytes. Hosted current-head checks remain a separate pre-merge gate.
