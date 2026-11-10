# Page composer #1730: implementation evidence

Owning issue: [#1730](https://github.com/baerenmarke90/eimir/issues/1730).
Approved reference source: [#1731](https://github.com/baerenmarke90/eimir/pull/1731),
`origin/docs/diary-composer-reference:docs/product/design/references/page-composer`.
Initial runtime baseline: `main` at `14b624f8f`, including merged #1727 and #1729.
Destination refreshed to `868b16a84` after #1731 merged during implementation
and to `d258eb833` after #1734 merged. The latter's shared sheet and important-date
changes were integrated without conflicts. Reference head:
`4bbb3110b31a0944992712a125900391754261c4`.
This audit compares the initial runtime baseline with the integrated implementation.
Test names below identify coverage; actual execution results and their revisions
are reported separately under Validation.

## Main inventory and final owners

| Section 3a function | Present on baseline main; missing or different | Final owner and behavior | Focused coverage |
| --- | --- | --- | --- |
| 1. Back, type heading, text Edit, saved feedback, no new capture on ordinary detail | Back already existed through `SubpageNavigation`/task navigation. Memory/Heart used the read shell with icon Edit; Plan used its authored heading and icon Edit. Saved feedback covered Memory creation but not all edit/create outcomes. Completed Plan detail exposed capture continuation actions. | `ComposerHeader`, `StoryDetailPageShell`, `StoryDetailEditLink` and the three product pages render contextual Back, compact localized type heading and text Edit. Save outcomes expose a short saved pill. Ordinary reopened completed Plans have no new-capture action. Existing completion confirmation preserves its transient result handoff (see deviation below). | `MemoryProductPage.test.tsx`: “keeps Edit as a labeled text action in the compact type header”; `HeartMomentProductPage.test.tsx`: “keeps a quiet visible text action for editing in the read header”; `PlanProductPage.test.tsx`: “shows a completed Plan as a truthful read result without reopening capture automatically”; `PlanProductPage.edit.test.tsx`: “keeps the activating Edit button separate from the new native-submit control”. |
| 2. Date/schedule, Place/map return, calendar, Heart visibility/feeling | Date, Place, visibility, feeling and `PlanCalendarAction` existed. Memory/Heart Places opened an intermediary sheet; Plan opened Place detail. Full-page Heart tint and the requested compact read composition differed. | `ComposerDateContext`, `MomentPlaces`, `HeartMomentLocation`, `PlanProductPage`, `MomentMapLink`/`photoPlaceMapUrl`, `PlanCalendarAction`, `HeartEmotionSurface`/`HeartEmotionBadge` retain the same data and platform owners. Coordinates link directly to the existing internal map; missing coordinates remain text. Plan uses its existing short schedule and calendar boundary. | Browser: “detail Places open the existing in-app map and Back restores the same reading position” (all three products); “HeartMoment keeps every feeling visible, tints page and system bar, and restores visibility after choice”. `PlanProductPage.test.tsx`: direct-map link, timed end range and undated intention tests. |
| 3. Swipe/snap, count/dots, navigation, cover first, sensitivity, reactions, fullscreen/zoom | Swipe/snap, count, pointer/keyboard navigation, conceal/reveal and fullscreen/zoom/close/Escape were already implemented. Dots were missing. Cover selection started at its stored index instead of displaying it first. Revealed sensitive photo activation toggled concealment instead of opening fullscreen. Six reactions and summary chips already existed for Memory only. | `MediaGallery`, `MemoryPhotoGallery`, `PlanPhotoGallery` and Heart media integration reuse loading, authorization, fullscreen and sensitive-state owners. Display order puts the cover first without changing stored order. Labeled dots and fraction count supplement existing navigation. Concealed activation reveals; revealed activation opens fullscreen; an explicit Hide control remains. Memory reactions retain their existing API. | Browser: “saved galleries retain sensitive reveal, swipe, fullscreen zoom and the same slide on return” (all three products, plus six offered Memory reaction choices and a confirmed LOVE summary; retained carousel/unit tests cover persistence and removal). `MediaGallery.test.tsx`: labeled position dots. `MediaGalleryLoading.test.tsx`: fullscreen navigation/window restoration. `MemoryPhotoGallery.test.tsx`: reaction persistence, removal, failure and cache identity. Retained `memory-carousel-stability.spec.ts` preserves gesture, image/object-URL loading, timing, focus, privacy and geometry protections. |
| 4. Display title | Authored Memory/Plan titles and Heart lead text already existed, with different hierarchy/placement. | Product pages and `PageComposerDetail.css` place Memory/Plan display titles after gallery content. Heart lead follows the explicit frame 15 composition. Generated Memory date titles remain one context date rather than a repeated authored heading. | `MemoryProductPage.test.tsx`: “keeps the short date above content and an authored display title after media” and “shows a generated title date once in the context row”; `HeartMomentProductPage.test.tsx`: “keeps long authored text once inside the content area, apart from the compact heading”; `PlanProductPage.test.tsx`: authored prose/no repeated heading. |
| 5. Memory initial, Plan note, bounded long prose | Memory already used `drop-cap-letter` and uppercase display treatment. Plan already had no initial. `ExpandableDescription` already preserved full prose with Show more/less, but the existing excerpt threshold was character/newline based. Plan's description box had border/shadow. | `ExpandableDescription`, `PageComposerDetail.css` and the pages retain authored text and disclosure ownership. Memory uses the scoped 1.3em initial. Plan uses one soft note surface without border/shadow. Measured visual overflow in the new detail composition adds the approximately five-line clamp/fade even when the existing character excerpt is short. | `ExpandableDescription.test.tsx`: “bounds long prose and preserves the full text through accessible expand and collapse”, ownership reset, inert HTML/safe links, multiline and URL-boundary tests. Retained `create-surface-visual-checks.spec.ts` checks authored prose and the initial at mobile/expanded widths. |
| 6. Tags, Heart voice, Plan shared Lists | Tags, saved voice and linked List rows/progress already existed. Heart voice placement differed. Plan rows navigated to the full List destination rather than a bounded sheet. | Existing tags and `SavedVoiceNote` stay with their owners. `PlanCollectionLinks` embeds the canonical `CollectionProductPage` with explicit ID; its checklist/add/versioning behavior is reused. Close refetches row progress. Pending operations block dismissal; unsaved List text requires explicit discard. | `PlanCollectionLinks.test.tsx`: “opens the canonical checklist in a sheet and updates its Plan row after checking and adding”; “keeps an unsaved list entry until the user explicitly discards it”. Browser: “Plan schedule and linked checklist remain bounded tasks with updated progress”. |
| 7. Read-only linked Wishes/Plans; linking only in composers; no Heart detail section | Memory read-only Wish/Plan links, Heart Plan links and Plan source-Wish association existed. The backend supports different relation domains by content type. | `StoryPlanningLinks`/`MemoryPlanningLinks` retain Memory destinations; `PlanWishLink` shows its source Wish with secondary title. Heart detail omits the linked section. Existing link/unlink management stays in create/edit. Plan creation stages a supported source Wish, creates the canonical Plan once, then associates it; a partial retry reuses and rereads the known parent. | `PlanningCreatePage.test.tsx`: “stages a Wish before creation and retries its association without creating another Plan”; “keeps the confirmed Plan after list-link failure and retries without creating a second Plan”. `HeartMomentProductPage.test.tsx`: “retries failed Plan associations against the known saved parent without creating twice”. `PlanCollectionLinks.test.tsx`: read-only detail and partial-link reconciliation. |
| 8. Existing comments, excluded for owner-only Heart | `CommentsPanel` and its create/edit/delete/permissions/offline/uncertain-state behavior already existed on all three products. Owner-only Heart already excluded comments. | `CommentsPanel` retains the same APIs, ownership and private exclusion. Detail presentation permits inline composition without opening the keyboard on read. The optional photo comment action uses the existing comment task owner. | `CommentsPanel.test.tsx`: “discloses the detail composer without activating the keyboard on read”; caller-owned edit/delete tests; comments/pagination before composer; “keeps newer text when an older submitted draft succeeds late”; failure draft retention and identical uncertain-retry identity. |

## Explicit deviations and retained domain boundaries

1. **Photo reactions remain Memory-only.** The brief's gallery paragraph is
   generic, but the destination main has only the Memory photo-reaction endpoint.
   HeartMoment and Plan expose no supported reaction endpoint. Their galleries
   preserve all existing navigation, privacy and fullscreen behavior. No backend
   or synthetic local reaction state is introduced.
2. **Composer linking follows supported relations.** Memory can link existing
   Wishes and Plans; HeartMoment can link existing Plans; Plan can associate one
   source Wish. Heart-to-Wish and Plan-to-Plan associations do not exist in the
   current API. Choices are limited to those supported domains, and the Plan's
   existing return-to-Wish lifecycle remains an editor action.
3. **Heart lead order follows frame 15.** The binding Heart detail illustration
   puts the authored lead before its media. That specific composition takes
   precedence over the generic gallery-then-title ordering in section 3a.
4. **Plan completion preserves its existing transient result handoff.** Immediately
   after a confirmed completion, the existing `PlanStoryContinuation` can still
   offer the related Memory/Heart/Milestone capture handoff. It is restricted to
   `completion.isConfirmed`; ordinary reopened completed Plan detail has no
   start-new action. Removing the transient handoff would regress the existing
   completion result contract and retained completion journeys.
5. **Emotion actions use an accessible derivation of existing roles.** An 80% mix
   of the existing emotion accent with semantic text supplies readable action
   foregrounds and filled interactions. The unmodified Happy accent could not
   reach 4.5:1 against white, and the visibility tint reduced other pairs below
   AA. No palette was added; all six feelings pass the Light/Dark browser Axe
   checks. The result is slightly darker in Light and lighter in Dark than the
   illustrated accent.
6. **Selected-media management expands when invoked.** The resting strip uses
   the illustrated 56 px thumbnails. Selecting one discloses the existing cover,
   sensitivity, reorder, remove and retry controls in 132 px square tiles to
   preserve their 44 px targets and an unobstructed selection/drag area. Choosing
   the cover or Done restores the resting strip.
7. **Existing List unlink remains beside the edit chip.** The existing chooser
   excludes already linked Lists and cannot unlink them. Its named unlink
   control remains available beside the chip; the chip reopens that existing
   chooser. Read rows have no relation-management action.

8. **Private Heart location remains a protected snapshot.** Its existing picker
   can copy an authorized saved Place or choose a location without creating a
   shared Place. The new shared-Place creation row is limited to shared relation
   editors, preserving the private-location boundary. Existing operator voice
   availability and the user's Pro-mark preference also remain authoritative.

9. **Read screens retain the existing global navigation.** The illustrated
   details omit the application shell. Runtime read screens keep its bottom
   navigation and central QuickCreate entry so the existing More, contextual
   Back and cross-task navigation remain available. Focused create/edit tasks
   hide that navigation and use only their header and tool row. The three
   ordinary details have no page-specific start-new action.
10. **Existing task, media and privacy affordances remain explicit.** The shared
    Back control, operable sheet handle/Close controls, visible fullscreen and
    Hide controls, canonical glyphs, plain cover badge and existing comment
    timestamp/ownership menu differ from the illustrative artwork. The source
    sheet retains provider privacy/consent disclosures, connection states and
    applicable Pro marks, so its height can exceed frame 8. No decorative
    avatar, provider logo or synthetic media reaction is added. The embedded
    List retains its existing per-item menus, absent from the illustration.
11. **Schedule and new-Place tasks retain native ownership.** Date/time fields
    use the browser's locale formatting. The separate illustrated “no fixed
    date” reset row is omitted; undated remains available by clearing the native
    date. The map-choice action uses a soft tile without the reference's
    decorative map illustration; its existing map task is unchanged. Existing
    labels, optional fields, validation and pending/error feedback remain.
12. **Illustrative data and accessible dimensions differ.** Runtime captures
    use real fixture photos, authored content, linked items, reaction totals,
    voice duration/waveform and selected feeling/visibility rather than drawn
    sample data. Saved feedback appears after a real save, not on an ordinary
    read. Browser captures omit the drawn bezel/status bar. Tool targets are
    48 px and interactive chips/dots are at least 44 px; narrow/200% text can
    wrap or stack them, including stacked feeling choices, to keep labels
    intact without horizontal scrolling.

## Bounded lifecycle review

The integrated Plan implementation retains the native form's hidden schedule
and Place values when sheets close. Place selection clears the parent pending
guard before the picker unmounts. Read and edit headers have separate native
button identities, preventing the activating Edit click from submitting the new
form. List draft discard is explicit; a pending List write blocks dismissal.
Staged Wish and List retries reuse a confirmed Plan instead of creating another
one. The shared tool row only manages visual viewport/safe-area presentation and
cleans up its listeners/observer; domain requests remain with existing owners.
No further lifecycle defect was found in this bounded source review. This is not
a substitute for the final browser/accessibility run.

## Reference exclusion

Both commands produced no paths against the integrated working tree:

```text
git diff --name-only origin/main -- docs/product/design/references/page-composer
git ls-files --others --exclude-standard docs/product/design/references/page-composer
```

The approved reference files are read from #1731; they are not copied into this
implementation PR.


## Lifecycle corrections found during regression verification

The retained tests exposed and now protect exact-image dot selection, native
Edit/Submit node separation, Place pending release, List dirty dismissal, and
partial relation retries against a known parent. Additional Heart checks retain
account/task-scoped create-observer state, synchronous same-version privacy
admission, pending feedback after unmount/return, and the original ability to act
on a newer authoritative version without accepting an older write's cache result.
The final retained browser rerun also found stale create-only Place/link state
counting as dirty after create-from-Plan, saved result and clean Edit. Those
create-only values now affect only create-mode dirty admission; the regression
asserts one canonical creation, no edit write and Back without a discard prompt.

## Scope, reuse and quality

The approved reference governs non-experience Memory, HeartMoment and Plan
create/edit/read. Wish, Milestone, Chapter, experience question/answer layouts,
API/schema and wrapper capabilities retain their existing contracts. Composer-specific shared component variants are opt-in. Gallery fractions,
position dots, single-item counts and revealed-photo fullscreen activation are
limited to the in-scope presentation; default galleries and experience paths
keep their previous pagination and sensitive-toggle behavior.

Native buttons/forms, file inputs, CSS scroll snap, visual viewport and the
existing task/sheet, upload, provider, map, voice, tags, List and gallery owners
were selected over a new form, modal or media library. The small shared tool/chip
primitives arrange existing actions; no dependency or provider was introduced.

No business/freemium impact: device photos and authoring remain Free/Core;
external sources remain Premium with existing availability and Pro presentation;
video retains Premium-upload/Core-retained-media and operator-processor rules.
The saved map retains its existing Pro boundary; basic Places, calendar handoff
and Lists remain Core. Couple ownership, quotas, cost, retention, downgrade,
export and Cloud/Self-Hosted behavior are unchanged. The authoritative feature
matrix needs no tier change.

No new content logging, telemetry, endpoint, schema, cache authority or media
authorization was introduced. Native input ownership, source consent, upload
admission, version preconditions, account/Space scope, uncertain responses and
known-parent retries remain with their existing owners. New labels are in both
shipped locales. Browser journeys exercise private visibility, draft recovery,
keyboard/focus, sheet return, reduced motion and reflow. Real Android software
keyboard/system Back acceptance was not performed in this browser-only proof;
wrapper code and browser-only button visibility are unchanged.

The screenshots use synthetic localized fixtures and existing repository demo
photos. Media content, voice duration, selected feeling/visibility and available operator
features reflect those fixtures rather than the illustrative reference data.
Browser captures omit the drawn phone bezel/status bar; feeling theme-color is
verified separately. These are runtime evidence, not copied reference assets.

## Validation

Final production source: `47aa560abef75eb36712c2c689b40dce020e30fa`, based on
`main` at `d258eb83372f12ef1c62b4827dcf4419bbde7b27`. Browser evidence uses
local Chromium, Node 26.7.0, a fresh Vite fixture build, production components
and fixture HTTP transport. The 200% case deliberately sets the root font size;
normal captures have no replacement layout or screenshot-only product styles.

| Check | Observed result |
| --- | --- |
| Final composer browser run, one worker | **21 passed**, 3.2 minutes: all 20 composer cases plus the retained shared-HeartMoment/Plan clean-edit return case. All 153 images were refreshed. |
| Accessibility within those cases | All six feelings in Light/Dark (12 Axe audits), all three readers at 390 px Light/Dark (6 Axe audits), 320 px/200% reflow, contained selection marks, native target geometry, focus and reduced motion passed. |
| Retained browser regression diagnosis | Initial 366-case run: 295 passed, 71 failed. After presentation-selector migrations and actual hit-target/overflow corrections, exact 71-case rerun: 70 passed, one false-dirty lifecycle failure. That last case passed after the create-only state fix and is included in the final 21. This is a correction chain, not a claim of one green 366-case command on the final revision. |
| Full unit suite | **2,884 passed, 2 skipped**, 320 files passed and two files skipped; 123 seconds with two workers. Started at `6ced0a33c` with all final runtime JavaScript; the subsequent `47aa560ab` change only selects the readable CSS initial color, separately verified by final browser/Axe evidence. |
| Typecheck, lint and format | All exit 0 on the final production source. Lint reports 154 warnings and 34 informational diagnostics, no errors. Format checks 1,106 files. |
| Production build and foundations | Build, semantic token/legal/i18n/PWA checks, and Capacitor foundation check pass. No native build or wrapper change. |
| Browser inventory | Pass: 105 specs; historical full baseline 972 and PR-critical baseline 719. Those inventory baselines are not the executed count. |
| Engineering/documentation language and whitespace | Both language audits and `git diff --check` pass on the final evidence/test/documentation tree. No audit exclusion or rule was weakened. |

The final test-selector correction waits for the actual saved Place result inside
`.moment-place-choices`, then asserts selected context before tags/save. The old
broad name match could instead click the temporary new-Place action while the
saved query was loading. The unchanged POST assertion exposed that test error;
no product Place state was lost. The final run preserves the canonical write,
privacy, source-byte, gesture, geometry, retry and focus assertions. No forced
click, sleep, skip or increased timeout was added to make retained cases pass.

Reproduce the final browser slice from `web/e2e` (the Playwright configuration
builds the fixture app before preview):

```sh
EIMIR_BROWSER_SPECS='["page-composer.spec.ts","plan-linked-lists.spec.ts"]' SCREENSHOT_EXPORT_DIR=/tmp/eimir-1730-evidence npm test -- --workers=1 --reporter=line --grep 'page-composer.spec.ts|shared HeartMoment capture retains its Plan in both directions'
```

Real Android software-keyboard/system-Back acceptance and a live backend journey
were not performed. Browser fixtures exercise the production UI and transport
contracts; they do not replace device or Product Owner acceptance. CI must be
green before merge. This implementation does not merge or publish the app.

## Reference-to-runtime comparison

References below remain at the original #1731 commit; only runtime captures are
added here. The source images include illustrative phone chrome and media.
Create/edit use the same approved anatomy. Filename frame numbers inherited from
the matrix state are descriptive; the reference column identifies the matching
composition (for example populated Diary create matches frame 2).

| Reference composition | Runtime at 390 px |
| --- | --- |
| Diary empty, frame 1<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/empty-390.png" width="220" alt="Reference frame 1"> | <img src="1730-diary-empty-frame-1-390-light.png" width="195" alt="Diary empty, Light"><img src="1730-diary-empty-frame-1-390-dark.png" width="195" alt="Diary empty, Dark"> |
| Diary populated create, frame 2<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/filled-390.png" width="220" alt="Reference frame 2"> | <img src="1730-diary-populated-create-frame-1-390-light.png" width="195" alt="Diary populated create, Light"><img src="1730-diary-populated-create-frame-1-390-dark.png" width="195" alt="Diary populated create, Dark"> |
| Diary edit, frame 2<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/filled-390.png" width="220" alt="Reference frame 2"> | <img src="1730-diary-edit-frame-2-390-light.png" width="195" alt="Diary edit, Light"><img src="1730-diary-edit-frame-2-390-dark.png" width="195" alt="Diary edit, Dark"> |
| Heart empty, frame 5<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png" width="220" alt="Reference frame 5"> | <img src="1730-heart-empty-frame-5-390-light.png" width="195" alt="Heart empty, Light"><img src="1730-heart-empty-frame-5-390-dark.png" width="195" alt="Heart empty, Dark"> |
| Heart populated create, frame 6<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png" width="220" alt="Reference frame 6"> | <img src="1730-heart-populated-create-frame-5-390-light.png" width="195" alt="Heart populated create, Light"><img src="1730-heart-populated-create-frame-5-390-dark.png" width="195" alt="Heart populated create, Dark"> |
| Heart edit, frame 6<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png" width="220" alt="Reference frame 6"> | <img src="1730-heart-edit-frame-6-390-light.png" width="195" alt="Heart edit, Light"><img src="1730-heart-edit-frame-6-390-dark.png" width="195" alt="Heart edit, Dark"> |
| Plan empty, frame 9<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png" width="220" alt="Reference frame 9"> | <img src="1730-plan-empty-frame-9-390-light.png" width="195" alt="Plan empty, Light"><img src="1730-plan-empty-frame-9-390-dark.png" width="195" alt="Plan empty, Dark"> |
| Plan populated create, frame 10<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png" width="220" alt="Reference frame 10"> | <img src="1730-plan-populated-create-frame-9-390-light.png" width="195" alt="Plan populated create, Light"><img src="1730-plan-populated-create-frame-9-390-dark.png" width="195" alt="Plan populated create, Dark"> |
| Plan edit, frame 10<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png" width="220" alt="Reference frame 10"> | <img src="1730-plan-edit-frame-10-390-light.png" width="195" alt="Plan edit, Light"><img src="1730-plan-edit-frame-10-390-dark.png" width="195" alt="Plan edit, Dark"> |
| Diary detail, frame 13<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-diary-390.png" width="220" alt="Reference frame 13"> | <img src="1730-diary-detail-frame-13-390-light.png" width="195" alt="Diary detail, Light"><img src="1730-diary-detail-frame-13-390-dark.png" width="195" alt="Diary detail, Dark"> |
| Diary comments, frame 14<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-diary-comments-390.png" width="220" alt="Reference frame 14"> | <img src="1730-diary-comments-frame-14-390-light.png" width="195" alt="Diary comments, Light"><img src="1730-diary-comments-frame-14-390-dark.png" width="195" alt="Diary comments, Dark"> |
| Heart detail, frame 15<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-heart-390.png" width="220" alt="Reference frame 15"> | <img src="1730-heart-detail-frame-15-390-light.png" width="195" alt="Heart detail, Light"><img src="1730-heart-detail-frame-15-390-dark.png" width="195" alt="Heart detail, Dark"> |
| Plan detail, frame 16<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-plan-390.png" width="220" alt="Reference frame 16"> | <img src="1730-plan-detail-frame-16-390-light.png" width="195" alt="Plan detail, Light"><img src="1730-plan-detail-frame-16-390-dark.png" width="195" alt="Plan detail, Dark"> |
| Diary Dark, frame 3<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/dark-390.png" width="220" alt="Reference frame 3"> | <img src="1730-diary-populated-create-frame-1-390-dark.png" width="195" alt="Diary Dark runtime"> |
| Heart Dark, frame 7<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png" width="220" alt="Reference frame 7"> | <img src="1730-heart-populated-create-frame-5-390-dark.png" width="195" alt="Heart Dark runtime"> |

### Compact matrix

Every linked screenshot is paired with its source frame in the first column.
Dark Diary populated follows frame 3; Dark Heart follows frame 7.

| State / reference | 360 Light | 360 Dark | 390 Light | 390 Dark | 430 Light | 430 Dark |
| --- | --- | --- | --- | --- | --- | --- |
| [Diary empty: frame 1](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/empty-390.png) | [Capture](1730-diary-empty-frame-1-360-light.png) | [Capture](1730-diary-empty-frame-1-360-dark.png) | [Capture](1730-diary-empty-frame-1-390-light.png) | [Capture](1730-diary-empty-frame-1-390-dark.png) | [Capture](1730-diary-empty-frame-1-430-light.png) | [Capture](1730-diary-empty-frame-1-430-dark.png) |
| [Diary populated create: frame 2](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/filled-390.png) | [Capture](1730-diary-populated-create-frame-1-360-light.png) | [Capture](1730-diary-populated-create-frame-1-360-dark.png) | [Capture](1730-diary-populated-create-frame-1-390-light.png) | [Capture](1730-diary-populated-create-frame-1-390-dark.png) | [Capture](1730-diary-populated-create-frame-1-430-light.png) | [Capture](1730-diary-populated-create-frame-1-430-dark.png) |
| [Diary edit: frame 2](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/filled-390.png) | [Capture](1730-diary-edit-frame-2-360-light.png) | [Capture](1730-diary-edit-frame-2-360-dark.png) | [Capture](1730-diary-edit-frame-2-390-light.png) | [Capture](1730-diary-edit-frame-2-390-dark.png) | [Capture](1730-diary-edit-frame-2-430-light.png) | [Capture](1730-diary-edit-frame-2-430-dark.png) |
| [Heart empty: frame 5](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png) | [Capture](1730-heart-empty-frame-5-360-light.png) | [Capture](1730-heart-empty-frame-5-360-dark.png) | [Capture](1730-heart-empty-frame-5-390-light.png) | [Capture](1730-heart-empty-frame-5-390-dark.png) | [Capture](1730-heart-empty-frame-5-430-light.png) | [Capture](1730-heart-empty-frame-5-430-dark.png) |
| [Heart populated create: frame 6](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png) | [Capture](1730-heart-populated-create-frame-5-360-light.png) | [Capture](1730-heart-populated-create-frame-5-360-dark.png) | [Capture](1730-heart-populated-create-frame-5-390-light.png) | [Capture](1730-heart-populated-create-frame-5-390-dark.png) | [Capture](1730-heart-populated-create-frame-5-430-light.png) | [Capture](1730-heart-populated-create-frame-5-430-dark.png) |
| [Heart edit: frame 6](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png) | [Capture](1730-heart-edit-frame-6-360-light.png) | [Capture](1730-heart-edit-frame-6-360-dark.png) | [Capture](1730-heart-edit-frame-6-390-light.png) | [Capture](1730-heart-edit-frame-6-390-dark.png) | [Capture](1730-heart-edit-frame-6-430-light.png) | [Capture](1730-heart-edit-frame-6-430-dark.png) |
| [Plan empty: frame 9](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png) | [Capture](1730-plan-empty-frame-9-360-light.png) | [Capture](1730-plan-empty-frame-9-360-dark.png) | [Capture](1730-plan-empty-frame-9-390-light.png) | [Capture](1730-plan-empty-frame-9-390-dark.png) | [Capture](1730-plan-empty-frame-9-430-light.png) | [Capture](1730-plan-empty-frame-9-430-dark.png) |
| [Plan populated create: frame 10](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png) | [Capture](1730-plan-populated-create-frame-9-360-light.png) | [Capture](1730-plan-populated-create-frame-9-360-dark.png) | [Capture](1730-plan-populated-create-frame-9-390-light.png) | [Capture](1730-plan-populated-create-frame-9-390-dark.png) | [Capture](1730-plan-populated-create-frame-9-430-light.png) | [Capture](1730-plan-populated-create-frame-9-430-dark.png) |
| [Plan edit: frame 10](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png) | [Capture](1730-plan-edit-frame-10-360-light.png) | [Capture](1730-plan-edit-frame-10-360-dark.png) | [Capture](1730-plan-edit-frame-10-390-light.png) | [Capture](1730-plan-edit-frame-10-390-dark.png) | [Capture](1730-plan-edit-frame-10-430-light.png) | [Capture](1730-plan-edit-frame-10-430-dark.png) |
| [Diary detail: frame 13](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-diary-390.png) | [Capture](1730-diary-detail-frame-13-360-light.png) | [Capture](1730-diary-detail-frame-13-360-dark.png) | [Capture](1730-diary-detail-frame-13-390-light.png) | [Capture](1730-diary-detail-frame-13-390-dark.png) | [Capture](1730-diary-detail-frame-13-430-light.png) | [Capture](1730-diary-detail-frame-13-430-dark.png) |
| [Diary comments: frame 14](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-diary-comments-390.png) | [Capture](1730-diary-comments-frame-14-360-light.png) | [Capture](1730-diary-comments-frame-14-360-dark.png) | [Capture](1730-diary-comments-frame-14-390-light.png) | [Capture](1730-diary-comments-frame-14-390-dark.png) | [Capture](1730-diary-comments-frame-14-430-light.png) | [Capture](1730-diary-comments-frame-14-430-dark.png) |
| [Heart detail: frame 15](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-heart-390.png) | [Capture](1730-heart-detail-frame-15-360-light.png) | [Capture](1730-heart-detail-frame-15-360-dark.png) | [Capture](1730-heart-detail-frame-15-390-light.png) | [Capture](1730-heart-detail-frame-15-390-dark.png) | [Capture](1730-heart-detail-frame-15-430-light.png) | [Capture](1730-heart-detail-frame-15-430-dark.png) |
| [Plan detail: frame 16](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-plan-390.png) | [Capture](1730-plan-detail-frame-16-360-light.png) | [Capture](1730-plan-detail-frame-16-360-dark.png) | [Capture](1730-plan-detail-frame-16-390-light.png) | [Capture](1730-plan-detail-frame-16-390-dark.png) | [Capture](1730-plan-detail-frame-16-430-light.png) | [Capture](1730-plan-detail-frame-16-430-dark.png) |

### Expanded, reduced motion and enlarged text

| State / reference | 1280 Light | 1280 Dark | 320 / 200% / reduced | 320 full page | 390 Dark / reduced |
| --- | --- | --- | --- | --- | --- |
| [Diary empty: frame 1](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/empty-390.png) | [Capture](1730-diary-empty-frame-1-1280-light.png) | [Capture](1730-diary-empty-frame-1-1280-dark.png) | [Capture](1730-diary-empty-frame-1-320-light-200-percent-reduced.png) | [Capture](1730-diary-empty-frame-1-320-light-200-percent-reduced-full.png) | [Capture](1730-diary-empty-frame-1-390-dark-reduced.png) |
| [Diary populated create: frame 2](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/filled-390.png) | [Capture](1730-diary-populated-create-frame-1-1280-light.png) | [Capture](1730-diary-populated-create-frame-1-1280-dark.png) | [Capture](1730-diary-populated-create-frame-1-320-light-200-percent-reduced.png) | [Capture](1730-diary-populated-create-frame-1-320-light-200-percent-reduced-full.png) | [Capture](1730-diary-populated-create-frame-1-390-dark-reduced.png) |
| [Diary edit: frame 2](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/filled-390.png) | [Capture](1730-diary-edit-frame-2-1280-light.png) | [Capture](1730-diary-edit-frame-2-1280-dark.png) | [Capture](1730-diary-edit-frame-2-320-light-200-percent-reduced.png) | [Capture](1730-diary-edit-frame-2-320-light-200-percent-reduced-full.png) | [Capture](1730-diary-edit-frame-2-390-dark-reduced.png) |
| [Heart empty: frame 5](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png) | [Capture](1730-heart-empty-frame-5-1280-light.png) | [Capture](1730-heart-empty-frame-5-1280-dark.png) | [Capture](1730-heart-empty-frame-5-320-light-200-percent-reduced.png) | [Capture](1730-heart-empty-frame-5-320-light-200-percent-reduced-full.png) | [Capture](1730-heart-empty-frame-5-390-dark-reduced.png) |
| [Heart populated create: frame 6](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png) | [Capture](1730-heart-populated-create-frame-5-1280-light.png) | [Capture](1730-heart-populated-create-frame-5-1280-dark.png) | [Capture](1730-heart-populated-create-frame-5-320-light-200-percent-reduced.png) | [Capture](1730-heart-populated-create-frame-5-320-light-200-percent-reduced-full.png) | [Capture](1730-heart-populated-create-frame-5-390-dark-reduced.png) |
| [Heart edit: frame 6](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png) | [Capture](1730-heart-edit-frame-6-1280-light.png) | [Capture](1730-heart-edit-frame-6-1280-dark.png) | [Capture](1730-heart-edit-frame-6-320-light-200-percent-reduced.png) | [Capture](1730-heart-edit-frame-6-320-light-200-percent-reduced-full.png) | [Capture](1730-heart-edit-frame-6-390-dark-reduced.png) |
| [Plan empty: frame 9](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png) | [Capture](1730-plan-empty-frame-9-1280-light.png) | [Capture](1730-plan-empty-frame-9-1280-dark.png) | [Capture](1730-plan-empty-frame-9-320-light-200-percent-reduced.png) | [Capture](1730-plan-empty-frame-9-320-light-200-percent-reduced-full.png) | [Capture](1730-plan-empty-frame-9-390-dark-reduced.png) |
| [Plan populated create: frame 10](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png) | [Capture](1730-plan-populated-create-frame-9-1280-light.png) | [Capture](1730-plan-populated-create-frame-9-1280-dark.png) | [Capture](1730-plan-populated-create-frame-9-320-light-200-percent-reduced.png) | [Capture](1730-plan-populated-create-frame-9-320-light-200-percent-reduced-full.png) | [Capture](1730-plan-populated-create-frame-9-390-dark-reduced.png) |
| [Plan edit: frame 10](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png) | [Capture](1730-plan-edit-frame-10-1280-light.png) | [Capture](1730-plan-edit-frame-10-1280-dark.png) | [Capture](1730-plan-edit-frame-10-320-light-200-percent-reduced.png) | [Capture](1730-plan-edit-frame-10-320-light-200-percent-reduced-full.png) | [Capture](1730-plan-edit-frame-10-390-dark-reduced.png) |
| [Diary detail: frame 13](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-diary-390.png) | [Capture](1730-diary-detail-frame-13-1280-light.png) | [Capture](1730-diary-detail-frame-13-1280-dark.png) | [Capture](1730-diary-detail-frame-13-320-light-200-percent-reduced.png) | [Capture](1730-diary-detail-frame-13-320-light-200-percent-reduced-full.png) | [Capture](1730-diary-detail-frame-13-390-dark-reduced.png) |
| [Diary comments: frame 14](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-diary-comments-390.png) | [Capture](1730-diary-comments-frame-14-1280-light.png) | [Capture](1730-diary-comments-frame-14-1280-dark.png) | [Capture](1730-diary-comments-frame-14-320-light-200-percent-reduced.png) | [Capture](1730-diary-comments-frame-14-320-light-200-percent-reduced-full.png) | [Capture](1730-diary-comments-frame-14-390-dark-reduced.png) |
| [Heart detail: frame 15](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-heart-390.png) | [Capture](1730-heart-detail-frame-15-1280-light.png) | [Capture](1730-heart-detail-frame-15-1280-dark.png) | [Capture](1730-heart-detail-frame-15-320-light-200-percent-reduced.png) | [Capture](1730-heart-detail-frame-15-320-light-200-percent-reduced-full.png) | [Capture](1730-heart-detail-frame-15-390-dark-reduced.png) |
| [Plan detail: frame 16](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/detail-plan-390.png) | [Capture](1730-plan-detail-frame-16-1280-light.png) | [Capture](1730-plan-detail-frame-16-1280-dark.png) | [Capture](1730-plan-detail-frame-16-320-light-200-percent-reduced.png) | [Capture](1730-plan-detail-frame-16-320-light-200-percent-reduced-full.png) | [Capture](1730-plan-detail-frame-16-390-dark-reduced.png) |

### Bounded tasks and fullscreen

| Reference / behavior | Runtime |
| --- | --- |
| [Frame 4: tags](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/sheet-390.png)<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/sheet-390.png" width="220" alt="Reference 4: tags"> | <img src="1730-diary-tag-sheet-frame-4.png" width="220" alt="Runtime 4: tags"> |
| [Frame 8: photo sources](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png)<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-heartmoment-reference.png" width="220" alt="Reference 8: photo sources"> | <img src="1730-photo-source-sheet-frame-8.png" width="220" alt="Runtime 8: photo sources"> |
| [Frame 11: schedule](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png)<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/generated-plan-reference.png" width="220" alt="Reference 11: schedule"> | <img src="1730-plan-schedule-sheet-frame-11.png" width="220" alt="Runtime 11: schedule"> |
| [Frame 12: new Place](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/new-place-390.png)<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/new-place-390.png" width="220" alt="Reference 12: new Place"> | <img src="1730-new-place-sheet-frame-12.png" width="220" alt="Runtime 12: new Place"> |
| [Frame 17: shared List](https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/plan-list-390.png)<br><img src="https://raw.githubusercontent.com/baerenmarke90/eimir/4bbb3110b31a0944992712a125900391754261c4/docs/product/design/references/page-composer/plan-list-390.png" width="220" alt="Reference 17: shared List"> | <img src="1730-plan-list-composer-frame-17.png" width="220" alt="Runtime 17: shared List"> |
| Diary fullscreen, same-slide return, swipe and zoom | [Capture](1730-diary-fullscreen.png) |
| Heart fullscreen, same-slide return, swipe and zoom | [Capture](1730-heart-fullscreen.png) |
| Plan fullscreen, same-slide return, swipe and zoom | [Capture](1730-plan-fullscreen.png) |

Saved result and draft continuity: [Diary after Save](1730-diary-saved-detail-frame-13.png), [restored Diary draft](1730-diary-restored-draft.png).

[Capture inventory](capture-manifest.json) identifies all 153 runtime PNGs.
No drawn reference or source screenshot is copied. The only test presentation override is the explicit 200% root-font scaling case.
