# Polish batch: vibe flights, map attribution strip, Plan header

One Product Owner request, three finished results assembled into one change.
Baseline: `main` `27d0feff3` (the screens and components named below were
reviewed on it). None of the three adds an entitlement, a Premium boundary or a
managed-resource cost.

## A. Map attribution strip in Dark

MapLibre paints the OpenStreetMap/OpenFreeMap attribution strip translucent
white. Over a dark map it was the brightest element on screen. In Dark the strip
now uses the page surface token at the same translucency; Light keeps the stock
strip. The rule lives in `PlaceMapPicker.css` and applies to every
`PlaceMapCanvas` user (Memory map, partner distance map, place picker).

- Dark, before: [map-attribution-before-390-dark.png](map-attribution-before-390-dark.png)
- Dark, after: [map-attribution-after-390-dark.png](map-attribution-after-390-dark.png)
- Strip close-up, Dark before and after: [map-attribution-strip-dark-before-after.png](map-attribution-strip-dark-before-after.png)
- Strip close-up, Light unchanged: [map-attribution-strip-light-unchanged.png](map-attribution-strip-light-unchanged.png)

Readability over real OpenFreeMap tiles on a device is still to be confirmed.

## B. Plan detail header: date and place

The Plan detail header kept date and place on one line whenever the whole place
fits; otherwise the place moves to its own row. The place used to carry 8 px of
inline padding the date does not have, so a place beside a timed date overflowed
by a few pixels at 360 px and dropped to a second line although both fit. This
was reported as a bug, not requested as a wish. The padding is gone inside the
detail header, the place may shrink and wrap inside its own row, and the date is
capped at the row width.

Isolated header at 390 px, before and after, Light and Dark:

| | Light | Dark |
| --- | --- | --- |
| Before | [plan-header-before-light.png](plan-header-before-light.png) | [plan-header-before-dark.png](plan-header-before-dark.png) |
| After | [plan-header-after-light.png](plan-header-after-light.png) | [plan-header-after-dark.png](plan-header-after-dark.png) |
| After, long place (own row) | [plan-header-after-long-place-light.png](plan-header-after-long-place-light.png) | [plan-header-after-long-place-dark.png](plan-header-after-long-place-dark.png) |

The real Plan detail at 390 px after the change:
[Light](plan-detail-after-390-light.png), [Dark](plan-detail-after-390-dark.png).

## C. Vibe, battery, note and gesture flights

The Product Owner approved three clickable demos as the visual reference
(`vibe-send-demo.html`, `vibe-partner-arrival-demo.html`,
`vibe-gesture-send-demo.html`, kept outside the repository). Runtime captures
from the implemented Wir page are listed below.

Behavior, in the order the commits build on each other:

1. **Dein Tag, Fertig.** Choosing a feeling still only selects and saves as
   before. When something changed and the person presses Fertig, the chosen
   feeling, the battery (if set) and the note lift out of the sheet, wait for the
   server, then fly together to the own avatar badge while the sheet closes. A
   value that could not be saved flies back and the sheet stays open. The note
   stays on the own badge as a dot once a note exists. The badge shows an empty
   pill while the flight waits (8 s limit); an unchanged Fertig closes at once.
   Offline and reduced motion keep the calm close without flight.
2. **Partner arrival on Wir.** The partner's revealed feeling, battery or note
   that is new or different from what this device last saw rise together out of
   the partner avatar, stay together briefly and fly together into the partner
   badge. At most once per state and device, never while the own check-in sheet is
   open, never with reduced motion, never for a value that is not visible under
   Mutual Reveal. This is a deliberate Product Owner decision against the earlier
   rule recorded in [1212-event-driven-arrival-motion.md](../../1212-event-driven-arrival-motion.md).
3. **Sent gestures.** A tapped gesture lifts out of the partner quick-action sheet
   and waits for the server. Only a confirmed send continues: the sheet closes,
   the symbol flies to the partner avatar and lands in a way that matches the
   gesture (the "is on its way" text is posted as a Snackbar). A failed send
   returns the symbol and the sheet stays open with the existing error and retry.
   Entitlements, cooldown and offline behavior are unchanged.
4. **Old feeling shrinks away.** When the partner changes their feeling the face
   this device saw before stays in place and shrinks away as the new one lands.

Contract and rationale: [motion-guideline.md](../../motion-guideline.md),
[partner-gesture-receipt.md](../../partner-gesture-receipt.md). No new motion
role beyond `motion.duration.sendFlight` (560 ms, `--duration-send-flight`).

Runtime captures from the browser journeys in `web/e2e/tests/today-daily-checkin.spec.ts`
(Compact, animations slowed to catch a frame; the saved frames are mid-motion, so they
show composition, not smoothness):

| | Light (360 px) | Dark (390 px) |
| --- | --- | --- |
| Own Fertig flight in the air | [send-flight-360-light-hover.png](send-flight-360-light-hover.png) | [send-flight-390-dark-hover.png](send-flight-390-dark-hover.png) |
| Own Fertig flight landed | | [send-flight-390-dark-landed.png](send-flight-390-dark-landed.png) |
| Partner arrival rising out of the avatar | [partner-arrival-360-light-rise.png](partner-arrival-360-light-rise.png) | [partner-arrival-390-dark-rise.png](partner-arrival-390-dark-rise.png) |
| Partner arrival landed | | [partner-arrival-390-dark-landed.png](partner-arrival-390-dark-landed.png) |

The sent-gesture flight (item 3) and the old-feeling shrink (item 4) are covered by
unit and browser tests but have no saved capture; the approved demo is their visual reference.
