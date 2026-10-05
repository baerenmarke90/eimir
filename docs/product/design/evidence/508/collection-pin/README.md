# Personal list pinning — actual Web evidence

Owning issue: #508, seventh bounded interaction slice. The generated
[whole-screen reference and Mobile Interaction Contract](../../../references/508/collection-pin-preflight.md)
were committed and linked to #508 before runtime implementation.
Baseline: `main@8dbe6e6bdbeeb0b98e5e875d4b1423b2e51ef53b`.

These are unretouched full-page Chromium captures of the canonical Web app
with authorized synthetic API fixtures and locked dependencies. The tested
Web source tree is `efd65bcdfb5c1f7f9d54ff53195929d61b7568df`; later evidence-only files do not
change that tree. German product copy comes from existing i18n resources.
Fixed navigation remains attached to the viewport in full-page captures;
this is not a proposed placement in document flow.

## Screens and journey

| Capture | State |
| --- | --- |
| [390px Light](collection-pin-pending-390-light.png) | Submitted pin is visible before the held server response, with polite saving status. |
| [390px Dark sparse](collection-pin-pending-390-dark-sparse.png) | One item, same personal action and pending semantics. |
| [360px Light dense](collection-pin-pending-360-light-dense.png) | Six items retain their content and available controls. |
| [430px Dark empty](collection-pin-pending-430-dark-empty.png) | Empty list remains useful and can be personally shown on Wir. |
| [320px Dark, 200% text](collection-pin-pending-320-dark-200pct.png) | Pin label/status wrap; the existing checklist reflows without horizontal overflow. |
| [1280px Light](collection-pin-pending-1280-light.png) | Expanded keeps the bounded list and personal action. |
| [Rollback](collection-pin-rollback-390-light.png) | Failed pin restores confirmed selection and offers read-only recovery. |
| [Read recovery](collection-pin-read-recovery-390-light.png) | Authorized list remains visible; unavailable preferences block pin writes. |

Six viewport cases execute Open list → pin held PATCH → immediately see selected
pending state → confirm → Wir shows the list → return → remove held PATCH →
immediately see unselected pending state → confirm → Wir no longer shows it.
They verify one write after repeated button activation, native pressed/status
association, unchanged Add availability, exact `[collection ID, null]` writes,
zero Axe WCAG A/AA violations and no horizontal overflow. All six use reduced
motion. Full-page large-text captures also include fixed shell elements outside
the active scrolled viewport; their document position is not a layout proposal.

The normal-motion failure case verifies 500 rollback, read-only Retry, an
updated authoritative selection after 409, and unavailable recovery reads.
Writes stay blocked until recovery succeeds; no failed selection is replayed.
The rollback state also passes Axe. Existing shared completion, reorder,
confirmed celebration, Add, Compact/Expanded and return tests remain covered.
The entire updated browser spec passes 17 cases without retries.

## Component and build verification

Seventeen production-component cases cover immediate selection/removal,
rapid duplicates, visibility semantics, background reads, row-owned rollback,
unrelated modules/order, newer authoritative rows on late success/failure,
conflict/offline recovery, Account/Space switches, removed/recreated query
non-recreation, remount duplicate prevention and denied preference reads. Additional scoped
cases keep old errors out of the new Account/Space and allow its explicit
selection while the initiating scope still saves; late settlement cannot
clear the newer pending feedback or write guard.
Fifteen existing Collection component cases and the planning regression remain
covered. The prior write-replaying retry assertion now verifies a read followed
by another explicit selection.

The full Web suite passes: 194 files / 1364 tests, with one existing skipped
file/test. Build, TypeScript, format, changed-file lint (no diagnostics), full
lint (existing warnings only), and engineering/documentation language audits
pass. The full suite exposed a pre-existing planning fixture clock dependency:
at execution on 2026-10-05 the supposed future hike had already passed. That
composition case now fixes only Date to 2026-10-02 and restores it afterward;
production grouping and assertions are unchanged.

## Scope and limits

Shared lists and basic interaction quality remain Free/Core on Cloud and
Self-Hosted. Pinning is personal Account/Space presentation, not shared content
or privacy mutation. Cache identity/row ownership guard local rollback and
late responses; the existing preference API has no exposed revision or
If-Match and does not promise cross-device conflict prevention. Authority is
refreshed after settlement. No dependency, provider, API/schema/migration,
telemetry, durable draft, offline queue or native wrapper change.

#508 remains open for other suitable actions and broader acceptance.
