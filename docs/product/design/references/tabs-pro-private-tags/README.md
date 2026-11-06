# Primary roots, subscribed feature marks, private locations and capture tags

## Baseline and scope

Preflight recorded before implementation on current main `be9b5ec3c`, with
contextual creation #1681 at `f0305e747`. At preflight, the concurrent People redesign had no
published implementation branch. Its completed revision must be integrated before
PR creation and merge, as explicitly requested by the Product Owner.

Reviewed the actual AppShell/usePrimaryNavigation/taskOrigin flow, Moments local
capture and filtered return, More destinations and every ProMark consumer,
HeartMoment create/edit/read/API/protected payload and shared Place relations,
MomentPlaceField/PlaceChoicePicker/PlaceMapPicker, and the common tag editor in
Memory, HeartMoment, Plan and Wish capture. The PO tag screenshot specifies the
input/add row and initially collapsed suggestions; it supersedes verbose legacy
capture descriptions. Existing shared Place relations cannot carry PRIVATE data.

![Generated whole-screen Compact reference](compact-reference.png)

Generated with the built-in Imagegen tool, against the reviewed whole composer.
It guides composition only: retain the exact existing six HeartEmotion choices,
their icons, current order, media/voice controls, and native task lifecycle. The
image's invented emotion captions are not product decisions. No new visual theme,
photo requirement, persistent prose or native capability is introduced.

## Acceptance criteria

- Selecting another primary tab by link or swipe opens its canonical default view
  at the top; no remembered filter, peer mode or scroll is resumed. Selecting the
  current tab also returns to its default root. Back from a content/detail/editor
  still restores that task's authorized originating context and draft guards.
- Pro feature badges disappear once the effective current Space tier is PREMIUM,
  including either partner's grant. Free retains upgrade discovery. Keep actual
  subscription/account status and all backend capability enforcement unchanged.
- PRIVATE HeartMoments support adding, changing, removing and reading a location.
  Its name/address/coordinates are protected parent content, never a shared Place
  or relation. Create, retry, update, visibility changes and transfer preserve it;
  partner/foreign lists, detail, Story, search and exports cannot reveal it.
- Capture tag editors use the common Tags legend, input plus Add on one row,
  followed by initially collapsed Suggestions. Selected removable tags, Enter,
  validation, dirty protection and save-time draft commitment remain supported.

## Mobile Interaction Contract

Product Reference v1 R1/R2/R4/R5, Create/Edit, Detail and Settings templates apply.
The authored moment remains the human focal point; Save is the dominant action.
Location is optional, revealed with the existing picker and chosen deliberately;
no automatic location permission/request. Use existing PlaceMapPicker, native
input/disclosure, ShortTaskSheet, semantic spacing/color/radius/motion tokens,
parent task lifecycle and query identity. Keep privacy visible at the audience
choice; a private location is not inserted into the couple's Place catalogue.
One person can complete all four flows; no partner participation is required.

Compact 360/390/430 and 320px/200% text retain readable fields and 44px targets;
the tag row gives the input remaining width without moving Add below it.
Expanded uses the same bounded capture, existing dialogs and top navigation.
Do not autofocus optional input. Picker cancellation retains the draft; success
opens the canonical saved result and Back restores the capture origin. Invalid
input/save/network/conflict failures retain work; offline remains read-only and
makes no queued-write promise. Loading grants never assert an upgrade need;
query errors cannot grant capabilities. Existing theme and reduced-motion
feedback applies, with instant tab positioning and non-blocking shell motion.

## Reuse and business/freemium review

Reuse existing browser/router history and scrolling, React context plus scoped
TanStack Query for presentation, the existing map picker and protected parent
payload. A shared Place relation is rejected for private data; a new private
Place domain is unnecessary for one optional parent location. No dependency,
provider, credentials, telemetry, background sync or device configuration is added.
Existing provider calls remain explicit and use the established backend adapters.

Business/freemium impact reviewed: Memory/HeartMoment/location/tags remain
Free/Core; feature marks express upgrade eligibility only. Pro grant remains
Space-scoped and authoritative server-side. Cloud and Self-Hosted share behavior;
no quota, count limit, storage tier, pricing, retention, operating-cost package,
non-destructive downgrade, restore or export reclassification. Update the matrix
only to clarify parent-private location semantics, not to change tier boundaries.

## Cross-cutting quality and validation plan

Location must survive encrypted parent payload and authorized transfer. Add
bounded names/addresses and finite paired coordinates, backward-compatible null
fields, optimistic version checks, idempotency fingerprint coverage, owner/partner
and cross-tenant HTTP negatives, and regenerated OpenAPI/TypeScript contracts.
No location content in events/logs or shared projections. Query scopes include
instance/account/Space and disposal prevents stale presentation crossing owners.

Run focused component and real-browser tab/default/detail-return, badge Free/Pro,
private create/edit/read and tag-row journeys, plus theme/reflow/keyboard/axe
checks. Capture actual Compact and Expanded screenshots. Apply the existing
browser impact planner and applicable backend/contract/governance checks; record
exact final integration revision, failed/unperformed checks and remaining limits
before publishing the authorized PR. Merge only after required final-head checks.


## Implementation and local acceptance

Implementation commit: `34dc312a5`. Main reconciliation: `8ec98dbb5` incorporates
main `271aaa99c` with merged #1681; it changes no implementation file. People
integration `70c6010b5` incorporates published #1684 head `89a175f18`; the
subsequent test alignment is `3403b27cf`. The later PO handoff request authorizes
immediate push and PR creation for online continuation while #1684 finishes its
hosted checks. Before merging this PR, reconcile the dependency's final main
merge and require all applicable final-head checks. No merge is performed as
part of this handoff.

- Primary selection now has one canonical root contract for links and swipes;
  obsolete root-resume storage is removed. Detail/task origins keep their
  independent bounded state. Re-selection replaces the current history entry.
- A strengthened peer-selection assertion exposed a retained primary-entry marker
  overwriting a deliberate Wishes selection. Commit `76ddb779b` limits reset to
  the canonical hashless entry; all 19 navigation browser cases pass after the fix.
- Pro marks share a lazy effective-tier read, scoped to instance/account/Space.
  Unknown/failed first reads never advertise an upgrade; an authorized retained
  tier is presentation only. Capability authorization is unchanged. Strict
  browser fixtures now explicitly answer this exact Free Space read while
  continuing to reject writes, other IDs and unknown requests.
- A location is copied into protected HeartMoment content, never into a private
  shared relation. Name/address and finite paired coordinates are bounded.
  Omitted updates preserve it, explicit null removes it, and idempotency includes
  its content. Existing shared Place links stay intact. HeartMoment capture uses
  the existing focused shell so root actions do not compete with completion.
- Tags reuse the common editor and existing localized copy, with a grid that
  keeps input and Add adjacent. Suggestions stay initially collapsed; selected
  removable tags and save-time draft validation remain unchanged.

### Observed validation

- Production Web build passes, including token/legal/static-locale/PWA checks
  and TypeScript. The complete pre-People Web suite passes 2,759 tests, with two
  existing skips; all 90 focused component tests also pass. Changed handwritten files
  pass Biome lint/format (the two existing redundant-fragment informational
  notices are unchanged).
- All 230 distinct browser cases across 17 affected specs pass: 56 final
  navigation/HeartMoment/local-capture/new-flow cases, 35 task-boundary cases,
  and 139 existing capture/planning/media/Today fixture consumers. This includes
  actual create/read/edit/remove/reload, draft and pending protection, unknown
  outcomes, Back/focus restoration, Free/Pro, explicit private map choice without
  shared Place writes, 360/390/430/1280px, 320px at 200% text, Light/Dark,
  reduced motion and affected-surface axe checks.
- All 90 focused Python cases pass with PostgreSQL 17, including owner/partner/
  cross-tenant negatives, stale writes, replay mismatch, encrypted storage and
  authorized export/round-trip import. An initial host database connection failed;
  the successful run uses Python 3.13.7 inside the test database's isolated
  container network, with no skips. Declared Python compatibility remains >=3.12;
  hosted CI owns the pinned interpreter verification.
- The complete pre-People non-integration Python suite passes 1,358 tests, with
  45 environment-dependent skips and 3,433 integration cases deselected. The
  separate PostgreSQL acceptance above has no skips. Ruff lint and format pass
  all 813 Python files.
- Backend mypy passes all 367 source files. Ruff and OpenAPI contract/generated
  client checks pass. The language audit, 27 language regressions, project identity
  scan, status contract and whitespace checks pass. No native wrapper capability
  changes or APK publication are claimed.
- Browser inventory contains 102 specs and collects 1,147 real cases; all 38 planner regressions pass. New
  acceptance stays feature-owned, with no always-run core expansion. The shared
  shell conservatively selects all 102 specs for hosted regression (75 critical,
  27 additional), with no overlap.

### Integrated acceptance

Verified on the combined source tree at `3403b27cf`, including #1684 at
`89a175f18`:

- Production build and the complete Web suite pass: 2,765 tests, two existing
  skips. OpenAPI and generated-client drift checks pass after the combined merge.
- All 148 distinct browser cases across ten complete specs pass: primary
  navigation (19), People (5), person photo sources (6), partner actions (22),
  session reload (3), task boundaries (35), private location/tags (11), HeartMoment
  capture (17), local Moments creation (9), and Wir design/settings (21).
  The existing root-reset variants now deliberately choose Wishes and occasions,
  then assert default Plans on re-entry. Exact related-person/date fixture reads
  return the API's array shape. No new always-run cases or assertion weakening.
- Four existing Pro-partner variants initially expected the old permanent upgrade
  mark. Their assertion now requires its absence for the explicit PREMIUM
  fixture, as the PO requested. All 22 partner cases and all 21 Free/Pro Wir
  settings cases pass after this correction; existing action, focus, history,
  consent, privacy and no-send assertions are retained.
- All 93 combined PostgreSQL cases pass, with no skips, covering protected
  HeartMoment locations, visibility, concurrency, idempotency, encrypted transfer
  and the three legacy/shared-person migration/import regressions.
- Mypy passes all 367 source files; Ruff lint/format pass all 815 Python files.
  Changed Web sources pass Biome lint/format. All 38 browser-planner regressions
  pass. The inventory remains 102 specs and now collects 1,149 cases. The own
  post-People diff conservatively selects 75 critical and 27 additional specs.

### Visual evidence

The [exact built-in Imagegen prompt](reference-prompt.txt) accompanies the
pre-implementation reference. All implementation captures use synthetic fixtures.

- [Private capture, 360 Light](evidence/private-create-360-light.png),
  [390 Dark](evidence/private-create-390-dark.png),
  [430 Light](evidence/private-create-430-light.png),
  [Expanded Dark](evidence/private-create-1280-dark.png).
- [Free destinations](evidence/more-free-390-light.png) and
  [Pro destinations without feature badges](evidence/more-pro-390-light.png).
- [Default Moments after tab selection, Compact](evidence/tab-reset-360-light.png),
  [Dark](evidence/tab-reset-390-dark.png) and
  [Expanded](evidence/tab-reset-1280-light.png).

Original screenshots regenerated by older browser fixtures are left outside this
change's commits. Only this slice's own evidence is included.
