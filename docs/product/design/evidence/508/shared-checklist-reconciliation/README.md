# Shared checklist reconciliation — #508

## Source and preflight

Baseline: `main@159f38a21e8fef03f36de7c1cef1874da60e5f14`.
Runtime source blob: `a8135318b93c71975bb63541d10e700f9a5fb3c0`
(`web/src/components/CollectionProductPage.tsx`). Captured 2026-10-16 on
Playwright 1.62.1 / pinned Chromium 151.0.7922.34, React/Vite production
components with synthetic authenticated API responses. This is Web acceptance;
it does not establish live-backend concurrency or physical-device acceptance.

The [owning issue preflight](https://github.com/baerenmarke90/eimir/issues/508#issuecomment-6213699909)
preceded runtime changes. This repairs the published shared-checkbox consistency
contract: no new/material feature, markup, styling, copy, interaction or
composition. The existing [generated Compact reference](../../../references/508/collection-toggle-pending.webp)
and [checklist contract](../../../references/508/checklist-offline-repair.md)
remain applicable. Product Reference v1 checklist/feedback rules, R3/R5,
Detail View and Checklist Row govern. Back/title/Edit/personal pin/count,
inline Add, item controls, errors and shell/navigation remain in place.

The human outcome is a trustworthy shared practical checkbox: immediate
reversible feedback without overwriting a partner's newer changes. Checklist
rows are appropriate for checking items; no new administrative composition,
extra typing, modal, celebration or relationship microcopy is introduced.
One person can complete this task alone. Existing loading/empty, localized
saving/error/offline/success, privacy/capability, keyboard/focus, targets,
large-text/reflow and reduced-motion behavior remain binding. Expanded adapts
the same bounded detail. No native capability is affected.

## Root cause and implementation

The old mutation replaced the entire cached row on failure and success, using
the current component key without checking its Query identity. It could discard
a newer item version, title or position and reconcile into a removed-and-replaced
Query. Ten added component cases cover newer rows, field ownership, deletion,
replacement, route feedback and replacement during awaited cancellation. Seven fail against
unchanged main; both new browser journeys also fail at the retained-title
assertion after the old callback. An additional route-transition characterization
fails before its feedback-scope guard. Restoring the fix makes them pass. No retries,
sleeps, timeouts, assertions or accessibility rules were relaxed.

Use the existing `captureQueryIdentity` before cancellation. Capture the admitted
collection's key and request Space. Apply optimistic completion only at the
admitted item version. Rollback restores only completion while that version and
submitted value still match. A successful response advances only completion,
version and update time when newer than the cached row; title, position and
other unrelated fields remain. Neither path inserts missing rows or writes to
replacement Queries. Late replacement-query errors are hidden and cannot replay
a stale attempt through Retry. Existing server If-Match, conflict read recovery,
explicit retry, synchronous duplicate lock and deliberate offline policy remain.

## Real browser journeys and captures

Both new journeys execute:

1. Open the shared detail at 390 px Light; check the first item and hold PATCH.
   Assert its optimistic check, disabled duplicate action and polite saving text.
2. Model a newer authorized server version 3 with a changed title, reopened
   completion and changed order. Add another real row through the UI: its normal
   invalidation loads the newer detail. No client cache or test-only runtime API
   is injected.
3. Release the old PATCH as failure or version-2 success. Hold the success
   recovery GET so it cannot mask stale callback corruption. Assert the newer
   title, completion, position and independently added row remain.
4. Explicitly Retry after failure, or check after success. Assert the request
   versions are exactly `1`, then `3`, and confirmed completion remains visible.
5. Review Expanded Dark with reduced motion, check full-page WCAG 2.2 AA Axe and
   reflow, then visible Back → browser return. The result and title remain;
   navigation sends no additional write.

| Capture | State |
| --- | --- |
| [Failure, 390 Light](shared-newer-failure-390-light.png) | Newer server row and order survive old failure; existing inline Retry |
| [Success, 390 Light](shared-newer-success-390-light.png) | Newer server row survives old success before held recovery read returns |
| [After deliberate retry, 1280 Dark](shared-newer-failure-1280-dark.png) | Confirmed version-3-based action, added row and updated order |
| [After deliberate check, 1280 Dark](shared-newer-success-1280-dark.png) | Confirmed result with reduced motion |

Existing browser cases additionally retain ordinary immediate check → failure →
rollback → retry → confirmation, 320 px / 200% text / Dark / reduced motion,
reorder, pin, Today and offline/no-replay acceptance. No theme/layout changes
are made. Full-page captures of long Compact content can place fixed navigation
within the captured document; actual scrolling and action reachability remain
covered by the runtime journeys.

## Reuse, business and cross-cutting review

**Reuse review relevant:** considered installed TanStack cancellation/context
and immutable cache updaters, the repository Query identity primitive, and a
separate optimistic store/transaction library. Select the existing framework and
small domain-specific field/version guards. The
[official optimistic-update guidance](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)
was rechecked; its whole-snapshot example needs narrower ownership in this
concurrent domain. No new dependency/provider, license, external data flow,
cost or operator/user setup. Adopted TanStack Query remains MIT and in-memory
on both Cloud and Self-Hosted.

**No business/freemium impact:** shared lists and fundamental interaction quality
remain Free/Core. Capabilities, relationship ownership, Cloud/Self-Hosted parity,
resource use, quotas, retention, downgrade, restore/export and the feature matrix
are unchanged.

Security/privacy: retain authorized Space-scoped reads, requests and cache-clear
isolation. No new storage, private projection, logging or telemetry. Resilience:
retain explicit retry, If-Match/conflict and no offline replay. Accessibility and
i18n reuse current components/copy; no status or motion gate is bypassed.
Performance: bounded existing-row mapping; no new query family or polling.
API/schema/migrations, dependencies, deployment, native and operating costs are
unaffected. #508's umbrella and final #946 acceptance remain open.

## Validation

- Complete Web suite: 1,483 passed, one existing skip (200 files).
- Focused component suite: 31 passed, including ten new cases.
- Counterfactual main: seven component failures and both new browser failures
  at the intended corruption assertions.
- Production build and TypeScript passed; scoped Biome check, both engineering
  language audits and `git diff --check` passed.
- Full affected browser suite: 28 passed without retry. The final route-feedback
  refinement also passes the three ordinary/concurrent checkbox journeys. Hosted
  PR checks are recorded in the PR.
