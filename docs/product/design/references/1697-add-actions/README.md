# Labeled add actions

Issue: #1697. Baseline main: `ab4590db29e53bc6eeed6b532e2e35dc17bdcfdf`.

## Product decision and preflight

The Product Owner supplied the current Planning screen and explicitly requested
its filled blue pill, plus icon and visible localized action label everywhere.
This correction supersedes the icon-only circular interpretation in #1693.
The supplied current-screen reference is authoritative for this existing-control
correction; no new feature, composition or generated alternative is proposed.
R1/R2/R3/R5, the existing screen templates, semantic tokens, content and shell
remain the baseline. The issue records the pre-implementation interaction,
reuse, business/freemium and cross-cutting review.

## Shared contract and inventory

`AddActionButton` owns native button presentation, `AddActionLink` owns Router
Link presentation, and `AddActionContent` supplies identical icon/label content
where an existing task-origin link, native file label or add/edit chip must keep
its own lifecycle. Add actions have one canonical blue surface, inverse label,
pill radius, tokenized padding/gap/type and comfortable minimum touch target.
Labels and inline rows wrap instead of hiding text or compressing fields.
Layout-only classes cannot redefine the action's appearance. Pending insertion
reserves both localized captions in the same grid cell, so confirmation cannot
resize the button or move its neighbors. The obsolete People-only horizontal
header is removed so the full action label sits below the Compact title. Native disabled,
fieldset, pressed, stationary hover, focus and reduced-motion behavior remain.

| Surface | Consumer |
| --- | --- |
| Plans and Wishes | SharedPlanningOverviewPage |
| Moments | MomentCreateMenu |
| People and birthdays | RelatedPeoplePage |
| Important days | ImportantDatesPanel |
| Tags in Memory, Heart Moment, Plan and Wish | ContextTagEditor |
| Shared places and lists | PlacesOverviewPage, CollectionsOverviewPage |
| Chapters | ChaptersOverviewPage |
| Private notes, gift ideas and lists | PrivateNotesPage, GiftIdeasPage, PrivateCollectionsPage |
| List insertion, including the Today pinned list | CollectionProductPage, PrivateCollectionsPage, TodayPinnedCollection |
| Preferences and private profile notes | ProfilePageBase |
| Partner nickname insertion | PartnerIdentityPanel |
| Media and video intake | DeviceMediaPicker, VideoUploadAction |
| Place insertion in capture and editing | PlanningCreatePage, MomentPlaceField, HeartMomentLocation, MomentPlaces |
| Content and Plan/Wish associations | PlanningRelationManager, MemoryPlanningLinks, PlanWishLink |
| Shared experiences | CoupleExperiencePage |
| Wish selection idea | WishSelectionPage |
| Optional period/end-time insertion | MemoryCreatePage, PlanScheduleFields |

Existing selected-value editing, source choices, navigation, recording, Save,
Back, Close, overflow and the global shell plus retain their task semantics.
The obsolete icon-only list-add variant and local Planning/Moments/list surfaces
are retired, including legacy full-width overrides of the shared pill.

## Validation and evidence

Existing browser journeys now share a rendered labeled-pill assertion for Plans,
Wishes, Moments, People, days and authored tags. Existing actionability,
save/result/return, focus, privacy, axe, Light/Dark, Expanded and large-text
coverage remains; tag rows explicitly accept non-overlapping wrapping. No new
always-run core journey or browser-selection policy is introduced. The shared
layout changes conservatively select the retained full browser suite.

Runtime screenshot evidence and exact final-head check results belong in the PR.
The local Chromium installation and launch were attempted: the download endpoint
returned a 195-byte HTML “Site Unavailable” response instead of the archive, and
Playwright confirmed the executable is absent. Hosted browser evidence is
required before calling the visual/behavioral result complete.

The full local Web run exposed a pre-existing monthly-fixture date expiry on
main. Reuse the already shipped Date-only fixture correction from test.53 source
`d8a31097a4042655a2b8fd5ec5b7aa24019dbec2`, without changing product code,
assertions, timeouts or other timers. The end-time component test now checks the
visible localized label and shared decorative plus separately, matching the
accessible icon/text contract rather than looking for a text plus character.

No API, schema, authorization, draft/storage, request, subscription or commercial
boundary changes. No dependency, provider, native wrapper or release change.
