# Immersive relationship recaps (#1744)

[Owning issue, findings and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/1744).
Product Owner review of 2026-11-11: the shipped monthly/yearly recaps (#1528, #1542)
were too thin for a Pro capability. This slice covers content volume and the reader.
The local model is unchanged; its editorial rework is Phase 2 of the issue.

## Design preflight

Baseline main: `1ff8f25aa`. Reviewed: the recap library and reader, their tasks,
the Wir monthly invitation, the focused-task shell mode, `useStoryPlayback`, the
authorized media loader and [the previous contract](../../automatic-relationship-recaps.md).

**Outstanding gate:** the required generated Compact visual reference does not exist.
No image-generation tool was available when this work started, and the Product Owner
asked for a working demo to judge the direction. The reference must be added to the
issue before this change is merged.

Product Reference v1 R2/R4/R5 governs. Reused: focused-task shell, `TaskBackButton`,
`MemoryPreview` with the authorized media lifecycle, `ShortTaskSheet` tasks,
`useStoryPlayback`, semantic surface, scrim, typography and motion tokens.
No new dependency or provider.

## What changed

- **Volume:** up to 8 highlights per month and 24 per year, still balanced across
  time, kinds and chapters. Manual selection allows 24. The wording model reads an
  evenly spread sample of at most 8 sources.
- **Counted facts:** the read contract gains `facts` with shared entries per kind,
  days with entries and, for a year, the strictly leading month. Only countable,
  authorized shared data; no presence, mood or relationship claims (#473 section 3).
  The scene appears from three counted entries.
- **Typed scenes:** photo-mosaic cover, facts, full-bleed photo with a legibility
  scrim, words for shared heart moments, emblem for milestones and chapters, and
  the unchanged closing scene with the couple's own words.
- **Playback like a photo memory (PO, 2026-11-11):** it starts on open and resumes on
  the restored page after a source. Tap right/left, horizontal swipe and arrow keys
  turn pages without pausing; a held finger pauses. It ends on the closing scene and
  never loops. This supersedes the earlier rule that a source return stays paused.
- **Toggle on the stage (PO, 2026-11-11):** the play/pause control sits centred on
  the stage and fades while playing. On text-only scenes it covers part of the text
  while paused; the PO accepted this. The closing scene keeps it in the control row
  because its own actions occupy the stage.
- **Browser-only arrows (PO, 2026-11-11):** Previous/Next are painted only in the
  browser. The native app decides by runtime platform, not viewport, and keeps both
  controls for assistive technology.
- **Library:** older editions form a two-column cover shelf; the featured cover has
  one action.

## States, motion and accessibility

Reduced motion keeps the reader paused on open and removes scene, drift and stagger
animation; state and focus are unchanged. Pending, paused, empty, error, offline,
downgrade and source-invalidation behavior is unchanged. Sensitive previews stay
behind reveal. Media uses the original variant in the reader and thumbnails in
small covers. All new copy is localized in German and English.

## Evidence

Synthetic fixtures only; the four additional photos are crops and color variants of
the existing lake fixture. Captured from `web/e2e/tests/automatic-recaps.spec.ts`.

| State | Compact light | Compact dark | Expanded dark |
| --- | --- | --- | --- |
| Library | [390](evidence/recaps-immersive-library-390-light.png) | | [1280](evidence/recaps-immersive-library-1280-dark.png) |
| Cover | [390](evidence/recaps-immersive-cover-390-light.png) | [430](evidence/recaps-immersive-cover-430-dark.png) | [1280](evidence/recaps-immersive-cover-1280-dark.png) |
| Facts | [390](evidence/recaps-immersive-facts-390-light.png) | [430](evidence/recaps-immersive-facts-430-dark.png) | |
| Photo | [390](evidence/recaps-immersive-photo-390-light.png) | [430](evidence/recaps-immersive-photo-430-dark.png) | [1280](evidence/recaps-immersive-photo-1280-dark.png) |
| Words | [390](evidence/recaps-immersive-words-390-light.png) | | |
| Milestone | [390](evidence/recaps-immersive-milestone-390-light.png) | | |
| Closing | [390](evidence/recaps-immersive-closing-390-light.png) | | |
| Native container | [cover](evidence/recaps-immersive-native-cover-390-light.png), [photo](evidence/recaps-immersive-native-photo-390-light.png) | | |
| Large text | [390](evidence/recaps-immersive-large-text-390.png) | | |

The native-container captures are browser-emulated. No Android device acceptance
has been performed.

## Business/freemium and cross-cutting

Business/freemium impact reviewed: unchanged row "Relationship passport and
automatic recaps (#497, #1528)" — Premium composition, Free retained artifacts,
capability `relationship.passport`. No tier, provider or Self-Hosted change.
The contract change is additive and needs no migration. Facts are counted at read
time from the same authorized shared metadata as the selection, so deleted or
privately re-classified sources leave the counts immediately.
