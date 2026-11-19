# eimir. Motion Contract

**Version:** 1.0 (2026-11-19)<br>
**Status:** Normative lower-level design-system contract under Product Reference v1 once merged. The library decision in [section 6](#6-library-decision) is **deferred by the Product Owner until the gesture test results are in** (2026-11-19). Haptics are approved ([4.10](#410-haptics)). Motion for gestures only is approved conditionally ([6.6](#66-product-owner-decisions-and-license-conditions)).<br>
**Scope:** Canonical Web/Mobile Web UI, including the Capacitor-delivered Android app<br>
**Issue:** [#2067](https://github.com/baerenmarke90/eimir/issues/2067)<br>
**Baseline:** `main` at `915e97ec8`

This contract adds three things to the [Web Motion Guideline](motion-guideline.md) (#1204):

1. a small, closed **catalogue of seven motion primitives** that every animation in the app must belong to: Enter, Replace / Exit, Feedback, Flight, Ambient, Gesture follow and Moment, plus three bounded domains;
2. **lifecycle invariants** that each primitive must keep: how it ends, when it may replay, how it survives remounts and hidden tabs, which properties it may animate, how motion shares one clock and one budget per screen, and how unprompted motion is limited;
3. the **motion layer**: one shared place in `web/src` that implements the primitives, plus the library decision and the migration plan to get there.

The Motion Guideline stays the owner of the semantic roles (section 3 there), the token vocabulary (section 2 there), presence (section 5), reduced motion (section 6) and the Product Owner's approved motion decisions. This contract does not change any approved motion. It defines how motion is built so that the same experience looks the same everywhere and the same defects cannot return. If the two documents conflict, the Guideline's approved product decisions win on *what* moves. This contract wins on *how* it is built. A conflict is recorded and resolved in the next version of this contract.

## 1. Why this contract exists

The Product Owner reported on 2026-11-19 that the new Wir animations looked broken: the "Wie geht's?" line did not show, avatars popped or blinked, and the ring breath looked like 3 FPS. The fixes ship separately. The root causes are general, and every feature that writes its own choreography can produce them again:

| Defect class | Wir instance | Invariant that prevents it |
| --- | --- | --- |
| Motion ends on a React render instead of its own clock | the opening ended at the next render, so the ring breath often never started | [M2](#m2-own-clock) |
| CSS entrances restart when a kept tab is shown again | `PrimaryTabPanels` hides inactive tabs with `hidden` (`display: none`); showing the tab again restarts every CSS animation still applied in it | [M4](#m4-kept-views-never-replay) |
| Slow `scale` on a thin stroke steps from pixel to pixel | a 2 px ring breathing with `scale` on phones | [M7](#m7-no-scale-on-thin-strokes) |
| A remount restarts or flashes motion and drops loaded media | span-to-button remount reset the avatar photo to initials and faded it in again | [M5](#m5-remount-safety) |
| A one-shot rule retires content for good | a quiet-hint cap retired the "Wie geht's?" prompt | [M3](#m3-one-identity-one-play) (motion state never decides whether content exists) |
| A photo fades in again over its placeholder | the avatar photo blinked after a remount | [M5](#m5-remount-safety) and the Enter `media` variant |
| Components that should move together run on separate clocks | the Wir heart line restarted when the hero remounted (`wirIntroClock.ts` now re-aligns it) | [M15](#m15-one-choreography-clock-and-a-per-screen-budget) |

The measured inventory ([section 7](#7-inventory-on-main-at-915e97ec8)) shows 257 `@keyframes` in 65 CSS files and 37 `.animate()` calls written by hand per feature, with three separate token readers and 22 separate reduced-motion checks in TypeScript.

## 2. Terms

- **Motion layer:** the shared module that implements this contract (proposed path `web/src/motion/`, see [section 5](#5-the-motion-layer)). Feature code asks the layer for a primitive. It does not write `@keyframes` or call `Element.animate()` itself.
- **Motion identity:** a stable string that names *what* plays, for example `wir.stage`, `wir.module.planning`, `today.quote`. It never contains personal content or user input, and is never persisted, logged or sent. Where one item needs its own identity (a received gesture, a photo URL for the `media` variant), the layer keys it by an opaque in-memory value that is dropped with the session.
- **Prompted / unprompted:** prompted motion answers the person's own action. Unprompted motion announces something they did not trigger (a partner arrival, a received gesture, a hint).
- **Choreography:** several motions on one screen that share one start time, for example the Wir stage and the modules that arrive after it.
- **Play scope:** how long a played identity stays played: `app-start` (until the app is reloaded or restarted), `session` (the current app session in memory), or `surface` (as long as the owning surface stays mounted, including while it is hidden in a kept tab).
- **Kept view:** a mounted view that is hidden and shown again without remounting. Today these are the primary tabs Wir, Momente and Planen in `web/src/components/PrimaryTabPanels.tsx`.
- **Thin stroke:** a visible ring, border, hairline or line whose painted width is 3 CSS px or less.

## 3. Global invariants

Every primitive keeps all of these. A pull request that breaks one is not merge-ready.

### M1. Tokens only

Durations, easings, stagger steps and repeat counts come from `design/tokens.json` through the generated roles in `web/src/design/product-roles.css`. CSS reads them with `var(--duration-…)` and `var(--easing-…)`. TypeScript reads them through one adapter in the motion layer, never with its own `getComputedStyle` parsing or a literal fallback such as `180`. New values extend the token contract first (Motion Guideline section 2).

### M2. Own clock

A motion ends on its own timeline: the `finished` promise of a Web Animation, the `animationend`/`transitionend` event of its own element, or a deadline computed from its tokens when it starts. It never ends because React rendered again, an effect re-ran, a query settled or a parent remounted. React state may record that a motion finished, but only from that signal. A motion that is still running when its element leaves the document is cancelled and counts as finished.

### M3. One identity, one play

One-shot motion (Enter, Feedback, Flight) plays at most once per *motion identity* and *play scope*. A re-render, refetch, cache update, remount or tab change is not a new identity. Replaying requires a deliberate new identity, for example a new item that arrives in a list.

Motion state never decides whether content exists or is visible after the motion. A capped or already played motion shows the final state; it never hides the content it would have introduced.

### M4. Kept views never replay

Showing a kept view again does not replay any one-shot motion in it (default). In CSS, an animation restarts when its element returns from `display: none`. So a one-shot CSS animation in a kept view must stop being applied once it has finished: the motion layer removes the attribute or class that applies it as soon as the animation ends (state `played`). Otherwise the motion runs as a Web Animation owned by the layer, which `display: none` does not restart.

Ambient motion in a kept view pauses while the view is hidden and continues when it is shown. It does not start from its first frame again, and it never replays the entrance it followed.

A primitive may replay on return only where an approved Product Owner decision says so. The entry in the [catalogue](#4-primitive-catalogue) then names that decision.

### M5. Remount safety

When an element with the same motion identity mounts again, for example a `span` that becomes a `button`, a `key` change, a Suspense fallback that resolves, or an error-boundary reset, it shows its final state in the same frame:

- no restart of the entrance, no frame at `opacity: 0`, no fade-in again;
- loaded media stays visible: the new element reuses the already decoded image (same URL, `decode()` before the swap, or the same element kept across the change), and never falls back to a placeholder or initials first;
- the motion layer, not the component, remembers that the identity has played.

Prefer not to remount at all: change attributes or roles on the same element where the semantics allow it.

### M6. Compositor-friendly properties only

Allowed to animate:

- `opacity`;
- `transform` and the individual `translate`, `scale` and `rotate` properties (all supported from the Android WebView floor, Chromium 111);
- for the Feedback primitive only: `color`, `background-color`, `border-color`, `box-shadow` on a single small element, for at most `--duration-transition`;
- for line-draw variants only: `stroke-dashoffset` on an SVG path of bounded size;
- for the Playback domain only: `filter` and `clip-path` on one layer at a time, with a recorded reason in its owning document;
- for Gesture follow only: the scroll position of a scroller (native scrolling, scroll snap, `scrollTo`);
- for the Replace `disclose` variant only: the one sanctioned layout transition described there.

Never animated otherwise: layout properties (`width`, `height`, `max-height`, `top`, `left`, `right`, `bottom`, `inset`, `margin`, `padding`, `gap`, `font-size`, `line-height`, `border-width`, grid/flex tracks). Expand/collapse follows Motion Guideline section 3 ("Expand and collapse").

`will-change` is set only for the time a motion runs and removed when it ends (Motion Guideline section 7).

### M7. No scale on thin strokes

Do not use `scale` or `transform: scale(…)` on an element whose visible feature is a thin stroke, and do not loop small sub-pixel `translate` values on one. Rasterization snaps the stroke edge to device pixels, so a slow scale steps visibly ("3 FPS") on phones. Use one of these instead:

- animate `opacity` of the stroke;
- scale a separate, soft, filled halo layer (no hard edge, at least 8 CSS px wide) behind the stroke;
- leave the stroke still.

### M8. Ambient motion is finite and visible-only

Ambient motion:

- runs for at most `--motion-ambient-repeat` cycles (token `motion.repeat.ambient`, currently 4), or for a finite duration that is stated next to the motion, and then rests in its neutral pose;
- pauses while the page is hidden (`visibilitychange`), while its kept view is hidden and while it is off screen (`IntersectionObserver`), and continues where it paused;
- is absent with reduced motion;
- never moves a tap target, a portrait, text being read, or the source or target of a Flight.

Two bounded domains may loop while visible; both still pause when hidden or off screen and stop with reduced motion: **Loading indicators** (until the status is known, Motion Guideline section 3) and **Scenes** (game playfields such as the garden, Heart Hunt and Picture Ping-Pong; see [4.8](#48-bounded-domains-loading-playback-scenes)).

### M9. Reduced motion is the same experience without movement

With `prefers-reduced-motion: reduce`:

- all duration roles resolve to `0ms` (already generated);
- the motion layer has one reduced-motion source that follows changes of the preference at runtime. Feature code does not call `matchMedia('(prefers-reduced-motion: reduce)')` itself;
- each primitive shows its final state at once, with no intermediate state and no delay. Only where the catalogue allows it, a short opacity change of at most `--duration-transition` remains;
- the same content, focus, announcement and result exist.

### M10. Never blocking

Motion is presentation only (Motion Guideline section 1). Content, focus order and the accessibility tree exist from the first render. Motion never delays a mutation, navigation, focus move or publication of a result. Decorative moving elements (ghosts, particles) are `aria-hidden`, `pointer-events: none` and live in the shared flight layer.

### M11. Interruptible and convergent

A new motion on the same element and channel (for example opacity, position) finishes or cancels the older one first. When a motion is cancelled, the element keeps its current state as its final style (commit, then cancel; no `fill: forwards` left running). Rapid open/close, double taps and fast tab changes converge on the final state.

### M12. Off screen means final state

A one-shot motion does not run for an element that is not visible: it is off screen, in a hidden kept view, or the page is hidden. When the element becomes visible, it plays once only where the primitive says "on first reach". Otherwise it is simply there.

### M13. Motion is never the only information

Status, order, success, error and arrival are also expressed through content, semantics and announcements (Motion Guideline section 6, UX Patterns section 11).

### M14. One layer

After migration, `@keyframes` and `Element.animate()` exist only inside the motion layer (and in the bounded domains' registered files during their migration, see [section 8](#8-migration-plan)). Feature code uses CSS `transition` with token roles for simple state changes. Transitions do not restart when a view returns from `display: none`, so they stay allowed everywhere. Pointer tracking for gestures also lives in the layer or in an adopted gesture component (`@dnd-kit`, `@panzoom/panzoom`) wrapped by it.

### M15. One choreography clock and a per-screen budget

Motions that belong together share one clock. A choreography has one start time. Members that mount late, or mount again, align to that time (the layer generalizes `wirIntroClock.ts`, which sets `Animation.startTime`). A member that mounts after its slot has passed shows its final state. Ambient motion on the screen starts only after the choreography finished.

Per screen:

- at most **one emphasized motion** at a time, meaning `--duration-context` or longer, a Flight or a Moment; a second one waits until the first finished, or shows its final state if it would wait longer than `--duration-context`;
- at most **12 elements animating at once** (the same cap as `MAX_ANIMATED_DEPARTURES`); beyond that, the remaining elements show their final state;
- nothing starts while the person is dragging or typing, except Gesture follow and the Feedback that answers it.

### M16. Unprompted motion is rare and rate-limited

Unprompted motion follows the [attention rules](#49-attention-unprompted-motion). It never interrupts a gesture, text input, an open sheet or a running Moment. It is rate-limited per kind, and it is dropped, not queued, when it cannot play.

## 4. Primitive catalogue

The catalogue is closed. A motion that does not fit one of these seven primitives, or one of the bounded domains in 4.8, needs a new version of this contract first. Sections 4.9 and 4.10 add cross-cutting rules (attention, haptics) that apply to several primitives. Section 4.11 records how each known motion need is covered.

Five primitives run on a clock (Enter, Replace / Exit, Feedback, Flight, Ambient). Gesture follow runs on the person's finger or scroll and hands over to a clock primitive on release. Moment is a rare, multi-beat emotional choreography with its own budget.

Mapping from the Guideline's roles:

| Motion Guideline role (section 3) | Primitive |
| --- | --- |
| Reveal / progressive disclosure, Sheet / drawer (enter), Modal / dialog (enter), Overlay / backdrop (enter) | Enter |
| Page / route transition | Replace `navigate` (a pure entrance without a previous view uses Enter) |
| List mutation, State transition, Sheet / dialog / overlay (exit), Expand and collapse | Replace / Exit |
| Micro / press feedback, Completion / success | Feedback |
| Celebration / emphasis, partner gesture receipt, connected moment, once-message reveal | Moment |
| Send flights, partner arrival, gesture flight (Guideline section 2) | Flight |
| Wir ring breath, garden life, handmade sway | Ambient |
| Drag dismissal, swipe between tabs, reorder, pull to refresh, pinch and pan, sliders, carousels | Gesture follow |
| Loading / async state | Loading (bounded domain) |

### 4.1 Enter

Content arrives: a screen's opening stage, a module reveal, a staggered list, a sheet, dialog or popover appearing.

| Aspect | Rule |
| --- | --- |
| Variants | `fade` (opacity), `rise` (opacity + small `translate` up, at most 12 CSS px), `surface` (sheet/dialog/popover with backdrop, one lifecycle), `stage` (a staged opening of several beats), `stagger` (siblings one after another), `draw` (a line drawn in with `stroke-dashoffset`), `media` (a photo or video still replacing its placeholder, see below) |
| Duration | `--duration-context` for a single element; `--duration-transition` for a small popover; `--duration-sequence-beat` per beat of a `stage`; longer roles only where an approved decision names them (for example `--duration-gesture-moment` in the Wir stage) |
| Easing | `--easing-enter` |
| Stagger | proposed new tokens (see [5.3](#53-token-extensions-proposed)): `motion.stagger.item` per sibling and `motion.stagger.maxItems`; items after the cap arrive together with the last staggered one. A `stagger` never moves items sideways inside a horizontal scroller (it would widen the strip; Guideline Wir decision) |
| Ends | on its own clock (M2) |
| Replays | never on re-render, refetch, remount or kept-view return (M3, M4). Play scope per identity: `app-start` for an opening stage, `session` for module reveals, `surface` for sheets and popovers (each opening is a new identity) |
| Remount | final state in the same frame (M5) |
| Off screen | `on first reach` for module reveals, otherwise final state (M12) |
| Reduced motion | final state at once; `surface` may keep a backdrop opacity change of at most `--duration-transition` |

**`media` variant (photo decode, skeleton to content).** The avatar blink came from this case, so these rules are binding:

- The placeholder (initials, colour field, skeleton) and the media share one box. The media is drawn above the placeholder only after `decode()` resolved, or after `load` for elements without `decode()`.
- The media fades in with `--duration-transition` and `--easing-standard` only the **first time a URL is shown in this session**. The layer keeps the shown URLs in memory only (never persisted, logged or sent).
- A URL that was already shown, or that is decoded within one frame (from the cache), appears at once with no fade.
- A remount, a change of the element that holds the photo, or a refetch that returns the same URL never shows the placeholder again and never fades again (M5). A changed URL keeps the previous image until the new one is decoded, then cross-fades (Replace `crossfade`).
- Skeleton to content: the skeleton is removed in the same frame in which the content is ready. Content may fade in for at most `--duration-transition`; the skeleton never fades out at the same time (no double fade, no blank frame).
- Reduced motion: the media appears at once over the placeholder.

### 4.2 Replace / Exit

Something already on screen changes or leaves: a value changes, an item is reordered or removed, a sheet closes, the content of a route is handed over, a picture is cross-faded.

| Aspect | Rule |
| --- | --- |
| Variants | `crossfade` (old and new overlap with opacity), `reorder` (FLIP with `translate` from the measured old position), `exit` (opacity, optionally a small `translate`, then unmount), `collapse-gap` (remaining items close the gap with `translate`, never `height`), `surface-exit` (sheet/dialog/popover and backdrop leave as one), and the variants with their own rules below: `navigate`, `disclose`, `value`, `scroll-state`, `appearance` |
| Duration | `--duration-transition` for values and reorder; `--duration-context` for exits and gaps; `--duration-feedback` for small value ticks |
| Easing | `--easing-standard` for crossfade and reorder; `--easing-exit` for exit |
| Presence | the authoritative state changes at once; the presentation node stays mounted only until the exit's own finished signal (Guideline section 5); a bulk change (filter swap, more than `MAX_ANIMATED_DEPARTURES`, today 12) is replaced without motion |
| Ends | own clock (M2); interruption converges (M11) |
| Replays | not applicable; a change is a new event, never replayed by a remount |
| Reduced motion | immediate final state; a `crossfade` may stay as an opacity change of at most `--duration-transition` |

**`navigate` (direction and spatial model).** Direction gets its own rules so that the same navigation always moves the same way:

- *Forward* (opening a detail, a deeper step): the new content arrives from the inline end with a translate of at most 32 CSS px plus opacity. *Back* (System Back, the back control, a return to the task origin) reverses it. In right-to-left locales, inline end is mirrored.
- *Lateral* (primary tabs): follows the tab order like a pager, and is the same movement as the swipe settle (Gesture follow), so tapping a tab and swiping look alike.
- *Replace in place* (a filter, a Space switch, a sign-in): no direction, `crossfade` only.
- *Task return* restores the reading position first; it never animates scroll (Guideline section 7).
- Duration `--duration-transition`, easing `--easing-standard`; navigation never waits for the animation (M10).
- **No container transform.** A card does not grow into its detail, and list and detail share no flying element. The Product Owner decided this on 2026-11-19 after watching an interactive preview for Momente. Opening a detail uses the forward `navigate` transition above. This is a decision, not a deferral; reintroducing it needs a new Product Owner decision and a new version of this contract. React `<ViewTransition>` is therefore not adopted for navigation in v1.
- Reduced motion: the new content is there at once; the restored position and focus are the same.

**`disclose` (expand and collapse: accordion, "+N weitere", the check-in row).** M6 forbids layout animation in general. The sanctioned way, in order of preference:

1. *No height animation.* The control changes state at once, revealed content uses Enter `fade`/`rise` (or `stagger` for "+N weitere" items, within the stagger cap), and content below moves to its new place at once. Use this whenever the content below is not being read.
2. *Gap with translate.* When content below must visibly follow, the layer measures and moves it with `reorder`/`collapse-gap` (FLIP, `translate` only).
3. *One bounded size transition.* Only where 1 and 2 cannot express it (the #2066 check-in row that closes under the names): a single `height`/`block-size` transition on **one** container per interaction, with `interpolate-size: allow-keywords` as a progressive enhancement. It lasts at most `--duration-context`, clips its content (`overflow: clip`), animates only in the direction that the decision names, is never used inside lists or on more than one element at once, and must not shift content the person is reading (scroll anchoring checked). Browsers without `interpolate-size` change in one step; this is acceptable by definition. Each use is listed in the owning document. On `main` today: `WirHeroStage.css` (check-in row), `QuietHint.css`, `RelationshipWaymarks.css`, the disclosure rule in `styles.css` (`grid-template-rows`) and three `height` transitions in `PhotoEditTask.css`. The migration checks each one against 1 and 2.
- Reduced motion: final size at once.

**`value` (numbers and short text).** Count changes, the days-together tick, timer digits:

- A changed number or short label cross-fades, optionally with a vertical translate of at most 8 CSS px in the direction of the change, using `--duration-feedback` or `--duration-transition`. Digits use `font-variant-numeric: tabular-nums` so the width stays stable.
- Count-ups (rolling a number from 0) exist only inside Playback (the recap film) or a Moment, never on ordinary screens or on first render.
- Running timers (recording, playback) change their digits without motion.
- The days-together value ticks only when the day changes while the screen is visible. On a remount or a return it shows the current value.
- Assistive technology gets the final value once; there is no live region per tick.
- Reduced motion: the new value is there at once.

**`scroll-state` (scroll-linked presentation).** Collapsing headers, a floating action that tucks away while scrolling (`useFloatingCreateScrollTuck.ts`), the status-bar scrim (`useStatusBarScrim.ts`):

- Scroll sets a **state** with hysteresis (separate show and hide distances, like the 24/12 px of the floating create action), and the state change is a `crossfade` or a small `translate` with `--duration-transition`. There is no per-pixel scroll-linked transform.
- Scroll-driven animation timelines (`animation-timeline: scroll()`/`view()`) are not used. They start at Chromium 115, above the Android WebView floor, and the approved Wir decision rules out scroll-driven drift. Layer code that inspects running animations (`getAnimations()`) must consider only animations on the document timeline.
- Parallax is not used.
- Reduced motion: the state changes at once.

**`appearance` (light/dark, token sets, app designs).**

- A theme change transitions only the root background and text colour (`theme.css`, `--duration-transition`). Components do not add their own theme transitions.
- A change of the app design or token set re-renders at once. The token adapter re-reads the roles.
- An appearance change is never a new motion identity: no entrance replays (M3).
- Reduced motion: at once.

### 4.3 Feedback

A direct response to a person's action or a confirmed result: press, toggle, selection, success tick, a single affectionate pulse, a refusal. Multi-beat emotional choreography is a [Moment](#47-moment).

| Aspect | Rule |
| --- | --- |
| Variants | `press` (`--control-pressed-scale`, brightness), `toggle` (state change with transition), `success` (one short acknowledgement after a confirmed result), `affection` (heart pulse, bloom; exactly one beat), `refuse` (see below) |
| Duration | `--duration-feedback` for press and toggle; `--duration-transition` for success; `--duration-context` for `affection` and `refuse` |
| Haptics | optional per [4.10](#410-haptics) |
| Easing | `--easing-standard`; `--easing-settle` only for an approved small settle |
| Trigger | only a direct action or an authoritative result, never pending or optimistic state, never a refetch |
| Ends | own clock; a second action interrupts and restarts the beat (M11) |
| Replays | never on remount or return; each action is its own event |
| Properties | M6, including the small color/shadow exception |
| Reduced motion | the pressed or selected state is still visible; no scale or travel; the confirmed result appears at once |

**`refuse` (errors and refusals).**

- *Invalid input:* the field shows its error state and message, and focus moves to it (UX Patterns). Motion is optional: a single horizontal nudge of at most 4 CSS px, two half cycles, within `--duration-context`. It is never repeated while the person types, and it is absent with reduced motion.
- *Failed send:* the Flight `return` variant brings the item back, and an inline message explains it.
- *Conflict:* the authoritative value replaces the local one with Replace `crossfade` and a message. There is no attention motion.
- Errors never use celebratory or affectionate motion, and never red flashing.

### 4.4 Flight (shared element)

An item travels from A to B to show where it went: the check-in values into the own badge, "Wie geht's?" into the plus, a sent gesture to the partner avatar, an item into a cart or list.

| Aspect | Rule |
| --- | --- |
| Mechanism | a decorative ghost in the shared top-layer flight layer (`FlightLayer.css`, today `flightKit.ts`) travels along an arc with `transform` only; source and target stay in the layout and never move for the flight; the target's landing beat is a Feedback |
| Duration | `--duration-send-flight`; the gesture choreography uses `--duration-gesture-moment` and `--duration-gesture-sequence` as approved |
| Easing | `--easing-standard` for travel; `--easing-settle` for an approved landing |
| Variants | `send` (source to target), `arrive` (an incoming item to its place; unprompted, see 4.9), `return` (a failed send travels back to its source) |
| Data | the flight never delays saving, closing or the next action; on failure the item visibly returns (Guideline section 2) |
| Ends | own clock; the ghost is removed when it finishes or is cancelled; a source or target that disappears cancels the flight and shows the final state |
| Replays | never; each send is one flight |
| Remount | a remounted target shows its final content at once (M5) |
| Reduced motion | no flight; the result appears in place |

### 4.5 Ambient

Quiet life on a surface that is otherwise still: the slow ring breath on Wir, garden life, the sway of handmade keepsakes.

| Aspect | Rule |
| --- | --- |
| Variants | `breath` (opacity, or scale of a soft halo, never of a thin stroke: M7), `sway` (small `rotate`), `drift` (small `translate`), `twinkle` (opacity) |
| Duration | `--duration-connection-travel` or `--duration-connection-travel-far` per cycle, or another long role that a decision names |
| Easing | `--easing-travel` |
| Repeat | finite: `--motion-ambient-repeat` cycles, then rest in the neutral pose (M8) |
| Start | only after the surface's Enter motion finished on its own clock (M2), and only while visible (M8, M12) |
| Pause | page hidden, kept view hidden, off screen; continues where it paused (M4) |
| Targets | never a tap target, portrait, readable text, or a Flight source or target |
| Reduced motion | absent |

### 4.6 Gesture follow (direct manipulation)

Motion that follows the finger (or mouse, pen, scroll) instead of a clock. On `main` these are:

- the primary-tab swipe and peek (`useNavigationMotion.ts`, `client/primaryTabPeek.ts`, `PrimaryTabPanels.tsx`);
- sheet drag-to-dismiss (`ShortTaskSheet.tsx`);
- pull to refresh (`usePullToRefresh.ts`, `PullToRefreshIndicator.tsx`);
- list reorder (`ListEntryActions.tsx`), photo arrangement with `@dnd-kit` (`PhotoArrangeTask.tsx`, `PhotoDraftSorting.tsx`);
- pinch, zoom and pan with `@panzoom/panzoom` (`ZoomablePhoto.tsx`, `PhotoCropTask.tsx`);
- carousels with scroll snap (8 `scroll-snap-type` declarations);
- range controls such as the energy battery (`WirDailyCheckIn.tsx`, `VoiceNotePlayer.tsx`, `PhotoCropTask.tsx` and three more).

| Aspect | Rule |
| --- | --- |
| Tracking | while the pointer is down, the element follows it **1:1, without easing and without a duration**, updated once per frame (`pointermove` coalesced into `requestAnimationFrame`, `transform` set directly). Native scrolling and scroll snap stay native |
| Start | a small slop and an axis lock decide who owns the gesture (today 4 to 10 px and an axis dominance of 1.15 to 1.25); vertical page scroll always wins over a horizontal pager on an ambiguous start; nested owners (`[data-gesture-owner]`-style exclusions in `ShortTaskSheet.tsx`) are respected |
| Edges | beyond a limit the element gives way with **rubber-banding**: a resistance factor (today 0.25) and a maximum travel (today 48 px), never a hard stop and never a neighbour that does not exist |
| Commit / cancel | on release, the gesture **commits** when the distance passes a threshold (today 18 % of the width capped at 48 to 80 px for the pager, 22 % of the sheet height capped at 120 to 180 px for dismissal, 72 px for pull to refresh) **or** the release velocity passes a fling threshold (today 0.5 px/ms after at least 32 px). Otherwise it **cancels**. A reversal of more than the reversal slop (today 24 px) before release cancels |
| Release handoff | the element continues from its current position **with its release velocity** into the settle of a clock primitive: Replace `navigate` (pager), Exit `surface-exit` (sheet), Replace `reorder` (drop), or back to rest (cancel). The settle duration scales with the remaining distance, at most `--duration-context`, with `--easing-standard`, or a sampled spring once the token contract has a spring role (see [6.4](#64-evaluation)) |
| Interruption | grabbing an element that is still settling stops the settle at its current position (`commitStyles`, then `cancel`) and continues tracking from there without a jump. A commit is decided only once per gesture |
| Properties | `transform` only (translate, scale for pinch), and scroll position for scrollers; never layout properties; no `will-change` outside an active gesture |
| Data | the commit triggers the domain action (navigation, close, reorder, refresh) at release, not after the settle; the settle never delays it (M10). A refresh shows its status in the Loading domain |
| Haptics | a light tick when the commit threshold is crossed in either direction, and one confirmation on commit; none while tracking (see [4.10](#410-haptics)) |
| Reduced motion | the gesture still works and still tracks the finger, because that is direct manipulation and not decorative motion. The settle after release is **instant**: the element jumps to its committed or resting state. Rubber-banding stays, because it is feedback under the finger |
| Accessibility | **every gesture has a non-gesture alternative** with the same result: tabs in the tab bar, a visible close control and System Back for sheets, move-up/move-down actions or a reorder mode for lists, a refresh action or automatic refresh, zoom buttons or double-tap plus keyboard for photos, keyboard-operable sliders with step values. The alternative is reachable by keyboard and screen reader, and never hidden behind the gesture |
| Off screen / hidden | a gesture that is interrupted by the page being hidden, a pointer cancel or a route change cancels and settles to rest at once |

### 4.7 Moment

A rare, multi-beat emotional choreography: a received partner gesture (`PartnerGestureReceipt.css`), the connected moment when a couple becomes two (`ConnectedMoment.css`), a shared achievement (`SharedAchievementCelebration.css`), the reveal of a love or once message (`OnceMessages.tsx`). Feedback `affection` stays a single beat; anything with several beats is a Moment.

| Aspect | Rule |
| --- | --- |
| Approval | each Moment needs an explicit Product Owner decision, recorded in the Motion Guideline (today: #455 gesture receipt, the connected moment, the shared achievement) |
| Duration | beats of `--duration-gesture-moment`, the whole of at most `--duration-gesture-sequence` |
| Easing | `--easing-enter` for arrival, `--easing-settle` only for an approved landing |
| Trigger | a confirmed result or a received event; never pending state, a refetch or a cache update |
| Budget | counts as the screen's one emphasized motion (M15); never two Moments at once; never during a gesture, typing or an open sheet unless the Moment is that sheet's content |
| Replays | once per item (opaque in-memory key): a received gesture or message never plays again after it was seen, on any return or remount |
| Content | the content (message text, gesture meaning) is readable from the first beat and stays after the Moment; motion never hides it or reveals it as the only way to see it (M13). A once message's privacy and screenshot-protection rules are unaffected |
| Reduced motion | a static composition with the same content, focus and actions |

### 4.8 Bounded domains: Loading, Playback, Scenes

These are not primitives. They are areas whose motion is defined by their own clock instead of a single change. They keep M1, M2, M6, M9, M10 and M13, and they run inside the motion layer's ambient controller for M8 pausing.

- **Loading:** shimmer, spinner, progress pulse. Loops until the status is known; no interaction delay; reduced motion stops the movement and keeps text, shape and `aria-busy`/status.
- **Playback:** the recap film (`RecapFilmScene.css`), story playback (`DiscoverStory.css`, `useStoryPlayback.ts`), garden playback. A playback engine composes Enter and Replace scenes on its own scene clock and may use the Playback property exception in M6. It pauses with the page and with an explicit pause control.
- **Scenes:** interactive game playfields (garden, Heart Hunt, Picture Ping-Pong, remote games). The scene may loop ambient life while it is visible and in use; it pauses when hidden or off screen and is absent with reduced motion. Taps inside the scene are Feedback.

### 4.9 Attention (unprompted motion)

Motion that announces something the person did not trigger: partner arrivals, received gestures, realtime signals, unread markers, badge counts, quiet hints. It uses the primitives above (Flight `arrive`, Enter, Feedback `affection`, Moment) and adds these rules. The [#1212 review](1212-event-driven-arrival-motion.md) remains the source for which events qualify.

- **Only live, identifiable events animate.** Polling, cache reconciliation and unread-count changes have no live identity and never animate (#1212). An unread dot or a badge count appears or changes **without motion** (at most Replace `value` for a count that the person is looking at).
- **Priority**, highest first:
  1. a Moment for a received partner gesture or message;
  2. a partner arrival Flight;
  3. an Enter for new content in view;
  4. a quiet hint.

  A lower kind never interrupts a higher one. A lower kind that cannot play is dropped and its content is simply shown.
- **Rate limits:** at most one unprompted motion at a time per screen. The same kind plays at most once per 30 seconds per screen (a proposed starting value, confirmed in the building-blocks step). Quiet hints keep their own limits (one per screen, one new per day, Freemium matrix "In-app guidance").
- **Never queued.** Events that arrive while the page or the view is hidden, or while a higher motion plays, are shown in their final state when the person returns; they do not replay as a backlog.
- **Never during input:** not while the person drags, types or has a sheet open (M16).
- Reduced motion: the content appears at once; announcements for assistive technology are unchanged.

### 4.10 Haptics

**Approved by the Product Owner on 2026-11-19:** the app gets haptic feedback, through the official `@capacitor/haptics` plugin. `main` has no haptics yet. The gestures-and-haptics step adds them.

Haptics belong to direct actions. They are never decorative and never the only signal (M13). All calls go through the layer's haptics adapter. Feature code never calls the plugin or `navigator.vibrate` itself.

| Trigger | Primitive | Plugin call | Notes |
| --- | --- | --- | --- |
| Commit threshold crossed (either direction) | Gesture follow | `selectionChanged()` | at most once per crossing; none while tracking otherwise |
| Gesture committed (sheet dismissed, tab changed by swipe, item dropped, refresh started) | Gesture follow | `impact({ style: Light })` | once per gesture |
| Press of an emphasized action (send, check-in "Fertig", a gesture to the partner) | Feedback `press` | `impact({ style: Light })` | only these named actions; ordinary buttons, links and tabs get none |
| Confirmed success of a meaningful action | Feedback `success` | `notification({ type: Success })` | only after the authoritative result; replaces the press haptic, never in addition |
| Affectionate beat the person triggered (sending a heart or kiss) | Feedback `affection` | `impact({ style: Medium })` | one beat |
| A Moment the person opens or receives while looking at it | Moment | one `impact({ style: Medium })` on its first beat | never for a Moment shown in its final state; never as a pattern of several pulses |
| Refusal of a direct action (invalid input on submit, failed send returning) | Feedback `refuse`, Flight `return` | `notification({ type: Warning })` | not while typing |

Rules:

- **Budget:** at most one haptic per direct action plus the threshold tick of a gesture. No two haptics within `--duration-context`; the later one is dropped. No haptics for unprompted motion (arrivals, hints, realtime signals, received items the person is not looking at), Ambient, Enter, Replace, navigation by tap, Loading or Scenes' ambient life.
- **User setting:** a visible on/off switch "Haptisches Feedback" (localized through i18n) in the app's settings, on by default, stored on the device only (not shared with the partner, not sent to the server). The switch is shown only in the native app (runtime platform check, AGENTS.md "Browser-only controls"), because the Web has no haptics.
- **Reduced motion:** does not switch haptics off; they are a separate preference and also help people who reduce motion. A person who wants neither turns off the in-app switch.
- **Android behaviour:** the plugin (version 8.0.2, MIT) vibrates through `Vibrator` with `VibrationEffect` one-shots and waveforms, and declares the normal-level `VIBRATE` permission (granted at install, no runtime prompt). It does **not** use `View.performHapticFeedback`, so it does not follow the system touch-feedback setting the way native controls do. The in-app switch is therefore required, and the gestures step verifies on a device:
  - how Android 13+ "Vibration & haptics" settings and Do Not Disturb affect it;
  - whether the light impacts feel like system ticks.

  If they feel like buzzes instead of ticks, the step may propose a small project plugin on `performHapticFeedback` (`CONFIRM`, `REJECT`, `GESTURE_THRESHOLD_ACTIVATE`, `CLOCK_TICK`) through its own reuse review.
- **Web fallback:** none. The adapter is a no-op outside the native app. The plugin's Web implementation calls `navigator.vibrate` directly, so the adapter never calls the plugin on the Web. Reasons: iOS Safari has no Vibration API; on Android browsers `navigator.vibrate` is a buzz that follows no system haptic setting; desktop has no vibration. A later Web use of `navigator.vibrate` would need its own decision.
- **iOS:** the repository has a Capacitor iOS project; the same adapter applies there through the plugin's Taptic Engine implementation when iOS ships.

### 4.11 Gap audit

How each known motion need is covered by v1:

| Need | Covered by | Decision |
| --- | --- | --- |
| Direct manipulation (swipe, drag, pinch, pull, reorder, sliders, carousels) | Gesture follow (4.6) | new primitive |
| Navigation direction (forward, back, lateral, in place) | Replace `navigate` | variant with direction rules |
| Container transform card to detail, list-to-detail shared element | — | **decided out of scope:** the Product Owner rejected it on 2026-11-19 after an interactive Momente preview; navigation keeps the directional `navigate` transitions |
| Scroll-linked headers, hide on scroll, status-bar scrim | Replace `scroll-state` | variant; scroll-driven timelines and parallax not used |
| Expand and collapse, "+N weitere", the check-in row | Replace `disclose` | variant with one sanctioned layout transition |
| Photo decode fade, skeleton to content | Enter `media` | variant with remount rules |
| Partner arrivals, realtime signals, unread markers, badges, hints | Attention rules (4.9) over existing primitives | cross-cutting rules, priority and rate limits |
| Invalid input, failed send, conflict | Feedback `refuse`, Flight `return`, Replace `crossfade` | variants |
| Count changes, days-together tick, timer digits | Replace `value` | variant; count-ups only in Playback or a Moment |
| Light/dark, token sets, app designs | Replace `appearance` | variant |
| Haptics | 4.10 | approved by the Product Owner (2026-11-19); `@capacitor/haptics`, in-app switch, budget |
| Several components on one choreography, per-screen budget | M15 | invariant |
| Love and once messages, celebrations, gesture receipt | Moment (4.7) | new primitive; `celebrate` moved out of Feedback |
| Text input caret, native scrolling momentum, native controls | the platform | out of scope: the browser owns them |
| Maps (camera, photo stack, connection line) | Replace and Enter with the map roles (Guideline section 2), Ambient for the connection glow | covered; the map step checks M7 on the connection line |
| Video and audio playback controls | Feedback and Loading | covered |

## 5. The motion layer

The layer is the single implementation of the catalogue. The API below describes responsibilities, not final names. The building-blocks issue fixes the names.

### 5.1 Responsibilities

| Part | Responsibility | Replaces on `main` today |
| --- | --- | --- |
| Token adapter | Reads duration, easing, stagger and repeat roles once per change of theme, token set or reduced-motion preference; returns milliseconds and easing strings | `readDuration`/`readMotionRoles` in `flightKit.ts`, `contextDurationMs` in `useDepartingItems.ts`, the inline reader with a `180` fallback in `ListEntryActions.tsx`, readers in `useNavigationMotion.ts`, `cartFlight.ts`, `GardenGamePage.tsx`, `HeartHuntGamePage.tsx`, `PlaceMapCanvas.tsx`, `GardenArt.tsx` |
| Reduced-motion source | One subscribed store for the preference | 22 TypeScript files with their own `matchMedia` check |
| Play registry | Remembers played identities per play scope (memory for `session`/`surface`, per-app-start for `app-start`); never stores content | `seenModules` in `useWirReveal.ts` and local flags elsewhere |
| Visibility controller | Page visibility, kept-view visibility (from `PrimaryTabPanels`), intersection; pauses and resumes ambient motion and holds one-shots that are not visible | per-feature observers and `animation-play-state` rules |
| Enter | `useEnter(identity, options)` returns attributes for the element and removes them on finish (M4); stage and stagger helpers | `useWirReveal.ts`, Today/Story reveal hooks, per-feature `*-reveal`/`*-enter` keyframes |
| Replace / Exit | presence (`usePresentationPresence` from `useOverlayPresence.ts`), departing items (`useDepartingItems.ts`), FLIP reorder, crossfade | the same hooks plus `ListEntryActions.tsx` FLIP and per-feature exit keyframes |
| Feedback | `feedback(element, kind)` and the shared CSS utilities | `.eimir-motion-success`, `.eimir-motion-pulse`, `.eimir-motion-lift`, `ChecklistToggle`, per-feature pops |
| Flight | arc flight, landing, return on failure | `flightKit.ts`, `sendFlight.ts`, `gestureFlight.ts`, `partnerArrival.ts`, `promptFlight.ts`, `cartFlight.ts` |
| Ambient | `ambient(element, kind)` with finite repeat and visibility control | `wir-breathe`, garden and handmade sway keyframes |
| Gesture follow | pointer tracking with slop and axis lock, rubber-banding, commit/cancel thresholds, velocity release handoff into a settle, interruption; wrappers for `@dnd-kit` and `@panzoom/panzoom` | the hand-written tracking in `useNavigationMotion.ts`, `ShortTaskSheet.tsx`, `usePullToRefresh.ts`, `ListEntryActions.tsx` |
| Moment | approved multi-beat choreographies with the one-at-a-time budget | `PartnerGestureReceipt.css`, `ConnectedMoment.css`, `SharedAchievementCelebration.css` |
| Choreography clock and budget | one start time per choreography, late members align, per-screen budget (M15) | `wirIntroClock.ts`, the batch timing in `useWirReveal.ts` |
| Attention scheduler | priority, rate limits, drop-not-queue for unprompted motion (4.9) | per-feature checks in `partnerArrival.ts`, `QuietHint.tsx` |
| Media reveal | decoded-URL registry for the Enter `media` variant | per-component image fades |
| Haptics adapter | one call per haptic event with the budget and the in-app switch, routed to `@capacitor/haptics` in the native app and a no-op on the Web (4.10) | none (no haptics on `main`) |
| CSS catalogue | one stylesheet with the shared keyframes per primitive variant, driven by data attributes and token roles | per-feature `@keyframes` |

### 5.2 Rules for feature code

- Use a primitive from the layer; do not write `@keyframes` or call `Element.animate()` in feature files (M14).
- Pass a motion identity for one-shot motion.
- Use CSS `transition` with token roles for simple state changes.
- Product decisions on Wir and elsewhere (what moves, how strongly) keep their place in the Motion Guideline; the feature passes them to the layer as options of a primitive.

### 5.3 Token extensions (proposed)

The existing roles cover all durations and easings. Only staggering lacks a token today (`useWirReveal.ts` uses a literal 220 ms step and a cap of 4). The building-blocks issue adds, with semantic names and values to be confirmed against the approved Wir timing:

| Proposed token | Meaning | Starting value |
| --- | --- | --- |
| `motion.stagger.item` | delay between siblings of a `stagger` | 60 ms |
| `motion.stagger.module` | delay between modules arriving together after an opening stage | 220 ms (today's Wir step) |
| `motion.stagger.maxItems` | siblings that stagger before the rest arrive together | 4 |

They are generated into `product-roles.css` like the other motion roles, and the stagger durations resolve to `0ms` with reduced motion. This PR does not change `design/tokens.json`.

## 6. Library decision

**Status: recommendation. The Product Owner deferred the choice until the gesture test results are in (2026-11-19); it is not approved.** The reuse review follows `docs/REUSE-BEFORE-BUILD.md`.

### 6.1 Requirements

From the catalogue and invariants:

1. own clock and interruption (M2, M11);
2. play identities and scopes, kept-view and remount safety (M3 to M5): this is app policy that no library provides;
3. compositor-friendly animation of opacity and transform that keeps running smoothly while React renders (the Wir opening runs while the page renders);
4. presence/exit, FLIP reorder, stagger, flights;
5. reduced motion from one source and token-driven values;
6. works on the Android WebView floor (Chromium 111) and the Web floor (Chrome/Edge 111, Firefox 114, Safari/iOS 16.4);
7. license compatible with eimir. (PolyForm Noncommercial source, commercial eimir. Cloud, Self-Hosted redistribution);
8. small runtime cost on mid-range Android, low migration cost for 257 keyframes and 37 WAAPI calls;
9. Gesture follow: 1:1 tracking, rubber-banding, a release handoff that keeps the velocity, ideally a spring-like settle, and interruption of a running settle.

### 6.2 Candidates

The review covered, in the order of `REUSE-BEFORE-BUILD.md`:

- **Standards and platform:** Web Animations API (WAAPI), CSS animations and transitions, View Transitions API (same-document), `IntersectionObserver`, `visibilitychange`, `matchMedia`.
- **Framework:** React 19.3 `<ViewTransition>` (stable since React 19.3; the app uses React 19.3.1).
- **Open-source libraries:** Motion (motion.dev, formerly Framer Motion), anime.js, GSAP, AutoAnimate, react-spring.
- **In-house:** a thin motion layer over WAAPI and CSS (consolidating `flightKit.ts`, `useOverlayPresence.ts`, `useDepartingItems.ts`, `useWirReveal.ts`); CSS-only shared utilities (close to today).

External providers do not apply: motion runs locally and needs no service.

### 6.3 Measured bundle size

Measured on 2026-11-19 with rolldown 1.3.3 (the bundler used by Vite 8), production `minify`, ESM, React marked external, gzip level default. The entry imports only the named exports. These are the costs that would be added to the app; the app's entry budget is 800 000 gzip bytes (`web/scripts/check-entry-size.mjs`).

| Candidate and import | License | min | gzip | brotli |
| --- | --- | ---: | ---: | ---: |
| Motion 14.14.0 `motion/react`: `LazyMotion`, `m`, `AnimatePresence`, `MotionConfig` (features loaded separately) | MIT | 18.9 kB | 7.8 kB | 7.1 kB |
| + `domAnimation` feature bundle (animations, exit, variants, gestures without drag/layout) | MIT | 78.8 kB | 27.4 kB | 25.2 kB |
| + `domMax` instead (adds layout and shared-element `layoutId`, drag) | MIT | 130.4 kB | 42.6 kB | 38.2 kB |
| Motion `motion/react` full `motion` component + `AnimatePresence` + `MotionConfig` | MIT | 141.9 kB | 47.0 kB | 42.1 kB |
| Motion `motion` vanilla `animate` + `stagger` (hybrid engine) | MIT | 72.2 kB | 25.2 kB | 23.0 kB |
| Motion `motion/mini` `animate` (WAAPI only) | MIT | 8.5 kB | 3.2 kB | 2.9 kB |
| Motion `motion/react-mini` `useAnimate` | MIT | 8.8 kB | 3.3 kB | 3.0 kB |
| anime.js 4.5.0 `animate` + `stagger` | MIT | 34.8 kB | 13.5 kB | 12.2 kB |
| GSAP 3.15.1 core | GSAP Standard "no charge" license (proprietary) | 68.8 kB | 26.9 kB | 24.2 kB |
| AutoAnimate 0.10.2 | MIT | 8.4 kB | 3.3 kB | 2.9 kB |
| In-house layer over WAAPI (estimate from today's `flightKit.ts`, presence and reveal hooks, consolidated) | project | — | about 3 to 5 kB | — |
| CSS-only utilities | project | — | CSS only | — |

Motion's own documentation states smaller figures for its tree-shaken React paths (built with Rollup). The figures above are what this app's bundler produces today. react-spring was not measured. It drives animation from `requestAnimationFrame` on the main thread, which fails requirement 3 by design.

### 6.4 Evaluation

| Criterion | In-house WAAPI layer | Motion (`motion/react`) | CSS-only utilities | React `<ViewTransition>` / View Transitions | anime.js | GSAP | AutoAnimate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Own clock, interruption (1) | yes: `Animation.finished`, `commitStyles`, `cancel` | yes | partly: `animationend`, no orchestration across elements | yes, per transition | yes | yes | yes, for its own list moves |
| Identities, kept view, remount (2) | implemented once in the layer | not provided; mount starts `initial`→`animate`, so every call site needs `initial={false}` plus our play registry | not provided; CSS restarts on `display: none` (the Wir defect) | not applicable | not provided | not provided | not provided |
| Compositor while React renders (3) | yes: WAAPI `transform`/`opacity` run on the compositor in Chromium | only when animating the `transform` string directly; Motion's independent `x`/`scale` values go through CSS variables and are not accelerated (Motion performance docs) | yes | yes (snapshot pseudo-elements) | JS-driven per frame by default (main thread) | JS-driven per frame (main thread) | WAAPI |
| Presence, FLIP, stagger, flights (4) | presence and departures exist; FLIP exists in `ListEntryActions.tsx`; flights exist; stagger to add | complete set, including layout and `layoutId` | stagger via delays only; no exit after unmount; no flights | route and shared-element snapshots; blocks input during a transition and allows only one at a time, unsuitable for flights and ambient | stagger, timelines; no React presence | complete timelines; no React presence | list add/remove/reorder only |
| Reduced motion, tokens (5) | one store; tokens through the adapter | `MotionConfig reducedMotion="user"` disables transform only; tokens need an adapter (seconds, JS numbers) | tokens and media query exist | snapshot animations need their own reduced-motion CSS | adapter needed | adapter needed | own detection |
| WebView 111 / Web floor (6) | WAAPI complete; individual transform properties since Chromium 104 | yes; uses `linear()` easing (Chromium 113) only after feature detection | yes | Android WebView 111 yes; Firefox 114 and Safari 16.4 no: enhancement only | yes | yes | yes |
| License (7) | project | MIT | project | platform / MIT | MIT | proprietary; prohibits use in tools that compete with Webflow; not an open-source license, so it would need legal review for Self-Hosted redistribution | MIT |
| Added size (8) | about 3 to 5 kB | 35 kB (lazy `domAnimation`) to 47 kB gzip | 0 | 0 | 13.5 kB | 26.9 kB | 3.3 kB |
| Migration cost (8) | low: 37 WAAPI calls are already in this style; CSS keyframes move to the catalogue | medium to high: rewrite to `m.*` components or `useAnimate`; two idioms during migration | lowest, but leaves the defect classes open | partial only | medium | medium | partial only |
| Maintenance | the team owns about 500 to 800 lines with unit tests; no upstream changes | active upstream (MIT, regular releases); major upgrades through Dependabot and this review | the team | browser vendors | active upstream | Webflow | small upstream |
| Gesture follow (9) | tracking, thresholds and rubber-banding exist on `main` (pager, sheet, pull, reorder); a velocity-aware spring settle must be built: sampled spring keyframes, or `linear()` easing from Chromium 113 with `--easing-standard` as the fallback on 111 and 112 | strongest candidate: `drag` with velocity, inertia and springs, constraints with elastic edges, interruption built in; requires `domMax` (42.6 kB gzip); its drag values are independent transforms driven per frame on the main thread, which is fine while tracking but also applies to the settle | no | no | springs, no React gesture model | Draggable plugin, inertia | no |
| Fallback without it | not applicable (platform APIs) | remove the dependency: the layer behind it would still be needed | not applicable | none needed (skips the animation) | — | — | — |

### 6.5 Recommendation

**Recommended: an in-house motion layer on the Web Animations API and one shared CSS catalogue, with no new runtime dependency.** Motion is the documented alternative if the Product Owner prefers a ready-made third-party library.

Rationale:

1. **The defects are lifecycle-policy defects.** Ending on an own clock, play identities, kept-view and remount safety, and finite visible-only ambient motion are eimir. rules. No candidate provides them. With Motion they still have to be written, and its React model of starting an animation on mount is the pattern that caused the remount and replay defects unless every call site opts out.
2. **Reuse order.** The mechanics are a web standard (WAAPI) and platform capabilities (`IntersectionObserver`, `visibilitychange`, `matchMedia`), which rank first and second in `REUSE-BEFORE-BUILD.md`. The custom part is limited to the policy that no library offers. This is why custom implementation is justified here.
3. **Smoothness on mid-range Android.** WAAPI `opacity`/`transform` animations run on the compositor while React renders. Motion's main ergonomics (independent `x`, `y`, `scale`) are not accelerated, so using Motion safely would mean writing full transform strings and losing most of its convenience.
4. **Cost and migration.** About 3 to 5 kB instead of about 35 to 47 kB gzip. The 37 existing `.animate()` calls and `flightKit.ts` already follow this approach, so migration consolidates rather than rewrites, and the app does not run two motion idioms side by side.
5. **No license or supply-chain change.** GSAP is excluded on license grounds. anime.js and AutoAnimate cover only parts of the catalogue.

**Gesture follow narrows the gap, and that should be stated plainly.** Velocity handoff, springs, elastic edges and interruption are Motion's strongest area. In the in-house layer they would be written and tested by the team. Three things still favour the in-house layer:

- the four gestures on `main` already have tuned thresholds, rubber-banding and WAAPI settles;
- the hardest gestures (sortable photo arrangement, pinch and pan) are already handled by the adopted `@dnd-kit` and `@panzoom/panzoom`;
- Motion's drag needs the 42.6 kB `domMax` bundle.

The decision therefore rests on a **gesture test**, run as a separate draft pull request before the building-blocks step. It prototypes one representative gesture (the sheet drag-to-dismiss) twice: once with a thin WAAPI layer and a velocity-aware sampled spring, once with `motion` (`LazyMotion`/`m`). The two are compared on:

- smoothness under 4x CPU throttling (frame timings);
- release velocity handoff;
- interruption;
- reduced motion;
- bundle delta;
- code size.

If the in-house settle needs clearly more than a small spring helper (roughly 150 lines with tests), or Motion is measurably smoother, the recommendation switches to Motion for Gesture follow and its settles only (`domMax` loaded lazily with the first gesture surface). The other primitives stay in the layer. The Product Owner decides question 1 in [6.6](#66-product-owner-decisions-and-license-conditions) on the test results.

Kept as options, not part of v1:

- **React `<ViewTransition>`** for route-level Replace on the Android app (WebView ≥ 111), as a progressive enhancement after a separate evaluation, because it blocks input during a transition and is unavailable on the Firefox and Safari floors. It would carry only the directional `navigate` transitions, never a container transform, which the Product Owner rejected (6.6).
- **Switch to Motion** (`motion/react` with `LazyMotion`, `m`, lazy `domAnimation`) if later work needs general layout animation of arbitrary layout changes (`layout`/`layoutId`) or physics springs often enough that maintaining FLIP in the layer costs more than the dependency. The layer's API stays the same so that only its implementation would change.

### 6.6 Product Owner decisions and license conditions

Product Owner decisions of 2026-11-19:

| # | Question | Decision |
| --- | --- | --- |
| 1 | In-house layer or Motion | **Deferred** until the gesture test results are in. Not approved. |
| 2 | Motion for Gesture follow only, if the gesture test shows the need | **Approved, conditional** on the license conditions below. |
| 3 | Haptics | **Approved**, with `@capacitor/haptics` ([4.10](#410-haptics)). |
| 4 | Container transform and list-to-detail shared elements (Replace `navigate`) | **Rejected** after an interactive preview for Momente. Out of scope; navigation keeps the directional page transitions. |

**License conditions for Motion** (checked 2026-11-19 against the published npm packages):

| Package | Version | License | Role |
| --- | --- | --- | --- |
| `motion` | 14.14.0 | MIT (`LICENSE.md`, copyright Motion B.V.) | the only package the app may import |
| `framer-motion` | 14.14.0 | MIT | dependency of `motion` |
| `motion-dom` | 14.14.0 | MIT | dependency of `framer-motion` |
| `motion-utils` | 14.7.0 | MIT | dependency of `framer-motion` and `motion-dom` |
| `tslib` | 2.9.1 | 0BSD | dependency of `motion` and `framer-motion` |
| `react`, `react-dom`, `remix` | — | — | optional peer dependencies; React is already in the app, `remix` is not used |

Rules:

- Only the MIT `motion` package from the public npm registry may be used, with the transitive set above. The adopting pull request lists the transitive dependency set and its licenses from `web/package-lock.json` in `docs/DEPENDENCIES.md`, and that list is re-checked on every Motion upgrade. A new transitive package with a license other than MIT, ISC, BSD or 0BSD blocks the upgrade.
- **Motion+ is never used.** Motion+ is Motion's paid offering (example and Motion UI source, MotionScore audits, CSS spring generation, private `motion-plus` packages). No `motion-plus*` package, no Motion+ registry or token, and no code copied from Motion+ examples may enter the repository. The guard (migration step 8) rejects `motion-plus` in `package.json`, the lockfile and imports.
- Features that once were Motion+ but now ship inside the MIT `motion` package (for example `motion/react-animate-view`) are covered by the MIT license, like any other part of that package.
- Self-Hosted redistribution and eimir. Cloud use are covered by MIT. Attribution is kept through the package's `LICENSE.md` in the dependency inventory.

**License of `@capacitor/haptics`:** version 8.0.2, MIT (copyright Ionic), no runtime dependencies, peer `@capacitor/core >= 8.0.0`. It matches the app's Capacitor 8 line. The adopting pull request records it in `docs/DEPENDENCIES.md`.

See the PR description for the German summary.

## 7. Inventory on `main` at `915e97ec8`

Measured on 2026-11-19 with `grep` over `web/src` (production files, tests excluded). It matches the figures in #2067.

### 7.1 Totals

| Measure | Count |
| --- | ---: |
| `@keyframes` | 257 in 65 CSS files |
| `Element.animate()` calls | 37 in 10 TypeScript files |
| CSS `transition:` declarations | 274 (95 of them with a token role; transitions stay allowed, M14) |
| Declarations with `infinite` | 33 in 13 files |
| Uses of `--motion-ambient-repeat` (finite ambient) | 4 files |
| Files that pause motion with `animation-play-state` | 4 |
| TypeScript files with their own reduced-motion `matchMedia` | 22 |
| TypeScript files reading motion tokens with their own parser | 9 |
| `cubic-bezier(` literals outside the token file | 7 |
| `@keyframes` animating layout properties | 0 |
| Layout transitions (`height`, `grid-template-rows`, `interpolate-size`) | 7 in 5 files (Replace `disclose`) |
| Hand-written gesture tracking (pointer or touch move) | 4 surfaces: tab pager, sheet dismissal, pull to refresh, list reorder |
| Adopted gesture components | `@dnd-kit` in 2 files, `@panzoom/panzoom` in 2 files |
| Range controls | 6 files |
| `scroll-snap-type` declarations | 8 |
| Haptics | none |

### 7.2 `@keyframes` by primitive

Classified from keyframe names and their use with `infinite` or `--motion-ambient-repeat`, then corrected by hand. The building-blocks issue produces the authoritative per-keyframe register.

| Primitive | Count | Typical members |
| --- | ---: | --- |
| Enter | 80 | `wir-intro-*`, `wir-reveal-*`, `today-module-reveal`, `short-task-sheet-enter*`, `preference-modal-*enter`, `header-notifications-*-enter`, `shared-story-lifeline-*`, `planen-panel-in`, `root-tab-intro`, `detail-page-open`, `eimir-disclosure-reveal`, `date-idea-image-fade` (`media`) |
| Replace / Exit | 17 | `short-task-sheet-exit*`, `preference-modal-*exit`, `media-overview-tile-depart`, `wir-moment-out`, `wir-distance-leave`, `planen-search-close` |
| Feedback | 42 | `notification-*` (9), `garden-tap-*`, `eimir-success`, `eimir-affectionate-pulse`, `wir-checkin-vibe-pop`, `heart-hunt-pop`, `anticipation-tick` |
| Flight | 13 | `wir-checkin-slot-land`, `wir-intro-pin-land`, `wish-journey-connect*`, `place-map-connection-*`, `pingpong-fly-*` (most flights are WAAPI, see 7.3) |
| Ambient | 46 | `wir-breathe`, `story-hang-sway`, `today-retrospective-sway`, about 40 garden life keyframes |
| Moment | 15 | `partner-gesture-*` (10), `connected-moment-*` (3), `shared-achievement-arrive`, `shared-achievement-leave` |
| Gesture follow | 0 | gestures track the pointer in TypeScript and settle with WAAPI or transitions (7.1, 7.3) |
| Loading (domain) | 8 | `story-shimmer`, `plan-cover-shimmer`, `gallery-pulse`, `app-pull-refresh-spin`, progress bars |
| Playback (domain) | 36 | `recap-film-*` (32), `momente-story-slide-in`, `momente-story-ken-burns`, `garden-playback-in`, `recap-photo-drift` |

### 7.3 `Element.animate()` by primitive

| File | Calls | Primitive |
| --- | ---: | --- |
| `gestureFlight.ts` | 17 | Flight + landing Feedback |
| `partnerArrival.ts` | 7 | Flight + Feedback |
| `sendFlight.ts` | 3 | Flight |
| `flightKit.ts` | 2 | Flight (shared arc) |
| `promptFlight.ts` | 2 | Flight |
| `cartFlight.ts` | 1 | Flight |
| `useNavigationMotion.ts` | 3 | Gesture follow settle (pager) and Replace `navigate` |
| `useDepartingItems.ts` | 1 | Exit (`collapse-gap`) |
| `ListEntryActions.tsx` | 1 | Gesture follow (reorder drop) into Replace `reorder` (FLIP) |
| `HeartHuntGamePage.tsx` | 1 | Scene Feedback |

### 7.4 Risks found

- **Kept views (M4):** Wir, Momente and Planen are kept tabs. Their one-shot CSS entrances (`WirMotion.css`, `WirHeroStage.css`, `WirDailyCheckIn.css`, `DailyQuoteCard.css`, `TodayPage.css`, `SharedStorySummary.css`, `PlanningReference.css`, `SharedPlanningPages.css`, `layout.css` `root-tab-intro`) restart when the tab is shown again unless the attribute or class that applies them is removed after they finish. The Wir step (separate Wir fixes are shipping now) and the area steps check each one.
- **Infinite loops (M8):** 33 `infinite` declarations; most are garden Scenes and Loading, which are allowed domains, but `RemoteCoupleGames.css` and `WishSelection.css` loops and the garden loops need the visibility controller. Only 4 files pause with `animation-play-state`.
- **Thin strokes (M7):** ring and line keyframes on Wir and the map connection need a check against M7 in the Wir and map steps.
- **Token readers (M1):** nine separate readers, one with a literal `180` fallback.
- **Reduced motion (M9):** 22 separate checks that do not all follow a runtime preference change.
- **Layout transitions (Replace `disclose`):** seven layout transitions in five files; each must be checked against the preferred alternatives.
- **Gestures (4.6):** thresholds, slop and rubber-banding are tuned separately per surface, with similar but different values. The settles do not keep the release velocity. Each surface needs the non-gesture alternative checked.
- **Choreography (M15):** the Wir stage keeps its clock with a surface-specific helper (`wirIntroClock.ts`); there is no per-screen budget.

## 8. Migration plan

Each step is its own issue and pull request. Draft issue texts for steps 2 to 7 are in the description of the pull request that adds this contract. Every user-facing step follows the visual-reference, Mobile Interaction Contract and visual-evidence gates in `AGENTS.md`. Approved product motion is preserved unless the Product Owner decides otherwise.

1. **Contract and library decision** (this document; #2067 step 1). Done when merged and the library decision is approved.
2. **Shared building blocks and guard.**
   - Create the motion layer: token adapter, reduced-motion source, play registry, visibility controller, choreography clock and budget (from `wirIntroClock.ts`), attention scheduler, media reveal registry, haptics adapter (budget, in-app switch, no-op on the Web), the clock primitives and the CSS catalogue.
   - Add the stagger tokens.
   - Move `flightKit.ts`, `useOverlayPresence.ts` and `useDepartingItems.ts` behind the layer without visible change.
   - Land the guard with a ratchet allowlist of today's files, so that no new ad-hoc motion is added during migration.
   - Apply the Product Owner's decision on the gesture test ([6.5](#65-recommendation), [6.6](#66-product-owner-decisions-and-license-conditions)): Gesture follow uses either the layer or Motion.
   - Unit tests for own clock, play scopes, kept-view return, remount, interruption, choreography alignment, budget, attention rate limits, reduced motion and finite ambient.
3. **Wir as the first complete reference.**
   - Migrate everything on Wir to the layer: stage and modules as one choreography, check-in (including the `disclose` row), partner distance, moment gallery, flights, the avatar photos as Enter `media`, quiet hint, ring breath and arrivals under the attention rules.
   - Device acceptance on an Android test release: the opening plays once per app start, nothing replays on tab return, no avatar flash on remount, the ring breath is smooth, and "Wie geht's?" is visible.
   - Wir's files leave the allowlist.
4. **Shell, overlays and navigation.** `ShortTaskSheet`, header notifications, profile/preference modals, quick-action popover, `layout.css` route entrances with `navigate` direction rules, `scroll-state` (floating create tuck, status-bar scrim), `appearance`, shared utilities in `styles.css`.
5. **Gestures and haptics.**
   - Move the tab pager, sheet dismissal, pull to refresh and list reorder onto Gesture follow, with one set of tokenized thresholds and the velocity handoff.
   - Wrap `@dnd-kit` and `@panzoom/panzoom`.
   - Check the non-gesture alternative of every gesture.
   - Haptics (approved 2026-11-19): adopt `@capacitor/haptics` 8.x (MIT), record it in `docs/DEPENDENCIES.md`, connect the haptics adapter to the triggers in [4.10](#410-haptics), add the in-app on/off switch (native app only, localized, device-local), and run device acceptance on an Android test release: system vibration settings, Do Not Disturb, and how the light impacts feel.
6. **Content areas.** Today/Momente/Story, Planning, shared content pages, notifications, composer, insights, wishes, people and settings, login and startup, paywall, map connection, the Moments (gesture receipt, connected moment, achievement, once messages), and the remaining `disclose` uses.
7. **Bounded domains.** Recap film, story playback, garden and games adopt the token adapter, reduced-motion source and visibility controller. Their keyframes move into the CSS catalogue's domain sections.
8. **Close the guard.** The allowlist is empty. The guard rejects:
   - `@keyframes` and `.animate()` outside the motion layer;
   - `infinite` outside the registered domains;
   - layout properties in keyframes, and layout transitions outside the registered `disclose` uses;
   - `scale` keyframes on elements marked as thin strokes, where detectable;
   - `cubic-bezier(` and literal durations in animation declarations;
   - `pointermove`/`touchmove` handlers outside the layer and the wrapped gesture components.

## 9. Review checklist addition

In addition to Motion Guideline section 10, a pull request with new or changed motion states:

- the primitive (or bounded domain) and variant from [section 4](#4-primitive-catalogue);
- the motion identity and play scope of each one-shot motion;
- how it ends (M2) and that it was checked with a kept-tab return (M4) and a remount (M5) where the surface allows them;
- that only allowed properties move (M6, M7);
- for ambient motion: the finite repeat and the pause conditions (M8);
- for gestures: the commit/cancel thresholds, the release handoff, interruption, and the non-gesture alternative (4.6);
- for unprompted motion: its priority and rate limit (4.9);
- whether the screen's budget and choreography clock are kept (M15), and any haptics (4.10).

## 10. Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-11-19 | First version (#2067). It contains:<br>• a catalogue of seven primitives, extended before merge at the Product Owner's request with Gesture follow and Moment;<br>• the Replace variants `navigate`, `disclose`, `value`, `scroll-state` and `appearance`, the Enter `media` variant, Feedback `refuse` and Flight `return`;<br>• the attention and haptics rules and the gap audit;<br>• invariants M1 to M16;<br>• the motion layer;<br>• the library recommendation; the choice was deferred by the Product Owner to a gesture test, with Motion for gestures approved conditionally on its MIT license (never Motion+);<br>• haptics, approved by the Product Owner;<br>• the inventory and the migration plan. |
