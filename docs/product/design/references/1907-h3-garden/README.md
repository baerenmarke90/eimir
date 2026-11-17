# Our garden (#1907 H3, concept A)

## Product Owner decision and baseline

On 2026-11-16 the Product Owner approved concept A of the apart-game proposal,
"Unser Garten", after several rounds in a clickable prototype ("Ja, freigeben").
The approved scope, the PR split and the quoted decisions are recorded in the
#1907 H3 sub-bullet. Decisions that shape this reference:

- Premium under the existing `games.couple`; one new notification kind (a seed
  arrived); delivery in three PRs (core, presentation, growth and life).
- Optional words on a seed are called `liebe Worte` ("Liebe Worte passt"), are
  offered only when the partners are further apart than `NEARBY` or distance is
  not shared, are collapsed for the sender without a "Freiwillig" label, and
  arrive as a folded card.
- A pause of both lets the garden sleep and wake up gently; nothing is lost
  (the Product Owner approved the proposal enthusiastically). Delivered in PR 2.
- The garden stays continuously animated while it is open ("so bleibt er
  lebhaft"): a deliberate, Product Owner approved exception to the default of
  one-shot motion. Reduced motion stops all of it.
- Organic illustrations without bare circles or corners.

Reviewed baseline: `main` `4097cecad`. Reviewed owner: the Games shelf under
More (`GamesProductArea` with `games.entries.moments`, `games.entries.wishes`,
`games.entries.perspective`) and the existing game pages. The garden joins the
shelf as one more entry with the same card grammar, status chip and Premium
behaviour; the existing entries are unchanged. The sibling H3 games (picture
ping-pong, heart hide-and-seek) add their own entries in their own PRs.

## Visual reference

Compact 390 px captures of the approved prototype, Light and Dark, with reduced
motion so the frames are stable:

| State | Light | Dark |
| --- | --- | --- |
| Choosing a seed with `liebe Worte` | [send](compact-390-light-1-send.png) | [send](compact-390-dark-1-send.png) |
| A seed arrives with a folded card | [receive](compact-390-light-2-receive.png) | [receive](compact-390-dark-2-receive.png) |
| Both were there today; a plant's story | [shared day](compact-390-light-3-shared-day.png) | [shared day](compact-390-dark-3-shared-day.png) |

![Choosing a seed, 390 px Light](compact-390-light-1-send.png)

The captures show the full vision. PR 1 (core) delivers the seed exchange, the
messenger flight, `liebe Worte`, planting, shared-day growth, a plant's story and
watering on the base meadow; lanterns, seasons, reunion and the sleeping garden
follow in PR 2, stages, more plants, unlocks, the garden book, bouquets, animals,
trees and the plane in PR 3.

## Mobile Interaction Contract

1. **Goal:** partners who are apart share a tiny daily ritual that makes their
   distance feel smaller: each sends the other a seed, and a garden grows from
   the days they were both there.
2. **Emotional value:** "you thought of me today"; a calm, living place that
   belongs to both. No score, no streak, nothing withers.
3. **Primary Compact state:** page title, the two partners with the messenger arc
   between them, the garden scene (focal point), one card with today's step.
4. **Dominant action:** one filled button per state: `Samen losschicken`,
   `Einpflanzen`. Watering is a tonal secondary action below the card.
5. **Hierarchy:** garden scene, today's card (seed choice or arrival), secondary
   actions, quiet footnote.
6. **Disclosure:** `Liebe Worte dazu?` is collapsed and opens five fixed phrases;
   the receiver's card is folded and opens on tap. Tapping a plant opens its
   story inline; the same tap closes it.
7. **Pattern:** one page under Games (like the other games); no sheet.
8. **Loading / Empty / Error / Offline:** a calm loading state; an empty garden
   explains the first step with the same seed card; failures use the shared
   problem state with retry; a second send on the same day (409) reloads and
   says so; nothing is queued offline.
9. **Success:** the messenger flies the seed along the arc; the card turns into
   the waiting state (`games.garden.waitingTitle`); a received seed drops into the soil; on a shared day
   every plant grows one stage once, with a short sun-and-pollen moment and a
   butterfly.
10. **Privacy / relationship state:** only the two partners of the Space. The
    garden stores species, fixed phrase codes, dates, stages, slots and who sent
    or watered; never a location or a distance. The messenger is chosen on the
    reading device from the existing Premium distance band; without sharing it
    is always the bird, with no label and no hint. The notification preview is
    generic and never shows the words.
11. **Large text / narrow:** cards and chips wrap, targets are at least 44 px,
    no horizontal page overflow at 320/360/390/430 px and 200 % text; a garden
    wider than the screen pans inside its own frame.
12. **Motion:** while the page is open the meadow sways, clouds drift and stars
    twinkle (Product Owner decision); the messenger flight, the seed drop, the
    growth and the shared-day moment are one-shot. Durations use the motion
    tokens. Reduced motion shows the same states without movement.
13. **Expanded:** one bounded centred column (like the other games); the scene
    keeps its aspect ratio.
14. **Typing:** none.
15. **Platform patterns:** native buttons; plants are buttons with names; system
    Back leaves the page.
16. **Table/list justification:** none used.
17. **Visual acceptance:** these captures, runtime captures in the PR and the
    browser journey `garden-game.spec.ts`.

## PR 2: presentation (seasons, lanterns, reunion, sleeping garden)

### Decisions

- Scope from the #1907 H3 sub-bullet: seasons from the calendar, two lanterns
  ("today in the garden"), the reunion from an existing Plan (a gate with the
  date; on the day everything blooms) and the sleeping garden after a pause of
  both (the Product Owner approved the proposal enthusiastically).
- Reunion signal (Product Owner, 2026-11-16, asked before building because
  Plans have no dedicated "meeting" marker): the next upcoming Plan with the
  existing anticipation highlight (#504 countdown, "Vorfreude") is the
  reunion. No new Plan setting and no new storage.
- Reviewed baseline: PR 1 branch `claude/1907-h3-garden-core` `0849801db`
  (on `main` `06af723f2`): `GardenGamePage` with the flight band, the scene,
  today's card, the plant story, watering and the footnote. PR 2 keeps all of
  them and adds layers to the same scene and calm cards around today's card.

### Visual reference

Compact 390 px captures of the approved prototype, Light and Dark. The
prototype's bunting needed a one-line fix to render (`Array.from` passes no
third argument); nothing else was changed. The prototype also shows PR 3
content (animals, trees, plane), which is not part of this PR.

| State | Light | Dark |
| --- | --- | --- |
| Autumn, lanterns, reunion gate and card | [soon](compact-390-light-4-autumn-reunion-soon.png) | [soon](compact-390-dark-4-autumn-reunion-soon.png) |
| Reunion day: everything blooms, bunting | [day](compact-390-light-5-reunion-day.png) | [day](compact-390-dark-5-reunion-day.png) |
| Winter: snow on the hills | [winter](compact-390-light-6-winter.png) | [winter](compact-390-dark-6-winter.png) |
| Spring blossoms | [spring](compact-390-light-7-spring.png) | [spring](compact-390-dark-7-spring.png) |
| Sleeping garden | [asleep](compact-390-light-8-sleeping.png) | [asleep](compact-390-dark-8-sleeping.png) |
| Woken garden | [awake](compact-390-light-9-woke.png) | [awake](compact-390-dark-9-woke.png) |

![Reunion day, 390 px Light](compact-390-light-5-reunion-day.png)

Runtime captures of the implementation from `garden-game.spec.ts` are in
[`evidence/`](evidence/) (`garden-sleeping-*`, `garden-woke-reunion-soon-*`,
`garden-reunion-day-*`, `garden-season-*`).

### Contract deltas

- **States.** *Season* from the month of the couple's calendar day: spring
  (March to May) blossoms on the meadow, summer a richer green, autumn golden
  greens with a one-shot moment of falling leaves on open, winter snow on the
  hills and snow-white meadow dots. Nothing withers in any season. *Lanterns*:
  one per partner at the garden edges (own on the left, partner on the right,
  like the avatars), outlined in the person colour; a lantern glows when that
  person sent today's seed, never a time. *Reunion soon*: a small gate at the
  right edge and a calm card (`games.garden.reunion.eyebrow`,
  `games.garden.reunion.soonTitle` with the date) above today's card. *Reunion day*: every plant is shown in bloom (the real stages
  are unchanged), bunting in both person colours, a card
  (`games.garden.reunion.todayTitle`) instead of the seed card; no seed is needed and watering is hidden;
  a seed that arrived can still be planted. The save action
  (`games.garden.reunion.save`) stores a still of the garden as a photo Moment on explicit tap
  only, through the existing media path, and then links to it. *Sleeping*:
  after four full days in which neither partner sent a seed or watered, the
  garden opens under mist with closed blossoms (buds) and dark lanterns and the
  card `games.garden.sleep.title`; it then wakes: the mist lifts, blossoms open and the
  welcome (`games.garden.sleep.wokeTitle`, `games.garden.sleep.wokeBody`)
  appears with a quiet secondary button to close it. Today's seed card stays available throughout.
  It never sleeps on a reunion day. Visitors added in PR 3 must stay away
  while it sleeps (the `sleep` phase of `useGardenPresentation`).
- **Hierarchy.** The scene stays the focal point; the sleep/welcome card sits
  directly below it, the reunion card above today's card. On the reunion day
  the save button is the single primary action.
- **Motion.** Lit lanterns flicker gently while the garden is lively (part of
  the approved continuous motion); falling leaves, the mist lifting, the
  blossoms opening on waking and on the reunion day, and the bunting popping in
  are one-shot. **Reduced motion** shows the same states without movement:
  no falling leaves, no flicker, and the garden is shown awake at once with the
  welcome card.
- **Privacy and relationship state.** The server derives `sleeping`,
  `reunionOn` (a day) and `reunionToday` from existing seed, watering and Plan
  data; nothing new is stored. The Plan's title never reaches the garden, so
  discreet Plans stay concealed. The sleeping garden is only a pause of both,
  never attributed to one person, and sends no notification. The saved Moment
  contains the drawn garden only (species, colours, decoration), no location.
- **Large text / narrow.** Cards wrap; the new layers live inside the scene,
  which keeps its aspect ratio; no horizontal overflow at 360/390 px.
