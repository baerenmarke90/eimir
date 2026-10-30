# Journal, captions and edit actions

## Product design preflight (2026-10-30)

Requested by the Product Owner in the implementation chat, including the two
attached Diary/Today screenshots and the follow-up removing the quote ornament.
Baseline main: `e9f6646065440c24baf4dfe02477704adaee57b7`.
Destination branch baseline: `da14f81791ae62a6ec4742762a43b8764ee2d298`
(`feat/primary-tab-swipe`; currently main plus its generated reference).

Reviewed the unified `/story` rediscovery hero/tapestry and Diary, current
filter sheet, `StoryBrowseLayer`, `StoryList`, `HeartEmotionVisual`, Today
monthly strip, quote, canonical read details, private read details, profile
identity and contextual comment editing. Preserve the four root destinations,
central create action, authorized images, privacy, active filters and task return.

Generated reference **before UI implementation**:
![Compact composition reference](references/journal-category-edit-polish/generated-reference.png)

Generated using the built-in Imagegen tool (`ui-mockup`). The reference covers
category-tinted Diary entries with red heart nodes, visible browse destinations,
photo captions and a contextual pencil. The image is composition guidance:
its invented header/hero copy, repeated privacy locks, hidden navigation labels,
separators and four separate browse tiles are not implementation requirements.
The actual existing shell, shared browse strip and authorization take precedence.

## Mobile interaction contract

- Outcome: recognize and rediscover one's history and edit the intended object.
  R2 (Moments), R4 (Today), R5 (utility), Detail and Story Timeline templates apply.
- Compact: preserve unified rediscovery followed by Diary. The recognizable
  sliders filter stays beside Diary; a visible Durchstöbern strip provides
  Photos, Milestones, Chapters and Years before the chronology. The filter
  sheet owns only draft filters and Apply/Cancel.
- Main action: open personal content. Editing is a secondary, named pencil at
  the trailing edge of the relevant title/section; no persistent edit form or
  duplicate edit shortcut. Item-specific actions stay with their item.
- Category: reuse all six existing emotion accent/surface pairs, icons and
  translated labels. All timeline heart markers use the existing red loved
  accent independently of category. Shapes and labels retain non-color meaning.
- Captions: preserve authored titles. For generated date titles, use one
  localized date as the heading and omit the repeated date underneath. Apply
  the same rule to Story, Today and other previews using these projections;
  do not rewrite stored titles or fetch bodies just for previews.
- Today: square photos with calm captions on the page, no link underline or
  colored caption container. Remove only the quote ornament, preserving the
  quotation, attribution, settings and entitlement states.
- Loading/empty/error/offline: retain existing regional states, caches, retry,
  author rights and disabled writes. No new data flow, cache or network call.
- Success: existing authoritative save, dirty/pending protection, keyboard
  focus restoration and originating filter/scroll/return state remain intact.
- One partner can browse and edit all content their capabilities allow without
  requiring participation from the other; optional comments stay optional.
- Controls have at least 44 px targets, visible focus, native link/button
  semantics, localized accessible names and Web tooltips. Browse labels wrap
  into two columns when necessary. No hover-only or gesture-only affordance.
- Expanded: same hierarchy with wider imagery and captions; no extra forms.
- Motion: reuse existing feedback/sheet and carousel behavior, including
  reduced motion; this correction adds no new animation or early keyboard.
- No new love microcopy/delight: personal content supplies the emotional value.

## Reuse, business and cross-cutting review

Reuse the existing emotion palette/attributes, `ListEntryIconButton`, pencil,
detail link, PageHeader, browse routes, task origin and date formatting. No
third-party dependency/provider or infrastructure implementation is required.
The generic edit action uses this existing icon pattern; contextual specific
field choices and destructive actions retain clear text where necessary.

**No business/freemium impact:** Memory CRUD/Timeline, HeartMoments, ordinary
search/filtering and photo browsing remain Free/Core under the matrix. No
capability, ownership, Cloud/Self-Hosted, quota, storage, operating-cost,
downgrade or existing-data behavior changes. Quote eligibility remains intact.

Security/privacy, API/migrations, concurrency, observability, operations and
resource usage are unchanged. Localization/date behavior, semantics/contrast,
focus/targets, reduced motion, narrow/large-text layouts and regression tests
are relevant. Validate all six categories in Light/Dark and generated/authored
captions; exercise filter draft/cancel/apply, browsing, edit/save/return and
private edit permissions. Capture Compact 360/390/430, 320 reflow, Expanded,
Light/Dark and reduced-motion evidence using synthetic content.
