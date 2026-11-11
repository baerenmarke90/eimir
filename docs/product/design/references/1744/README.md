# Immersive relationship recaps (#1744)

[Owning issue, findings and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/1744).
Product Owner review of 2026-11-11: the shipped monthly/yearly recaps (#1528, #1542)
were too thin for a Pro capability. This slice covers content volume and the reader.
The local model is unchanged; its editorial rework is Phase 2 of the issue.

## Design preflight

The initial demo reviewed `main@1ff8f25aa`. For the generated reference, the
baseline was `main@e0c4d842f34688470580f6a581cb3adeda5914ae`. The review covered
the More library at `/more/passport`, its Months and Years tabs, featured cover,
archive, and context disclosures. It also covered the focused reader's Back and
progress controls, canonical source links and return, selection, reflection,
retention, and the Wir monthly invitation.

![Generated Compact reference for the library, cover, photo and closing scenes](compact-reference.png)

ImageGen created this synthetic design board for eimir. during merge preparation
after the first demo. It uses the existing eimir. screens and synthetic lake
imagery as guidance. The [generation prompts](prompt.txt) and the
[project asset terms](../../../../../PROVENANCE.md#assets) record its provenance.
The facts scene and the browser controls appear in the runtime evidence below.

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
- **Toggle on the stage (PO, 2026-11-11):** the play/pause control sits centred
  on the stage and fades while playing. Photo scenes centre it above the caption
  so large text stays readable. On text-only scenes it covers part of the text
  while paused, as accepted by the PO. The closing scene places it in the control
  row because its own actions occupy the stage.
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

The [360 px reader](evidence/recaps-playback-360-dark-large-reduced.png) shows
Dark, 200% text and reduced motion. The browser-emulated native-container
journey uses touch input to test two quick taps and a swipe. Android device
acceptance is outside this evidence.

## Business/freemium and cross-cutting

Business/freemium impact reviewed: unchanged row "Relationship passport and
automatic recaps (#497, #1528)" — Premium composition, Free retained artifacts,
capability `relationship.passport`. No tier, provider or Self-Hosted change.
The contract change is additive and needs no migration. One read-time query
groups the same authorized shared metadata used by the selection by kind and
day. Counts, active days and the leading month use the same read snapshot.
Deleted or privately reclassified sources leave the counts on the next read.
