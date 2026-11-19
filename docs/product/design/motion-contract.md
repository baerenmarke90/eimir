# eimir. Motion Contract

**Version:** 1.0 (2026-11-19)  
**Status:** Normative lower-level design-system contract under Product Reference v1 once merged. The library decision in [section 6](#6-library-decision) is **pending Product Owner approval**.  
**Scope:** Canonical Web/Mobile Web UI, including the Capacitor-delivered Android app  
**Issue:** [#2067](https://github.com/baerenmarke90/eimir/issues/2067)  
**Baseline:** `main` at `915e97ec8`

This contract adds three things to the [Web Motion Guideline](motion-guideline.md) (#1204):

1. a small, closed **catalogue of motion primitives** that every animation in the app must belong to;
2. **lifecycle invariants** that each primitive must keep: how it ends, when it may replay, how it survives remounts and hidden tabs, which properties it may animate;
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

The measured inventory ([section 7](#7-inventory-on-main-at-915e97ec8)) shows 257 `@keyframes` in 65 CSS files and 37 `.animate()` calls written by hand per feature, with three separate token readers and 22 separate reduced-motion checks in TypeScript.

## 2. Terms

- **Motion layer:** the shared module that implements this contract (proposed path `web/src/motion/`, see [section 5](#5-the-motion-layer)). Feature code asks the layer for a primitive. It does not write `@keyframes` or call `Element.animate()` itself.
- **Motion identity:** a stable string that names *what* plays, for example `wir.stage`, `wir.module.planning`, `today.quote`. It never contains personal content, ids of private items, or user input.
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
- for the Playback domain only: `filter` and `clip-path` on one layer at a time, with a recorded reason in its owning document.

Never animated: layout properties (`width`, `height`, `max-height`, `top`, `left`, `right`, `bottom`, `inset`, `margin`, `padding`, `gap`, `font-size`, `line-height`, `border-width`, grid/flex tracks). Expand/collapse follows Motion Guideline section 3 ("Expand and collapse").

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

Two bounded domains may loop while visible; both still pause when hidden or off screen and stop with reduced motion: **Loading indicators** (until the status is known, Motion Guideline section 3) and **Scenes** (game playfields such as the garden, Heart Hunt and Picture Ping-Pong; see [4.6](#46-bounded-domains-loading-playback-scenes)).

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

After migration, `@keyframes` and `Element.animate()` exist only inside the motion layer (and in the bounded domains' registered files during their migration, see [section 8](#8-migration-plan)). Feature code uses CSS `transition` with token roles for simple state changes. Transitions do not restart when a view returns from `display: none`, so they stay allowed everywhere.

## 4. Primitive catalogue

The catalogue is closed. A motion that does not fit one of these five primitives, or one of the bounded domains in 4.6, needs a new version of this contract first.

Mapping from the Guideline's roles:

| Motion Guideline role (section 3) | Primitive |
| --- | --- |
| Reveal / progressive disclosure, Sheet / drawer (enter), Modal / dialog (enter), Overlay / backdrop (enter), Page / route transition | Enter |
| List mutation, State transition, Page / route content handoff, Sheet / dialog / overlay (exit) | Replace / Exit |
| Micro / press feedback, Completion / success, Celebration / emphasis | Feedback |
| Send flights, partner arrival, gesture flight (Guideline section 2) | Flight |
| Wir ring breath, garden life, handmade sway | Ambient |
| Loading / async state | Loading (bounded domain) |

### 4.1 Enter

Content arrives: a screen's opening stage, a module reveal, a staggered list, a sheet, dialog or popover appearing.

| Aspect | Rule |
| --- | --- |
| Variants | `fade` (opacity), `rise` (opacity + small `translate` up, at most 12 CSS px), `surface` (sheet/dialog/popover with backdrop, one lifecycle), `stage` (a staged opening of several beats), `stagger` (siblings one after another), `draw` (a line drawn in with `stroke-dashoffset`) |
| Duration | `--duration-context` for a single element; `--duration-transition` for a small popover; `--duration-sequence-beat` per beat of a `stage`; longer roles only where an approved decision names them (for example `--duration-gesture-moment` in the Wir stage) |
| Easing | `--easing-enter` |
| Stagger | proposed new tokens (see [5.3](#53-token-extensions-proposed)): `motion.stagger.item` per sibling and `motion.stagger.maxItems`; items after the cap arrive together with the last staggered one. A `stagger` never moves items sideways inside a horizontal scroller (it would widen the strip; Guideline Wir decision) |
| Ends | on its own clock (M2) |
| Replays | never on re-render, refetch, remount or kept-view return (M3, M4). Play scope per identity: `app-start` for an opening stage, `session` for module reveals, `surface` for sheets and popovers (each opening is a new identity) |
| Remount | final state in the same frame (M5) |
| Off screen | `on first reach` for module reveals, otherwise final state (M12) |
| Reduced motion | final state at once; `surface` may keep a backdrop opacity change of at most `--duration-transition` |

### 4.2 Replace / Exit

Something already on screen changes or leaves: a value changes, an item is reordered or removed, a sheet closes, the content of a route is handed over, a picture is cross-faded.

| Aspect | Rule |
| --- | --- |
| Variants | `crossfade` (old and new overlap with opacity), `reorder` (FLIP with `translate` from the measured old position), `exit` (opacity, optionally a small `translate`, then unmount), `collapse-gap` (remaining items close the gap with `translate`, never `height`), `surface-exit` (sheet/dialog/popover and backdrop leave as one) |
| Duration | `--duration-transition` for values and reorder; `--duration-context` for exits and gaps; `--duration-feedback` for small value ticks |
| Easing | `--easing-standard` for crossfade and reorder; `--easing-exit` for exit |
| Presence | the authoritative state changes at once; the presentation node stays mounted only until the exit's own finished signal (Guideline section 5); a bulk change (filter swap, more than `MAX_ANIMATED_DEPARTURES`, today 12) is replaced without motion |
| Ends | own clock (M2); interruption converges (M11) |
| Replays | not applicable; a change is a new event, never replayed by a remount |
| Reduced motion | immediate final state; a `crossfade` may stay as an opacity change of at most `--duration-transition` |

### 4.3 Feedback

A direct response to a person's action or a confirmed result: press, toggle, selection, success tick, affectionate pulse, a small celebration.

| Aspect | Rule |
| --- | --- |
| Variants | `press` (`--control-pressed-scale`, brightness), `toggle` (state change with transition), `success` (one short acknowledgement after a confirmed result), `affection` (heart pulse, bloom; one beat), `celebrate` (rare shared result; Guideline "Celebration / emphasis") |
| Duration | `--duration-feedback` for press and toggle; `--duration-transition` for success; `--duration-context` up to `--duration-gesture-moment` for `affection` and `celebrate` only where a decision names it |
| Easing | `--easing-standard`; `--easing-settle` only for an approved small settle |
| Trigger | only a direct action or an authoritative result, never pending or optimistic state, never a refetch |
| Ends | own clock; a second action interrupts and restarts the beat (M11) |
| Replays | never on remount or return; each action is its own event |
| Properties | M6, including the small color/shadow exception |
| Reduced motion | the pressed or selected state is still visible; no scale or travel; the confirmed result appears at once |

### 4.4 Flight (shared element)

An item travels from A to B to show where it went: the check-in values into the own badge, "Wie geht's?" into the plus, a sent gesture to the partner avatar, an item into a cart or list.

| Aspect | Rule |
| --- | --- |
| Mechanism | a decorative ghost in the shared top-layer flight layer (`FlightLayer.css`, today `flightKit.ts`) travels along an arc with `transform` only; source and target stay in the layout and never move for the flight; the target's landing beat is a Feedback |
| Duration | `--duration-send-flight`; the gesture choreography uses `--duration-gesture-moment` and `--duration-gesture-sequence` as approved |
| Easing | `--easing-standard` for travel; `--easing-settle` for an approved landing |
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

### 4.6 Bounded domains: Loading, Playback, Scenes

These are not primitives. They are areas whose motion is defined by their own clock instead of a single change. They keep M1, M2, M6, M9, M10 and M13, and they run inside the motion layer's ambient controller for M8 pausing.

- **Loading:** shimmer, spinner, progress pulse. Loops until the status is known; no interaction delay; reduced motion stops the movement and keeps text, shape and `aria-busy`/status.
- **Playback:** the recap film (`RecapFilmScene.css`), story playback (`DiscoverStory.css`, `useStoryPlayback.ts`), garden playback. A playback engine composes Enter and Replace scenes on its own scene clock and may use the Playback property exception in M6. It pauses with the page and with an explicit pause control.
- **Scenes:** interactive game playfields (garden, Heart Hunt, Picture Ping-Pong, remote games). The scene may loop ambient life while it is visible and in use; it pauses when hidden or off screen and is absent with reduced motion. Taps inside the scene are Feedback.

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

**Status: recommendation, pending Product Owner approval.** The reuse review follows `docs/REUSE-BEFORE-BUILD.md`.

### 6.1 Requirements

From the catalogue and invariants:

1. own clock and interruption (M2, M11);
2. play identities and scopes, kept-view and remount safety (M3 to M5): this is app policy that no library provides;
3. compositor-friendly animation of opacity and transform that keeps running smoothly while React renders (the Wir opening runs while the page renders);
4. presence/exit, FLIP reorder, stagger, flights;
5. reduced motion from one source and token-driven values;
6. works on the Android WebView floor (Chromium 111) and the Web floor (Chrome/Edge 111, Firefox 114, Safari/iOS 16.4);
7. license compatible with eimir. (PolyForm Noncommercial source, commercial eimir. Cloud, Self-Hosted redistribution);
8. small runtime cost on mid-range Android, low migration cost for 257 keyframes and 37 WAAPI calls.

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
| Fallback without it | not applicable (platform APIs) | remove the dependency: the layer behind it would still be needed | not applicable | none needed (skips the animation) | — | — | — |

### 6.5 Recommendation

**Recommended: an in-house motion layer on the Web Animations API and one shared CSS catalogue, with no new runtime dependency.** Motion is the documented alternative if the Product Owner prefers a ready-made third-party library.

Rationale:

1. **The defects are lifecycle-policy defects.** Ending on an own clock, play identities, kept-view and remount safety, and finite visible-only ambient motion are eimir. rules. No candidate provides them. With Motion they still have to be written, and its React model of starting an animation on mount is the pattern that caused the remount and replay defects unless every call site opts out.
2. **Reuse order.** The mechanics are a web standard (WAAPI) and platform capabilities (`IntersectionObserver`, `visibilitychange`, `matchMedia`), which rank first and second in `REUSE-BEFORE-BUILD.md`. The custom part is limited to the policy that no library offers. This is why custom implementation is justified here.
3. **Smoothness on mid-range Android.** WAAPI `opacity`/`transform` animations run on the compositor while React renders. Motion's main ergonomics (independent `x`, `y`, `scale`) are not accelerated, so using Motion safely would mean writing full transform strings and losing most of its convenience.
4. **Cost and migration.** About 3 to 5 kB instead of about 35 to 47 kB gzip. The 37 existing `.animate()` calls and `flightKit.ts` already follow this approach, so migration consolidates rather than rewrites, and the app does not run two motion idioms side by side.
5. **No license or supply-chain change.** GSAP is excluded on license grounds. anime.js and AutoAnimate cover only parts of the catalogue.

Kept as options, not part of v1:

- **React `<ViewTransition>`** for route-level Replace on the Android app (WebView ≥ 111), as a progressive enhancement after a separate evaluation, because it blocks input during a transition and is unavailable on the Firefox and Safari floors.
- **Switch to Motion** (`motion/react` with `LazyMotion`, `m`, lazy `domAnimation`) if later work needs general layout animation of arbitrary layout changes (`layout`/`layoutId`) or physics springs often enough that maintaining FLIP in the layer costs more than the dependency. The layer's API stays the same so that only its implementation would change.

**Product Owner decision needed:** approve the in-house layer, or choose Motion instead. See the PR description for the German summary.

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

### 7.2 `@keyframes` by primitive

Classified from keyframe names and their use with `infinite` or `--motion-ambient-repeat`, then corrected by hand. The building-blocks issue produces the authoritative per-keyframe register.

| Primitive | Count | Typical members |
| --- | ---: | --- |
| Enter | 85 | `wir-intro-*`, `wir-reveal-*`, `today-module-reveal`, `short-task-sheet-enter*`, `preference-modal-*enter`, `header-notifications-*-enter`, `shared-story-lifeline-*`, `planen-panel-in`, `root-tab-intro`, `detail-page-open`, `eimir-disclosure-reveal` |
| Replace / Exit | 19 | `short-task-sheet-exit*`, `preference-modal-*exit`, `partner-gesture-receipt-exit`, `media-overview-tile-depart`, `wir-moment-out`, `wir-distance-leave` |
| Feedback | 47 | `notification-*` (9), `partner-gesture-*` beats, `garden-tap-*`, `eimir-success`, `eimir-affectionate-pulse`, `wir-checkin-vibe-pop`, `heart-hunt-pop` |
| Flight | 14 | `wir-checkin-slot-land`, `wir-intro-pin-land`, `wish-journey-connect*`, `place-map-connection-*`, `pingpong-fly-*` (most flights are WAAPI, see 7.3) |
| Ambient | 48 | `wir-breathe`, `story-hang-sway`, `today-retrospective-sway`, `partner-gesture-breathe`, about 40 garden life keyframes |
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
| `useNavigationMotion.ts` | 3 | Enter / Replace (route content) |
| `useDepartingItems.ts` | 1 | Exit (`collapse-gap`) |
| `ListEntryActions.tsx` | 1 | Replace (`reorder`, FLIP) |
| `HeartHuntGamePage.tsx` | 1 | Scene Feedback |

### 7.4 Risks found

- **Kept views (M4):** Wir, Momente and Planen are kept tabs. Their one-shot CSS entrances (`WirMotion.css`, `WirHeroStage.css`, `WirDailyCheckIn.css`, `DailyQuoteCard.css`, `TodayPage.css`, `SharedStorySummary.css`, `PlanningReference.css`, `SharedPlanningPages.css`, `layout.css` `root-tab-intro`) restart when the tab is shown again unless the attribute or class that applies them is removed after they finish. The Wir step (separate Wir fixes are shipping now) and the area steps check each one.
- **Infinite loops (M8):** 33 `infinite` declarations; most are garden Scenes and Loading, which are allowed domains, but `RemoteCoupleGames.css` and `WishSelection.css` loops and the garden loops need the visibility controller. Only 4 files pause with `animation-play-state`.
- **Thin strokes (M7):** ring and line keyframes on Wir and the map connection need a check against M7 in the Wir and map steps.
- **Token readers (M1):** nine separate readers, one with a literal `180` fallback.
- **Reduced motion (M9):** 22 separate checks that do not all follow a runtime preference change.

## 8. Migration plan

Each step is its own issue and pull request. Draft issue texts for steps 2 to 7 are in the description of the pull request that adds this contract. Every user-facing step follows the visual-reference, Mobile Interaction Contract and visual-evidence gates in `AGENTS.md`. Approved product motion is preserved unless the Product Owner decides otherwise.

1. **Contract and library decision** (this document; #2067 step 1). Done when merged and the library decision is approved.
2. **Shared building blocks and guard.** Create the motion layer (token adapter, reduced-motion source, play registry, visibility controller, the five primitives, CSS catalogue), add the stagger tokens, move `flightKit.ts`, `useOverlayPresence.ts` and `useDepartingItems.ts` behind the layer without visible change, and land the guard with a ratchet allowlist of today's files so that no new ad-hoc motion is added during migration. Unit tests for own clock, play scopes, kept-view return, remount, interruption, reduced motion and finite ambient.
3. **Wir as the first complete reference.** Migrate everything on Wir (stage, modules, check-in, partner distance, moment gallery, flights, quiet hint, ring breath) to the layer. Device acceptance on an Android test release: opening once per app start, no replay on tab return, no avatar flash on remount, smooth ring breath, "Wie geht's?" visible. Wir's files leave the allowlist.
4. **Shell, overlays and navigation.** `ShortTaskSheet`, header notifications, profile/preference modals, quick-action popover, `layout.css` route entrances, `useNavigationMotion.ts`, shared utilities in `styles.css`.
5. **Content areas.** Today/Momente/Story, Planning, shared content pages, notifications, composer, insights, wishes, people and settings, login and startup, paywall, map connection.
6. **Bounded domains.** Recap film, story playback, garden and games adopt the token adapter, reduced-motion source and visibility controller; their keyframes move into the CSS catalogue's domain sections.
7. **Close the guard.** The allowlist is empty; the guard rejects `@keyframes` and `.animate()` outside the motion layer, `infinite` outside the registered domains, layout properties in keyframes, `scale` keyframes on elements marked as thin strokes where detectable, `cubic-bezier(` and literal durations in animation declarations.

## 9. Review checklist addition

In addition to Motion Guideline section 10, a pull request with new or changed motion states:

- the primitive (or bounded domain) and variant from [section 4](#4-primitive-catalogue);
- the motion identity and play scope of each one-shot motion;
- how it ends (M2) and that it was checked with a kept-tab return (M4) and a remount (M5) where the surface allows them;
- that only allowed properties move (M6, M7);
- for ambient motion: the finite repeat and the pause conditions (M8).

## 10. Changelog

| Version | Date | Change |
| --- | --- | --- |
| 1.0 | 2026-11-19 | First version: primitive catalogue, invariants M1 to M14, motion layer, library recommendation pending Product Owner approval, inventory, migration plan (#2067). |
