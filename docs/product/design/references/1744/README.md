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
- **Earlier periods arrive by themselves:** every month and year with shared
  material is prepared without a request. The server requests the current periods
  at once and earlier ones newest-first in batches of six, continued every two
  minutes by one queued job per Space and by the six-hourly scan. A long history
  therefore never occupies the worker or the single local inference slot. Until
  its edition exists, a period is a quiet, non-interactive cover in the shelf;
  the per-period "compile" buttons are gone. The library re-reads at a calm
  cadence while such covers remain.

- **Automatic retention (PO, 2026-11-11):** a completed month or year is retained
  by the server seven days after it ends; the manual "keep edition" step and its
  confirmation sheet are gone. The grace week lets late entries and a changed
  selection still count. An automatic proposal that still describes a partial
  period is recomposed over the whole period first; a selection the couple made
  is kept as it is. Only the default variant of a period without a retained
  edition is finalised, and only while the Space holds `relationship.passport`.
  After retention the selection and generated wording are frozen, while own words
  can still be drafted, shared and withdrawn. This supersedes the earlier rule
  that a retained edition accepts no new words. Covers of completed periods read
  "completed period"; the "kept" mark remains only on earlier manual snapshots of
  a running period. `POST .../save` stays in the contract for older clients.

- **Wording resilience (Phase 2, model unchanged):** a narration the editorial
  checks reject gets one retry that names the broken rule; the rejected draft is
  not sent back, and transport failures are not retried. When a source of an
  unretained automatic proposal changes, its prose is still scrubbed at once and
  one rewrite is queued ten minutes later, so several edits cost one inference.
  Retained and curated editions keep the factual template.

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
| Library, periods in preparation | [390](evidence/recaps-immersive-library-preparing-390-light.png) | [390](evidence/recaps-immersive-library-preparing-390-dark.png) | |
| Retained edition, closing scene | [390](evidence/recaps-immersive-retained-closing-390-light.png) | | |
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
Automatic preparation of earlier periods stays behind `relationship.passport`:
it stops when the capability lapses and never changes what a retained edition
shows. It adds no table, column or contract field; `periods` in the overview now
lists only periods that still have no edition.

Automatic retention changes no tier: the matrix already keeps every created
edition readable after expiry. It replaces a manual Pro action with a scheduled
one and lets words be added to retained editions under the existing rules (new
words need the capability; own existing words stay editable and withdrawable).
The matrix row records this.

## Rhythm scene "Gute Tage zusammen" (#1744)

The scene follows the counted facts and shows how many days **both** partners marked a good day (`VERY_GOOD` or `GOOD`), per week for a month and per month for a year (backend contract in #1783). It appears only when the edition carries the frozen rhythm and at least three good days were counted; otherwise no scene is added. It is the fourth panel of the [generated Compact reference](own-words-compact-reference.png) (baseline `main@ba3bd390d`).

- Quiet vertical bars sized relative to the strongest bucket, the strictly leading bucket in the cobalt tone, the others in a pale tint, a thin line for zero. No line, axis, score, percentage or emoji.
- Every bucket has a visible label and count plus a screen-reader text ("3 gute Tage"); the bars are decorative. The columns share one grid so labels and counts align even when text wraps.
- It is text-led, so the play toggle sits below the copy like on the facts scene. Reduced motion changes nothing; no motion was added.
- Runtime captures from `automatic-recaps.spec.ts` (390 Light, 430 Dark, 1280 Dark, axe and overflow checks): `evidence/recaps-rhythm-*`.
- Not performed: large-text capture, a year edition capture (12 buckets), and Android device acceptance.

