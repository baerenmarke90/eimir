# Occasion mark on memories (#1907 F2)

## Generated visual reference (before implementation)

Composed on the real Moments timeline (`/story?tab=timeline`) and memory
detail routes of `main` `40eca3333` (e2e harness with the mocked story
timeline fixture, DOM only, nothing saved). Fixture: relationship start
2023-06-17, partner birthday 1994-05-12, reduced motion.

- `00-before-timeline-390-light.jpg`, `10-before-detail-390-light.jpg`:
  current state without a mark.
- `01-timeline-390-light.jpg`, `02-timeline-390-dark.jpg`,
  `03-timeline-360-light-large.jpg` (200 % root font size): a memory dated on
  the third anniversary carries one quiet line between title and the
  date/place footer.
- `04-timeline-birthday-390-light.jpg`: a memory on the partner's birthday.
- `11-detail-390-light.jpg`, `12-detail-390-dark.jpg`,
  `13-detail-360-light-large.jpg`: the same line in the detail, below date
  and place.

Kept unchanged: segmented Moments views, month headings, filter, Timeline
nodes, card photo/title/footer (date, place, media count, comments), the
floating create action, the detail header with Back/Edit, the gallery, body
text, comments and the bottom navigation.

The line reuses the existing icon grammar (`jahrestag`, `geburtstag`,
`highlights`) and supporting-copy typography; it is real text and part of the
card's accessible description. Copy in the images is a proposal, not final.

## Motion (described, not captured)

When a marked card first enters the viewport (once per item per visit), the
icon's accent stroke gives one soft pulse and the line fades in
(`--duration-context`, `--easing-enter`, opacity plus at most 2 px of
movement). It never loops and never delays reading or interaction. With
reduced motion the line is simply present, without movement, with the same
text and semantics.

## Product Owner decision (2026-11-15)

Approved with one change: birthdays and other dates of related people are not
marked, because a date match alone does not mean the moment concerns that
person. A deliberate memory–person link is parked in #1918. The partner's
birthday shown in `04-timeline-birthday-390-light.jpg` remains in scope.

## Implementation evidence

Captured by `web/e2e/tests/occasion-memory-mark.spec.ts` with
`OCCASION_MARK_EVIDENCE=1` (reduced motion, animations disabled):

- `20-impl-timeline-390-light.jpg`: anniversary and partner birthday on the
  Timeline; a private date and a person-linked date on the hike's day leave
  that card unmarked.
- `21-impl-detail-390-light.jpg`: the same line in the memory detail.
- `22-impl-timeline-390-dark.jpg`, `22-impl-timeline-360-light-large.jpg`
  (200 % root font size, the line wraps), `22-impl-timeline-1280-light.jpg`
  (Expanded, same card system).
