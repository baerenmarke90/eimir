# Planning search and private profile context

## Baseline and request

Verified current main `88004f8147fa2cf6d65364d06443805859011fc3` on 2026-11-05.
The clean existing checkout is reused on `fix/planning-search-and-profile-context`;
the independent Android release branch and the older dirty source checkout are untouched.

Reviewed SharedPlanningOverviewPage, PlanningReference, PlanProductPage,
PlanCover, PlanPhotoGallery/MediaGallery, MoreOverviewPage/PersonIdentity,
ProfilePageBase, PrivateAreaProductPage/Frame, taskOrigin and the authorized
list DTOs. Current wishes store a title only. Retain the two planning modes,
local add, status scopes, Wish selection, focal/later/undated/past/completed
plans, canonical content destinations and task return. Preserve the actual
four-destination shell with central capture and the existing utility entries.

[Generated Compact reference](generated-reference.png) was produced with the
built-in Imagegen tool before UI implementation. [Exact prompt](prompt.txt).
The image guides composition; preserve actual page headings, canonical icons,
existing capability badges, actions and precise privacy contracts where image
generation simplified them. Expanded retains a bounded single reading column,
so it does not require a different generated composition.

## Acceptance and Mobile Interaction Contract

Apply Product Reference v1 R3/R5, Plan Hub, Detail View and Settings/Privacy;
reuse existing PageHeader, status/segment controls, Link, UiState, ProblemState,
private PreferenceManager/editor, task-origin handling and theme/motion tokens.

- Make a supported linked Plan place visible alongside the date/time at the
  beginning of detail. Preserve its canonical Place destination and address.
- Give focal Plan previews a deliberate bounded landscape crop; secondary
  previews use a consistent thumbnail. Fullscreen keeps the complete image.
  Keep sensitivity concealment, gallery count, explicit controls and keyboard.
- Add persistently labeled, explicitly clearable searches to both modes.
  Match authorized Wish titles and Plan titles/descriptions without case/accent
  friction. Search the entire current status scope, including later cursor pages.
  Keep separate terms for Plans/Wishes and restore them on content return.
  Terms remain in memory; never put personal queries in a URL or telemetry.
- Compose Wishes as a personal alphabetic wishbook: section initials, spacious
  title destinations, no repeated creator, chevron or fabricated description.
  Preserve complete locale-aware alphabetical ordering and existing actions.
- Move existing private partner notes out of Profile into a dedicated destination
  under Nur fuer mich. Reuse the existing private preference records, owner
  authorization, version/conflict handling and editor. No data migration or
  conversion into shared preferences. No private preview on Profile.
- In More, show the current profile photo at a useful size directly in its row,
  removing the extra icon container/ring. Preserve the name and Profile destination.
- Explain existing Chapter chronology: a single marker at authored startOn,
  full date range in its label, no repetition across months/years; no marker
  without startOn. This request does not change Chapter date semantics.
- Recommend one shared tag vocabulary for Memories/Plans/Wishes as a separate
  domain extension. Do not silently add schema, relation or tagging behavior to
  this UI correction.

The primary action opens the authored intention or selected private destination.
No early input autofocus, required gesture, permanent editing UI or helper prose.
A visible search label and native search input support keyboard and assistive
technology. Results and no-match/loading/error states remain distinct; clearing
restores the original overview. Do not announce a final empty result until all
relevant list pages are read. Retain usable results and explicit retry on failure;
offline uses the existing authorized read cache and its freshness notice.
Normal press/focus feedback uses existing tokens, with no decorative list-entry
animation or motion-dependent information. Reduced motion keeps all controls.
360/390/430px and Expanded retain the same content and navigation order; narrow
and 200% text wrap without horizontal scrolling.

Private notes show owner-only context before content, preserve no-partner/error
recovery and explicit save/cancel/conflict behavior. Navigation back stays inside
the private area. The move changes discoverability, never audience rights.

## Reuse-before-build

Considered existing global PostgreSQL FTS/SearchApi, native in-memory matching
over the already authorized list metadata, adding a second fuzzy-search package,
and a provider. Prefer existing paginated metadata plus native Unicode/string
matching for these bounded in-area scopes: it preserves exact current lifecycle
and chronological/alphabetical grouping, works with retained reads, avoids
per-result detail hydration and introduces no index/provider/dependency.
Complete later Plan pages on demand when searching; Wishes already assemble
the complete alphabet. Server authorization remains the only access boundary.
Reuse existing profile/private preference services instead of duplicating notes.
Reuse the existing media loader and browser object-fit instead of derivatives.
Third-party component/license/cost review: no new third party or dependency.

## Business / Freemium Model Consistency

No business/freemium impact: ordinary Plans, Wishes, search and private notes
remain Free/Core; privacy and accessibility remain non-paywallable. Identical
Cloud/Self-Hosted behavior. Existing shared media, gallery/resource limits,
Space ownership, retained-data access, downgrade, export and cleanup are
unchanged. No feature-matrix update, new provider cost or managed resource quota.

## Cross-cutting quality and validation plan

Keep authorization-first list reads, existing account/Space query isolation,
owner-only notes and sensitive-media concealment. No new endpoint, database
migration, persistence, telemetry, media derivative or public query data.
Use localized labels/counts and locale-aware ordering; retain genuine Link and
heading semantics, visible labels, accessible clear actions and focus return.
Cursor consumption must remain deduplicated and stop after a repeated cursor.
Existing note writes keep If-Match, dirty/pending, error and conflict protection.

Before delivery run affected component tests, TypeScript, formatting/lint and
token/PWA checks. Exercise complete affected planning/private/profile browser
journeys, search beyond page one and return from detail, plus create/edit/save/
result/return. Capture synthetic Compact/Expanded Light/Dark evidence and
320px/200%-text, reduced-motion and keyboard/axe behavior. Review both browser
inventories and run their validation; retain core-plus-impact CI selection and
all existing gates/assertions/timeouts. No merge or release is claimed.

## Implementation and acceptance evidence

Tracked in [#1655](https://github.com/baerenmarke90/eimir/issues/1655).
The Plan detail groups its linked Place and address with the schedule. Active
Places reuse the existing selector snapshot; a linked archived Place has one
canonical authorized detail read and an explicit retry on failure. Overview
covers use a 16:10 focal crop and square secondary thumbnails; the detail
gallery retains contain/full-original viewing in its bounded 16:10 viewport.

Plans and Wishes retain separate in-memory searches, lifecycle scope, selected
item and return focus. Unicode matching folds accents and German sharp-s,
and Plan descriptions are included. Searches complete later list pages before
reporting a final empty result. Tab changes synchronize the existing non-sensitive
mode hash so a stale Plan hash cannot override a returning Wish origin. Each
return snapshot is restored once rather than replaying old values on a local
scope change. The account/API/Space key clears component state across identity
changes; query text stays out of the URL/history payload.

Wish initials and spacious title destinations form the wishbook. The existing
selection task remains one compact labeled link, with a correctly sized icon,
instead of an explanatory panel. Private partner notes now open from the fourth
private destination and reuse existing records and save/error/retry/conflict
behavior. Shared Profile no longer renders those notes. More uses the existing
48px avatar directly, without its former surrounding icon tile or portrait border.
The R5 reference and profile contract record this explicit PO navigation decision.

Representative synthetic screenshots (26 retained; no personal photos or notes):

- [Plan search, Compact Light](evidence/planning-search-360-light.png),
  [Compact Dark](evidence/planning-search-390-dark.png),
  [Expanded Dark](evidence/planning-search-1280-dark.png).
- [Plan date/Place context, Compact Light](evidence/plan-context-360-light.png),
  [Compact Dark](evidence/plan-context-390-dark.png),
  [Expanded Dark](evidence/plan-context-1280-dark.png).
- [Portrait preview crop](evidence/plan-cover-overview-390-portrait-light-false-false.png),
  [landscape crop](evidence/plan-cover-overview-430-landscape-dark-false-false.png),
  [square source](evidence/plan-cover-overview-1280-square-light-false-false.png).
- [Wishbook, Compact Dark](evidence/wishbook-390-dark.png),
  [430px Light](evidence/wishbook-430-light.png),
  [320px/200% text](evidence/wishbook-320-light.png),
  [Expanded Dark](evidence/wishbook-1280-dark.png).
- [More portrait, Light](evidence/more-profile-430-light.png),
  [Dark](evidence/more-profile-390-dark.png),
  [Expanded](evidence/more-profile-1280-dark.png).
- [Private destinations, Light](evidence/private-hub-430-light.png),
  [Dark](evidence/private-hub-390-dark.png),
  [320px/200% text](evidence/private-hub-320-light.png).
- [Private note create](evidence/partner-note-create-390-light.png),
  [preserved failed edit](evidence/partner-note-error-390-light.png),
  [saved result](evidence/partner-note-saved-390-light.png),
  [Expanded saved result](evidence/partner-note-saved-1280-dark.png).

## Validation result, 2026-11-05

- Production `npm run build`, TypeScript, token adapters, PWA checks and changed-file
  formatting/lint pass. Lint retains seven existing non-blocking selector-order /
  non-null-assertion warnings. The existing Node 22.23.2 runtime was used because
  the host's default Node 20 could not start the installed jsdom dependency.
- 81 tests pass across eleven affected component/client files, including Plan
  edit, media admission, note privacy, preference dialogs, task origins and the
  existing selection task.
- 157 distinct Chromium cases across the complete seven affected specs pass
  after targeted recovery. The complete selection took 5.3 minutes with two
  workers; subsequent correction batches retained the passing independent cases.
  Baseline assertions now expect four private destinations, the preserved peer
  hash and a cropped secondary thumbnail beside its copy. The 200%-text image
  assertion scrolls its deliberately viewport-admitted preview into view before
  checking its pixels. No assertion, timeout, retry, required context or core
  selection was weakened. The final seven new search/context cases pass together
  in 15.6 seconds, including later-page failure/retry and an archived Place.
- 38 browser-planner regressions and 45 design/status guard tests pass. Both
  inventories validate. Actual Playwright collection: 1064 tests in 93 files.
  New coverage is feature-owned full regression; the always-run core is unchanged.
  Private-note coverage declares its new private destination in the impact map.
- Reviewed Compact 360/390/430px, Expanded, Light/Dark, keyboard/axe, reduced
  motion, 320px/200% text, sparse/dense and error/retry states. Open → interact →
  save/complete → result → return includes actual existing private notes and Plan
  gallery staging, not screenshots alone. No physical-device run was performed.

Current main was refreshed after validation and remains the baseline above.
CI, Product Owner acceptance, merge and publication remain separate delivery
states; this work does not publish an Android build. Shared tags and an optional
ongoing-Chapter range indicator remain recommendations rather than schema changes.

