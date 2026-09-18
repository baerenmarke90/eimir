# #1028 Mobile Web performance baseline

Baseline commit: `6ef94b7b96cdebc2a0cd6c2a7da71d70b6bf461d`

This pass targets confirmed work on the representative Today/Momente navigation
path without changing product semantics. The fixes are deliberately bounded to
work that scales with feed length or scroll-event frequency.

## Confirmed hotspots

### Repeated author-avatar binary loads

`StoryList` renders an `AuthorAvatar` for every Timeline item. Before this
pass, every `useProfileAvatarUrl` instance independently called
`getProfileAvatarContentRaw`, converted the same avatar blob and created its
own object URL.

The existing progressive-loading browser fixture mounts 22 initial Timeline
cards from the same author. That shape therefore had 22 independent avatar
consumers for one underlying asset. The regression fixture now instruments the
avatar content endpoint and requires the same 22-card surface to issue exactly
one binary avatar request; pagination with another item by that author must
remain at one.

### Root scroll work executed at event frequency

The Momente hide-on-scroll hook previously ran its DOM/modal query, document
scroll-height read and navigation state transition directly inside every root
`scroll` event. High-frequency touch scrolling can dispatch multiple events
inside one display frame.

The hook now coalesces root scroll events through one animation-frame callback,
reads the latest scroll position once, and only publishes React state when
visibility actually changes. A deterministic hook test dispatches three
events before the frame and verifies one scheduled update.

### Persistent compositor promotion on off-screen feed items

Timeline and Discover reveal CSS previously placed `will-change` on every
loaded but unrevealed item. With progressive pagination this scales compositor
resource reservation with loaded history, including content well outside the
viewport.

The reveal transitions remain unchanged, but persistent `will-change` hints
are removed. A stylesheet regression test prevents reintroducing feed-wide
promotion.

### Date formatter construction scaled with rendered item count

`formatTimelineDate` and `formatStoryDate` previously constructed a new
`Intl.DateTimeFormat` for every item formatting call. Timeline and Discover
now reuse the small formatter set keyed by locale and whether the Timeline date
needs a year.

## Guardrails

- no Story/Today data query keys or stale-time semantics changed;
- no Account/Space authorization behavior changed;
- no media quality or viewport-loading thresholds changed;
- no visual hierarchy or interaction model changed;
- reduced-motion behavior is preserved;
- avatar sharing is scoped to the same configured `ProfilesApi` instance and
  exact Space/Account/attachment identity, so it does not become a
  cross-session/global data cache;
- the shared avatar object URL is revoked as soon as its last consumer has
  disappeared, with only a one-task defer to survive React StrictMode effect
  replay.

## Validation

Automated coverage for this pass:

- `useProfileAvatarUrl.test.tsx`: concurrent consumer request/blob/object-URL
  deduplication and release;
- `useHideOnScrollNav.test.ts`: one animation-frame update for a burst of
  root scroll events plus existing hysteresis/peer-mode behavior;
- `webLayout.test.ts`: no persistent `will-change` on progressive
  Timeline/Discover reveal layers;
- `momente-timeline-progressive-loading.spec.ts`: real browser route fixture
  with 22 initial cards verifies one avatar binary request and no new request
  when pagination adds another card from the same author.

CI and Browser QA remain the merge gate; Product Owner runtime acceptance stays
separate from technical green checks.
