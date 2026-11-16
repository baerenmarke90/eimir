# #1907 I1 Quiet hints: visual reference

Product Owner decision (2026-11-16): option **A "Quiet hints"** ("A eintragen").
Baseline `main` `06af723f2`. Nothing is implemented yet; this folder is the visual
preflight required by `AGENTS.md` before UI work starts.

[`prototype.html`](prototype.html) is the clickable 390 px prototype (options A, B and C,
reduced motion, Light/Dark). Append `#shot-<name>` or `#shot-<name>-dark` to render one
settled state (`wirnew`, `wirsaved`, `join`, `moments`, `plan`, `planempty`, `new`).
The images are captures of that prototype. Gradient rectangles stand in for photos; the
names are fixture names. It is a composition reference, not a pixel lock.

| Image | State |
| --- | --- |
| [01](01-wir-move-in-390-light.jpg), [05](05-wir-move-in-390-dark.jpg) | Wir in a new Space without a partner: move-in with one filled action and a quiet invite link |
| [02](02-wir-connected-390-light.jpg) | Wir once the partner joins: one-time "connected" moment (#513 section 4), settled state |
| [03](03-moments-empty-390-light.jpg) | Momente empty state with its existing copy plus the unused `story.emptyAction` |
| [04](04-new-note-390-light.jpg) | "New in eimir." note where the new feature lives |

## Reviewed baseline screens and functions

- Wir (`TodayPage.tsx`): `isSparse` renders `.new-space-experience` with heading and body only.
  `m5s5.dashboard.newSpaceAction` exists but is unused. The partner invitation is reachable only
  from Settings (`PartnerConnectionPanel`). No root rise; only the hero heart line draws.
- Momente (`StoryProductPage.tsx`): empty state with heart mark, title and body; `story.emptyAction`
  is unused, creation relies on the floating "+". Momente, Planen and Mehr have the
  `useRootTabIntro` rise.
- Planen (`SharedPlanningOverviewPage.tsx`): `.planen-empty-state` is a heading (plus
  `m5s3.plan.createIntro` for open plans). Many secondary `UiState kind="empty"` surfaces
  (chapters, people, collections, important dates, media) have no action.
- Mehr: the optional #796 product orientation and its replay row.
- No coach marks, tooltips or View Transitions. All seen/dismiss state is device-local
  (`attentionReceipt.ts`, product tour flag). `GentleSuggestionCard` (#1620) is not mounted.

## Approved direction (option A)

- Move-in on Wir and one warm sentence plus exactly one filled action in every empty area.
  Derived from shared data; disappears for both partners with the first item. No stored state.
- Contextual hints only where something is not obvious, and "New in eimir." notes at the place
  of a shipped feature. Per person, device-local opaque receipts, no content, no analytics.
- Limits: at most one hint per screen and one new hint per day; a hint retires after first use,
  "Got it" or three views; "New" notes expire 14 days after the release.
- Motion with existing tokens: Wir gets the root rise; the first item settles with a one-time
  glow; the partner-joined moment uses `gestureMoment`. Reduced motion shows the same content
  and focus instantly.
- Not included: blocking tour, spotlight/coach marks, badges or red dots, progress counters,
  push for hints, daily-question hints on Wir, partner-blaming copy.
- Free/Core, identical Cloud and Self-Hosted, no backend. Proposed slices: I1a empty states and
  move-in, I1b hint primitive with limits and "New" notes, I1c Wir rise and connected moment.

## Product tour and PR #1976

The Product Owner stopped PR #1976 (optional introduction) on 2026-11-16 and asked to close it and
to remove the #796 introduction from More ("eimir. kennenlernen") after I1. Quiet hints are the only
in-app guidance; the tour removal ships in its own pull request.

## Implementation evidence

Browser captures from `web/e2e/tests/quiet-hints.spec.ts` (mocked API, reduced motion so the settled
state is captured; Chromium):

| Image | State |
| --- | --- |
| [Wir 390 Light](evidence/i1-wir-move-in-390-light.png), [Dark](evidence/i1-wir-move-in-390-dark.png), [1280 Dark](evidence/i1-wir-move-in-1280-dark.png) | Move-in without a partner: one action, the empty frame, the invitation link |
| [Wir connected](evidence/i1-wir-connected-390-light.png) | Partner joined: the one-time connected moment above the move-in |
| [Momente](evidence/i1-moments-empty-390-light.png) | Empty discovery with the `story.emptyAction` action |
| [Plans](evidence/i1-plans-empty-390-light.png) | `m5s3.overview.openPlansEmpty` with the `quietHints.firstPlan` action |
| [Wishes tip Light](evidence/i1-wishes-tip-390-light.png), [Dark](evidence/i1-wishes-tip-390-dark.png) | The personal wish-to-plan tip with its open and dismiss actions |

Deviation from the prototype: the connected moment is its own small mark under the hero (two person
circles and the heart line) instead of animating the hero avatars, so it works with every Wir design
and leaves the hero's own intro untouched.
