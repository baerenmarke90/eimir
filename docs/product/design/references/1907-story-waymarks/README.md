# #1907 F1 – Waymarks on the story overview

Generated visual reference for umbrella issue #1907, slice F1 ("Eure Geschichte"
gets more meaningful milestones). Baseline: `main` `5854be4dd` (2026-11-15).

## How it was composed

The real `/story/our-story` route (`RelationshipStoryPage` with
`RelationshipPassport`) was rendered by the Web E2E harness with the mocked API
of `relationship-reflections.spec.ts` (start 17 June 2023, 1,230 days together,
shared counts, lifeline). The proposal was then inserted into that DOM only:
one extra row in the existing "next chapter" list (`passport.nextChapter`) and
a new section after it, styled with existing semantic tokens. Header,
identity line, next-chapter cards, counts, lifeline, chapters, links and
navigation are the current product as it is. Titles, dates and names are
synthetic.

| File | State |
|---|---|
| `00-before-390-light.jpg` | Current page, 390 px Light |
| `01-390-light.jpg` | Proposal, 390 px Light |
| `02-390-dark.jpg` | Proposal, 390 px Dark |
| `03-360-light-large.jpg` | Proposal, 360 px Light, 200 % text |
| `04-390-light-expanded.jpg` | All waymarks expanded, 390 px Light |

## Product Owner selection (2026-11-15)

Chosen: **round day counts** and **"one year since …" anniversaries of the
couple's own authored milestones**; reached ones appear in **a new section**.
Not chosen: Nth shared memory, Nth shared place. Not feasible without new
stored data and therefore not proposed for building: 10th country or city,
first shared home, longest long-distance phase. First shared photo belongs to
#1860.

## Proposal

- **Round day counts.** 100, 200, 500 and 1,000 days, then every 1,000
  days up to 10,000 (decided 2026-11-16, see below). The next one stays the
  single round-day card in "next chapter".
- **"One year since …".** Each authored Milestone has a yearly anniversary
  ("1 Jahr seit …", "2 Jahre seit …", quoted title). The nearest upcoming one
  joins "next chapter" as one more card, sorted with the others by days
  remaining; 29 February falls on 28 February in other years.
- **New section, working title "Eure Wegmarken"**, directly after "next
  chapter": the reached round days, relationship anniversaries and Milestone
  anniversaries, newest first, as a quiet thread inside one raised card: the
  newest has a filled dot, older ones a ring. Four are shown; a text button
  ("Alle 17 Wegmarken anzeigen") expands the list in place and collapses it
  again. Milestone anniversaries open their Milestone; the other rows are
  plain text. Relationship anniversaries are included only when they are
  meaningful (see the decision below).
- **Data.** Derived in the client, no new stored state or endpoint: the
  relationship start and server-anchored day count from the existing passport
  read, and the existing Milestones list. Milestones are always shared, so both
  partners see the same waymarks. Date-only arithmetic in UTC, anchored to the
  server's day count, never the device time zone.
- **States.** No relationship start: no day counts or relationship
  anniversaries; Milestone anniversaries still appear. Nothing reached yet: the
  section is omitted (no empty state, no zero). Milestones loading or failing:
  the section shows what the passport read already gives and never blocks the
  page. Free: the whole overview stays behind the existing Pro entry.
- **Motion.** Expanding grows the list (height and opacity,
  `--duration-context`, `--easing-enter`); collapsing returns focus to the
  button. Nothing pulses, loops or celebrates. Reduced motion: the rows simply
  appear.
- **Accessibility.** An ordered list with `<time>` values; the button carries
  `aria-expanded` and names the count; large text wraps titles instead of
  truncating them.
- **Not included.** Badges, confetti, notifications, a score or streak, a
  separate Discover/Wir tile, storing waymarks.

## Product Owner decisions (2026-11-16)

- Implementation approved by the Product Owner.
- **Relationship anniversaries** belong in the thread, but only the meaningful
  ones: the 1st, then every 5th (1, 5, 10, 15 …). Not every year. The next
  anniversary stays in "next chapter" as before.

## Implementation notes

- Baseline for the implementation: `main` `1ccac0407`. The story overview
  route, `RelationshipPassport` and its styles are unchanged since the
  reference baseline `67dbb6b69`.
- The reference showed a "Noch 56 Tage" card for "1 Jahr seit …" and the
  thread inside one raised card; both are implemented as drawn. The filled
  and ring dots use the brand text token so they stay visible in Dark.
- With no relationship start there is no server-anchored day, so the device's
  UTC calendar date anchors Milestone anniversaries in the thread; the
  "next chapter" list stays hidden in that state, as before.
- Browser evidence: `web/e2e/tests/story-waymarks.spec.ts` writes
  `story-waymarks-*.png` for 390 Light/Dark, 360 at 200 % text, Expanded,
  the expanded thread and the omitted state.

## Round days narrowed (2026-11-16)

The Product Owner asked for fewer round days after the first implementation:
not every hundredth day and no repdigits. The series is **100, 200, 500,
1,000, then every 1,000 days up to 10,000**. The reference images above
still show the earlier series (for example 1,111 and 1,500) and are kept as the
composition reference only.
