# Occasion symbols

## Product design preflight

Reviewed main: `868b16a8419268e5664283e3c158ebfb5a5a1ef1`.
The Product Owner requests recognizable symbols immediately before occasion
names, with no additional type labels or descriptions. Keep the existing three
types: Birthday, Anniversary and Special day. Name day was explicitly declined.
Shared/private read presentation also uses symbols alone, with localized
accessible names; explicit audience choices in the editor retain their labels.

The [generated Compact reference](generated-reference.png) was produced with the
built-in Imagegen tool after reviewing current main, `/plan#dates`,
`PlanningOccasions`, `ImportantDatesPanel`, `PeopleProfiles.css`,
`ShortTaskSheet`, `EimirIcon`, the actual existing screen and semantic tokens.
It supersedes the earlier exploratory four-type composition. The input was the
repository's synthetic 390px occasion screenshot from #1712. This is design
preflight, not runtime evidence or a pixel lock.

### Mobile interaction contract

Authority: Product Reference v1 principles 4, 5, 7 and 9, R3 Planning and R5
utility, plus Plan Hub, Detail View and Create/Edit templates. The task is to
recognize an upcoming meaningful date, then read it; a chronological, unboxed
agenda supports scanning. Personal names/titles lead, followed by the date and
quiet repeat/audience context. Keep Plan/Wish/Occasion tabs, month grouping,
date blocks, trailing navigation cues and the filled AddActionButton.

Reuse the existing cake, anniversary ring and sparkle glyphs from EimirIcon,
its theme-aware identity roles, spacing, type, focus and motion tokens. No new
illustration library, color palette, occasion store or dependency is needed.
The symbols precede titles on the same line in overview and reader. The people
and lock audience symbols remain distinguishable without color. Localized
accessible names retain type and audience meaning without extra visible copy.

Compact is normative: preserve readable wrapping at 320/360/390/430px and large
text; no horizontal discovery or early keyboard. Opening a date still uses the
existing reader sheet; Edit opens the same focused editor, Save shows the real
saved result, and Back restores the originating context and focus. Expanded
uses the same hierarchy and bounded sheet, without a new pane or extra controls.
One partner can complete this task alone; no bilateral participation is added.

Loading, empty, error/retry, offline and save/pending/failure states keep their
existing semantics. Never represent a failed read as empty or a failed save as
success. Preserve independent important-date privacy, profile-derived birthdays
and the derived relationship anniversary. Do not duplicate these source records.
Keep the existing non-blocking press, sheet and save feedback; reduced motion
retains all information and focus without new animation. No additional romantic
microcopy is warranted for this compact recognition task.

### Reuse and business/freemium review

Reuse review relevant: existing EimirIcon symbols and native accessible semantics
are preferred to emoji, custom artwork or a third-party icon package. No new
provider, data flow, license obligation, credential, dependency or runtime cost.

No business/freemium impact: this improves basic date tracking on the Free/Core
side of the existing Mixed RelatedPerson/ImportantDate row. Entitlements, quotas,
automation, retained data/export, Cloud/Self-Hosted parity and ownership stay as
currently specified. No matrix reclassification is needed.

### Cross-cutting review and validation plan

Presentation only: no API, database, authorization, reminder, notification,
concurrency, retention, cache, telemetry or release changes. All names use the
existing localization resources; dates retain their locale-aware formatting.
Validate current affected component tests, typecheck/build, lint/format,
browser ownership/inventory and the full affected People/occasion journeys.
Capture and inspect Compact and Expanded, Light/Dark, reduced motion and large
text. Review Open -> interact -> save -> observe result -> return, draft safety,
profile birthday navigation and audience semantics. No native capability changes
or device-specific controls are introduced; an APK release is outside this PR.

## Generation provenance

Tool: built-in Imagegen; no CLI or external inference/provider integration.
Prompt: correct the current full Compact occasion screen; preserve navigation,
chronology, date markers, add action and authored names; use only three small
two-tone cake/ring/sparkle symbols immediately before titles, with no type-name
badge, description or name day; retain repeat text and use only people/lock
symbols for audience. Preserve the existing identity and all visible functions.

The [exact generation prompt](reference-prompt.txt) is retained with the reference.
Owning work record: [#1733](https://github.com/baerenmarke90/eimir/issues/1733).

## Runtime implementation evidence

Tested product revision: `714a0943f5fcd441af29a18cc2bd1b54fa576fa2`.
The subsequent evidence commit changes only documentation and captured images.

- [Compact Light agenda](evidence/occasions-390-light.png): all three stored and
  projected types use cake/ring/sparkle symbols immediately before titles.
  Audience uses people/lock symbols, with no extra visible label or description.
- [Expanded Dark reader](evidence/reader-1440-dark.png): long titles wrap, the
  same type symbol accompanies the title, and repeat/audience share quiet context.
- [200% Light editor](evidence/editor-200-percent-light.png) and
  [400% Dark editor](evidence/editor-400-percent-dark.png): explicit choices and
  reachable completion are preserved. The preceding agenda reflow is asserted.

Inspected Compact/Expanded screenshots against the generated reference. Existing
identity glyphs and tokens supply the final artwork; no generated bitmap ships
in the product. Profile-derived birthdays and the relationship anniversary use
their actual source type, without inferred label matching or duplicate records.

All 40 complete browser cases pass: five People/occasion journeys plus 35
cross-surface task-boundary cases. They cover explicit create/edit/save and the
actual resulting reader, profile birthday navigation and focus/return, dirty
Back, failures/pending/offline handling, Light/Dark, reduced motion,
320/360/390/430/1280px task variants, large text/reflow, small height and axe.
All 61 targeted component cases pass across ImportantDatesPanel (18),
PlanningOccasions (1), RelatedPeoplePage (21) and ShortTaskSheet (21). The
initial concurrent local run timed out on cold query/render work; reducing
contention and rerunning the affected file with unchanged timeouts passed.
No assertion, timeout, production behavior or CI protection was relaxed.

Production build (including TypeScript, tokens, localization, legal and PWA
checks), Web lint and formatting pass. Lint retains only existing warnings in
unrelated files. Browser inventory validates all 104 specs; 17 planning/selection
regressions pass. Existing ownership roots already cover the changed production
entry points, so neither browser map nor the always-run core was altered.
The validated planner conservatively selects all 104 retained specs
(77 critical, 27 additional) because the new generated reference is an unmapped
presentation asset. Hosted checks on the final PR head remain authoritative.
No native capability, Android package or published release is changed.
