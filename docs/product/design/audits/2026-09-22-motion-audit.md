# Web Motion Audit — 2026-09-22

**Issue:** #1204  
**Audited baseline:** `main@a9749f346f535f8ff4cbe205e8ed77806d2c3d00`  
**Parallel work included:** #1207/#1197, #1208/#1203, #1209/#1202 and #1210/#1200 were already merged into the audited baseline.  
**Scope:** Production Web/Mobile Web source, shared motion/design tokens, overlay and focus lifecycles, relevant tests and current follow-up issues.

This is a source-level repository audit, not a claim that every interaction was manually exercised on every device. Runtime acceptance remains required in the implementation follow-ups that change presentation.

## 1. Classification

- `OK_NO_MOTION`: no animation is required for the product meaning.
- `OK_EXISTING_PATTERN`: the current shared/feature pattern is appropriate.
- `MISSING_MOTION`: motion is useful and the current transition is abrupt or absent.
- `INCONSISTENT`: correct intent, but timing/easing/ownership does not match the common language.
- `WRONG_PRIMITIVE`: a different existing responsibility/primitive should own the interaction.
- `LIFECYCLE_PROBLEM`: mount/unmount, focus, history or presence prevents a correct Enter/Exit contract.
- `PERFORMANCE_RISK`: motion can cause avoidable layout/compositor/scroll work.
- `REDUCED_MOTION_GAP`: reduced motion does not preserve the required contract cleanly.
- `FIXED_IN_1204`: a small central defect was safe and necessary to correct in the #1204 foundation slice.

## 2. Token inventory

### Canonical source

`design/tokens.json` defines:

| Token | Value | Intended semantic role |
| --- | ---: | --- |
| `motion.duration.instant` | 0 ms | no movement / reduced fallback |
| `motion.duration.fast` | 120 ms | micro / press feedback |
| `motion.duration.standard` | 180 ms | ordinary state transition |
| `motion.duration.emphasized` | 280 ms | spatial/contextual entry |
| `motion.duration.maximum` | 320 ms | normal upper guardrail |
| `motion.easing.standard` | cubic-bezier(0.2, 0, 0, 1) | settled state |
| `motion.easing.enter` | cubic-bezier(0, 0, 0.2, 1) | entry/spatial arrival |
| `motion.easing.exit` | cubic-bezier(0.4, 0, 1, 1) | dismissal |

`web/src/design/product-roles.css` is generated from that source and exposes the currently supported semantic Web aliases:

- `--duration-feedback` → 120 ms;
- `--duration-transition` → 180 ms;
- `--duration-context` → 280 ms;
- `--easing-standard`;
- `--easing-enter`;
- `--easing-exit`.

Reduced motion sets all three generated duration roles to `0ms`.

### Competing legacy vocabularies

The audit found two additional production timing languages:

1. `web/src/theme.css`:
   - `--motion-duration-short: 160ms`;
   - `--motion-duration-medium: 220ms`;
   - `--motion-duration-long: 300ms`;
   - `--motion-easing-reveal/lift/settle/pulse`.
2. `web/src/styles.css`:
   - `--motion-fast: 180ms ease-out`.

The legacy systems have many production consumers while the canonical generated duration roles have only partial adoption. This is RC-01 and is tracked by #1213.

### Raw timing drift found

Representative production examples:

- `DailyVibeCheckIn.css`: 520 ms and 640 ms reveal/emphasis, plus 90 ms staging delay;
- `DailyEnergyCheckIn.css`: 440 ms battery-fill emphasis;
- `ThinkingOfYouButton.css`: 0.6/0.8 s pulse/beat loops and 0.4 s success/error effects;
- `HeartEmotionVisual.css`: 420 ms detail settle;
- `StoryDiscoverReveal.css`: 195 ms local reveal;
- `StoryTimelineProgressive.css`: 210 ms local reveal;
- `theme.css`: raw 0.4 s body theme-color transition.

The Today/HeartEmotion values above 320 ms are outside the accepted interaction-transition guardrail and require semantic reconciliation, not mechanical shortening.

### Small defect corrected in #1204

`DailyQuoteCard.css` referenced undefined `--duration-standard` and `--duration-fast` variables. The declarations therefore could not resolve to the intended tokenized motion.

#1204 changes them to:

- `--duration-transition`;
- `--duration-feedback`;

and adds a source-level guard in `productRoles.test.ts`.

## 3. Primitive and lifecycle inventory

| Responsibility | Existing primitive/implementation | Assessment |
| --- | --- | --- |
| Canonical motion values | `design/tokens.json` → generated `product-roles.css` | Keep; source of truth |
| Bounded Compact task sheet | `ShortTaskSheet` | Strong base; exit presence incomplete |
| Modal focus + body scroll | `useModalLifecycle` | Keep; shared top-layer mechanics |
| Browser-back editor ownership | `useEditorHistoryEntry` | Keep; data/task lifecycle independent of animation |
| Anchored dismissible popover | `useDismissiblePopover` | Keep for non-modal popovers |
| Checklist completion feedback | `ChecklistToggle` | Good canonical token consumer |
| Shared completion result | `SharedAchievementCelebration` | Good semantic primitive; some child hover styling remains legacy |
| Global acknowledgement | `Snackbar` + event channel | Keep; animation is optional |
| Generic mount reveal | `.eimir-motion-reveal` | Too broad; retire as default mount behavior |
| Planning reveal override | `SharedPlanningMotion.css` | Symptom of generic reveal overreach; likely obsolete after #1214 |
| Timeline progressive reveal | `StoryTimelineProgressive` | Correct scoped ownership; timing still legacy |
| Discover progressive reveal | `StoryDiscoverReveal` | Correct scoped ownership; timing still legacy |
| Media carousel/lightbox | `MediaGallery` + snap tracks + `useModalLifecycle` | Keep domain-specific; reduced smooth scrolling is handled |
| Loading skeleton/pulse | feature CSS with reduced-motion guards | Keep where it communicates loading without blocking |

No production `will-change` hint was found in the audited reveal surfaces. Timeline/Discover explicitly avoid persistent layer promotion, and `webLayout.test.ts` protects that performance choice.

## 4. Lifecycle findings

### ShortTaskSheet

Good existing behavior:

- native `<dialog>.showModal()`;
- shared body-scroll and focus lifecycle;
- browser-history ownership separated through `useEditorHistoryEntry`;
- Compact pointer drag follows the pointer directly;
- drag-dismiss waits for a real `transitionend`;
- reduced motion skips the spatial dismissal immediately;
- navigation closes native modality before destination focus is assigned.

Gap:

- drag dismissal has an explicit exiting presence state, but Close, Escape/Back and ordinary state close can complete the React close path without an equivalent visual exit;
- the base transform transition uses the emphasized duration for dismissal, while the product direction calls for emphasized Enter and standard Exit.

This is RC-03, tracked by #1215. #1198 should consume that foundation rather than duplicate timing logic.

### Compact notifications

`HeaderNotificationsMenu` already reuses `useModalLifecycle` and focus containment, but Compact uses its own portalled dialog/backdrop surface and currently mounts/unmounts abruptly. This remains owned by #1198, with #1215 as the shared lifecycle prerequisite/reference.

### PreferenceDialog

`PreferenceDialog` uses shared scroll/focus mechanics but still:

- mounts a local backdrop/dialog implementation;
- applies the generic reveal utility;
- uses a 20 ms focus staging timeout;
- disables shared focus restoration and relies on caller behavior.

This is a migration candidate under #1215, not a reason to create another universal modal abstraction in #1204.

### Media lightbox

The lightbox is intentionally not a Bottom Sheet. It already reuses shared modal focus/scroll mechanics, contains Tab focus, handles Escape and uses explicit carousel movement. Reduced motion switches smooth carousel navigation to immediate scroll positioning. No forced sheet migration is recommended.

## 5. Generic reveal finding

`.eimir-motion-reveal` is a transform-only utility, which avoided a real contrast regression from opacity compositing. The remaining problem is ownership: it is now applied to unrelated mounts including:

- `AppShell` route content keyed by pathname;
- Today sections/date heading;
- Planning panels;
- Story/create cards;
- search/activity result items;
- profile edit states;
- game results and handoffs.

The repository already documents two concrete side effects:

- Story return/origin measurement must account for transient transformed ancestors;
- Planning's place picker is portalled partly because the generic transform creates an ancestor stacking context.

This is RC-02. #1214 must replace default mount animation with scoped semantic owners. It must not collapse Timeline, Discover, completion, carousel and route transitions into one universal animation.

## 6. Surface audit

### Shell / navigation

| Surface | Classification | Evidence / rationale | Follow-up |
| --- | --- | --- | --- |
| Header | `INCONSISTENT` | #1208 removed permanent action chrome correctly; remaining action transitions use legacy `--motion-fast` | #1213 |
| Search | `INCONSISTENT` | search result wrappers reuse generic mount reveal rather than a query/result-specific need | #1214 |
| Notifications | `MISSING_MOTION` | Compact sheet/backdrop mounts abruptly; modal mechanics are partly shared | #1198, #1215 |
| Profile | `LIFECYCLE_PROBLEM` | legacy PreferenceDialog overlay + focus staging timeout + generic reveal | #1215 |
| Quick Create | `OK_EXISTING_PATTERN` | Compact already uses the shared ShortTaskSheet task boundary | #1215 for shared exit hardening only |
| Bottom navigation | `OK_EXISTING_PATTERN` | stable labeled shell with local selected/press feedback; no extra navigation motion required | #1213 only for alias migration |
| Route / view change | `INCONSISTENT` | `AppShell` remounts pathname-keyed main content with generic reveal | #1214 |

### Wir / Today

| Surface | Classification | Evidence / rationale | Follow-up |
| --- | --- | --- | --- |
| Hero | `INCONSISTENT` | direct gesture feedback exists, but Thinking-of-you uses raw long effects; future location/action hub is product-owned | #1206, #1213 |
| Vibe | `INCONSISTENT` | domain-specific reveal is reasonable; 520/640 ms timings and staged delay exceed shared interaction semantics | #1213 |
| Energy | `INCONSISTENT` | battery-fill emphasis is transform-based and reduced-motion-aware, but 440 ms exceeds the normal guardrail | #1213 |
| Daily Quote | `FIXED_IN_1204` | intended canonical motion referenced undefined duration aliases | #1204 fix |
| Demnächst / Upcoming | `OK_NO_MOTION` | content/clip correctness is the relevant contract; #1210 already fixed tile clipping | none |
| Euer Moment | `OK_NO_MOTION` | no separate animation is needed for content meaning; generic section mount reveal is the cross-cutting issue | #1214 |
| pinned shared list | `OK_EXISTING_PATTERN` | `ChecklistToggle` is a good canonical micro-feedback primitive | #1201 for mutation/flow behavior |
| shared-list completion | `INCONSISTENT` | shared achievement primitive exists, but the pinned-list mutation/completion journey is still abrupt/hakelig per accepted issue | #1201 |
| Relationship Signals | `OK_NO_MOTION` | persistent relationship information does not need its own animation | #1214 removes accidental generic mount motion |
| Month Strip | `OK_EXISTING_PATTERN` | user-driven horizontal scroll/snap is appropriate; no auto-advance required | none |
| Activity / Recent | `INCONSISTENT` | result wrappers use generic reveal on mount | #1214 |
| Summary | `INCONSISTENT` | semantics are stable; local interaction styling remains on legacy motion shorthand | #1213 |

### Planen

| Surface | Classification | Evidence / rationale | Follow-up |
| --- | --- | --- | --- |
| Plan Hub | `INCONSISTENT` | Planen overrides generic reveal with another local keyframe to keep copy opaque | #1214 |
| Wishes | `OK_NO_MOTION` | browse/detail content does not need additional entrance motion | #1213 for legacy control aliases |
| Lists / Collections | `OK_NO_MOTION` | list browsing itself should remain stable | #1201 only where Today pinned-list behavior applies |
| Add / Edit / Create | `INCONSISTENT` | create/reveal paths mix generic utility, local schedule reveal and legacy aliases | #1213, #1214 |
| Completion | `OK_EXISTING_PATTERN` | shared completion/result primitives exist; domain state does not wait for animation | #1213 for remaining aliases |
| Progressive disclosure | `INCONSISTENT` | optional/schedule fields use local reveal implementations rather than one semantic token language | #1213, #1214 |
| Dialogs / Sheets | `OK_EXISTING_PATTERN` | ShortTaskSheet is the right bounded-task base | #1215 for exit/presence |
| Place picker popover | `OK_EXISTING_PATTERN` | anchored portal is appropriate; generic ancestor reveal stacking context is the real defect | #1214 |

### Momente / Story

| Surface | Classification | Evidence / rationale | Follow-up |
| --- | --- | --- | --- |
| Timeline | `INCONSISTENT` | viewport-owned reveal and no `will-change` are correct; 210 ms/legacy easing drift remains | #1213 |
| Discover | `INCONSISTENT` | separate calm viewport reveal is justified; 195 ms/legacy easing drift remains | #1213 |
| Detail | `INCONSISTENT` | HeartMoment detail icon settles for 420 ms with a legacy easing | #1213 |
| Media | `OK_EXISTING_PATTERN` | loading pulse has reduced-motion fallback; media geometry is stable | none |
| Carousel | `OK_EXISTING_PATTERN` | explicit smooth scroll for user navigation; reduced motion switches to immediate positioning | none |
| Lightbox | `OK_EXISTING_PATTERN` | domain-specific full-screen layer reuses modal focus/scroll lifecycle | none |
| Create / Edit | `INCONSISTENT` | focused task boundary is sound, but generic mount reveal is reused | #1214 |
| Reveal | `OK_EXISTING_PATTERN` | Timeline and Discover correctly own viewport reveal independently | #1213 for token timing only |
| Return / origin | `OK_EXISTING_PATTERN` | TaskOrigin/scroll geometry is explicitly kept independent of translated card content | #1214 removes remaining transformed-ancestor interference |

### Other states and utilities

| Surface | Classification | Evidence / rationale | Follow-up |
| --- | --- | --- | --- |
| Snackbar / Toast | `OK_NO_MOTION` | persistent meaning is the live status; entrance motion is optional, not required | none |
| Offline/banner | `OK_NO_MOTION` | state must appear immediately; no decorative motion required | none |
| Pull-to-refresh feedback | `PERFORMANCE_RISK` | indicator transition animates `height` + opacity; verify whether transform/containment can avoid layout work | #1213 implementation review |
| Loading | `OK_EXISTING_PATTERN` | skeleton/pulse patterns are reduced-motion-aware and do not delay data | none |
| Success | `OK_EXISTING_PATTERN` | SharedAchievement is semantic and tokenized; generic success utility remains legacy debt | #1213 |
| Error | `INCONSISTENT` | most errors are correctly static; Thinking-of-you adds a raw 0.4 s shake even though state/copy already communicate failure | #1213 |
| Empty | `OK_NO_MOTION` | stable state representation is preferable | none |
| Premium / entitlement | `OK_NO_MOTION` | entitlement meaning must not depend on motion | none |
| Settings | `INCONSISTENT` | reduced-motion handling exists in multiple controls, but legacy duration aliases remain | #1213 |
| Delete / confirmation | `OK_EXISTING_PATTERN` | modal/task ownership is the relevant contract | #1215 where ShortTaskSheet/dialog presence applies |
| Overlays | `LIFECYCLE_PROBLEM` | shared focus/scroll primitive exists, but presentation presence/exit is not yet one contract | #1215 |
| Popovers | `OK_EXISTING_PATTERN` | `useDismissiblePopover` centralizes outside click/Escape/route close; motion is not mandatory | #1213 only for styling aliases |

## 7. Root causes and ownership

### RC-01 — Motion value vocabulary is fragmented

**Evidence:** canonical generated roles coexist with legacy 160/220/300 ms tokens, legacy easing roles, `--motion-fast`, and raw durations.

**Why this matters:** equivalent interactions cannot reliably share timing/reduced-motion semantics, and local values can exceed the product guardrail without review.

**Owner:** #1213.

### RC-02 — Generic mount reveal owns unrelated lifecycles

**Evidence:** route, section, result, form and game mounts share `eimir-motion-reveal`; existing source comments document coordinate and stacking-context side effects.

**Why this matters:** animation follows React remount mechanics rather than user causality.

**Owner:** #1214.

### RC-03 — Overlay presentation presence is not yet a shared exit contract

**Evidence:** ShortTaskSheet drag dismissal has a transition-completion path while other close sources can unmount directly; older modal surfaces remain locally staged.

**Why this matters:** declared Exit motion cannot run after unmount, and feature teams are tempted to add local timeouts or duplicate overlay state.

**Owner:** #1215. #1198 and #1206 should consume the hardened behavior where their surfaces use a sheet.

### RC-04 — Feature-specific mutation/attention work is correctly separate from foundation

The audit does **not** absorb product behavior that already has an owner:

- #1198 — notification sheet presentation;
- #1201 — Today pinned-list mutation, completion and add flow;
- #1206 — Hero/partner quick actions and their press/sheet/success semantics;
- #1211 — real-time in-app notification arrival product experience;
- #1212 — event-driven arrival/attention motion, explicitly subject to critical product/UX review.

These issues must apply the guideline rather than invent parallel timing/lifecycle rules.

### RC-05 — Daily Quote referenced non-existent motion aliases

**Evidence:** `DailyQuoteCard.css` used `--duration-fast` and `--duration-standard`, neither of which exists in generated product roles.

**Owner:** fixed directly in #1204 because the change is small, central and required to make the documented token language real.

## 8. Already-clean patterns worth preserving

- `ChecklistToggle`: canonical feedback duration/easing and explicit reduced-motion fallback.
- `SharedAchievementCelebration`: canonical contextual duration/easing, one-shot non-blocking result, reduced-motion fallback.
- `ShortTaskSheet`: native dialog modality, focus/scroll reuse, history ownership and event-driven drag dismissal.
- `useModalLifecycle`: shared top-layer focus/scroll mechanics instead of per-component body locking.
- Timeline/Discover reveal: no persistent `will-change`; reveal is viewport-owned rather than data-fetch-owned.
- Media carousel/lightbox: user-controlled movement, requestAnimationFrame scroll observation and explicit reduced-motion branches.
- Snackbar: mutation-independent acknowledgement channel; its 6-second reading lifetime is not treated as animation timing.

## 9. Local solutions to retire or narrow

| Local mechanism | Future state |
| --- | --- |
| `--motion-duration-short/medium/long` | staged migration to canonical generated roles; retire when no consumer remains |
| `--motion-easing-reveal/lift/settle/pulse` | map repeated semantics to canonical roles; add a new token only if a real repeated semantic remains |
| `--motion-fast` | retire as duration+easing shorthand |
| raw 195/210/420/440/520/640 ms interaction timings | reconcile against semantic roles and 320 ms guardrail |
| generic `eimir-motion-reveal` on route/section mounts | remove or replace with scoped semantic owners |
| `SharedPlanningMotion.css` generic-reveal override | likely obsolete once Planen no longer inherits the generic mount primitive |
| notification-specific sheet timing | do not add; consume #1215 through #1198 |
| timeout-based animation completion | prohibited; no new instances |
| persistent list/feed `will-change` | remain absent |

Domain-specific visual meaning may remain local when it is genuinely distinct. The audit does not propose one universal animation component.

## 10. Existing issue updates required

The following issues should explicitly reference the #1204 guideline/audit before implementation:

- #1198: sheet Enter/Exit roles, shared #1215 lifecycle, reduced motion, no local delay;
- #1201: mutation state independent from animation, canonical list/completion roles, rapid interaction;
- #1206: press/sheet/success roles and #1215 reuse for any Compact sheet;
- #1212: event-driven attention must stay within the semantic roles and may legitimately choose no motion.

## 11. New follow-up slices

- #1213 — canonical token/alias consolidation and timing drift;
- #1214 — replace generic mount reveal with scoped lifecycle-aware patterns;
- #1215 — shared sheet/dialog presence and exit lifecycle.

No separate issues were created for each affected component because those components share the root causes above.

## 12. Quality / gate assessment for #1204

### Product / design

- The guideline elaborates the already accepted Product Reference v1 motion direction.
- No new visual concept, route, feature, entitlement or content hierarchy is introduced.
- The only runtime style correction restores the motion Daily Quote was already intended to use.
- New visual evidence is not required for the documentation/token-reference fix because it does not introduce a new visual design; runtime follow-ups must provide evidence when their actual UI changes require it.

### Reuse-before-build

Selected existing primitives: canonical tokens, ShortTaskSheet, useModalLifecycle, useDismissiblePopover, ChecklistToggle, SharedAchievementCelebration and Snackbar. No dependency or animation library is introduced.

### Business / Freemium

No capability, entitlement, quota, downgrade, Cloud/Self-hosted or Premium classification changes. Free/Premium behavior remains identical; motion is presentation semantics across tiers.

### Cross-cutting quality

- security/privacy: no trust boundary or disclosure changes;
- accessibility: reduced motion, focus, modal lifecycle and information parity are explicit contracts;
- performance: transform/opacity preferred; layout motion and persistent compositor hints are explicitly constrained;
- i18n/reflow: no new product copy or fixed geometry introduced by #1204;
- testing: only the real Daily Quote token regression receives a source-level guard; no synthetic UI tests are added for documentation alone.

## 13. Acceptance status

#1204 deliverables on this branch:

- [x] binding Motion Guideline;
- [x] canonical + legacy token inventory;
- [x] shared primitive/lifecycle inventory;
- [x] interaction reference matrix;
- [x] requested Web surface audit;
- [x] root-cause grouping;
- [x] obsolete/duplicate local mechanisms identified;
- [x] existing issue ownership reconciled;
- [x] only necessary new root-cause follow-up issues created;
- [x] small Daily Quote foundation defect corrected with a regression guard;
- [ ] final branch-vs-current-main reconciliation immediately before PR;
- [ ] branch checks / PR CI.
