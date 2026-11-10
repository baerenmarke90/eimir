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
   `generated-compact-reference.png` (Diary: empty, populated, populated Dark,
   tag sheet) and `generated-composer-family-reference.png` (HeartMoment Light
   and Dark, Plan).
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
create and edit, Plan create and edit.

Out of scope: Wish, Milestone, Chapter, couple-experience question/answer flows
(`experienceKind` paths keep their current layout), read/detail screens,
backend/API, native wrapper.

## 2. Shared anatomy (all in-scope composers, top to bottom)

1. **Header** – keep `ComposerHeader`: task Back, localized title, header submit.
   Submit is the only filled accent action on the page. It looks quiet
   (subtle surface, secondary text) while nothing saveable exists and becomes the
   filled accent once content exists. Keep its current validation behavior; do not
   make it a disabled control.
2. **Context lines** – no card. Line 1: calendar icon + localized long date
   (Plan: schedule summary incl. time, or the unscheduled string) + chevron;
   tapping opens the existing date/range or `PlanScheduleFields` control in a
   `ShortTaskSheet`. Line 2: audience.
   - Diary/Memory/Plan: fixed audience line with people icon (shared space; not a
     toggle).
   - HeartMoment: a pill showing the selected visibility (lock icon for
     owner-only) with chevron, opening the existing visibility choice.
3. **Writing and media** – the page itself is the composer. Remove the wrapping
   writing surface/card around title, prose and media. No nested containers.
   - Diary/Memory: media intake first (large), then title, then prose.
   - HeartMoment: moment text first (display role, it is the lead), then the
     feeling chips, then the compact intake (media + voice).
   - Plan: intention title, then description, then the compact intake.
4. **Chips** – chosen places, tags and shared Lists render below the content as
   quiet pill chips (subtle surface, accent text, leading icon, at least 44 px
   target with spacing). Tapping a chip reopens its existing editor. Order: places,
   Lists, tags.
5. **Draft/status line** – keep the existing draft status and pending/error/offline
   notices with their current owners and copy; style as small secondary text.
6. **Tool row** – a labeled bottom row, sticky above the safe area and the
   software keyboard (use the existing keyboard/visual-viewport handling if one
   exists; otherwise CSS `env(safe-area-inset-bottom)` plus `visualViewport`).
   Items, each an icon over a short label, min 48 × 48 px:
   - Diary/Memory: Photo, Place, Tag.
   - HeartMoment: Photo, Voice, Place, Tag.
   - Plan: Photo, Place, List, Tag.
   Photo opens the device picker directly (same as the intake). Place, Tag, List
   and Voice open their existing editors in a `ShortTaskSheet` (or the editor's
   existing sheet). An item with a value shows the accent color. The row replaces
   the current filled place/tag `AddAction` pills inside these composers.

## 3. Media

- **Empty, large intake (Diary/Memory)**: one soft surface (`radius.sheet`)
  containing a raised main action (photo-plus icon in a tinted circle, primary
  line "add photos or videos", secondary line "choose from device"; video wording
  only when video is actually eligible) and below it a quiet full-width row
  "other photo source" with `ProMark`, following existing availability and Pro rules.
- **Compact intake (HeartMoment/Plan, and Diary when text is long)**: the same
  surface as stacked full-width rows: device media, voice note (HeartMoment only,
  with its existing limit hint), quiet external-source row with `ProMark`.
- Idle file-format text (`memory.photoFormats`) is removed from the idle state; the
  existing `mediaDrop.supported*` messages appear only on rejection.
- **After selection**: the chosen cover becomes a large rounded hero (full content
  width, about 214 px high at 390 px) with a "cover" badge top-left and
  "n of m" bottom-right, followed by a thumbnail strip (56 px, `radius.medium`):
  selected ring, sensitive thumbnails blurred with an eye-off glyph, and a final
  add tile. Reuse `PhotoDraftGallery`; keep cover choice, automatic cover,
  sensitivity toggle (#1477), reorder, remove, retry, upload progress, video
  processing, swipe/fullscreen/zoom and limit messages. Restyle, do not rewrite.

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
- HeartMoment: the selected feeling tints the whole composer page using the
  existing `--emotion-*-surface` / `--emotion-*-accent` roles (Light and Dark).
  Feeling choices render as chips (selected = filled accent with check) but keep
  `HeartEmotionPicker` radio-group semantics.
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
