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

## Acceptance evidence

Implementation and execution evidence are pending. The initial local preflight
found reusable JavaScript dependencies but no pinned Chromium executable. Existing
repository screenshots are references only. Required browser/product acceptance
must use a working pinned browser environment; collection is not execution.
