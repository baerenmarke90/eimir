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

## Validation status

The expanded component matrix covers all four editors: removed/replaced Query after unmount, 401/403/404 reads, newer versions, normal authorized save and deferred-list-recovery session clear where the editor awaits recovery.

The Cloud execution environment disconnected after the two initial failing characterizations and before runtime implementation. Prepared source is published through GitHub for the existing hosted CI. Further tests, browser acceptance and visual inspection are pending; no unexecuted check is claimed as passed. Keep the PR Draft until relevant checks and acceptance are complete.
