# Wish completion feedback — acceptance evidence

Owning issue: #508. Baseline main: `5cf7bdd27633dcf1757a11199973f57258adc2f7`.
The [preflight and generated composition](../../../references/508/wish-completion-preflight.md)
were published before implementation. These images show the implemented product.

## Behavioral acceptance

The production Wish page is exercised with a held completion response. Two native
button activations in one browser task send one request. The last-confirmed open
status remains visible, a polite saving status appears outside the management
disclosure, and editing/conversion are unavailable without losing conversion input.
The saving status remains visible when that disclosure is collapsed.

Only the authoritative success response opens the optional Memory continuation.
Its heading receives focus; Done keeps the Wish fulfilled and restores focus to
Back. Keyboard Enter/Enter/Space sends one request and preserves action focus
while pending. A server error removes the saving claim, retains input and allows
an explicit retry. A conflict reads a partner's fulfillment without replaying
the write or displaying our transient continuation.

Offline attempts fail through the existing error presentation instead of being
paused for submission on reconnect. Reconnecting does not fulfill a Wish; a new
explicit activation is required, with conversion input retained.

Fourteen component cases additionally cover both competing-write orders,
update/delete exclusion, the held conflict-recovery lock and fresh If-Match on
explicit retry, pending remounts, late unmounted success, replaced query identity,
and Space/cache-clear isolation. The shared lifecycle retains all existing Plan
component acceptance cases.

## Captures

| Capture | State and viewport |
| --- | --- |
| [Pending Light](planning-wish-completion-pending-390-light.png) | 390 px Compact; held response, focused action, retained conversion input |
| [Pending Dark](planning-wish-completion-pending-390-dark.png) | 390 px Compact; same interaction in Dark |
| [Narrow reflow](planning-wish-completion-pending-320-reflow.png) | 320 px, 200% root text, reduced motion; wrapped title and actions |
| [Small Compact](planning-wish-completion-pending-360-light.png) | 360 px, Light |
| [Large Compact](planning-wish-completion-pending-430-dark.png) | 430 px, Dark |
| [Expanded](planning-wish-completion-pending-1440-expanded-light.png) | 1440 px; existing detail hierarchy and disclosure |
| [Confirmed](planning-wish-completion-confirmed-390-light.png) | 390 px; authoritative fulfillment and optional continuation |
| [Failure](planning-wish-completion-failure-390-light.png) | 390 px; existing error presentation and retained input |
| [Conflict recovery](planning-wish-completion-conflict-recovered-390-light.png) | 390 px; partner fulfillment without our continuation |

These are full-page screenshots; fixed Compact navigation stays in the initial
viewport and can cross the long page capture. Focused controls retain the existing
keyboard focus treatment. Reflow uses a scoped shrinkable grid and wrapping for
localized Wish text. Browser assertions check horizontal overflow in pending and
confirmed states, Axe WCAG 2.2 AA in 390 px Light/Dark pending states, and disabled
success animation under reduced motion.

## Validation and limits

- Full Web suite: 1,392 passed, one existing skipped test; 196 passed test files.
- Focused Wish/Plan component regressions: 40 passed across four files.
- Wish browser spec: all 16 passed, including six existing continuation cases.
- Plan browser regression spec: all 19 passed after settled-motion measurement.
- Typecheck, lint, formatting, production build and browser inventory passed.
- Engineering/documentation language audits and 24 audit regressions passed.
- No new dependency, API, schema, entitlement, telemetry or persisted draft store.

Local captures use Chromium 153.0.8010.0 because the pinned Playwright Chromium
151 download returned an empty archive. Repository browser configuration, retries
and timeouts are unchanged; hosted Browser QA remains the pinned-browser gate.
The existing Plan continuation evidence waits for its finite entrance animation
before measuring settled contrast. No Axe rule or threshold was relaxed.
These are browser checks, not native device/emulator evidence. No native behavior
or Capacitor integration changes in this slice.
