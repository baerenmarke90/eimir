# Memory delete ownership — #1340

Base: `bb8ccd7b34c4c56c6b65fe296e0461b555a1d119`, tree
`6c4f8c4416d0cde847d29a19a2881f247c1b3630`. Source and production asset
digests are retained in `baseline-identity.json` and `final-identity.json`.
The PR's final proof comment binds these files to its immutable head and hosted checks.

## Product result

An existing Memory deletion captures its original Account, Space, Memory,
version, API and exact authorized Query. Cancellation cannot admit a delete
after that read or task loses ownership. A confirmed server result always
revokes the original persistent read snapshot. Cache recovery and exact
eviction require the original authorized Query, including a check after
awaited recovery. A replacement Query or later 401/403/404 remains intact.
Only the submitting route activation may navigate or announce success.
Leaving and returning restores resource pending protection without reviving
that navigation ownership. An offline confirmation settles locally and
requires a deliberate retry; reconnect cannot replay it. Pending edits and
deletes exclude each other for this resource.

Product Reference v1 R1/R2 continuity, interruption safety and shared-content
principles govern the same existing journey. Screen Templates 9 Create/Edit
and 11 Detail View remain the owners. The authored Memory is the focal point;
title/body, tags, photos/removal choices, date, fixed shared audience,
Save/Cancel/Back and two-step permanent-delete confirmation stay in place.
Compact leads and Expanded keeps the same content task. The correction adds
no composition or new product capability. Existing localized feedback and
semantic tokens are reused. Destructive confirmation calls for clear intent
and calm feedback; extra typing, playful copy and decorative motion would
not help. All seven new browser journeys use reduced motion.

The original editor also expanded a 320px document to 434px at 200% text.
Bounded zero-minimum grid tracks, wrapping and existing semantic spacing
tokens repair that task's reflow. Adaptive padding uses the existing
`product-content` container breakpoint; the photo picker can wrap. Text stays
at 200%, controls remain at least 44px, and content is not clipped or hidden.
Single-line input values retain their normal native internal scrolling.
The original measurement and screenshot are retained. Normal Compact and
Expanded compositions are preserved. Keyboard focus can expose the existing
skip link in full-page captures; fixed shell controls are captured at the
current viewport position.

## Reproducible negative and positive checks

| Layer | Unchanged baseline | Repaired source |
| --- | --- | --- |
| New production-component cases | 22 fail; normal confirmed-delete control passes | 23 pass |
| Focused deletion and existing editor cases | Baseline applies only to new cases | 31 pass |
| Full Web unit suite | Not rerun for this comparison | 1,704 pass; one existing skip |
| New production-bundle browser journeys | Seven intended failures | Seven pass |
| Existing Momente reference journeys | Existing contract retained | All 13 pass |

`baseline-unit-results.json` retains all 23 assertions and actual failure
messages against the unchanged runtime, omitting rendered localized DOM while
preserving assertion text and stack; the localized pending-button selector is
represented by its existing i18n key. The original reporter JSON digest is
recorded; logs normalize terminal formatting and trailing whitespace. The
unchanged runtime's source blob was checked against
the base commit. These tests force real denied reads with `staleTime: 0`,
observe both awaited recovery boundaries, and hold projection refetches so
canonical recovery cannot hide an incorrect callback. Cases cover removed
and replaced Queries, Account/Space/Memory changes, 401/403/404, synchronous
duplicate admission, cancellation races, departure/return and competing edits.
`focused-unit-results.json` and `web-unit.txt` record the positive results.

`browser-baseline.txt` runs the final seven-case sidecar against a frozen
production build of unchanged main. Its failures are specific: missing
restored pending at 390px; late `/more` → `/story` navigation at 430px and
both 1440px themes; 434px document width at 320px/200%; and unsettled offline
confirmation in both 360px themes. `browser-final.txt` records all 20 passing
new and existing journeys, with zero retries. Early harness runs with a
missing moved `expect` import were discarded; they are not defect evidence.

The new sidecar is `PR_CRITICAL` (seven cases). Its pure Story fixture was
extracted from the existing Momente spec, preserving all 13 original test
bodies and their `FULL_REGRESSION` classification. That changed spec is also
selected by the existing changed-spec CI plan. The complete PR-critical list
contains 357 actual cases in 38 files; this PR additionally selects the 13
Momente cases. No timing, assertion, retry or native delivery gate is weakened.

## Actual product journey and visual evidence

Tests sign in through the existing fixture, open Momente/Zeitleiste, open a
Memory, edit, cancel/reopen confirmation and confirm by keyboard. A first
503 leaves the title and editable draft intact. A deliberate retry holds
the exact `If-Match: 1` DELETE pending. Save and confirmation controls are
disabled. The user leaves through Cancel/detail and the real More route;
390px also returns to the editor during the request. After server confirmation,
More remains active, no deletion toast is posted there, and returning to the
canonical Timeline removes only the deleted Memory while another remains.
Strict fixture mode rejects every unhandled API request.

The 360px Light/Dark journeys retain unsaved body text after offline failure,
verify no DELETE on reconnect or cancellation, then explicitly reconfirm and
complete exactly one versioned request. Full-page Axe checks, document width,
control/label containment and 44px targets accompany the pending states.

| State | Retained captures |
| --- | --- |
| Compact pending | [390 Light](memory-delete-390-light-pending.png), [430 Dark](memory-delete-430-dark-pending.png) |
| Expanded pending | [1440 Light](memory-delete-1440-light-pending.png), [1440 Dark](memory-delete-1440-dark-pending.png) |
| Large text | [320 Dark, 200%](memory-delete-320-dark-large-pending.png), [unchanged overflow](baseline-320-dark-large-pending.png) |
| Error and retry | [430 Dark server failure](memory-delete-430-dark-error.png) |
| Departed task retained | [390 Light](memory-delete-390-light-departed.png), [430 Dark](memory-delete-430-dark-departed.png) |
| Canonical return | [390 Light](memory-delete-390-light-returned.png), [1440 Dark](memory-delete-1440-dark-returned.png) |
| Offline draft retained | [360 Light](memory-delete-offline-360-light.png), [360 Dark](memory-delete-offline-360-dark.png) |

Local proof uses Playwright 1.62.1 and Chrome Headless Shell 153.0.8010.0
against the production Vite bundle, two workers, zero retries. This is
separate from the mandatory hosted pinned-browser gates. Physical native
acceptance for #1332/#1271 remains outstanding and independent. #946 is not
activated; #1339 remains a separate Heart visibility repair.

## Reuse, business and cross-cutting review

Reuse installed MIT TanStack Query mutation keys, pending counts and
cancellation, React lifecycle cleanup, `captureAuthorizedQuery`, existing
generated APIs, `ProductReadResult`, `assertOnlineWrite` and persistent-cache
revocation. A new queue, history framework, store or provider would duplicate
existing ownership and recovery primitives. No new dependency/provider or
license, ToS, setup, data-flow or operating-cost change is introduced.

**No business/freemium impact:** Memory CRUD and Timeline remain Free/Core;
media privacy/validation remains non-paywallable. Entitlements, shared
ownership, Cloud/Self-Hosted parity, quotas, costs, retention, trials,
downgrade, export and restore contracts remain unchanged. Authoritative
business and feature-matrix documentation therefore needs no change.

Server authorization and original If-Match remain authoritative. No delete
optimism or sensitive diagnostics are added. No API/DTO/schema/migration,
backend, deployment or native capability changes. Existing i18n, date
rendering and semantics remain. Exact original-scope recovery avoids effects
on replacement reads or another task and introduces no polling or replay.
Build, tokens, PWA, Capacitor, lint, formatting, language audits, inventory,
planner tests, browser typechecks and secret checks supplement the tests.
Existing lint warnings and one existing skipped unit test are recorded;
no new lint error or warning is introduced.
