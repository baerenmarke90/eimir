# Event-driven arrival and attention: critical product review (#1212)

**Baseline:** `main` at `89aba33e`, 23 September 2026. The
[Web Motion Guideline](motion-guideline.md) (#1204) owns every duration, easing,
reduced-motion and presence mechanism. The [#1211 foreground notification
decision](1211-foreground-notification-arrival.md) owns whether a transient
notification surface is justified. This review specifies **which visible
transitions, if any, warrant motion**; it does not create new event delivery,
UI, keyframes or notification priorities.

## Critical product/UX decision

**No new global incoming-event animation is approved now.** The current
notification shell refreshes its unread count every 30 seconds; a count delta
is not a live event. Partner Vibe/Energy data can refetch without a live
identity, and rendering changes can follow ordinary cache reconciliation.
Neither should pulse, bounce or produce a new arrival animation. #1211
explicitly retains badge/preview/Center without a live banner. A future
verified, authorized foreground event may use one already approved
presentation role, but only after the owner of that surface approves it.

The relationship focal point remains the currently viewed human content.
Incoming changes must not interrupt an active task merely to make the app feel
busy. Nothing in this decision requires a new screen, route, content copy,
gesture, toast, overlay or visual design. Consequently there is no generated
visual reference for this docs-only review; AGENTS.md requires one in the
owning issue before any later user-facing implementation.

## Current product and primitive inventory

| Real surface/source | Current behavior / owner | Review consequence |
| --- | --- | --- |
| Header notification dot and Center | `AppShell.tsx` polls unread count; `HeaderNotificationsMenu.tsx` and `M4ProductPages.tsx` show authorized items on open | Count changes have no stable live identity: no attention motion or banner. Opening the existing Compact sheet retains its #1204 enter/exit lifecycle. |
| Today Vibe/Energy | `client/dailyCheckIn.ts` refetches; today components render the projected state | A partner update or cache refetch is not proof of a fresh, authorized foreground event. Show correct state without signal animation or implied presence. |
| Partner quick action | `PartnerQuickActions.tsx` uses `.eimir-motion-success` for the sender's confirmed feedback | Keep sender confirmation separate from the recipient's potential future arrival; never play it again on reconciliation. |
| Pinned list completion | `TodayPinnedCollection.tsx`, `ChecklistToggle` and `SharedAchievementCelebration` | Local toggle uses item state feedback; a qualifying *confirmed* shared achievement may use the existing rare celebration, never optimistic or repeated on refetch. |
| Story/Discover and overlays | Viewport-owned reveals, `useOverlayPresence`, `ShortTaskSheet`, `useDismissiblePopover` | Preserve their established navigation and layer lifecycles. A cache refresh is not a disclosure or route reveal. |
| Motion source | `design/tokens.json`, generated `product-roles.css`, `motion-guideline.md` | Use canonical feedback, transition and context roles; no event-specific keyframe or motion library. |

## Decision matrix

The meaning and *visible transition* govern motion, never an Outbox event type
alone. Priority, permissions, copy and notification delivery belong to their
existing contracts. "Future" rows do not authorize runtime implementation.

| User-visible situation | Decision and reason | Existing role / reduced motion |
| --- | --- | --- |
| Poll, cache invalidation, unread change, reconnect or tab resume | **No special motion.** High frequency and ambiguous age/identity make emphasis misleading and fatiguing. | Static badge/list state. No animation to remove in reduced motion. |
| New comment or list item in the exact view the user is reading | **Local change only if** an authorized live identity and stable item transition later exist; today reconcile without new animation. Preserve position, no global alert. | #1204 list mutation: fast/standard (120/180 ms), standard easing on the affected item; instant final state when reduced. |
| Partner's explicit Thinking-of-You or extended gesture | **Future conditional attention**, one presentation at most, only if #1211 later approves a foreground surface and recipient policy permits it. Current sender confirmation remains unchanged. | The approved surface's enter/exit state or rare emphasis role, never independent header pulse plus banner; instant/short opacity in reduced motion. |
| Reminder or invitation requiring action | **No celebratory/attention motion.** The route/action and urgency belong in authorized content and #515; no invented severity or animation based on request metadata. | If a later approved surface opens, use its existing enter/exit role; same actionable state immediately in reduced motion. |
| Own check-in/save or list item completion | **Local state/confirmed success** only; no partner-arrival treatment. The user already knows the action. | #1204 state or success role: fast/standard, standard easing; immediate confirmed state in reduced motion. |
| Confirmed shared achievement | **Rare one-shot celebration** only when the existing authoritative result qualifies; keep the existing `SharedAchievementCelebration` ownership. Routine CRUD and remote cache discovery do not qualify. | #1204 celebration/emphasis: context 280 ms / enter; static confirmed copy and action in reduced motion. |
| Account/security error, conflict, offline status | **Immediate readable state, no decorative arrival.** The action/recovery and accessible status carry the meaning. | Existing status/alert semantics; do not delay, focus-steal or animate failure. |

## Attention and lifecycle contract

- At most **one coordinated visual response per verified live ID**. If the
  owned surface enters, do not simultaneously bounce the bell, pulse the
  badge, highlight a card and animate the route. Contextual local updates
  replace duplicate global presentation.
- Do not replay after query refetch, harmless rerender, React StrictMode,
  transport retry, tab activation, reconnect or historical backlog load.
  Background/inactive tabs do not run attention animation. Cross-tab
  ownership and deduplication belong to the eventual #1211 transport slice,
  not a new #1212 event store.
- Coalesce bursts in the eventual presentation owner and cap its queue.
  Incoming work never restarts an earlier animation indefinitely. If the
  user has a sheet/dialog or keyboard open, leave their task uninterrupted
  and retain canonical content in the destination.
- The authoritative domain/notification state publishes immediately. Motion
  cannot gate mutation, navigation, read state, error handling or cache
  reconciliation. Timers/listeners and exit presence follow existing
  lifecycle primitives; no guessed timeout, route-wide remount or replay of
  the retired generic `eimir-motion-reveal`.
- Use transform/opacity on a bounded element and only the existing generated
  duration/easing roles. The 320 ms maximum token is a guardrail, not a
  default. Do not animate layout height/position, set persistent
  `will-change`, flash or loop attention.

With `prefers-reduced-motion: reduce`, remove spatial travel, scale, pulse
and celebration decoration. Keep the same state, content, accessible name,
announcement, focus, control and deep link. Screen-reader announcements are
owned by the content surface, never by CSS animation. No animation is the
default if it does not explain a transition.

## Reuse, business and readiness

This review reuses the #1204 guideline, generated tokens, local mutation
feedback, the appropriate existing presence lifecycle and the
shared-achievement pattern.
CSS/WAAPI/third-party animation libraries and custom coordinators were
considered; no new mechanism is justified without an approved live surface
and a demonstrated gap in current primitives. No provider, new dependency,
configuration, runtime cost, API, migration or content retention change.
The Notification Policy and standard motion/accessibility quality are
Free/Core and identical for Cloud and Self-Hosted; sending a Premium gesture
does not entitle better recipient feedback. No quotas, data or downgrades
change.

**Future implementation gates:** a surface-specific #1211 decision and
generated Compact reference on current `main`; authorized stable identity,
policy and personal preferences (#515/#638); then tests for once-only
presentation across tab/reconnect/StrictMode, same-context suppression,
reduced motion, screen reader, 360/390/430 px, safe areas, scrolling,
keyboard/overlay contention, Light/Dark and meaningful performance. Keep
any resulting code slice component/primitive-oriented. This review changes
no UI; synthetic browser captures and motion tests would not validate it.
