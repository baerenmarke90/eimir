# Private list reorder — actual Web evidence

Owning issue: #508, sixth bounded interaction slice. The generated whole-screen
reference and [Mobile Interaction Contract](../../../references/508/private-list-reorder-preflight.md)
were committed and linked to #508 before UI implementation.

These are unretouched full-page Chromium captures of the canonical Web app
with authorized synthetic API fixtures. German product copy uses the existing
localization resources. Full-page captures include fixed viewport navigation;
its position is not a proposed placement in the document flow.

## Screens

| Capture | Acceptance state |
| --- | --- |
| [390px Light](private-reorder-pending-390-light.png) | Album stays first after a keyboard move; all overlapping writes wait for confirmation. |
| [390px Dark sparse](private-reorder-pending-390-dark-sparse.png) | Two items and the same pending state in Dark. |
| [360px Light dense](private-reorder-pending-360-light-dense.png) | Six entries preserve their content while saving. |
| [430px Light](private-reorder-pending-430-light.png) | Same Compact hierarchy and handle semantics. |
| [320px Dark, 200% text](private-reorder-pending-320-dark-200pct.png) | Title editor/actions, row controls and pending text wrap within the available width. |
| [1280px Light](private-reorder-pending-1280-light.png) | Expanded retains the existing grouped checklist and Edit disclosure. |
| [Pointer move and draft](private-reorder-pointer-390-dark.png) | Real pointer drag/release leaves album first and retains the collection-title draft. |
| [Rollback](private-reorder-rollback-390-light.png) | A failed write restores the confirmed order and offers a read-only recovery action. |
| [Failed read recovery](private-reorder-read-recovery-390-light.png) | Authorized content remains visible, with writes blocked until refresh succeeds. |

## Behavior and verification

Six viewport cases exercise Open → Edit → keyboard reorder → held PUT → see
new order immediately → confirm → move back with returned root version 2 →
Cancel → Back to private lists. They assert unchanged `If-Match: 1`, one write
after rapid repeated input, disabled add/handles and localized saving status.
All six pending views pass Axe WCAG A/AA with zero violations and no horizontal
overflow; all use reduced motion.

The pointer case uses normal motion, a real mouse drag and pointer capture,
and holds the response after release. It verifies order, pending state,
blocked title Save and retained title draft before and after confirmation.
The failure case checks 500 rollback, a read-only Retry, 409 authoritative
root version 7, and unavailable recovery reads without another write. It
checks visible authorized content and disabled writes until recovery succeeds;
rollback also passes Axe. No write is automatically replayed.

The recovery test waits for an enabled, focused handle before its next keyboard
move. The original CI trace showed focus being attempted while Retry's read
still blocked writes; `locator.focus()` does not wait for enabled state. This
readiness assertion preserves the recovery and exact write-count checks without
adding a delay, extending timeouts or changing runtime behavior.

Nine component cases verify immediate order, duplicate/overlapping writes,
unchanged versions, background refresh, position-only rollback, title-draft
safety, newer independent item content, newer root/item-set preservation on
late success and failure, conflict versions, offline recovery, initiating
Account/Space isolation, cleared-cache non-recreation and denied access.
Existing completion and private collection regressions remain covered.

The full Web unit suite passes: 193 files / 1347 tests, one existing skipped
file/test. Typecheck, production build, format, lint (no errors; existing
warnings) and engineering/documentation language audits pass. The final
private-area browser spec contains 25 cases, including all existing hub,
Search, title, completion and Edit/return regressions.

Visual QA caught existing Edit-mode min-content overflow at 320px/200% text;
the private section can now shrink and its title actions wrap. The pointer
test centers the handle before dragging so the fixed bottom navigation does
not intercept its starting point. No controls or capabilities are removed.

## Boundaries

This is Free/Core quality for Cloud and Self-Hosted. Existing protected owner-only
API, `If-Match`, root and independent item versions remain authoritative. No
API/schema, migration, provider, entitlement, durable cache or offline-write
change. Late responses cannot overwrite newer root data, replace newer item
content or recreate removed caches. A recovery failure deliberately blocks
writes until an authorized refresh succeeds. #508 remains open for its other
actions. This is Web acceptance, with no native device claim.
