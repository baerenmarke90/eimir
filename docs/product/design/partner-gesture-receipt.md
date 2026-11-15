# Partner gesture receipt (#455)

**Baseline:** `main` at `f3c6b8393`, 15 November 2026.
**Decision:** the Product Owner request of 2026-11-15 asks for a small,
emotional receipt for the three existing partner gestures. It is the explicit
product decision that the [#1211 foreground arrival review](1211-foreground-notification-arrival.md)
and the [#1212 event motion review](1212-event-driven-arrival-motion.md)
required before any foreground surface. This document records the resulting
contract. Their privacy, lifecycle and policy gates remain binding.

Owning issue: [#455](https://github.com/baerenmarke90/eimir/issues/455)
(receipt part only; the global sender entry is unchanged). Related: #1206
(quick actions), #515 (notification policy), #1790 (everyday closeness).

## Scope

- One shared presentation primitive, `PartnerGestureReceipt`, for the existing
  notification kinds `THINKING_OF_YOU`, `PARTNER_KISS` and `PARTNER_CHECK_IN`.
- No new notification kind, gesture, endpoint, API field, migration, push
  payload, Notification Center, read store, presence or delivery receipt.
- Replies reuse `usePartnerGesture` and therefore the existing `THINKING` and
  `KISS` endpoints, idempotency keys, cooldowns, module checks and the
  `partner.quick_actions.extended` capability.

## Product Owner motion decision (2026-11-15)

Two choreographies were compared in real time on the Wir screen at 390 px
([thinking](references/partner-gesture-receipt/variant-a-vs-b-thinking.webp),
[kiss](references/partner-gesture-receipt/variant-a-vs-b-kiss.webp),
[check-in](references/partner-gesture-receipt/variant-a-vs-b-check-in.webp)):
A, restrained (about 1 s, existing duration roles only), and B, expressive
(about 2.4 s). The Product Owner chose **B**. It needs two new semantic motion
tokens, `motion.duration.gestureMoment` (900 ms) and
`motion.duration.gestureSequence` (1800 ms), recorded in the
[motion guideline](motion-guideline.md) and zeroed for reduced motion like
every other duration role. The big heart briefly covers the partner's face
before settling as a badge; this was part of the reviewed variant.

## Generated visual reference

![Compact reference](references/partner-gesture-receipt/compact-reference.png)

Composed before runtime UI implementation from the real running app on
`f3c6b8393` (mocked API, Wir at 390 px) plus the token-based receipt markup and
its stylesheet, because no image-generation model was available in the
implementing session. Left: "Ich denke an dich" (Light). Middle: kiss (Light).
Right: "Wie geht's dir?" (Dark). Reviewed with it: the Wir hero with the couple
avatars and partner quick actions, the daily check-in sheet, the floating
create action, the Compact bottom navigation, the Notification Center under
Mehr, and the Snackbar.

## Mobile Interaction Contract

| # | Item | Contract |
| --- | --- | --- |
| 1 | User goal | Notice, in a calm moment, that the partner just sent a gesture, and answer it with one tap if wanted. |
| 2 | Relationship value | A small gesture feels personal and warm instead of a system message. |
| 3 | Compact state | A compact elevated surface at the top safe edge, above the current page; the page stays usable. |
| 4 | Dominant action | The gesture's reply: send a thought back, send a kiss back, or share how you feel. Close is secondary. |
| 5 | Hierarchy | Partner avatar with gesture glyph → personal sentence → quiet detail line → reply → close. |
| 6 | Immediate vs. disclosed | Everything is visible at once. No expanded state. |
| 7 | Pattern | Non-modal, transient surface (`aside` landmark). Not a dialog, sheet or toast with critical content. |
| 8 | Loading | Nothing is shown until the authorized notification item is loaded. Reply shows the existing sending copy. |
| 9 | Empty | No item: nothing is shown. |
| 10 | Error | Reply failures use the existing quick-action error copy inside the receipt; the receipt then stays until closed. |
| 11 | Offline | The receipt never appears from cached data. A reply offline shows the existing offline copy; nothing is queued. |
| 12 | Success | The existing sender copy (`partnerQuickActions.sentThinking`, "your greeting is on its way") replaces the reply. It never claims arrival or reading. |
| 13 | Privacy | Only the authorized, already visible notification item (actor name, avatar, kind). No mood, energy, presence or delivery state. |
| 14 | Large text / narrow | A container query in `em` stacks partner, sentence and reply when the text is large for the available width; labels hyphenate; the decorative picture keeps a fixed size; 44 px targets. Tested at 320 px with 200 % text and at 390/430/1280 px. |
| 15 | Motion | Enter: opacity + scale with `--duration-context`/`--easing-enter`. Then one expressive, one-shot gesture on the avatar (below, about 2.4 s), ending in a calm badge. Exit: `--duration-transition`/`--easing-exit`. Reduced motion: the settled state at once, no waves, hearts or wash movement. |
| 16 | Expanded | Same surface below the top navigation, max 26 rem wide. |
| 17 | List/table | None. |
| 18 | Platform patterns | Reuses the in-app banner pattern of mobile messengers, the shared avatar, Pro mark and quick-action icon roles. |
| 19 | Typing | No typing. Focus is never moved. |
| 20 | Reference | Above; baseline `f3c6b8393`. |
| 21 | Visual acceptance | Playwright evidence at 390 px Light/Dark, 320 px 200 % text with reduced motion, and Expanded. |

### Gesture variants

| Kind | Title / detail | Glyph and motion | Reply |
| --- | --- | --- | --- |
| `THINKING_OF_YOU` | `partnerGestureReceipt.thinking.title` / `.detail` ("Ben is thinking of you right now" / "a small hello, just for you") | A big heart appears over the avatar, beats twice (lub-dub) with one ripple, then settles as the heart badge. | `partnerGestureReceipt.thinking.reply` ("send one back") → existing `THINKING` send, only when the Thinking-of-You cooldown is not active. |
| `PARTNER_KISS` | `partnerGestureReceipt.kiss.title` / `.detail` ("a kiss from Ben" / "for you") | Two hearts float in on arcs from both sides, meet over the avatar, "kiss" with a short squeeze and a soft bloom, then settle as two small hearts. | `partnerGestureReceipt.kiss.reply` ("send a kiss back") → existing `KISS` send with the extended capability; without it, the existing Pro mark opens the Pro information. Not offered while the cooldown is active or the entitlement is not yet known. |
| `PARTNER_CHECK_IN` | `partnerGestureReceipt.checkIn.title` / `.detail` ("Ben would like to know how you are" / "only if you feel like it") | No hearts: the avatar takes one slow breath while three calm waves widen, then a "?" badge settles. | `partnerGestureReceipt.checkIn.reply` ("share how you feel") → opens the existing own daily check-in sheet on Wir, only when vibe or energy check-in is enabled for the Space. Nothing is changed automatically. |

Without an actor name the existing anonymous titles are used. The avatar uses
the shared `AuthorAvatar` with its initials fallback.

## Arrival and lifecycle

**Foreground arrival.** There is no realtime notification transport. The
receipt reuses the existing signals only:

1. The shell's existing unread-count query (30-s refresh, focus refresh, and
   the native push `wake` invalidation) is observed.
2. Only an **increase** after the first observed value, in the visible and
   focused window, triggers one read of the newest notification page
   (`limit: 5`) through the existing authorized list endpoint. Tab switches,
   focus without an increase and decreases cause no request.
3. Only an unread gesture item from the partner, created after this shell
   instance started and never handled before, qualifies. The newest one wins;
   older qualifying items of the same read are marked handled and stay only in
   the Notification Center.

So arrival latency is up to the existing 30-s refresh, or immediate when a
native push wake reaches the foreground app. This is a documented limit, not a
simulated realtime feature.

**Push open.** Opening a push still resolves the item through
`openNotification` and navigates exactly as before. For a gesture item, the
receipt is then presented once for that deliberately opened item.

**Suppression (no later interruption).** The receipt is not shown — the item
stays in the Center — when a focused task route is active, a draft blocks
leaving, a modal layer or dialog is open, or a text field has focus. A receipt
on screen closes when a focused task or modal begins.

**Never.** No stacking (one receipt; a newer arrival replaces it), no queue, no
replay after reload/app start (items older than the shell instance never
qualify), no replay of handled IDs, no presentation after an Account or Space
change (scope check on every asynchronous result, host keyed by scope), no
read-state change (arrival, timeout and close do not mark read; the Center
remains canonical).

**Timing.** The receipt closes itself after 8 s. The timer pauses while the
pointer or keyboard focus is inside it and while a reply is pending; after an
error it stays until closed.

## Accessibility

- A permanent polite live region announces the title and detail exactly once
  when a receipt appears; the surface itself is not a live region.
- No focus movement. The receipt is a named `aside` landmark; its controls are
  reachable by keyboard and Escape closes it while focus is inside.
- The avatar is decorative here (`aria-hidden`); the sentence carries the
  meaning. Glyphs and motion never carry information alone.

## Policy, privacy and business review

- **Notification rules:** the receipt only uses items the server already
  admits to the in-app Center, so the per-account IN_APP choice (#638),
  membership, module and target authorization stay server-side. Quiet Hours
  defer external Push and Email only ([contract](../../m4/NOTIFICATION-QUIET-HOURS.md));
  the receipt is in-app, appears only in the focused, active window, makes no
  sound or vibration and never replaces a suppressed push.
- **Push privacy:** unchanged. Push payloads stay neutral; the receipt content
  is read from the authorized API after opening.
- **Haptics:** no existing haptic primitive exists. None is added, so no new
  native dependency.
- **Business/freemium:** reviewed. Receiving and reading a gesture is the same
  for Free and Pro (`docs/FREEMIUM-FEATURE-MATRIX.md`, Notification Policy and
  partner quick actions rows). Sending a kiss or check-in reply stays behind
  the existing `partner.quick_actions.extended` capability, read only from the
  session's cached entitlement (no new read). No new capability, quota, cost,
  Cloud/Self-Hosted difference or downgrade behavior.
- **Reuse:** `usePartnerGesture`, `usePresentationPresence`, `AuthorAvatar`,
  `ProMark`, `getNotificationItemTitle` copy pattern, the Snackbar window-event
  pattern, the shared modal lifecycle, the document leave guard and the
  generated motion roles. Considered and rejected: the Snackbar itself (no
  avatar, one action, bottom position collides with navigation and the
  floating create action), a new SSE/WebSocket transport, polling and a
  motion library.

## Evidence and limits

Browser evidence from `web/e2e/tests/partner-quick-actions.spec.ts` (mocked
API, Chromium) is in [evidence/455-gesture-receipt](evidence/455-gesture-receipt/):
390 px Light (thinking) and Dark (kiss), 430 px Dark arriving on Momente and
opening the own check-in, 320 px Dark with 200 % text and reduced motion
(Pro discovery), Expanded 1280 px, and frame-exact motion of the real
component (`final-motion-*.webp`, `motion-filmstrip-390.png`). The Momente
content behind the 430 px receipt shows that fixture's unmocked error state,
not a product regression.

Known limits, documented instead of simulated:

- **No realtime transport.** Arrival follows the existing 30-s unread-count
  refresh, focus refresh and native push wake. A receipt can therefore appear
  up to about 30 s after sending when push is off.
- **Native foreground push.** This slice does not change how the Android app
  presents a push while it is in the foreground; the receipt only adds the
  in-app moment after the existing wake refresh.
- **No device acceptance yet.** Android (Capacitor) behavior, including the
  push-open receipt, still needs a Pixel check.
- **Read state** is unchanged by design: seeing, replying to or closing the
  receipt does not mark the Center entry read.
