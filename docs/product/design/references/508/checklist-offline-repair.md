# Deliberate offline checklist writes — #508

Baseline: `main@57d6d2fe1c40de58bf7213020d132c058a318830` (2026-10-16).

## Pre-implementation review

Reviewed current `CollectionProductPage`, private `CollectionItems`, their query
keys, generated API calls, item/root versions, retry paths and existing controls.
Private component characterizations reproduce paused offline mutations and the
pre-dispatch cancellation race before runtime changes. Shared detail has the same
missing network policy. Current main's `useCollectionPin`, `usePartnerGesture` and
`useDailyCheckInWrite` already implement deliberate attempts.

This repairs the published offline contract of existing checklist interactions;
it introduces no new feature, composition, state copy, gesture or styling. The
owning issue already contains the generated whole-screen
[shared toggle](collection-toggle-pending.webp),
[shared reorder](collection-reorder-pending.webp),
[private toggle](private-list-toggle-preflight.md) and
[private reorder](private-list-reorder-preflight.md) references and Mobile
Interaction Contracts. Current destinations still have Back, collection title,
Edit, count, item controls, inline errors and existing navigation. Shared detail
also retains personal pinning; private detail retains its owner-only context and
Edit-only add/rename/reorder/delete. Those composition references remain applicable.

Product Reference v1 R3/R5, Detail View/Create-Edit and Checklist Row govern.
Item titles stay focal; the checkbox or existing pointer/keyboard reorder handle
is the local action. Keep current localized pending status, rollback and
ProblemState. No extra typing, modal, celebration or relationship microcopy is
appropriate. Preserve Loading/Empty, truthful confirmed Success, access-denied
hiding, Account/Space isolation, keyboard focus, touch targets, wrapping and
semantic motion/reduced-motion behavior. Expanded uses the same bounded detail.

Offline attempts must end with the existing localized error and rollback rather
than wait for reconnect. Reconnection may recover reads but must issue no write.
Private Retry remains read-only before a separate deliberate action; shared Retry
retains its explicit retry meaning and fresh-version/conflict checks. Check
connectivity at actual dispatch, after awaited cancellation. Recovery invalidates
without starting an offline read. Success/failure must release local write locks.

## Reuse and business review

Reuse review relevant: inspected the installed TanStack Query 5.85.5 mutation
network modes and the three existing deliberate send/write consumers. Select
per-mutation `networkMode: 'always'` and `retry: false`, with the existing online
manager plus browser signal and `ClientProblemError('offline')`. Extract only this
repeated connectivity check into a small shared helper; reuse existing rollback,
query invalidation and error presentation. A global network-mode change, new
state/sync engine or provider would change unrelated flows and is unnecessary.
No new third-party component, license, data flow, cost or hoster effort.

No business/freemium impact: shared/private lists and fundamental interaction
quality remain Free/Core for Cloud and Self-Hosted. Personal pinning, Free
Thinking-of-you, Premium extended gestures and Mixed daily-check-in capabilities
retain their current policies. No entitlement, ownership, storage, quota,
retention, export/restore, downgrade or matrix change.

Cross-cutting: preserve server If-Match, item/root versions, scoped caches,
existing rollback and authorization behavior. No new persistence, telemetry,
API/schema/migration, infrastructure, release configuration or native capability.
The helper does not promise actual network reachability; request failures still
use existing normalization. Other mutation families and the pinned Today
checklist's per-item queue remain separate lifecycle work under #508.

## Acceptance plan

Run production-component regressions for both offline signals, connectivity lost
while cancellation awaits, reconnect without replay, deliberate retry and
success/failure settlement after connectivity loss. Retain the existing
success/conflict, unrelated-data, duplicate input, context/cache removal tests.
Run real Web journeys for private/shared toggle/reorder at Compact and Expanded:
Open → offline attempt → rollback/error → reconnect (zero writes) → explicit
recovery/action → confirm → return. Capture error/recovered states; cover narrow
widths, Light/Dark and reduced motion with existing browser coverage. No
native-device or whole-#508/final-#946 acceptance claim.
