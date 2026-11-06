# Contextual creation in Moments and partner actions

Owning issue: [#1679](https://github.com/baerenmarke90/eimir/issues/1679).

## Pre-implementation reference

Baseline: `aa62b721aafcb6fd56d4176f46f9f0dcda07d578` (fetched main, 2026-11-06).
Both images were generated with the built-in Imagegen tool before UI code.
The exact prompts are in [reference-prompts.md](reference-prompts.md).

- [Moments composition](moments-reference.png): actual main diary screenshot at
  390 × 844, with a local create action and its three-choice sheet.
- [Partner actions composition](partner-reference.png): PO screenshot, checked
  against main's `PartnerQuickActions`, with rounded rows and the existing
  one-time-message capture destination. The reference substitutes synthetic
  names and avatar artwork; no real couple photo is committed.

Reviewed `StoryProductPage`, `MemoryMapPage`, `StoryViewTabs`,
`SharedPlanningOverviewPage`, `QuickCreateMenu`, `PartnerQuickActions`,
`TodayPage`, `ShortTaskSheet`, `TaskOriginProvider`, canonical capture routes,
current tokens and the feature matrix. Main's unchanged 390 px diary reference
journey passed before the images were generated.

These are composition references, not pixel locks. Runtime uses shared dialog
modality, navigation-safe exit and existing icons. The first image's rendered
navigation under the sheet is illustrative; the real modal makes the entire
background inert. Portraits and authored content retain their current priority.

## Mobile interaction contract

Authority: Product Reference v1 principles 2, 4, 5 and 8; R1 capture, R2 Moments
and R4 Wir; Story Timeline, Discovery, Create/Edit and existing contextual
partner-action patterns.

### Moments

One quiet `Moment hinzufügen` action follows the existing Erinnerungen,
Tagebuch and Karte tabs. Only activation reveals Erinnerung, Herzmoment and
Meilenstein, with existing destination icons and canonical focused capture
routes. No helper paragraph, input or keyboard appears on this choice surface.
The existing memory-only empty-state CTA is replaced by the common action.
Loading, empty, filtered-empty, errors, offline and the Pro map gate do not hide
the Core create entry.

The sheet closes through `closeForNavigation` before the task captures the
current origin. Existing task lifecycle owns dirty/pending exits, validation,
media, privacy, offline feedback and the actual saved result. Return restores
the original view, visible scope and position, including map place selection.

### Partner actions

The PO's follow-up adds `Nur für dich` to the existing menu opened from the
couple/partner avatar. This opens the canonical one-time-message composer,
without sending, enabling reception or changing consent. Preserve the three
existing gestures, cooldowns, pending ownership and entitlement behavior. The
one-time entry remains discoverable independently of the extended-gesture
capability request. It carries the existing Pro and single-view meaning.
Opening another task is blocked while a gesture is in flight.

Use the defined `--radius-large` token for action rows. The previous
`--radius-control` reference has no definition in the runtime adapter and
therefore rendered square. Remove redundant introductory/gesture descriptions;
retain cooldown, privacy, single-view and failure/recovery copy.

### Shared behavior and acceptance

Compact reuses `ShortTaskSheet`; Expanded Moments uses its centered dialog and
partner actions retain their existing anchored popover. Use native buttons/links,
named surfaces, focus restoration, visible focus, wrapped labels and product
touch targets. Preserve view meaning across resize and 320 px / large text.
No new motion: reuse existing press, overlay enter/exit and reduced-motion roles.
No new celebratory layer is needed around authored content.

One partner can initiate these tasks alone. The existing one-time reception
consent is still bilateral and cannot be inferred from opening its composer.
No private previews, counts, inferred audience, draft persistence, analytics,
backend/API/schema, quota or provider changes.

Business/freemium: Memory, HeartMoment and Milestone creation remain Free/Core.
One-time sending retains Pro / existing consent, reception, deletion and retained
data rights. Existing Cloud/Self-Hosted behavior and resource limits are unchanged.
No matrix reclassification is required.

Reuse review: three permanent create actions and the complete global menu were
considered. A bounded local choice best fits Moments. Reuse existing sheets,
icons, type labels, capture destinations, origin metadata and one-time composer.
No new dependency or custom overlay engine.

## Validation and evidence

Planned: target scope and navigation, all originating views, normal and dirty
cancellation, actual save/result/return with filters, map place retention,
global-plus regression, partner one-time handoff without a send, pending gesture
guard, successful existing gestures, Light/Dark, Compact/Expanded, reduced motion,
320 px / large text, axe, and the browser ownership inventory.
Final revision-bound results and screenshots will be recorded below.
