# Partner gesture send feedback — acceptance evidence

Owning issue: #508. Baseline: `main@a8d6a575f707300c40fe7d67c4f835825299d1a4`.
Dated 2026-10-12. The [preflight and generated whole-screen reference](../../../references/508/partner-gesture/preflight.md)
were published in #508 at `608d2838` before UI implementation.

## Behavior and ownership

The production Today sender now announces the selected gesture immediately while
retaining the existing action label and keyboard focus. All three send choices are
temporarily aria-disabled; a synchronous mutation-cache guard prevents duplicate or
competing activation even before React renders. Only the server response supplies
success copy and cooldown. Compact sheet dismissal, root navigation and browser Back
can leave and return to a pending send without releasing its Account/Space owner.

The existing TanStack mutation cache retains pending, errors and server cooldowns
through same-context sender remounts. Settled feedback belongs to the current query
identity. Query clearing/replacement and Account/Space transitions invalidate late
results; unmounted senders do not emit a global snackbar. No removed Dashboard query
is recreated. A small query-identity helper replaces equivalent closures in Plan/Wish
completion and personal Collection pinning; their domain lifecycles remain separate.

Offline activation fails immediately without calling the API or pausing a mutation.
Reconnect neither sends nor retries. A new explicit activation is required. An
uncertain network/server failure retains the same secure client request ID for a
deliberate identical retry within the existing shared reconciliation window; an
authoritative rejection retires it. Existing server Membership/module/entitlement,
idempotency and cooldown rules remain authoritative.

No durable outbox, persistent draft/result store, automatic retry, optimistic delivery,
new API/schema, native capability, provider, dependency or telemetry was added.
The existing bounded in-memory query/mutation cache lifetime applies: a full document
reload does not restore these transient request outcomes. Extended cooldowns are
presentation of retained server responses, never a substitute for server admission.
Thinking-of-you also preserves the current authoritative Dashboard deadline.

## Validation

- Two component characterization cases failed on the baseline (pending remount and
  paused offline send) before the correction.
- Complete Web suite passed with two bounded workers. The final sender suite has
  **19 passed component cases**, including same-task activation, synchronous pacing
  before observer render, remount, uncertain/known rejection, explicit retry identity,
  offline/reconnect, Account/Space switches and cache/query replacement.
- The final combined sender, Plan, Wish and Collection component regressions had
  **69 passed cases**.
- **15 partner-gesture browser cases passed** on pinned Chromium 151.0.7922.34 with
  one worker and zero retries, including all three send kinds and both existing and
  new navigation, focus, capability, theme and reflow checks.
- **37 existing Plan/Wish browser cases passed** against the extracted helper.
- **Seven existing personal Collection pin browser cases passed**, including pending,
  rollback/conflict/read failure and Compact/Expanded/large-text states. Together these
  packages cover **59 distinct browser cases**; the strengthened narrow-sheet case was
  additionally rerun and confirms that all three actions remain reachable by scrolling.
- TypeScript, full lint, formatting, production build, token/PWA and browser inventory
  checks passed. Existing lint and bundle-size/directive warnings remain; no warning
  points to the new sender or identity helper.
- English engineering/documentation audits and all 24 audit regressions passed. Exact
  localized literals are exempt only in the generated prompt; surrounding and foreign
  documentation remain audited.

Local tests use the real React/Vite UI and mocked HTTP records. Chromium was downloaded
from the official Chrome-for-Testing storage URL after the normal CDN returned an empty
archive. The temporary external config only points to that exact pinned executable
and an isolated test-output location; repository retry/timeout/assertion policy was
unchanged. Failed initial invocations are excluded from acceptance. Two initial browser
failures were ambiguous global selectors matching both the snackbar and inline success;
the final assertions identify the actual dialog. No assertion was loosened.

## Captures

| Capture | Reviewed state |
| --- | --- |
| [Thinking pending](gesture-THINKING-pending-390-light.png) | 390px Light, honest pending, readable unchanged actions |
| [Kiss pending](gesture-KISS-pending-360-light.png) | 360px Light, same scoped ownership |
| [Check-in pending](gesture-CHECK_IN-pending-430-dark.png) | 430px Dark, no partner Vibe/status disclosure |
| [Failure after return](gesture-failed-remount-390-light.png) | Persistent error and explicit retry |
| [Expanded pending](gesture-pending-1280-light.png) | Existing non-modal popover, same state hierarchy |
| [Narrow large text](gesture-pending-320-dark-200pct-reduced-motion.png) | 320px Dark/200%, scrollable bounded sheet and reduced motion |

Full-page screenshots can place the fixed-height overlay across a longer document
capture. The sheet itself stays attached to the viewport; narrow large text scrolls
within its existing body. These are Web checks, not native device/emulator or live
backend delivery evidence. No existing historical planning evidence is replaced.

## Product and business result

Product Reference v1 feedback/result ownership and R4 Today govern the existing
avatar entry. The partner and deliberate gesture remain the focal point; one quiet
localized status is added between intro and action choices. Current tokens, icons,
fonts, sheet/popover, focus restoration and confirmed-success motion remain.
Reduced motion retains the same outcomes; no looping pending animation or decoration.

No business/freemium impact: the authoritative matrix stays Mixed (Free/Core
Thinking-of-you, Pro extended gestures), identically on Cloud/Self-Hosted. Module
configuration does not grant entitlement or visibility. No new managed cost, quota,
retention, downgrade, export or ownership semantics. #508 remains open for its broader
scope; this slice does not establish final acceptance under #946.
