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

