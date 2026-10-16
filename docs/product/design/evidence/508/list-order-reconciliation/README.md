# Authorized list-order reconciliation — #508

Baseline: `main@b5d220bbc1507ecb47e5418e6a614f0314530d75`, 2026-10-16.
Runtime and tests: `b37f989c44ebded74b070f31a4d6209aaf2f67ec`.
[Pre-implementation review and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/508#issuecomment-6218951194).

## Problem and bounded contract

Shared reorder previously restored old positions without checking the initiating
root version, and committed the complete response without checking the Query or
independent item versions. Its callbacks also used the current route closure.
Private reorder already protected newer root/item versions, but could still
write into a replacement Query and clear a newer denied-read error. Both could
make unavailable content visible again after an old order response.

Backend inspection confirms that item addition/deletion and reordering advance
the collection root version. Item title/completion updates use independent item
versions. A root-only whole-response replacement therefore loses valid changes.

`captureCollectionOrder` is the single small cache contract for both existing
reorder consumers:

1. Capture the exact authorized Query before awaited cancellation. Apply
   optimistic positions only when the captured Query and submitted root version
   still exist after cancellation; retain server versions.
2. On failure, restore positions only at that submitted root version. Preserve
   titles, completion and independently updated item fields.
3. On success, retain an equal/newer current root. Otherwise reconcile returned
   positions/root metadata while retaining equal/newer item versions.
4. Ignore removed/replacement Queries and newer 401/403/404 reads. The shared
   `captureAuthorizedQuery` guard is extracted from `capturePrivateEdit`, whose
   existing behavior is retained; order callbacks now use the same precedence.

The shared detail task is keyed by Account/Space/collection, matching the private
collection's existing resource boundary. Navigating to another collection starts
its own task state and write lock. The synchronous reorder lock also captures
the exact authorized Query and request identity: a replacement Query is not held
by an old request, and old settlement cannot release a newer request's lock.
Component journeys hold two independent writes across a route change and verify
pending feedback, duplicate blocking, cache ownership and release.

Shared requests, errors, deliberate Retry and invalidation use the submitted
Space/collection. Recovery of an overview only targets its captured Query.
Private access-denied reset and read-only Retry stay local; the order helper
neither performs recovery nor decides product retry policy. Existing duplicate
locks, If-Match, conflict handling, connectivity-at-dispatch, pending presentation
and no-write-on-reconnect semantics remain in place.

This slice does not claim all mutation families under #508 are complete. #946
final acceptance and physical-device gates are not activated by these results.

## Product acceptance

Product Reference v1 R3/R5, Detail View/Create-Edit and Checklist Row govern.
The generated [shared reorder reference](../../../references/508/collection-reorder-pending.webp),
[private reorder contract/reference](../../../references/508/private-list-reorder-preflight.md)
and [offline repair contract](../../../references/508/checklist-offline-repair.md)
remain applicable: composition, copy, actions, touch targets and motion are
unchanged. No new generated composition is required for this bounded repair.
Titles remain focal, with the existing pointer/keyboard handle and quiet saving
status. No additional typing, modal, celebration or relationship copy is useful.
Compact remains normative and Expanded adapts the same detail.

The six concurrent-read browser journeys open a shared collection, move an item,
hold the response, and model a newer server order or independent item edit.
After the existing 15-second cache freshness interval is advanced with the test
clock, actual offline/reconnect events trigger the normal authorized read while
the original write remains held. No client-cache injection or test-only runtime
API is used. Release the old response as success or failure, holding the success
recovery GET so it cannot mask corruption. The newer order/title/completion must
remain. A deliberate retry/new move sends the current root version; Back/return
retains the result without an additional write.

Four more real-browser cases refresh into a denied 403 read while shared/private
reorder waits. Release the old success/failure after the unavailable state is
visible. Hold any unexpected recovery read and wait for the response/render
boundary: the old callback must neither reveal content nor start a recovery read.
Component cases additionally cover 401 and 404 without relying on document reload.

The existing affected suites retain ordinary immediate order, pointer release,
rollback, conflict, read recovery, read-only private Retry, offline/no replay,
duplicate input, draft safety, private create/edit continuity, pin/Today and
Back/return journeys. Compact 360/390/430, sparse/dense, 320 px/200% text, Expanded,
Light/Dark, reduced motion, horizontal reflow and strict full-page WCAG 2.2 AA Axe
remain covered. API I/O is fixture-controlled; these are production Web journeys,
not real-backend concurrency or native-device acceptance.

## Actual production captures

All listed images were captured from the final production bundle and visually
inspected. Full-page Compact images can contain fixed navigation partway down
the document; actual scrolling/action reachability is exercised by the journeys.
Narrow native inputs retain their existing clipping/scrolling behavior for long
values. The helper adds no geometry or styling.

| Capture | Reviewable state |
| --- | --- |
| [Old failure, Compact Light](shared-order-newer-order-failure-390-light.png) | Newer order and edited/completed item remain; explicit Retry |
| [Old success, Compact Light](shared-order-newer-order-success-390-light.png) | Newer root/order survives before recovery returns |
| [Newer item, Compact Light](shared-order-newer-item-success-390-light.png) | Independent title/completion survives equal-root old response |
| [Old failure, Expanded Dark](shared-order-newer-order-failure-1280-dark.png) | Newer order and existing error presentation |
| [Old success, Expanded Dark](shared-order-newer-order-success-1280-dark.png) | Newer authorized list remains stable |
| [Newer item, Expanded Dark](shared-order-newer-item-success-1280-dark.png) | Updated item survives old success |
| [Denied shared read, Compact Light](shared-order-denied-success.png) | Content remains unavailable after old success |
| [Private pending, Compact Light](private-reorder-pending-390-light.png) | Released order, saving text and disabled overlapping controls |
| [Private pending, Compact Dark](private-reorder-pending-390-dark-sparse.png) | Sparse list with existing Dark feedback |
| [Private pending, Expanded Light](private-reorder-pending-1280-light.png) | Same order/interaction hierarchy at Expanded width |
| [Private pending, 320 px/200% Dark](private-reorder-pending-320-dark-200pct.png) | Wrapping, reflow and textual pending feedback |
| [Denied private read, Expanded Dark](private-order-denied-failure.png) | Owner-only rows remain hidden after old failure |

## Reuse, business and cross-cutting review

**Reuse review relevant:** considered the installed TanStack Query 5.102.2
cancellation/context/immutable-update lifecycle, existing Query identity and
private-edit authorized-read guards, the two order implementations, React resource
keys (including private `CollectionItems`), existing request-identity locks, and a
separate optimistic store/transaction library. Reuse the adopted framework and native
pointer/keyboard interaction. The small shared domain core is necessary for root
versus item versions and precise Query ownership; a second store/provider cannot
replace those contracts. No dependency/provider, license/ToS, external data flow,
cost, rate limit or user/hoster setup is introduced. Adopted TanStack remains MIT
and in-memory for both Cloud and Self-Hosted.

**No business/freemium impact:** shared/private lists and basic interaction quality
remain Free/Core; privacy remains non-paywallable. Entitlements, relationship and
owner-only semantics, Cloud/Self-Hosted parity, managed cost, storage/quota,
retention, downgrade, existing-data/export/restore and the authoritative matrix
are unchanged.

Security/privacy: preserve authorized Account/Space reads, exact Query lifetime,
denied-read precedence and cache-clear isolation. No new projection, persistence,
logging or telemetry. Accessibility/i18n reuse current controls, localized error
and status copy, keyboard/pointer behavior and reduced motion. Resilience retains
If-Match, explicit retry and no offline write queue. Performance remains bounded
mapping of the current list with no new polling/query family. APIs, schemas,
migrations, dependencies, native capabilities, deployment/backup/release settings
and operating costs are unaffected.

## Validation and provenance

- Complete Web suite: **1,564 passed, one existing skip**, 202 passing files.
- Focused shared/private component files: **69 cases**, including 24 new
  regressions. Against unchanged baseline: **24 failed, 45 passed** at the intended
  stale-cache, feedback, scope, cancellation and denied-read assertions.
- Counterfactual production browser: all six concurrent-read cases and all four
  denied-read cases fail against unchanged baseline at content/order/visibility
  assertions. No failed regression is hidden by a recovery response.
- Final affected production-browser suites: **88 passed in 4.8 minutes**, one
  worker, zero retries/flakes.
- Production build, TypeScript, browser/fixture typing, complete lint/format,
  Capacitor foundation, token/PWA checks, engineering/documentation language audits
  and `git diff --check` pass. Existing complete-lint output is 25 warnings and
  13 infos; all nine changed source/test files have zero lint diagnostics.

Local runtime: Node 24.19.0; pinned Playwright Chromium. An explicit temporary
browser configuration starts Vite **preview**, forbids reuse of another server,
and retains existing assertion settings with one worker and zero retries. The
served HTML was verified to contain built `/assets/` references and no Vite dev
client. Runtime and tests were committed before final visual evidence.

| Production asset | SHA-256 |
| --- | --- |
| `index-DlRGngtD.js` | `2160a63c091454205c4a4950a9763c4ba660108adbb6900b812c4c9eaf1e4721` |
| `index-D46K-c7Q.css` | `5a0671f0169db7c9502f7709de7b79f2568b81e89a09a3ad57a6e77202b0d3f2` |

[SHA256SUMS](SHA256SUMS) records the committed image bytes. Hosted checks are linked
from the owning PR after completion; they remain a separate technical gate.
