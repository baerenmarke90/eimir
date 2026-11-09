# Free composer — approved composition and preservation contract

Owner: [#1715](https://github.com/baerenmarke90/eimir/issues/1715). The Product
Owner approved implementation on 2026-11-09 after reviewing the interactive
composition and correcting omitted existing media/tag behavior.

## Baseline and reference provenance

Reviewed main: `559c0f46bcc3757a44ce06c99a21e72091840ccd`, including #1712.
Reviewed MemoryCreatePage, HeartMomentProductPage, PlanningCreatePage,
StoryFormPageShell, StoryDetailPageShell, AttachmentDraftPicker,
PlanPhotosEditor, PhotoDraftGallery/PhotoDraftSorting, MediaGallery/ZoomablePhoto,
ContextTagEditor, VoiceNoteEditor and PlanScheduleFields. #1714 is an independent
video-preparation dependency; reconcile its merged state before final validation.

![Generated Compact composition](compact-reference.png)

Generated with the built-in Imagegen tool before runtime implementation. Inputs
were the approved interactive Memory Light, HeartMoment Dark and Plan Light
compositions, using synthetic repository demo photographs. This generated image
is a design reference, not a product screenshot or runtime asset. No private
couple content, old-application source, or external stock asset was imported.

The owning issue records the Mobile Interaction Contract, existing-function
inventory, reuse/business/cross-cutting reviews and validation plan. This
document records the stable design decision and implementation evidence; it is
not a second project-status source.

## Product Owner decisions

- Use the current eimir. palette, self-hosted typography, material depth, glyphs
  and labeled canonical-blue AddAction controls. Warmth comes from composition
  and personal content; do not create a replacement identity.
- Keep title and authored text/description visibly framed. This later explicit
  decision creates a scoped authored-field role; ordinary utility controls keep
  the existing borderless role. It supersedes #1574 only for these authored
  fields, not for the whole application.
- Author before selecting media: Memory title/body; HeartMoment thought and
  compact feeling; Plan title and visible note. No invented HeartMoment title.
  Dates/periods remain compact and retain their actual domain semantics.
- Plan note precedes shared Lists. Existing selection, creation and links remain.
- Present one shared media composition with meaningful preview, native swiping,
  whole-image viewing, zoom/pan, ordered thumbnails and real source intake.
  Keep sensitivity at a stable top-right position and cover selection explicit.
- Tags remain individual selectable/removable chips. Optional enrichment may be
  disclosed, while selected state, privacy, errors and consequences stay visible.
- Preserve the current save, upload, authorization, draft, resource and return
  owners. Presentation must not recreate these lifecycles or unmount hidden
  form fields. Keep read, compose and edit distinct.
- Apply the same visual grammar to the other capture/edit tasks, preserving
  their different domain and privacy contracts. Detail pages use their actual
  content and useful contextual actions without blank hero slots or filler.

## Generation prompt

Use case: ui-mockup. Generate one faithful, high-fidelity three-column Compact
composition of the approved eimir. Memory Light, HeartMoment Dark and Plan Light
task pages. Preserve pale-periwinkle page/surface materials, dark-blue content,
canonical-blue labeled pill Add controls, Instrument Sans and selective Literata.
Show framed optional Memory title/body before media; HeartMoment date, framed
thought and compact Geliebt choice before photos/video/audio; Plan compact
schedule, framed title and Notiz before media, Place and shared Lists. Show
meaningful imagery, expand, fixed top-right Sensibel, gallery count, explicit
cover, sortable thumbnails, Medien hinzufügen, individual Draußen/Wir zwei chips,
visible audience and one Speichern action. Keep the existing shell and product
meaning. Do not add dashboard fields, quotas, decorative romance, tutorial prose,
placeholder gaps or new navigation. Reference source and full acceptance scope
are recorded in #1715.

## Implementation evidence

Behavioral and visual evidence will be bound to the final tested revision in the
PR: actual create → saved detail → edit → return, draft/error/pending safety,
media/tag identity, pointer/touch gestures, Compact/Expanded, Light/Dark,
200% text and reduced motion. The generated reference is not that evidence.
