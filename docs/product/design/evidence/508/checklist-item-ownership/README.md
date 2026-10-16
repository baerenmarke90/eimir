# Authorized checklist item reconciliation — #508

Baseline: `main@5b03e3e01ad379fa6f780633f8293250da11a60e`, 2026-10-16.
Runtime and tests: `94e219a285678fd6605929447a65daf82757b454`;
Git tree: `3f833b8ea6699e55f3d5205c6c2b5288246151ec`.
[Pre-implementation review and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/508#issuecomment-6224360010).

## Bounded defect and shared contract

A private item confirmation previously replaced the complete item DTO, including
its collection-owned position. A delayed response could therefore undo a newer
reorder. Item callbacks could also change a replacement Query, apply optimism
after cancellation to a newer item, or clear a newer 401/403/404 read and reveal
unavailable content. Pending private completion could mask a newer authorized
item until the old write settled. Shared completion had its own field/version
reconciliation but lacked the denied-read guard.

`captureCollectionItemUpdate` extracts that shared reconciliation responsibility:

1. Capture the exact authorized Query before awaited read cancellation.
2. Apply optimistic completion only at the submitted item version. Retain a
   newer item, a replacement Query and denied reads.
3. Roll back only the submitted completion at the admitted item version and
   value; preserve unrelated fields and collection positions.
4. Confirm only submitted title/completion fields plus item version/time when
   the response advances the current item. Equal/newer reads remain authoritative;
   deleted items and removed Queries are never recreated.

Both existing shared/private item consumers use this core. Private inline rename
uses the same mutation lifecycle and now preserves independent order as well.
Private pending feedback additionally requires the admitted item version and
current authorized Query. Consumers retain their own recovery policies: private
Retry reads only; shared Retry remains a deliberate version-checked action.
Private detail/overview recovery checks their original Query identities and
rechecks authorization after an awaited detail read. Existing synchronous duplicate
locks, Account/Space/collection task boundaries, If-Match and no reconnect write
replay remain.

This does not finish every mutation family under #508 or activate final #946.
Draft #1271 and its physical-device acceptance remain independent.

## Product acceptance

Product Reference v1 R3/R5, Detail/Create-Edit and Checklist Row apply. The
generated [private toggle reference/contract](../../../references/508/private-list-toggle-preflight.md),
[shared toggle reference](../../../references/508/collection-toggle-pending.webp)
and [offline contract](../../../references/508/checklist-offline-repair.md) remain
representative of the reviewed current destinations. This is a behavioral repair:
composition, markup, copy, controls, gestures, tokens and styling are unchanged.
No newly generated composition is required.

Personal item titles stay focal. The current pressed checkbox and associated
quiet saving text remain the immediate action/feedback. Owner-only context,
private tabs, Back, title/count and Edit-only management remain. Shared detail
retains its own pin/add/edit controls. Checklist rows serve the actual checking
task; no table, extra typing, modal, celebration or relationship copy is added.
Compact is normative; Expanded adapts the same detail. Keyboard/focus, touch
targets, wrapping, semantic motion and reduced motion retain their contracts.

Six new production-browser journeys hold an actual item PATCH response. Normal
offline/reconnect events after the existing read freshness interval trigger a
new authorized GET. A newer root order or item edit must remain visible before
and after the old success. Hold the success recovery GET so it cannot conceal
cache corruption. A deliberate next action sends the returned/current item
version; Back and reopening retain the result without another write. Separate
success/failure journeys refresh into a denied read; the old callback must leave
content unavailable and issue no new recovery read. No client-cache injection or
test-only product API is used.

The existing affected suites also exercise ordinary completion/rename/reorder,
conflict/read recovery, private read-only Retry, duplicate input, offline/no replay,
draft and task continuity, account transitions, pin/Today and Back/return. Cover
Compact 360/390/430, sparse/dense, 320 px/200% text, Expanded, Light/Dark, reduced
motion, horizontal overflow and strict full-page WCAG 2.2 AA Axe.

## Reviewed production captures

All seven full-page captures below were visually inspected on the exact production
bundle. The Narrow/200% capture retains existing navigation truncation and text
wrapping; it adds no new geometry. Fixed Compact navigation can appear partway
down a full-document capture; action reachability and scrolling are exercised by
the journeys.

| Capture | Observed result |
| --- | --- |
| [Newer order, Compact Light](private-completion-newer-order-390-light.png) | Confirmed completion retains the independently reordered item position |
| [Newer item, Compact Light](private-completion-newer-item-390-light.png) | Newer title/open state stays authoritative without obsolete pending feedback |
| [Newer order, Expanded Dark](private-completion-newer-order-1280-dark.png) | Same preserved order and completion in the bounded read-first detail |
| [Newer item, Expanded Dark](private-completion-newer-item-1280-dark.png) | Newer item survives the old success |
| [Denied read, old success](private-completion-denied-success.png) | No personal list content is revealed |
| [Denied read, old failure](private-completion-denied-failure.png) | Unavailable state remains authoritative |
| [Pending, 320 px/200% Dark](private-list-pending-320-dark-200pct.png) | Existing wrapping and associated textual saving state remain usable |

## Reuse, business and cross-cutting review

Reuse the adopted TanStack Query 5.102.2 cancellation/context/immutable-update
lifecycle, existing shared item algorithm, `captureAuthorizedQuery`, generated
DTOs and current native checkbox/inline edit controls. A separate store, sync
engine, transaction library or provider cannot replace domain field ownership
and independent root/item versions. No product dependency, external data flow,
license/ToS, cost, rate limit or user/hoster setup changes. Adopted TanStack remains
MIT and in-memory for both Cloud and Self-Hosted.

No business/freemium impact: shared/private lists and basic interaction quality
remain Free/Core; privacy remains non-paywallable. Entitlements, relationship and
owner-only boundaries, Cloud/Self-Hosted parity, managed cost, quota/storage,
retention, downgrade, existing-data/export/restore and the feature matrix remain.

Preserve authorized Account/Space reads, Query lifetime, denied-read precedence,
If-Match and explicit recovery. No persistence, telemetry, logging, schema/API,
migration, native capability, release/backup setting or infrastructure change.
Work stays bounded to current items with no new polling/query family. Existing
localization and accessibility/status/error components remain authoritative.

## Validation and runtime identity

- Complete Web suite: **1,584 passed, one existing skip**, 202 passing files.
- Focused shared/private item component files: **77 passed**. All **20 new cases
  fail unchanged baseline**, with 57 existing cases passing; failures are at
  order, Query ownership, denied-read, version and pending-state assertions.
- All **six new production-browser cases pass** with zero retries. All six fail
  against a separately built unchanged baseline at the intended order,
  pressed-state or unavailable-content assertion.
- Full affected production-browser suites: **94 passed in 3.5 minutes**, one
  worker, zero retries/flakes.
- Production build/typecheck, complete lint/format, token/PWA/Capacitor foundation,
  browser-spec typing/inventory, engineering/documentation language audits and
  diff checks pass. Complete lint retains 25 existing warnings/13 infos.

Local runtime: Node 24.19.0, Chromium **153.0.8010.0** from an isolated
`@sparticuz/chromium@153.0.0` QA installation. The pinned Chromium 151 download was
unavailable locally. The isolated browser is not a product dependency; no lockfile
or repository dependency changed. Use ordinary browser security defaults, retaining
only headless/sandbox/container and software-rendering launch requirements; do
not use the package's single-process or disabled-web-security defaults. The initial
single-process harness crashed between contexts; no product assertion failed in
that harness run. Correcting the local launch configuration resolved it.

An explicit temporary Playwright configuration starts Vite **preview** with a
dedicated port, forbids server reuse, and uses one worker with zero retries and
unchanged assertions/timeouts. Hosted canonical browser evidence remains a separate
technical gate; API I/O is fixture-controlled, so neither run claims real-backend
concurrency, physical-device or final #946 acceptance.

| Production asset | SHA-256 |
| --- | --- |
| `index-CZkyPbW4.js` | `d39aa9cb015dd646f3fb43fd4d5ec67e4abfb0d6f57400a6a4d1ffd30002880a` |
| `index-D46K-c7Q.css` | `5a0671f0169db7c9502f7709de7b79f2568b81e89a09a3ad57a6e77202b0d3f2` |

[SHA256SUMS](SHA256SUMS) records the committed screenshot bytes. Hosted checks and
their exact heads are linked in the PR after completion.
