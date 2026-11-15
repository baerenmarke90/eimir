# Moment experience polish — implementation acceptance

Owning issue: [#1628](https://github.com/baerenmarke90/eimir/issues/1628).
Base: `cf71ad7784497f9efd4037bb2276af593803de30` (main, including #1625 and #1627).
Captured UI source: `f168f782dfdf5bdf7a4efbe53c4c2f3ba42c00b4`.

The generated [preflight](README.md) guided hierarchy. These are actual browser
captures of the implementation using synthetic test content, not generated UI.
Unchanged scenes were captured at `cb5220073bfd6650678460bc278ec3c377b513a8`;
HeartMoment, privacy and draft-Place captures were refreshed after their fixes.

## Product decisions and evidence

| Request | Result | Actual evidence |
| --- | --- | --- |
| Places | Name-sorted, persistent shared archive/restore; exactly Active, Archived, All; return preserves filter. Existing linked content remains available. | [Active](places-active-390-dark.png), [Archived](places-archived-390-dark.png) |
| Media sources | Equal device/Immich actions open selection directly. Account-owned setup moved to Settings → Media sources; optional Google disclosure and entitlement checks retained. | [Source actions](media-sources-390-light.png) |
| Draft Places | Borderless semantic group, shared pin/name/address presentation, reorder controls only for multiple Places. | [Memory capture, 360 dark](memory-place-360-dark.png) |
| HeartMoment | Date first; six feelings in a compact two-column composition. Existing single authored text field retained. | [390 light](heart-create-390-light.png), [390 dark](heart-create-390-dark.png), [Expanded](heart-create-expanded.png), [large text](heart-create-large-text.png) |
| Sensitive images | Reveal/conceal control keeps identical corner geometry and a 44px target, including 200% text; reveal remains local and resets on leaving/backgrounding. | [Concealed](diary-430-concealed.png), [revealed](diary-430-revealed.png), [large concealed](diary-320-large-text-concealed.png), [large revealed](diary-320-large-text-revealed.png) |
| Comments | Own-author header overflow contains Edit/Delete; editor autofocus and return focus; oldest-first chronology retained. | [Open comment menu](comment-menu-390-dark.png) |
| Diary | Titled photo entries share the existing larger photo-led treatment; chronology and titles remain intact. | [Photo-led diary](diary-430-revealed.png) |
| Plans | Overview cover and detail gallery lead the composition; title/date/actions follow. | [Saved Plan](plan-photos-first.png), [overview at 320px/200% text](plan-overview-320-large-text.png) |
| Wir activity trace | Same authorized shared activity query, actor/action/target/date semantics and event order as Activities, including comments. | [Compact dark trace](wir-activities-390-dark.png) |

Product Reference v1 R1–R5 and Screen Templates 4/8/9/11 remain authoritative.
Native status buttons, native details overflow, ShortTaskSheet, existing gallery,
shared location presentation and existing semantic tokens are reused. The Places
list is appropriate for intentional name lookup; no administrative table or
secondary data model was introduced. Existing localized relationship copy and
privacy vocabulary are retained; no decorative animation competes with capture.
Reduced motion retains the same actions, focus and feedback.

## Behavioral acceptance

The browser journeys cover open → select/edit → save → observe → return,
including draft recovery/reload, custom-tag-only capture/edit/removal, source
consent/disconnect and downgrade, privacy concealment, comment ownership,
failed/offline writes, stale/late responses, Place archive/restore and return to
the selected filter. Sizes include 320/360/390/430 and 1280/1440/1920, Light/Dark,
200% text, sparse/dense content and reduced motion. Axe checks are retained.
Screenshots supplement these assertions; they are not the sole acceptance.

A real input race was reproduced: tag-field blur inserted a chip between
pointerdown and pointerup, moving the Save button. Forms now use the existing
ContextTagEditor submit contract to commit pending tags atomically. Memory
create/edit and HeartMoment create/edit share that contract; validation is not
weakened and no delay, scroll workaround or retry was added.

Required PostgreSQL CI also exposed a baseline shared-answer race: an insert
can predate the committed root whose transaction acquired the projection lock
first. Pending answers now join established threads before new threads are
assigned, independent of insert timestamps. A deterministic unit regression
reproduced the split before the fix; both candidate orders now pass. A matching
PostgreSQL regression supplements the unchanged concurrent-request acceptance.
Existing roots, author content, timestamps and the transaction lock are retained.

## Technical and cross-cutting review

- Migration 0106 adds a default-false Place archive flag; existing data, links,
  backup/restore and backward-compatible default listing remain supported.
- Archive uses existing tenant capabilities and If-Match PATCH. Archive-only
  updates do not adopt/detach generated Place links. Stale writes conflict;
  foreign resources remain indistinguishable from missing resources.
- Alphabetic ordering decrypts only the authorized Space result set, sorts a
  normalized name with an ID tie-breaker, and binds cursors to order/scope.
  Names never enter plaintext indexes, cursor payloads, events or diagnostics.
  Its per-request sorting cost scales with the authorized Place set, avoiding
  an additional plaintext name store.
- Settings/picker reuse one account/base/Space-scoped source query. Tokens are
  accessed through the current API ref; existing provider, consent, expiry,
  downgrade and disconnect policies remain. No dependency/provider was added.
- Wir and Activities share one infinite-query contract and fail closed after
  denied reads. The trace reuses the first four authoritative activities,
  without filtering away events whose target is featured elsewhere.
- Shared StatusScope, task-origin validation and versioned Place cache
  invalidation preserve consistent state across overview/detail/edit flows.
- Free/Core organizational and accessibility behavior remain Free/Core;
  external media integrations retain the existing Premium boundary. Cloud and
  Self-Hosted behavior, upload/storage limits and essential export remain
  unchanged. The business model and feature matrix need no classification change.

## Validation

- Full Web suite: 2,594 passed, 2 skipped before the final focused corrections.
- Focused final Web regression suite: 138 passed, including the submit contract.
- Browser batch: 147/149 initially passed; the two failures were diagnosed and
  corrected. Final focused runs pass the tag-only save, sensitive geometry,
  Compact/Expanded/reflow, authoritative trace and Memory tag journeys.
- Five final manual-Place recovery/save journeys cover 320 through 1280.
- Eight final browser regressions passed for custom-tag capture, all five
  privacy geometries, authoritative event order and exact Wir/Activities parity.
- The shared-answer correction passed 17 focused backend unit tests, Ruff and
  mypy. Required CI checks the deterministic and concurrent PostgreSQL cases.
- The initial CI format failure in the final trace assertion is corrected;
  the complete Web format check passes again.
- The broad browser run passed 787 cases and exposed one obsolete Plan oracle
  requiring copy above the photograph at 200% text. The PO's photo-first order
  is now asserted at all four reference sizes, preserving overflow, theme and
  reduced-motion checks. All four focused scenarios pass; actual large-text
  overview evidence is linked above. No runtime layout or assertion was weakened.
- Backend: Ruff, mypy (350 source files), 48 focused unit tests passed.
- Web build, typecheck, lint, format and engineering-language checks passed.
- API schema regenerated with pinned OpenAPI Generator 7.24.0 and compared with
  generated clients. Browser inventory passed: 87 specs, PR-critical baseline 622.
- PostgreSQL integration and complete required GitHub checks must pass before
  merge. Local environment has no PostgreSQL service; no integration result is
  claimed from mocks or unit tests.
- No GitHub workflow retries requested. Local failures were inspected and fixed
  before targeted validation; no test assertion or branch protection weakened.
