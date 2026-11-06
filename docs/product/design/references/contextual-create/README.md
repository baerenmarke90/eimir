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

The PO's follow-up adds the one-time-message composer to the menu opened from the
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

Implementation commit: `3af425d73145b71d7d3b2e5025bdb9c0a4382f04`.

- 65 browser cases pass across local creation, partner actions, global creation,
  journal/map continuity, actual one-time encryption/reveal and HeartMoment voice
  notes. After strengthening the large-text focus assertion, all nine local
  creation cases pass again on the recorded commit.
- Every moment type completes create → authoritative detail → original filtered
  diary, with one create request and restored trigger focus. Discover and selected
  map place survive cancellation. Dirty Memory exits preserve the draft until
  deliberate discard. The global plus retains its nine targets.
- The new Core action remains available with empty history, load errors, offline
  state and the Pro map gate. German/English labels, Escape/browser Back, bounded
  SVG dimensions, all three choices and 320 px / 200% text focus visibility pass.
- Partner one-time entry works at 360/390/430/1280 px without any gesture, send or
  reception mutation. It preserves the existing consent task and return focus.
  Defined rounded corners, retained privacy/consequence copy, in-flight gesture
  navigation exclusion, existing cooldowns, failure/retry, offline behavior and
  both responsive presentations pass. The entry survives an entitlement-read
  failure for the separate extended-gesture capability.
- Web production build (including token/legal/static-locale/PWA/type checks),
  changed-file Biome lint/format, 38 browser-planner regressions, the 101-spec
  ownership inventory, 27 engineering-language regressions, documentation and
  clean-source language audits, and status/whitespace checks pass.
- The impact planner selects all 101 retained specs (74 critical and 27 additional)
  because the changed bundled locale is a shared foundation. No always-run core
  expansion or weakened assertion is introduced.

Screenshots below use only synthetic browser fixtures. Light/Dark, Compact and
Expanded were visually inspected; axe WCAG 2.2 AA checks pass in the affected
choice surfaces. Reduced-motion behavior reuses the existing modal lifecycle.
No Capacitor wrapper or native capability changed; no new APK or live audio
activation is claimed.

| Surface | Representative evidence |
| --- | --- |
| Local action | [360 Light](evidence/moments-local-360-light.png), [390 Dark](evidence/moments-local-390-dark.png), [430 Light](evidence/moments-local-430-light.png), [1280 Dark](evidence/moments-local-1280-dark.png) |
| Three-choice sheet | [360 Light](evidence/moments-choice-360-light.png), [390 Dark](evidence/moments-choice-390-dark.png), [430 Light](evidence/moments-choice-430-light.png), [1280 Dark](evidence/moments-choice-1280-dark.png), [320 large text](evidence/moments-choice-320-dark-large.png) |
| Rounded partner actions | [360 Light](evidence/partner-actions-360-light.png), [390 Light](evidence/partner-actions-390-light.png), [430 Dark](evidence/partner-actions-430-dark.png), [1280 Dark](evidence/partner-actions-1280-dark.png), [320 large text](evidence/partner-actions-320-dark-large.png) |

## Requested main / #1680 reconciliation

Before opening this PR, refreshed main remained at the inspected baseline.
[PR #1680](https://github.com/baerenmarke90/eimir/pull/1680), reviewed at head
`53a76c39cc080afc28b9a21ddd487b319f13dc0b`, changes only the private-channel
exporter, its Compose tests, operator environment example and runbook. There are
no overlapping paths, client/API changes or new UI rules, comments or reviews.
Its instance-local audio opt-in still controls the existing HeartMoment composer
through authenticated `audioProcessingEnabled`; the local entry reuses that
same composer and does not override processor availability. Voice-note browser
acceptance is included in the final adjacent-flow validation. Live audio
activation remains the operator-owned action described in #1680.
