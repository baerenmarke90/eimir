# Private checklist feedback — actual Web evidence

Owning issue: #508. This is its bounded private item-completion slice, following
the shared list, shared reorder, Energy and Vibe feedback slices.
The [preflight and generated whole-screen reference](../../../references/508/private-list-toggle-preflight.md)
were committed and linked in #508 before UI implementation. They are separate
from these real Chromium captures of the canonical Web app.

## Screens

| Capture | What it shows |
| --- | --- |
| [390px Light pending](private-list-pending-390-light.png) | Only the submitted item is immediately checked; its status remains pending and management is blocked. |
| [390px Dark sparse](private-list-pending-390-dark-sparse.png) | The same feedback with one private item and the dark theme. |
| [360px Light dense](private-list-pending-360-light-dense.png) | Six entries retain their content and order while the first write waits. |
| [430px Light](private-list-pending-430-light.png) | Compact adaptation with the same hierarchy and controls. |
| [320px Dark, 200% text](private-list-pending-320-dark-200pct.png) | Long heading wraps, and row copy uses the full row below its control rather than collapsing into a narrow column. |
| [1280px Light](private-list-pending-1280-light.png) | Expanded keeps the same private checklist composition. |
| [Rollback](private-list-rollback-390-light.png) | Failed completion restores the confirmed state and keeps an inline recovery action. |
| [Conflict](private-list-conflict-390-light.png) | A 409 refreshes the actual completed value/version and never silently replays the failed write. |
| [Read recovery](private-list-read-recovery-390-light.png) | Failed write and failed recovery leave the list readable, block stale writes and offer a refresh. |

All new captures use reduced motion. Synthetic English titles are fixture
content; product controls, pending status, privacy and errors use German i18n.
These are full-page captures; the actual Compact navigation remains attached
to the viewport. No screenshot is generated or retouched.

## Behavioral acceptance

`web/e2e/tests/private-area-reference.spec.ts` passes all 17 cases, including
the existing private hub, Search, title validation, read-first collection and
Edit/return regressions. Six new viewport cases exercise:

1. Sign in and open the authorized private detail.
2. Hold the real generated-client PATCH response and observe immediate pressed
   state, localized row status, disabled duplicate/management controls and
   unchanged `If-Match: 1`.
3. Confirm, remove pending copy, then reopen the item with returned version 2.
4. Return through the existing Back link to the private collection list.

The seventh new case covers 500 rollback, explicit read-only retry, a 409 with
authoritative version 7, and failed read recovery while preserving visible
authorized content. It asserts that recovery never sends another item write.
The six pending views and rollback pass Axe WCAG A/AA checks with no violations;
all relevant views have no horizontal overflow. Visual review additionally
caught and fixed cramped row copy at 320px/200% text beyond those automated
checks.

Seven focused React/Query cases cover the held response, rapid duplicate,
background refresh, narrow rollback with unrelated updates, conflict version,
offline recovery, newer-version preservation while the recovery read is still
held, Account/Space switching, removed-cache non-recreation and denied access.
All six existing private collection component tests also pass.

## Validation and boundaries

The full Web unit suite, typecheck, production build, format check and lint
(no errors; existing warnings) pass. Engineering and documentation language
audits pass. No API/schema, migration, provider, entitlement or persistence
change is introduced. The existing private query keys and protected backend
remain the authority; this is Free/Core across Cloud and Self-Hosted.

This evidence is Web browser acceptance. It does not claim Android device
validation, offline writes, private reorder feedback or closure of the broad
#508 epic. CI must be green on the final head before merging.
