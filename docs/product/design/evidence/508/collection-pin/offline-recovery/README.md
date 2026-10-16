# Personal pin offline recovery — #508

Baseline: `main@e83bccd4978fd4969bb0f64a6eeb0e79c1e122fb`, October 12, 2026.
This repairs the existing [generated reference and interaction contract](../../../../references/508/collection-pin-preflight.md), which already prohibit an offline write queue.
The scope and reuse/business/cross-cutting review were recorded on #508 before runtime edits.
No screen composition, control, text, token, API, dependency or native capability was added.

## Root cause and repair

The default TanStack mutation network mode pauses an offline selection for reconnect.
The optimistic selection then appears to keep saving without an error.
Awaiting an offline recovery query can also keep an already settled write pending.

Use the existing deliberate-mutation pattern: `networkMode: 'always'`, reject
known offline state immediately before dispatch, retain row-owned rollback, and
invalidate without starting a paused recovery read while offline. Online
recovery still awaits the authorized read. Reconnect may refresh reads; it never
replays this mutation. Retry reads current preferences; a separate explicit pin
or unpin submits a new write. An already dispatched request remains authoritative:
a confirmed response is accepted, while a failure preserves existing recovery semantics.

## Actual browser evidence

| Capture | State |
| --- | --- |
| [390px Light](collection-pin-offline-390-light.png) | Localized offline feedback, restored personal selection, no pending saving label; list content remains available. |
| [1280px Dark](collection-pin-offline-1280-dark.png) | Same recovery in the existing Expanded composition. |

Both are unretouched full-page captures of the canonical Web app on pinned
Playwright Chromium, using authorized synthetic API fixtures and reduced motion.
The Compact navigation stays fixed to the viewport during a full-page capture.
The only runtime change from the baseline is `web/src/components/useCollectionPin.ts`.
Its tested SHA-256 is `e615e884353eb82de373ace9409bb6766534cac2dbcf0e90637033c8b90a6cbf`.

Each new browser case executes: open list → offline pin → see error and restored
selection → reconnect → read-only Retry with zero writes → explicit pin → confirm
→ Wir shows the list → return → offline unpin → preserve confirmed selection
→ reconnect/read-only Retry with no extra write → explicit unpin → confirm
→ Wir no longer shows the list. Exactly `[collection ID, null]` reaches the API.
Both cases pass with zero Axe WCAG A/AA violations and no horizontal overflow.

## Validation

- Five new component cases cover independent browser/TanStack offline signals,
  connectivity lost during query cancellation, and an admitted success/failure
  settling offline without retaining the lock for a paused recovery read.
  The first three failed on the baseline before runtime changes.
- 48 component cases pass across CollectionPinFeedback, CollectionProductPage
  and TodayPinnedCollection, preserving existing duplicate/scope/query identity,
  row-owned rollback, conflict recovery and collection interaction coverage.
- The 17 existing browser cases pass, including 320px/200% text, 360/390/430px,
  Light/Dark, Expanded, reduced motion and pending/conflict/recovery journeys.
  The initial combined run failed only the two new assertions that incorrectly
  treated the existing offline live-region status as a pending saving label.
  They now check the actual pending element; both complete new journeys pass
  in a focused run. No production behavior or existing assertion was weakened.
- Web build/TypeScript, scoped lint, formatting, engineering/documentation
  language audits and `git diff --check` pass. The existing bundle-size warning remains.

Shared lists and basic interaction quality remain Free/Core for Cloud and
Self-Hosted. Personal Account/Space presentation, ownership, quotas, retention,
export and downgrade semantics are unchanged. No persistent attempt, outbox,
telemetry or new provider. #508 and final #946 retain their broader scopes.
