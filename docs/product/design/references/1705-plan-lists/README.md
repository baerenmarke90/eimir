# Plan-linked lists and source Place continuity

## Preflight

Owner: [#1705](https://github.com/baerenmarke90/eimir/issues/1705).
Baseline: `b810058786bf02553005a0a3e74cacaf4d553584`.

![Generated Compact composition reference](compact-reference.png)

The generated image predates UI implementation. The owning issue records the
Mobile Interaction Contract, reuse, commercial model and cross-cutting review.
Reviewed current Plan overview/detail/completion, Collection overview/detail,
Memory source-Plan capture, HeartMoment location/privacy, shared task lifecycles,
status scopes, tokens and shell. Product Reference v1 R1, R3 and R5 govern.

The approved slice links canonical shared lists to Plans, derives list status
from existing items, and prefills the source Place in canonical capture. It
preserves the existing Wish association, comments, Plan completion, Milestone
alternative, gallery, private audience and task return behavior.

The image guides hierarchy, not exact pixels or new capability. Keep actual
navigation glyphs and existing media/feeling controls; do not implement invented
stock imagery, gradients, automatic photo copying or altered privacy choices.
All standalone insertion controls retain the shared blue plus-and-label pill.
The final implementation must include behavioral and real-build visual evidence.

## Product Owner correction: list actions belong in Edit

Reviewed current `main` `7aca73a05d27bcbf4ac0073d2b369503d431d641`
and the supplied Compact screenshot on 2026-11-09. The screenshot exposes an
empty shared-lists section and its add action while reading a Plan. This violates
the requested Edit boundary and Product Reference v1's read-first contract.

Acceptance for this bounded correction:

- Normal Plan detail shows existing linked lists and their live progress as
  canonical open/return links, without add or unlink actions.
- A confirmed empty list section is omitted from normal detail.
- The existing Plan Edit action reveals list management inside the editor,
  alongside the existing optional relations. Reuse the blue labeled add action,
  alphabetical multi-picker and named unlink controls.
- Linking/unlinking keeps its existing explicit, immediate relation operation;
  pending writes block conflicting Plan saves and editor exit. Failed selection
  remains retryable. Plan-field drafts are independent of picker selection.
- Saving or cancelling the Plan editor returns to the read-only list view.
  Permissions and offline guards remain effective.

The existing generated reference and Mobile Interaction Contract above still
govern the feature; this correction restores the approved reading/editing pattern
without a new visual system, domain capability or material screen redesign.
Compact and Expanded retain their existing composition, tokens, sheet motion,
focus restoration and reduced-motion fallback. Confirm empty/read/edit states,
link/unlink, failure/retry and list-result return in the existing feature suite.

Reuse review: existing Plan editor and relation/sheet/query primitives; no new
dependency, infrastructure or provider. **No business/freemium impact:** Plan
lifecycle and shared Collections remain Free/Core in Cloud and Self-Hosted, with
unchanged entitlements, quotas, costs and data rights. Cross-cutting review:
preserve authorization, localized labels, query isolation, truthful progress,
error/offline handling, keyboard focus, narrow/large-text layout and independent
Plan/list lifecycles. No API, persistence, telemetry or native-wrapper changes.

## Implemented result and acceptance

Plans reference canonical shared Collections through the existing typed relation
lifecycle. The same list can support multiple Plans; unlinking keeps the list and
its items. List progress refreshes after confirmed item/title/structure changes.
The alphabetical multi-picker includes completed lists and uses the canonical
blue labeled add action inside Plan Edit and the existing shared-list creation destination. List
creation remains its own canonical task; linking is an explicit choice.

Shared list browsing reuses `StatusScope`: Open / Completed / All. Empty lists
are open. Filtering happens before keyset pagination, cursors bind the scope,
and task origin preserves the selected scope when returning or deleting.
Linked lists do not inherit this overview filter.

Both Memory and HeartMoment capture use one scoped source-Plan reader. The
source Place stays editable/removable, late reads preserve manual choices,
and Memory draft recovery wins over source prefilling. Normal Memory creation
stores the canonical Place relation. A private HeartMoment stores only the
protected name/address/coordinate snapshot. No photos or private backlinks are
implicitly copied. Existing Milestone continuation and Plan completion remain
independent of capture success.

The shared icon-action primitive now has an explicitly named unlink role. At
narrow widths/large text, decorative list icons and chevrons recede to preserve
readable names and progress. The completion continuation also constrains its
Grid minimum and wraps labels at 320 px / 200% text. Narrow continuation
insets and the section-heading role keep complete action words readable. The
browser journey also asserts focus returns to the add action after linking.

### Real-build evidence

`web/e2e/tests/plan-linked-lists.spec.ts` owns eight complete journeys, including
five viewport/theme variants, exact mutation payloads, actual save/result/return,
list reopening/filter restoration, no horizontal overflow, and axe checks.
Every variant uses reduced motion. The 320 px variant uses 200% root text.
No artificial scroll, delay, retry, or weakened assertion was introduced.
The existing Planning completion/reference/create/search suites also passed.

| State | Compact | Expanded |
| --- | --- | --- |
| Plan and linked lists | [360 Light](evidence/plan-lists-360-light.png), [390 Dark](evidence/plan-lists-390-dark.png), [430 Light](evidence/plan-lists-430-light.png), [320 / 200%](evidence/plan-lists-320-light.png) | [1280 Dark](evidence/plan-lists-1280-dark.png) |
| Alphabetical multi-picker | [360 Light](evidence/lists-picker-360-light.png), [390 Dark](evidence/lists-picker-390-dark.png), [430 Light](evidence/lists-picker-430-light.png), [320 / 200%](evidence/lists-picker-320-light.png) | [1280 Dark](evidence/lists-picker-1280-dark.png) |
| Completed-list scope | [360 Light](evidence/lists-completed-360-light.png), [390 Dark](evidence/lists-completed-390-dark.png), [430 Light](evidence/lists-completed-430-light.png), [320 / 200%](evidence/lists-completed-320-light.png) | [1280 Dark](evidence/lists-completed-1280-dark.png) |
| Canonical capture | [Memory source Place](evidence/memory-source-place.png) | [Private HeartMoment source Place](evidence/heart-source-place-private.png) |
| Reopened list leaves completed scope | [Retained scope, empty result](evidence/completed-lists-after-reopen.png) | Same status interaction |

Local validation: 2,786 Web tests passed (two existing skips), 1,358 backend unit
tests passed (21 explicitly skipped database-dependent probes), type/lint/format,
production build, 38 browser-planner regressions, and generated API/schema checks.
The complete five-spec Planning browser run passed 56 cases. The focused
completion/feature run passed 28 cases; the final eight-case feature run also
passed after refining narrow continuation typography and action insets.
PostgreSQL HTTP/tenant, migration and transfer-roundtrip evidence is supplied by
hosted CI; no local PostgreSQL execution is claimed.

### Edit-boundary correction validation (2026-11-09)

The existing eight-case feature suite now enters the actual Plan editor before
linking/unlinking. It asserts that normal detail has no add/unlink controls,
confirmed empty sections disappear, both Cancel and Save return to read mode,
the list still opens and returns with refreshed progress, and linking restores
focus to the enabled add action. It retains the completed-list and canonical
Memory/private-HeartMoment capture journeys.

All **8 browser cases passed** across 360/390/430/1280 px and 320 px at 200%
text, with Light/Dark, reduced motion, no horizontal overflow and axe checks.
The newly exercised editor required a shrinkable field track, wrapping action
row and heading, plus closing the picker after the shared write guard releases
its focus target. No test assertion, timeout or retry was weakened.

**44 focused component tests passed**, including Plan-field serialization,
conflict/draft recovery, list selection/partial failure and Wish-link behavior.
The two new read-mode regressions first failed against the unchanged runtime.
Production build/typecheck, token/localization/PWA checks, lint, changed-file
formatting, browser inventory and diff checks passed. Existing lint and bundler
warnings remain non-blocking. Local dependencies were synchronized with the
committed lockfile; no dependency change is part of the correction.

Actual synthetic-fixture captures, with checksums in
[`edit-boundary-evidence/manifest.json`](edit-boundary-evidence/manifest.json):

| State | Compact | Expanded |
| --- | --- | --- |
| No linked lists, normal detail | [360 Light](edit-boundary-evidence/plan-without-lists-360-light.png) | [1280 Dark](edit-boundary-evidence/plan-without-lists-1280-dark.png) |
| Linked lists, normal detail | [390 Dark](edit-boundary-evidence/plan-lists-390-dark.png), [320 / 200%](edit-boundary-evidence/plan-lists-320-light.png) | [1280 Dark](edit-boundary-evidence/plan-lists-1280-dark.png) |
| List actions inside Edit | [390 Dark](edit-boundary-evidence/plan-lists-edit-390-dark.png), [320 / 200%](edit-boundary-evidence/plan-lists-edit-320-light.png) | [1280 Dark](edit-boundary-evidence/plan-lists-edit-1280-dark.png) |

This is canonical Web behavior, also packaged by Capacitor. No native-wrapper
change, installed-device acceptance, merge or publication is claimed. Hosted
validation is recorded in the correction PR against its actual source revision.
