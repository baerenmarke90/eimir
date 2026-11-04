# Unified subpage navigation and moment context

## Baseline and acceptance scope

Reviewed main `9003e45debd1e4531f4adaae80320d7da9ee48ce` and Chapter PR
[#1636](https://github.com/baerenmarke90/eimir/pull/1636) at
`113f389e38af59099c53b92ef4bc1b8bd5206e04`. The integration has the exact
Chapter source tree; other working copies and their unpublished edits are preserved.

The three Product Owner requests are cumulative:

1. Every current and future authenticated secondary page has one rounded,
   icon-only left-chevron button at the upper left. Root destinations have none.
   Keep existing task-specific close, pending, dirty-exit and contextual return
   ownership; deep links have a canonical parent fallback.
2. Memory and HeartMoment detail dates use a calendar icon, with linked Places
   beside them in one wrapping metadata row, above the photo. Preserve every
   Place, order, map/address/attribution access, authorization and retry state.
   Reuse the same calendar date treatment in existing moment previews.
3. Incoming happiness and time-travel answers on Wir include their original
   prompt, author and date with the answer, and retain canonical opening and
   consume-on-open behavior. No invented question, answer or relationship state.

## Generated visual preflight

![Compact composition](reference.png)

Generated with built-in Imagegen before UI implementation after inspecting
AppShell, TaskBackButton, PageHeader, Memory/HeartMoment readers, MomentPlaces,
SharedExperienceReveal, Today orchestration, the dashboard projection, routes
and task-origin/editor lifecycle. [Exact prompt](prompt.txt).

The image guides composition only. Use the actual Eimir icons, normal UI section
headings, existing appearance controls and shell. The generated settings choices,
portrait shape, decorative outlines and navigation icons are illustrative;
no new settings, card borders, avatar layout or tab meanings are introduced.

## Mobile Interaction Contract

Product Reference v1 R1/R2/R4/R5; Screen Templates 4/8/9/11. The human goal is
recognizable navigation and understandable personal context. Existing photos,
authored prompts and answers remain focal. A secondary page has one familiar
Back action; each reader retains its existing contextual actions.

Compact uses the established safe-area gutters, one vertical reading flow,
44px minimum Back/Place targets and a naturally wrapping date/location row.
The shell supplies secondary navigation by default, with explicit page-owned
task actions taking precedence without duplicated controls. Reading, loading,
empty, unavailable, error, offline and permission states retain usable Back.

Keep native/browser Back, focused editors, ShortTaskSheet modality,
dirty/pending guards, retained originating scope/pages/focus/scroll, and canonical
deep-link fallbacks. Utility navigation needs no typing or early keyboard.
Optional Place details use a short contextual disclosure; no map provider runs
until an explicit link. No extra row per Place below media.

Incoming experience content reads original prompt -> authored answer -> author,
date and existing open action. Sparse or legacy responses use honest localized
type context without fabricating a prompt. Refresh does not animate repeatedly.
Use existing press/route/sheet feedback and reduced-motion semantics.

Expanded preserves the same order, bounded reading width and upper-left Back.
Long text, multiple Places and 320px/200% text reflow without horizontal scrolling.
No private content, entitlement, relationship-state or source-access boundary changes.

## Reuse and business model

Reuse React Router, React portals/context, TaskBackButton, task-origin/editor
lifecycle, ShortTaskSheet, MomentPlaces, Eimir calendar/pin icons, Intl dates and
semantic tokens. Extending these owned primitives avoids a second navigation,
Place-query or provider layer. No new dependency, provider or native capability.

**No business/freemium impact:** basic navigation and existing Memory/HeartMoment
metadata retain Free/Core and non-paywallable accessibility. Existing happiness/
time-travel entitlement remains. Cloud and Self-Hosted behavior, resource limits,
data retention, export, downgrade and ongoing costs are unchanged.

## Cross-cutting and validation plan

Preserve scoped authorization and late-result admission, Place privacy and
shared-only projection, no private data in navigation state, locale-driven text,
date-only UTC semantics, named icon controls, keyboard/focus and large text.
The dashboard adds only the already authorized original prompt, with no schema
migration, new query or notification side effect. Regenerate OpenAPI and its
client from their sources.

Validate component regressions, production build/typecheck/lint/format/tokens,
dashboard/API projection and contract generation. Exercise real browser
navigation -> edit -> dirty/pending Back -> save -> read -> return; unknown
future subpages, deep links, privacy/denial and multi-Place metadata. Review
Compact 360/390/430, Expanded Light/Dark, 320px large text and reduced motion.
Shared shell changes conservatively select the full retained hosted browser suite.


## Implementation acceptance, 2026-11-04

The final source includes the updated Chapter dependency at
`947d3098268faadc747e6cead37a5470f0f912d2`, including confirmed editor-history
retirement on deletion. The generated preflight above remains the original
pre-implementation record; its destination composition is unchanged.

| Request | Delivered behavior | Evidence |
| --- | --- | --- |
| Universal Back | AppShell supplies every secondary route by default. Existing guarded buttons and links move into its single upper-left slot; all four primary roots stay clear. Direct entries use canonical domain parents. | Unknown future-route and ownership component checks; complete Settings, Chapter and Story browser journeys. |
| Date / Place | Calendar date and every authorized Place appear together above media. Date-only fallback headings show the date once. All Places retain their order, map/address/attribution disclosure, query/error states and automatic pagination. Private HeartMoments make no shared-Place request. | Multi-Place component regression, narrow/large-text screenshots and shared/private HeartMoment browser checks. |
| Incoming happiness / time travel | The dashboard returns the authorized original prompt alongside its existing answer. Wir presents prompt, answer, author and calendar date together; canonical opening consumes the same stable invitation. Old cached projections use honest type context. Long preview truncation is marked. | Four PostgreSQL root/reply projections across both kinds, foreign-Space/own-source exclusion, six Light/Dark/Expanded answer journeys and axe. |

### Executed checks

- Full Web suite: **2,647 passed, two existing skips** on the pre-integration
  source. The subsequent Chapter integration and annual-return changes pass
  **33 focused final-source checks**, alongside nine Place/year checks.
- Backend suite without integration: **1,288 passed, 28 existing skips**.
  PostgreSQL Dashboard suite: **37 passed**, including all four new prompt/reply
  projection cases. The temporary database was removed after validation.
- The complete **14-case** new browser spec passes at 360/390/430, Expanded
  Light/Dark, 320px with 200% text/reduced motion, both shared experience kinds,
  canonical return/consumption and shared/private HeartMoment location privacy.
- TypeScript, lint, formatting, design-token/PWA validation, production build and
  backend lint/format/type checks pass. The 38 browser-planning regressions and
  complete 90-spec inventory pass. Shared navigation conservatively selects the
  full retained hosted browser regression; no global core case was added.
- An initial browser fixture renewed `createdAt` on each Dashboard read, making
  a consumed invitation appear new. Keeping the source timestamp stable fixes
  both complete journeys without changing production receipt behavior, retries,
  timeouts or assertions. Incomplete unrelated Today fixtures were completed
  before final visual capture. No hosted manual retry or rerun-all was used.
- Local validation uses Node 24.22.1 and Python 3.14.6; hosted workflows retain
  the repository-pinned runtime and all required checks. Backend tests run in the
  temporary database network after diagnosing an unavailable host TCP mapping;
  skipped connection-probe results are not counted as database passes.

### Current-source visual evidence

All images use synthetic fixture identities/content and existing repository demo
media. The reference image is not used as a product asset.

| State | Screenshot |
| --- | --- |
| Compact Memory, 360 Light | [View](evidence/story-context-360-light.png) |
| Compact Memory, 390 Dark | [View](evidence/story-context-390-dark.png) |
| Compact Memory, 430 Light | [View](evidence/story-context-430-light.png) |
| Expanded Memory, Light | [View](evidence/story-context-1280-light.png) |
| Expanded Memory, Dark | [View](evidence/story-context-1280-dark.png) |
| 320px, 200% text, reduced motion | [View](evidence/story-context-320-light-large-reduced.png) |
| Shared HeartMoment, 390 Light | [View](evidence/story-context-heart-shared-390-light.png) |
| Happiness, 390 Light | [View](evidence/today-context-happiness-390-light.png) |
| Happiness, 390 Dark | [View](evidence/today-context-happiness-390-dark.png) |
| Happiness, Expanded Dark | [View](evidence/today-context-happiness-1280-dark.png) |
| Time travel, 390 Light | [View](evidence/today-context-time_travel-390-light.png) |
| Time travel, 390 Dark | [View](evidence/today-context-time_travel-390-dark.png) |
| Time travel, Expanded Dark | [View](evidence/today-context-time_travel-1280-dark.png) |

Open -> contextual Place sheet -> map/attribution -> Escape/focus -> Back and
Settings category -> index are checked in the actual browser. Existing Chapter,
HeartMoment, accessibility and focused-task suites retain their full edit/save,
dirty-exit, history, scroll and focus contracts. Final hosted results remain
mandatory before merge; this record does not claim an APK publication.


### Final source-review corrections

The final review preserves the Plan completion continuation's focus return after
Back moves outside the page subtree. A real portaled-control regression fails
without that correction and passes with it. Shared Wish selection now targets
the same shared Back slot while retaining its full destination assertions.
Explicit colors use the existing `--color-text` adapter role.

The final correction passes 32 focused component checks and TypeScript. Actual
Playwright collection is **1,034 cases in 90 complete specs**; the new 14-case
acceptance spec remains feature-owned rather than expanding the always-run core.
The first combined diagnostic browser sweep recorded 54 passes, one local
`ERR_NETWORK_CHANGED` event before sign-in (confirmed from its trace), and two
new-spec cases invalidated when their inventory expanded during that local run.
That diagnostic run is not counted as a complete pass. The stable final specs
receive fresh complete lifecycle/browser coverage and the normal hosted sweep.
No retry, timeout, assertion or branch protection was relaxed.


### Hosted correction batch

All **77 complete final-source browser journeys pass together** across focused
tasks, Plan completion, shared Wish selection and the new context spec. The
unchanged consent case passes twice after the diagnosed local network event.
The first hosted CI gate rejected seven localized fixture/expectation literals in
handwritten test files. Their values now live in the existing German fixture or
localization resources; product behavior, screenshots, test assertions and the
auditor remain unchanged. Fresh head checks validate this source correction;
no unchanged workflow retry is used. Other useful first-head browser lanes are
allowed to finish so independent findings can be consolidated.
