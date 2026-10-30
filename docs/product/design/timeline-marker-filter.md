# Timeline marker and filter correction

## Scope and design review before implementation

Product Owner follow-up on 2026-10-30: center the chronology markers vertically
beside their corresponding cards and replace the sliders glyph with a familiar
funnel filter. Baseline main: `daf8783fde32c53ff72a03bf02e2ebad6ef92417`.

This is a bounded alignment/icon correction to existing controls, not a new or
materially changed feature, screen composition or interaction. It retains the
[existing generated whole-screen reference and interaction contract](journal-category-edit-polish.md).
The new owner direction supersedes that record's sliders choice and the existing
fixed top offsets. No new generated concept is needed for these two corrections.

Product Reference v1/R2 and the Story Timeline template apply. Preserve content
hierarchy, card widths, emotion colors, red HeartMoment shape, milestone shape,
month grouping, visible browsing, applied scope and the existing filter sheet.
Use percentage-based marker alignment so photo, text and tall HeartMoment cards
remain centered after reflow or media loading. The decorative spine connects
actual marker centers, including first/last and single-entry groups.

Reuse the existing inline SVG, button semantics, accessible filter name,
tooltip, active-count badge, native sheet focus and Apply/Cancel behavior.
Compact, Expanded, large text and Light/Dark use the same correction; no new
motion, typing, permission, cache, request or storage is introduced. Existing
loading/empty/error/offline/success and detail/Back contracts stay unchanged.

No business/freemium impact: Timeline/filtering and HeartMoments stay Free/Core;
accessibility/privacy remain non-paywallable. No entitlement, ownership,
Cloud/Self-Hosted, quota, cost, downgrade, retention or data change.
Reuse review not relevant to new infrastructure: native CSS/SVG and existing
components suffice; no dependency, provider or custom gesture is introduced.
The relevant cross-cutting checks are reflow, contrast, semantics/focus and
unchanged filter/return behavior. No API/migration/security boundary changes.

## Validation

- 12 existing Story hierarchy/filter component tests passed.
- All 23 existing Timeline reference/hierarchy browser cases and four Diary
  category/theme cases have passing results. These cover filter draft/apply,
  detail navigation, sparse/dense cards, sticky month context, keyboard/axe,
  320 px reflow, 200% text, Compact and Expanded.
- Two initial local detail cases encountered a blank development page before
  Timeline loaded. Both passed unchanged in the targeted repeat; no timeout,
  assertion or product behavior was relaxed to obtain that result.
- Production build (including TypeScript and token/PWA checks), scoped Biome
  checks, engineering-language audit and whitespace checks passed. No new
  dependency, API contract or native capability needs device acceptance.
- Visually reviewed centered hearts/dots, the first/last spine endpoints,
  unchanged emotion colors and the funnel in both themes. Images use synthetic
  fixtures rather than the Product Owner's personal attachments.

| View | Browser evidence |
| --- | --- |
| Compact Light | [360 px](references/timeline-marker-filter/diary-360-light.png), [430 px](references/timeline-marker-filter/diary-430-light.png) |
| Compact Dark | [390 px](references/timeline-marker-filter/diary-390-dark.png) |
| Expanded Dark | [1280 px](references/timeline-marker-filter/diary-1280-dark.png) |

## CI geometry-check alignment

The first CI revision `c4d1bbb1` passed the full Web suite and browser shards
1/2/4, but shard 3 found an existing geometry assertion still measuring the
removed list-level pseudo-element. Its `left: auto` produced `NaN` on both
automatic attempts. The existing check now measures each entry's actual rail
and retains the one-pixel horizontal tolerance. It additionally checks vertical
centering against that entry's card with the same tolerance. All remaining
open/edit/Place/link/return, accessibility and request assertions are retained.

All seven cases in `product-consistency.spec.ts` pass locally, including
390 Light, 430 Dark, 1280 Light and 320 Dark at 200% text. Scoped lint/format
and whitespace checks pass. This test correction requires a new commit and
fresh CI; the failed job was not manually retried. The rendered UI and the
linked visual evidence still describe the runtime source `c4d1bbb1`.
