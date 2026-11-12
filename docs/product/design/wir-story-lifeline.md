# Wir story lifeline (#1770)

Status: implemented with the Product Owner decision of 2026-11-12.

## Decision trail

- The Product Owner asked to redesign the Wir shared story summary
  (`m5s5.dashboard.storySummaryTitle`). It was the only purely numerical block
  on Wir: a large total, a stacked bar and three rows.
- **Binding constraint:** nothing may be duplicated on Wir. `Euer Moment`
  (`keepsake`) and the monthly mosaic (`monthly_highlights`) already show
  photos.
- **Direction A** (first memory, heart moment and milestone with photos) was
  withdrawn. It never changes, so it adds no lasting value.
- **Direction C, the relationship lifeline, was chosen** over a slim text line
  (B).
- **Numbers must add up.** The caption names one total, and the legend names
  exactly the three parts of that total. A total mixed with a single part
  (total plus milestones) is not allowed.

Visual preflight and alternatives are in #1770 and on the branch
`design/wir-story-summary-reference`.

## Composition

- The section heading stays outside the content (PO addendum #1508), followed
  by a quiet caption, `m5s5.dashboard.storyLifelineCaption`: the total since
  the start month. The year is added when the start lies in another year.
- **The band** runs from the start (left) to today (right). Each column holds
  one period's dots, stacked bottom to top: memories, heart moments, then
  milestones as larger hollow rings that read as landmarks.
- **Axis:** month labels below, plus `m5s5.dashboard.storyLifelineToday` at
  the end.
- **Legend:** the three counts as links into the filtered timeline. Only
  types with entries appear. Their sum always equals the caption total,
  because both come from the same response.
- **Column unit:** weeks up to 40 columns, then months, then quarters. When
  the busiest column exceeds the band height (6 dots), every dot stands for
  the same number of entries; each present type keeps at least one dot, and
  memories give way first.
- **Hint:** `m5s5.dashboard.storyLifelineHint` shows until the first
  interaction, remembered per device.

## Interaction

- **Scrub:** a horizontal drag scrubs the band; vertical swipes keep
  scrolling the page (`touch-action: pan-y`). The current column is
  emphasized and the other columns dim.
- **Preview:** an elevated card above the band shows the period's entry
  (photo when it is a Memory with a ready cover, otherwise the type glyph),
  its date and the period's entry count. It opens that entry. The card stays
  after release until the user taps elsewhere or presses Escape.
- **Keyboard and assistive technology:** the band is one `slider`.
  - Arrow keys, Home and End move between periods; Enter opens the preview's
    entry.
  - `aria-valuetext` gives the period, entry count and title
    (`m5s5.dashboard.storyLifelineValue`).
- **Motion:** the preview fades in with `--duration-feedback`; dots scale on
  the current column. Reduced motion removes both.

## States

- **Visibility:** the block shows only with the existing Pro
  `relationship.passport` Wir statistics opt-in (personal, off by default).
- **Loading, error or offline:** the caption and legend use the Dashboard
  totals until the lifeline arrives, so no empty frame or spinner appears.
- **Sparse:** fewer than 5 entries or less than 6 weeks of history shows the
  caption and legend without a band.
- **Empty:** shows `m5s5.dashboard.storyLifelineEmpty`.
- **Sensitive covers:** keep the shared sensitive-media treatment in the
  preview.

## Data

`GET /api/v1/spaces/{spaceId}/story-lifeline` (`getStoryLifeline`):

- **Access:** requires `relationship.passport` before reading.
- **Shared set only:** buckets the same `shared_only` Story set as the
  Dashboard totals by calendar week (starting Monday), up to the viewer's
  local today. Private HeartMoments, other Spaces and future-dated entries
  never appear.
- **Week preview entry:** each non-empty week carries one entry, its latest
  Memory first, for the preview.
- **Relationship start:** returned only when the couple shows its relationship
  duration.
- **Media:** preview media load lazily through the existing authorized
  delivery.

## Evidence

Compact at 390 px in Light and Dark, the preview, 320 px with 200% text, and
Expanded at 1280 px Dark:
[evidence/wir-story-lifeline](evidence/wir-story-lifeline/).
