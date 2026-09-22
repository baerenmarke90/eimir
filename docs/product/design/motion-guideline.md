# eimir. Web Motion Guideline

**Status:** Normative lower-level product/design-system contract under Product Reference v1  
**Scope:** Canonical Web/Mobile Web UI, including the Capacitor-delivered product  
**Baseline:** Product Reference v1 and `design-system-direction.md` section 8  
**Issue:** #1204

This document operationalizes the existing motion direction. It does not create a second visual language and it does not authorize animation for its own sake. Product Reference v1, the Partner-App Experience Standard, component contracts, accessibility, privacy and security remain higher-order constraints.

## 1. Principle

Motion explains one or more of:

- where something came from;
- what state changed;
- continuity between two related states;
- a confirmed completion or result;
- spatial relationship between a control and the surface it opened.

If none of those needs explanation, no motion is required.

Motion never:

- delays a domain mutation, navigation, query publication or error state;
- hides the only representation of status or hierarchy;
- blocks the next useful action;
- substitutes for focus, semantic state, copy or accessible announcements;
- adds movement merely to make a quiet surface look more active.

Compact/smartphone is the normative interaction reference. Expanded may adapt geometry but keeps the same semantic role.

## 2. Canonical token vocabulary

`design/tokens.json` is the only value source for new or materially changed motion work.

| Semantic use | Source token | Current value | Generated Web role |
| --- | --- | ---: | --- |
| no movement | `motion.duration.instant` | 0 ms | reduced-motion fallback |
| micro / press feedback | `motion.duration.fast` | 120 ms | `--duration-feedback` |
| ordinary state transition | `motion.duration.standard` | 180 ms | `--duration-transition` |
| spatial/contextual enter | `motion.duration.emphasized` | 280 ms | `--duration-context` |
| normal upper guardrail | `motion.duration.maximum` | 320 ms | no default alias; not a routine duration |
| state / settled movement | `motion.easing.standard` | 0.2, 0, 0, 1 | `--easing-standard` |
| entering / spatial arrival | `motion.easing.enter` | 0, 0, 0.2, 1 | `--easing-enter` |
| exit / dismissal | `motion.easing.exit` | 0.4, 0, 1, 1 | `--easing-exit` |

The 320 ms token is a guardrail, not a fourth default speed. Continuous loading indicators may have a longer visual cycle when the cycle itself does not delay interaction or state and is removed for reduced motion.

Do not add component-local duration scales or `cubic-bezier(...)` curves. If the three easing roles cannot truthfully express a repeated interaction, extend the token contract first and migrate equivalent consumers deliberately.

The former `--motion-duration-*`, `--motion-easing-*` and `--motion-fast` compatibility aliases were retired from production Web by #1213. Do not reintroduce them; historical fixtures or previews that need motion must use the generated roles as well.

## 3. Motion roles

| Role | Use motion when | No motion needed when | Duration / easing | Preferred properties | Enter | Exit | Reduced motion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Micro / press feedback | A direct press, selection or toggle benefits from tactile confirmation | Native control feedback is already clear | fast / standard | `transform`, color, background, border | Immediate response; optional tiny settle | Immediate release | Remove translation/scale; retain visible selected/pressed state |
| State transition | A local state changes in place | The new state is already self-evident and movement would add noise | standard / standard | opacity, color, transform | Short local change | Short local reversal when useful | Instant or short opacity-only change |
| Reveal / progressive disclosure | New related content unfolds from a known control or viewport position | Static content merely mounts because a parent rerendered | standard / enter | transform + optional opacity | Small spatial offset that explains origin | Only if dismissal/collapse is meaningful | No translation/scale; instant or restrained opacity |
| Sheet / drawer | A Compact contextual layer is spatially attached to an edge | A dedicated page is the correct task boundary | emphasized / enter; standard / exit | transform; backdrop opacity | Surface and backdrop enter as one lifecycle | Surface and backdrop leave as one lifecycle before unmount | Remove translation; immediate or short opacity; same focus/back/result semantics |
| Modal / dialog | A bounded consequential decision needs a modal layer | Ordinary browsing, long capture or routine success | standard / enter and standard / exit | opacity; at most a very small scale if spatially justified | One bounded arrival | One bounded dismissal before unmount | Remove scale/translation; immediate or short opacity |
| Overlay / backdrop | It communicates a temporary top layer | The surface is non-modal | standard / standard or exit | opacity only | Starts with owning surface | Ends with owning surface | Immediate or short opacity; never changes modality semantics |
| List mutation | Added/removed/reordered content needs continuity | A server refresh would merely replay entrance motion | fast or standard / standard | transform + opacity on the affected item | Local item only | Local item only, with presence retained until exit completes when an exit is useful | Immediate mutation; preserve final order and announcements |
| Completion / success | A confirmed result deserves concise acknowledgement | Pending/optimistic state is not yet authoritative | standard; up to emphasized for a meaningful shared completion / standard or enter | transform + opacity | Only after confirmed result | Usually not required; ordinary continuation replaces it | Show the same confirmed result immediately |
| Celebration / emphasis | A rare meaningful shared result benefits from one restrained moment | Routine saves, every tap, errors, quotas or upgrade prompts | emphasized / enter or standard; maximum only with explicit justification | transform + opacity; no large travel | One-shot, non-blocking | Not normally animated | Remove decorative movement; keep result/copy |
| Page / route transition | A modest content change preserves orientation while the shell stays stable | Route ownership, scroll restoration or task return would be disturbed | standard / standard | transform or opacity on a bounded content surface | Optional and scoped | Do not hold navigation for animation | Instant or short opacity; preserve restored position |
| Loading / async state | Motion helps identify an indeterminate placeholder | Text/status already communicates progress sufficiently | no interaction delay; loop timing may differ from transition scale | opacity or transform only | Status appears immediately | Status disappears immediately when result is known | Stop shimmer/spin/pulse; keep text, shape and `aria-busy`/status |

### Expand and collapse

Prefer semantic disclosure primitives such as `<details>` or a bounded state change. Do not animate `height`, `max-height`, margins, `top` or `left` by default. When the exact content height is part of the interaction and a layout animation is demonstrably necessary, keep the scope local, measure it deliberately and verify reflow/scroll stability.

## 4. Easing rules

- **standard**: local state changes and settled feedback.
- **enter**: content arriving from a meaningful spatial origin, including sheet entry and restrained reveal.
- **exit**: surfaces leaving or items being dismissed.
- **emphasis** is a semantic role, not currently a separate curve. Use an existing easing role unless the token source gains an approved repeated emphasis easing.
- Do not encode a new easing in a component merely because it looks smoother in isolation.

## 5. Presence and lifecycle are part of motion

CSS cannot provide an exit animation after React has already removed the element.

For surfaces where exit matters:

1. authoritative product state may change immediately;
2. presentation presence may remain briefly in an explicit exiting phase;
3. the exit completion signal comes from the transition/animation lifecycle, not a guessed timeout;
4. then the presentation node unmounts;
5. focus restoration, scroll lock, inertness and history ownership remain correct throughout the handoff.

Do not couple network revalidation to animation completion. Do not use animation duration as a data-consistency clock.

For modal layers, backdrop and surface share one presence lifecycle. Closing through visible Close, Escape/System Back, backdrop, browser history and deliberate navigation must converge on the same contract.

## 6. Reduced motion

`prefers-reduced-motion: reduce` is part of the behavior contract.

Reduced motion:

- removes translation, scale, parallax, shimmer, shake, bounce and decorative pulse;
- may retain a short opacity/color transition where it improves comprehension without spatial movement;
- may switch directly to the final state;
- keeps identical information, hierarchy, focus, modality, status, error, recovery and success semantics;
- must not introduce an extra intermediate state or a delayed close;
- must not turn a valid interaction into an abrupt broken lifecycle.

A JS motion branch is acceptable only when browser behavior itself changes, such as `scroll-behavior: smooth`. Prefer CSS media queries for presentation.

## 7. Performance and scroll stability

Prefer compositor-friendly `transform` and `opacity`. Avoid animating layout-critical properties unless the interaction requires it.

- No persistent `will-change` on lists, feeds or unrevealed off-screen items.
- No global wrapper animation that changes measurement coordinates, creates an avoidable stacking context, or replays because unrelated state remounted a subtree.
- Route/task return must restore the authoritative scroll/list position independently of motion.
- Drag/swipe feedback follows the pointer directly; settling may animate after release.
- Motion must not trigger a request, invalidate a query, retry a mutation or delay publication of a successful result.
- Do not use artificial delays to stage data-backed UI.

## 8. Reference matrix

| Interaction | Pattern | Token / easing | Preferred primitive | Reduced-motion behavior |
| --- | --- | --- | --- | --- |
| Button press | micro feedback | fast / standard | native button + shared control styling | no scale/translation; state remains visible |
| Bottom Sheet | spatial contextual layer | emphasized enter / enter; standard exit / exit | `ShortTaskSheet` where its task contract fits | no travel; same close/focus/history contract |
| Dialog | bounded modal decision | standard / enter; standard / exit | native dialog or established modal lifecycle | no scale/travel; same modality/focus |
| Expand | progressive disclosure | standard / enter | native disclosure or bounded reveal | immediate content, same control state |
| Collapse | reverse disclosure | standard / exit | same disclosure owner | immediate removal after semantic state change |
| Local list mutation | affected-item continuity | fast-standard / standard | domain mutation + local presentation presence | immediate final list order |
| Item complete | confirmed local state | fast-standard / standard | shared toggle/mutation primitive | immediate checked/completed state |
| Item remove | local exit then unmount when useful | standard / exit | list presence owner | immediate removal |
| Success | concise confirmation | standard / standard | inline result / Snackbar where appropriate | immediate result |
| Celebration | rare meaningful emphasis | emphasized / enter | shared achievement pattern when semantics match | static confirmed composition |
| Toast / Snackbar | non-critical acknowledgement | optional fast-standard / standard | `Snackbar` | immediate appearance/removal is acceptable |
| Overlay / backdrop | modal layer cue | standard / standard-exit | owning sheet/dialog/lightbox lifecycle | immediate/opacity-only |
| Navigation content | bounded continuity, stable shell | optional standard / standard | route-owned content surface | instant content handoff with position preserved |

## 9. Existing shared responsibilities

The audit found useful primitives that new work should reuse rather than duplicate:

- `design/tokens.json` + generated `product-roles.css`: canonical duration/easing source and reduced-duration aliases.
- `ShortTaskSheet`: native dialog modality, Compact drag dismissal, history/back ownership and shared modal lifecycle for bounded contextual tasks.
- `useModalLifecycle`: ref-counted body scroll lock, initial focus and focus restoration for modal-like layers.
- `useDismissiblePopover`: outside-pointer, Escape, route-change and trigger-focus behavior for non-modal anchored popovers.
- `ChecklistToggle`: tokenized local completion feedback.
- `SharedAchievementCelebration`: existing shared-completion presentation.
- `Snackbar`: decoupled non-critical acknowledgement independent of mutation ownership.
- Story Timeline/Discover progressive reveal hooks: viewport-owned reveal and reduced-motion behavior with no persistent `will-change`.
- Media gallery/lightbox: explicit carousel movement with JS reduced-motion handling and shared modal focus/scroll mechanics.

These are not universal components. A lightbox is not a Bottom Sheet; a popover is not a modal; completion is not route motion.

## 10. Review checklist for new or changed motion

Before shipping:

- identify the semantic role from section 3;
- reuse canonical duration/easing tokens;
- confirm that no existing primitive already owns the lifecycle;
- verify Enter and, where meaningful, Exit including rapid open/close;
- verify reduced motion;
- verify focus trap/restore, Escape/Back and backdrop behavior for overlays;
- verify mutation/query ownership is independent of animation;
- verify Compact first, then Expanded;
- verify Light/Dark where presentation-sensitive;
- verify 200% text/reflow and scroll stability where geometry changes;
- use visual evidence only when the change actually alters user-facing behavior or appearance.

A documentation-only change does not justify synthetic UI tests or screenshots.
