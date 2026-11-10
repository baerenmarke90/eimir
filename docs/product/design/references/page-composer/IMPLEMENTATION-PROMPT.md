# Implementation prompt: page-as-composer for shared composers

Copy everything below the line into the implementing agent (ChatGPT/Codex).

---

You are implementing an approved Product Owner design in the eimir. repository
(`baerenmarke90/eimir`). Implement it **exactly as shown in the reference images**
in `docs/product/design/references/page-composer/`. The images are the target
composition: hierarchy, order, spacing rhythm, surfaces, type roles, chips, tool
row and states. Deviate only where a rule below says so, and record every
deviation in the PR.

## 0. Before writing code

1. Read `AGENTS.md` and every mandatory source it lists for user-facing Web work
   (Product Reference v1, Partner-App Experience Standard, UX patterns, screen
   templates, component contracts, design-system delivery, `design/tokens.json`).
2. Read `docs/product/design/references/page-composer/README.md` (decision,
   baseline, Mobile Interaction Contract) and look at all PNGs in that folder:
   `generated-compact-reference.png` (frames 1–4, Diary: empty, populated,
   populated Dark, tag sheet), `generated-heartmoment-reference.png` (frames 5–8:
   choosing a feeling, with photo and voice, Dark, photo source sheet) and
   `generated-plan-reference.png` (frames 9–11: Plan, with photos, schedule sheet)
   and `generated-detail-reference.png` (frames 12–16: new place sheet, Diary
   entry detail top and bottom, HeartMoment detail, Plan detail).
3. Check the state of issue #1726 / PR #1727 (soft composer media rows). If
   #1727 is merged, branch from `main`. If it is still open, ask the Product Owner
   whether to build on its branch; do not duplicate or fight its media-row work.
   This reference supersedes #1727 where they conflict (outer composer surface,
   blue place/tag pills, idle file-format copy, enrichment placement).
4. Inventory the current owners on the actual destination screens before
   editing: `MemoryCreatePage`, `MemoryProductPage` (edit), `HeartMomentProductPage`
   (create and edit), `PlanningCreatePage`, `PlanProductPage` (edit),
   `ComposerHeader`, `ComposerDateContext`, `PlanScheduleFields`,
   `AttachmentDraftPicker`, `DeviceMediaPicker`, `PhotoSourcePicker`,
   `PhotoDraftGallery`, `PlanPhotosEditor`, `VoiceNoteEditor`,
   `OrderedMomentPlacesField`, `MomentPlaceField`, `HeartMomentLocationField`,
   `PlaceChoicePicker`, `MemoryTagChoices`, `HeartMomentTagChoices`,
   `ContextTagEditor`, `CollectionChoicePicker`, `HeartEmotionPicker`,
   `ShortTaskSheet`, `ProMark`, `EimirIcon`.

## 1. Scope

In scope: Diary/Memory create (non-experience path), Memory edit, HeartMoment
create and edit, Plan create and edit, and the Diary/Memory, HeartMoment and
Plan detail (read) screens (section 3a).

Out of scope: Wish, Milestone, Chapter, couple-experience question/answer flows
(`experienceKind` paths keep their current layout), backend/API, native wrapper.

Product Owner decisions of 2026-11-10 that this brief encodes (they supersede
conflicting earlier wording, including Product Reference v1 R1 row 6 for the
fixed audience line): no "visible to both" line in Diary/Memory and Plan
composers; short date without weekday; place next to the date; drag and drop for
media in every composer; creating a new place from the place sheet; feeling
chips stay visible; detail screens keep gallery swipe, photo count, comments,
reactions, drop-cap initial, place next to the date and linked Wishes/Plans.

## 2. Shared anatomy (all in-scope composers, top to bottom)

1. **Header** – keep `ComposerHeader`: task Back, localized title, header submit.
   Submit is the only filled accent action on the page. It looks quiet
   (subtle surface, secondary text) while nothing saveable exists and becomes the
   filled accent once content exists. Keep its current validation behavior; do not
   make it a disabled control.
2. **Context row** – no card. One wrapping row: calendar icon + short localized
   date without weekday (`Intl` `{ day: 'numeric', month: 'long', year: 'numeric' }`,
   e.g. "10. November 2026"; Diary range "8. November – 10. November 2026"; Plan
   adds " · 12:00" or uses the unscheduled string) + chevron; tapping opens the
   existing date/range or `PlanScheduleFields` control in a `ShortTaskSheet`.
   Directly to its right (wrapping below on narrow widths): the chosen place(s)
   with a pin icon in the accent color (first place, then "+n"), opening the place
   editor. No place, no place item.
   - Diary/Memory/Plan: **no audience line** (PO decision).
   - HeartMoment: below the row, a pill showing the selected visibility (lock icon
     for owner-only) with chevron, opening the existing visibility choice.
3. **Writing and media** – the page itself is the composer. Remove the wrapping
   writing surface/card around title, prose and media. No nested containers.
   - Diary/Memory: media first (large intake while empty, cover + strip once
     selected), then title, then prose.
   - HeartMoment: moment text first (display role, it is the lead), then the
     feeling chips, then selected media and the voice note. The feeling chips
     always stay visible; selecting one never collapses or hides them (no
     disclosure, no delay). No media block is shown on the page until media or
     voice exists.
   - Plan: cover + strip first once photos exist, then intention title, then
     description. No media block is shown on the page until photos exist.
4. **Chips** – chosen shared Lists and tags render below the content as quiet
   pill chips (subtle surface, accent text, leading icon, at least 44 px target
   with spacing). Tapping a chip reopens its existing editor. Order: Lists, tags.
   Places are not chips; they live in the context row.
5. **Draft/status line** – keep the existing draft status and pending/error/offline
   notices with their current owners and copy; style as small secondary text.
6. **Tool row** – a labeled bottom row, sticky above the safe area and the
   software keyboard (use the existing keyboard/visual-viewport handling if one
   exists; otherwise CSS `env(safe-area-inset-bottom)` plus `visualViewport`).
   Items, each an icon over a short label, min 48 × 48 px:
   - Diary/Memory: Place, Tag (no Photo item: the on-page intake and later the
     strip's add tile are the single media entry).
   - HeartMoment: Photo, Voice, Place, Tag.
   - Plan: Photo, Place, List, Tag.
   **One media entry per state, never two visible at once.** Where the tool row
   has Photo, the page shows no intake block; where the page shows the intake,
   the tool row has no Photo item. Photo opens the shared photo source sheet
   (frame 8). Place, Tag, List and Voice open their existing editors in a
   `ShortTaskSheet` (or the editor's existing sheet). An item with a value shows
   the accent color. The row replaces the current filled place/tag `AddAction`
   pills inside these composers.

## 3. Media

- **Empty, large intake (Diary/Memory)**: one soft surface (`radius.sheet`)
  containing a raised main action (photo-plus icon in a tinted circle, primary
  line "add photos or videos", secondary line "choose from device"; video wording
  only when video is actually eligible) and below it a quiet full-width row
  "other photo source" with `ProMark`, following existing availability and Pro rules.
- **Photo source sheet (frame 8)**: opened by the Photo tool (HeartMoment, Plan)
  and by the Diary intake's external-source row. One `ShortTaskSheet` built from
  `PhotoSourcePicker`/`DeviceMediaPicker`: title `photoSources.title`, the existing
  consent sentence, then full-width soft rows — device (`photoSources.device`,
  hint `photoSources.deviceMedia` only when video is eligible) first, then each
  external source (Google Photos, Immich) with `ProMark` and its existing
  availability, connection and Pro rules. Use neutral contextual icons, not
  provider brand logos. Choosing device opens the system picker directly.
- **Voice note (HeartMoment)**: the Voice tool opens `VoiceNoteEditor`
  (record / choose file, existing limit). A saved note appears inline below the
  photos as one soft row with a play button in the feeling accent, waveform and
  duration (`SavedVoiceNote`), with its existing re-record/remove actions.
- Idle file-format text (`memory.photoFormats`) is removed from the idle state; the
  existing `mediaDrop.supported*` messages appear only on rejection.
- **Drag and drop** in every composer: dropping image files anywhere on the
  composer page adds them through the existing media-drop/intake owner. While
  files are dragged over the page, show a dashed accent drop overlay with
  "drop photos here" copy. The Diary intake's secondary line mentions dragging.
  Unsupported files show the existing `mediaDrop.supported*` message.
- **New place**: the place sheet lists saved places, filtered by its search
  field, and starts with a row "add new place" (or "create '<search text>' as a
  new place" when the text matches nothing). It opens the existing shared-place
  creation (`photoPlaces.saveSharedPlace`, `photoPlaces.sharedCreateHint`,
  `PlaceMapPicker`): name prefilled from the search text, optional address, map
  choice, then save and select it (frame 12).
- **After selection**: the chosen cover becomes a large rounded hero (full content
  width, about 214 px high at 390 px) with a "cover" badge top-left and
  "n of m" bottom-right, followed by a thumbnail strip (56 px, `radius.medium`):
  selected ring (accent; feeling accent in HeartMoment), sensitive thumbnails
  blurred with an eye-off glyph, and a final add tile that opens the same media
  entry as the screen's Photo tool or intake. HeartMoment and Plan use a cover
  height of about 176 px. Reuse `PhotoDraftGallery`; keep cover choice, automatic cover,
  sensitivity toggle (#1477), reorder, remove, retry, upload progress, video
  processing, swipe/fullscreen/zoom and limit messages. Restyle, do not rewrite.

## 3a. Detail (read) screens

Frames 13–16. The PO reported these capabilities missing in the current runtime;
verify each on `main` and restore it where it regressed. Order:

1. Header: Back, localized type title, Edit as text action. After a save, a
   short "saved" status pill.
2. Meta row: short date (as in the composer) and, to its right, the place(s);
   HeartMoment adds its visibility. HeartMoment then shows `HeartEmotionBadge`
   (detail variant: icon + feeling) and keeps its feeling tint on the page.
3. Gallery (`MemoryPhotoGallery` / `MediaGallery`): one swipeable full-width
   gallery with scroll-snap, "n / m" count top-right, position dots below,
   previous/next buttons for pointer and keyboard (arrow keys), the cover first.
   Sensitive photos stay concealed until "show image" and can be hidden again.
   Photo reactions (`photoReactions.*`, six reactions) open from a "react"
   button on the photo; summary chips under the gallery show counts and your own
   reaction. Fullscreen/zoom remain as today.
4. Title in the display role; prose with the existing `drop-cap-letter` initial
   (first letter uppercase, display font, brand/accent color, 1.3em).
5. Tags; HeartMoment voice note; Plan shared Lists.
6. "Linked Wishes and Plans" (`StoryPlanningLinks`, `memoryProduct.planning.*`)
   with the linked items and the link action.
7. Comments (`CommentsPanel`) with the existing composer; not rendered for
   owner-only HeartMoments.

## 4. Type, color, spacing

- Title/intention/HeartMoment text: Literata (`font.family.display`), 600,
  27 px (Diary title) / 25 px (lead text), line-height 1.2. Placeholder uses the
  secondary text color. If no matching typography token exists, add a semantic
  token (for example `typography.composerTitle`) instead of literals.
- Prose: Instrument Sans 17 px, line-height 1.55.
- Context lines: 15 px; date in primary text, audience in secondary text.
- Gutters per Product Reference D7: 16 px below ~390 px, 20 px from ~390 px.
- Surfaces from semantic tokens only: page `background`, intake `surfaceSubtle`,
  raised rows `surface` (Light) / `surfaceRaised` (Dark), hairline above the tool
  row `border`. No idle outlines; focus-visible and forced-colors outlines stay.
- HeartMoment feeling (frames 5–8):
  - Each feeling chip shows the same icon the timeline uses: reuse the
    `EmotionIcon` glyphs and the `.heart-emotion-icon` treatment from
    `HeartEmotionVisual.tsx` / `HeartEmotionVisual.css` (icon in a 15 % accent
    circle). Every chip carries its own `data-emotion`, so each icon keeps its own
    emotion accent even when another feeling is selected. Do not draw new icons.
  - The selected chip is filled with its emotion accent, icon and label on the
    accent, followed by a check; unselected chips sit on a light surface.
  - The selected feeling tints the whole composer, not only the writing
    surface: page background, header, tool row and safe-area background use
    `--heart-emotion-surface`; header submit, visibility pill, intake icons,
    external-source row, tool icons and chips use `--heart-emotion-accent`; the
    intake surface and hairlines are `color-mix` derivations of both. Drive it from
    the existing `.heart-emotion-compose:has(... :checked)` /
    `[data-heart-emotion]` mechanism and the existing emotion roles (Light and
    Dark); add no new palette.
  - The browser/Android system bar (`meta[name="theme-color"]`, currently set in
    `applyResolvedTheme` from `--color-background`) follows the feeling surface
    while the HeartMoment composer is open and is restored on exit. If this is not
    achievable without a native capability change, document it as a deviation.
  - Re-tinting on a feeling change uses the existing feedback duration; reduced
    motion switches instantly.
  - Keep `HeartEmotionPicker` radio-group semantics, the default feeling, form
    reset behavior and the accessible label of each choice.
- No new hex literals in component CSS; add semantic tokens where needed.

## 5. Behavior and lifecycle (must not regress)

- No autofocus; tapping prose starts typing; keyboard never covers the focused
  field, the tool row or header submit.
- Draft persistence, dirty-exit prompt, recovery, uncertain/partial save,
  duplicate-submit prevention and canonical result/return stay exactly as today.
- Sheets: named, initial focus, focus trap, Escape/Back, grab handle as operable
  control, focus returns to the invoking tool or chip.
- Text-only entries show no photo-shaped gap; title-only/image-only/text-only/mixed
  contracts unchanged.

## 6. Motion

Use existing motion tokens: intake to cover cross-fade on first media, chips
fade/scale in, sheets use shared sheet motion, submit color transition when content
becomes saveable. `prefers-reduced-motion: reduce` removes translation/scale and
keeps all states visible.

## 7. Localization and accessibility

- All new labels via i18n in every shipped locale (at least `de` and `en`): tool
  labels, audience line, cover count, chip accessible names ("place: name, edit").
  Reuse existing keys wherever they exist; German copy must match the reference.
- Tool row is a labeled group; each item is a native button with visible label.
- Contrast AA in Light and Dark, 200 % text, 320 px reflow without horizontal
  scrolling.

## 8. Verification and evidence

- Update/extend the existing unit and Playwright journeys for these composers
  (run Playwright with `--workers=1` locally). Cover: open → add media → mark
  sensitive → choose cover → add place via tool row → add tag via sheet → save →
  result → return; HeartMoment feeling tint and visibility; Plan schedule sheet and
  List chip; draft restore after reload.
- Capture evidence at 360/390/430 px Light and Dark, empty and populated,
  reduced motion, 200 % text, one Expanded width; place each screenshot next to the
  matching reference frame in the PR. Do not run the whole Playwright suite in a
  way that overwrites committed evidence images.
- Run lint, type-check, unit tests for touched areas and
  `tools/ci/engineering_language_audit.py` before pushing.

## 9. Pull request

Use the repository PR template. Required: reuse review (alternatives considered,
selected approach, why no new dependency), business/freemium result
("No business/freemium impact": device media and authoring stay Free/Core,
external sources stay Premium with the existing mark, video keeps its boundary; no
quota/cost/retention/ownership/Self-Hosted change), Product Design / UX checklist,
cross-cutting notes (i18n, a11y, keyboard, draft continuity, motion). Reference the
owning issue and this folder. English for all code, comments, tests, commits and
PR text.

## 10. Do not

- wrap the composer or intake in additional cards;
- keep filled blue pill buttons for place/tag inside these composers;
- show file formats while idle;
- hide audience, consequences, errors or privacy behind the tool row;
- add new features, fields, providers or entitlement rules;
- hardcode colors, radii or font sizes that have or need a semantic token.
