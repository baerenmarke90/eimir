# Foreground notification arrival: critical product review (#1211)

**Baseline:** `main` at `4d81f8b6`, 23 September 2026. This review decides
**when** an in-app event warrants attention. [Product Reference v1](product-reference-v1.md)
remains authoritative: relationship content leads; notification meaning comes
before read management.

## Decision

**Narrow the present experience to the existing unread indicator, preview and
Notification Center. No transient foreground banner is approved for runtime
implementation yet.** A count change does not identify a live, currently
authorized, unmuted event. Displaying a banner from it could reveal a stale
notification on reconnect/focus, repeat an event after another tab reads it,
or ignore personal IN_APP preferences.

This critical UX review rejects immediate banner implementation; it does not
claim final Product Owner approval of a later visual surface. #515 owns
classification, digest, quiet hours and noise control; #638 owns per-account
event/channel preferences. Neither has shipped its full contract. IN_APP_ONLY
does not imply a foreground alert. #1204 owns motion mechanics; #1212 reviews
event-driven attention semantics. An implementation PR requires the gates below.

## Current inventory and reuse decision

| Responsibility | Existing source | Finding |
| --- | --- | --- |
| Authoritative event/recipient state | `backend/src/eimir/engagement/{service,models,thinking}.py`, `reminders/delivery.py` | Controlled Outbox projection, stable notification/source IDs; recipient and target authorization rechecked on reads; protected text is not copied. |
| API | `backend/src/eimir/api/v1/engagement.py`, generated `NotificationsApi` | List, unread count, mark-one and mark-all; no authorized arrival stream or new-event cursor contract. |
| Web state | `web/src/client/notificationQueries.ts`, `components/AppShell.tsx` | Shared TanStack Query keys; count refreshed every 30 seconds and on focus. A count delta has no event identity or ordering. |
| Existing UI | `components/HeaderNotificationsMenu.tsx`, `M4ProductPages.tsx`, `client/notificationTitle.ts` | Preview loads when open; page loads on navigation; localized actor/action labels, typed target resolver and explicit read actions exist. |
| Other live code | `client/dailyCheckIn.ts`, `components/PresenceHeartbeat.tsx` | Domain-specific refresh/heartbeat; presence is product-gated. Neither transports notifications. No notification SSE/WebSocket or cross-tab coordinator exists. |
| Missing policy | #515 and #638 | No complete server-authoritative delivery classification or per-account IN_APP event preference gate for transient UI. |

The actual notification kinds are `COMMENT_CREATED`, `THINKING_OF_YOU`,
`PARTNER_KISS`, `PARTNER_CHECK_IN`, `REMINDER_DUE`. Activity-only events,
invitations and security notices are not implicitly notifications. The first
list page need not contain every newly counted item.

The **current** solution reuses the Notification API, Query cache and routes.
For a future transport, compare authorized server-sent events, bounded
polling by stable new notification ID and the existing API with WebSocket and
push handoff; evaluate latency, reconnect and hosting/proxy cost before
selection. Domain-specific check-in polling is unsuitable. No new provider,
broker, WebSocket stack, local count-diff queue or third-party dependency is
justified by this review. Browser visibility/focus, BroadcastChannel and Web
Locks are potential cross-tab primitives; uncertain ownership fails silent.

## Candidate mapping after prerequisites

These are **eligibility ceilings**, not authorization to display a banner now.
Intersect server authorization, #515 policy, #638 IN_APP preference, screen
context and verified live identity first.

| Kind | Product decision for future review | Reason |
| --- | --- | --- |
| `THINKING_OF_YOU` | Candidate for one brief compact surface | Explicit, intentionally paced partner signal; never replay on reconciliation. |
| `PARTNER_KISS`, `PARTNER_CHECK_IN` | Evaluate with the explicit signal, not as a second alert class | A check-in prompt reveals no mood or presence. Pro governs sending extended gestures, not recipient presentation quality. |
| `REMINDER_DUE` | Candidate only for an opted-in, time-sensitive reminder as classified by #515 | Use authorized target. Do not invent a persistent urgent banner. |
| `COMMENT_CREATED` | Badge/Center by default; local update in an open thread | Potentially frequent and digestible; no duplicate banner for content already visible. |
| Activity-only, self-authored, sync, security/account messages | No relationship banner | Activity is a different projection; account-critical communication needs its own contract. |

An already open thread/list updates in place and preserves scroll position. An
open Notification Center updates its canonical list. A later product review
may still choose **no banners** after observing normal usage.

## Mobile interaction contract for a later implementation

- **Focal point:** current content/task stays dominant. One short localized
  actor/action line may include only authorized name, avatar and target
  context; no fabricated emotion, protected text preview or filler subtitle.
- **Action:** one accessible tap/keyboard target opens the existing typed
  destination; an unavailable target falls back to the privacy-safe Center.
  Recheck target access. Arrival, dismissal and timeout do not mark read;
  only the existing explicit open/read action does.
- **Compact/Expanded:** preserve AppShell and Notification screen template.
  Never cover navigation, safe areas, open sheet/dialog, keyboard or active
  text input. Suppress the banner during contention, keeping badge/Center.
  Touch/dismiss targets are at least 44 px; Expanded keeps the same hierarchy
  rather than a desktop notification panel. No layout shift or forced scroll.
- **Offline/error/reconnect:** never construct a surface from a count or stale
  cache. Reconcile silently; missed events remain in the Center without late
  arrival animation.
- **Accessibility:** informational arrival never steals focus. Announce
  exactly once, politely, only when displayed; avoid duplicate badge/list
  announcements. Localized accessible controls, long translation/zoom and
  360/390/430 px reflow are required. Reduced motion preserves information
  and navigation. Use #1204 tokens only when #1212 approves event motion.

Before any new user-facing UI code, add the AGENTS.md-required generated
Compact visual reference to #1211, based on then-current `main`, the real
shell and Notification Center, including a competing overlay state. The
implementation PR must provide Compact/Expanded Light/Dark evidence. This
docs-only review changes no screen and requires no generated UI image itself.

## Privacy, policy and lifecycle gates

1. Obtain stable notification ID and fresh authorized recipient projection.
   Never use raw Outbox data, push previews, a count delta or caller-selected
   recipient for content. Removed/private targets reveal no existence.
2. Apply #515 classification/quiet hours and #638 *own-account* IN_APP
   preference per event. Disabled means no visible in-app presentation. No
   second priority taxonomy or banner settings are introduced.
3. Suppress self-authored actions, already visible exact targets, competing
   overlays/keyboard and inferred partner-presence signals.
4. All tabs can reconcile canonical state; at most one visible active tab may
   display one live event once. If ownership cannot be established, omit the
   banner. Activation does not turn historical items into arrivals.
5. Reconnect/background backlog is silent. Deduplicate by stable ID across
   retries, remount, Query invalidation and StrictMode; bound the queue, clean
   timers/listeners and stop stale presentation on route changes.
6. Server Notification/read state is canonical. Dismissal never removes an
   unread item from the Center or creates another event/read store.

## Cross-cutting and business result

Server-side membership/target checks and current privacy class must precede
display. No OWNER_ONLY or unrevealed-surprise data, arbitrary payload text,
secrets or relationship content in logs/analytics. Copy uses i18n presentation
keys and locale-aware dates. Current API/generated models remain unchanged.

`docs/FREEMIUM-FEATURE-MATRIX.md` classifies Notification Policy as Free/Core
with identical Cloud/Self-Hosted behavior. This review adds no entitlement,
quota, downgrade, billing, provider, persistence, API or deployment change.
Recipient visibility is the same for Free and Pro even when sending an
extended gesture requires Pro. A future transport needs a bounded cost/retry
budget and the same functional behavior without a push provider.

## Readiness and validation

Runtime work requires effective #515 and #638 gates; verified live identity
and reconciliation; a current generated Compact reference reviewed by the
Product Owner; and #1212's decision about event motion. Prove with meaningful
tests: policy/preference-off, tenant/privacy transitions, same-target and
self-authored suppression, explicit read state, one active tab, deduplication
and StrictMode, silent backlog, accessible focus/announcement, reduced motion,
safe-area/keyboard/reflow and Cloud/Self-Hosted parity. This review changes no
runtime, so no artificial banner tests or screenshots are claimed.
