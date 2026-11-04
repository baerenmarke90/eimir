# Chapter experience and diary markers

Owning issue: [#1635](https://github.com/baerenmarke90/eimir/issues/1635).

## Reviewed baseline and coordination

Current main: `52d2eeda39f11d430d01676de93ebe11c92a6567`.
Parallel work: [#1634](https://github.com/baerenmarke90/eimir/issues/1634), branch
`fix/complete-moment-experience`, inspected head `ad0ba864984fecfcd0e8e853b26f9cc1be6be4fa`.
Its declared scope includes Discover layout, common native date/pagination/cache
behavior and Memory-to-Plan/Wish relations. This slice has a separate worktree
and branch, `feat/chapter-experience`. Recheck shared paths and current refs before
claiming integration compatibility. No merge or publication is authorized here.

## Generated visual preflight

![Generated Chapter composition reference](reference.png)

Generated before UI implementation with the built-in image tool. The exact prompt
is in [reference-prompt.txt](reference-prompt.txt). This is a composition reference
using synthetic content, not runtime acceptance evidence. The historical
place-moment-picker Chapter screenshot supplied the existing palette and shell
grammar; current main source governs newer headerless Compact behavior.

Reviewed actual destinations and contracts: ChaptersOverviewPage, ChapterCreatePage,
ChapterProductPage, PlanningRelationManager, StoryProductPage, StoryList, typed
chapter relations, task origin/editor lifecycle, native date fields and tokens.
Product Reference v1 R1/R2, Screen Templates 4/9/11 and existing selection/task
contracts apply. Retain all supported title/description/date/place/edit/delete/
link capabilities. Personal titles and authored words lead; linked media remains
media of its original source. No custom chapter cover or fabricated count.

## Mobile interaction contract

Overview uses directly openable, readable chapter titles, optional description
excerpts and complete/open date ranges. Detail composes meaningful date/place
context with authored words and authorized moments. Absent optional metadata
does not create empty panels. Add belongs above linked content; removing a link
is a deliberate contextual action that retains the source.

Creation uses existing protected task lifecycle, title, optional authored prose,
native start/end dates and a singular Place choice. No date is invented.
Confirmed save opens the actual result. Dirty/pending exits, offline admission,
retained failures, conflict handling and account/Space ownership use existing
contracts. Browsing does not expose permanent editing controls.

Compact is normative. Expanded keeps the same hierarchy with useful reading
width. Long text reflows; targets and focus remain reachable. Existing causal
motion and reduced-motion behavior apply. Loading, empty, failed, offline,
pending and confirmed success remain distinct.

## Diary projection

Exactly one marker appears at an authored start date. End date is descriptive;
undated and end-only chapters have no invented diary position. Overlapping
chapters are independent. Explicit links select contents; date overlap never
creates links. Open/back restores the diary scope and position.

Keep ordinary StoryKind/StoryItem and Discover unchanged. The diary opts into
an additive chapterMarkers projection, with one authorized union, stable keyset
cursor and combined page limit. Year/type scope and marker-only pages must remain
correct. Source dates, privacy and typed relation boundaries are unchanged.
Chapter mutations invalidate applicable query and retained snapshot data.

## Reuse, business model and quality

Reuse existing authorized Chapter projections, timeline pagination, TanStack
query ownership, TaskBackButton/useTaskEditorLifecycle, task origin,
NativeDateField, PlaceChoicePicker, ShortTaskSheet and authorized moment previews.
A chapter period helper is a bounded shared presentation contract, not a generic
card framework. No new provider, cache, dependency or native UI.

No business/freemium impact: standard Chapter CRUD/relations and diary history
remain Free/Core under the matrix. No custom covers, bespoke user-configurable
magazine composition or narrative export is introduced.

Retain membership/Space isolation, encrypted reads, private-source exclusion,
If-Match, stale-owner guards, date-only meaning, localized copy, accessible
controls and bounded per-page work. No database-owned duplicate marker records
or additional notification side effects.

## Implementation and acceptance evidence

The overview now reads as authored chapter destinations with description excerpts
and complete/open periods, without per-card detail requests. The reader omits
absent context, retains an actionable authorized Place, and gives linked moments
room to lead. Add is above those moments; the existing shared contextual action
sheet now handles Place and Chapter unlinking with the source-retention consequence.
The same protected task lifecycle and native context fields serve chapter capture
and correction. The selected Place remains a singular explicit reference.

The diary opts into `includeChapters`; ordinary StoryKind/StoryItem, Discover,
photo flows and relation choices retain exactly their existing content kinds.
One authorized SQL union supplies the combined keyset cursor/page limit. Only an
authored start contributes a marker/year. Marker positions preserve the exact
server order, including sub-millisecond creation ties that JavaScript Date cannot
represent; clients never re-sort the combined chronology. The projection adjusts
positions if a source becomes unreadable between query and authorized projection.
Loaded-page aggregation prevents duplicates and normalizes retained positions.

The existing Timeline return implementation was extracted as useTaskListReturn
and reused by the diary, annual archive and Chapters overview. It retains validated
origins, loaded range, layout-coordinate restoration and focus semantics. Chapter
mutations revoke derived Story snapshots through the existing cache store and
invalidate the affected diary/year queries. Late reads cannot repersist revoked
snapshots. Account/Space task ownership, online write admission and If-Match remain
binding. The shared cache's existing generation wipe is the failure fallback;
a storage failure cannot present a confirmed create as a failed creation.

Local checks on the implementation source (the resulting PR records its exact
commit and subsequent CI evidence):

- Web: 2,606 tests passed, two pre-existing tests skipped. Typecheck, lint,
  formatting, token/PWA checks and production build passed.
- Backend: focused Story/OpenAPI tests passed; PostgreSQL integration tests are
  collected but skipped locally because no test database is available. Ruff and
  mypy passed for the changed runtime modules.
- Browser selection: 38 planning regressions passed; inventory remains valid.
  Nine new feature-scoped browser cases cover complete create/read/edit/link/
  unlink/return/delete, failed saves/conflicts, marker-only pagination and years,
  plus Compact 360/390/430, Expanded Light/Dark and 320px large-text/reduced-motion
  states. Collection/typechecking is not browser execution.
- The versioned OpenAPI contract and Web client were regenerated with the
  repository's generator version 7.24.0. The container-based CI drift check remains
  authoritative; this environment has no Docker executable.

The pinned Chromium download produced an invalid archive in this environment.
Actual current-source browser execution, screenshots and PostgreSQL acceptance
must therefore complete in CI before final review. The generated reference is
composition guidance, not implementation evidence. The PR Validation section owns
live results, source screenshots, remaining findings and exact tested revisions.

## Parallel integration boundary

Refs were refreshed immediately before the implementation push: main remains
`52d2eeda39f11d430d01676de93ebe11c92a6567`; #1634's published branch remains
`ad0ba864984fecfcd0e8e853b26f9cc1be6be4fa` (preflight only). This does not establish
compatibility with its unpublished implementation. Reconcile ChaptersOverviewPage,
ChapterCreatePage, PlanningRelationManager, StoryProductPage, StoryYearsPage,
AppShell, taskOrigin and productReadCache after #1634 publishes its shared native
fields, progressive loading and cache work. Preserve that ownership; this PR adds
no competing pagination, cache store or native-date primitive. No merge or release
is authorized by #1635.
