# Wir hero: distance in the heart and the light

Owner: #1792 (partner distance on Wir). Product Owner decisions of 2026-11-22.
This record takes precedence over the earlier distance chip of the Verbunden
hero in [1907-h4-distance-value](../1907-h4-distance-value/README.md). The chip
of the other Wir designs is unchanged.

## Problem

The hero was full: the check-in and message marks, the heart, the time together
above and below it, two names and the distance chip between them. The distance
needed a clearer presentation without taking a place of its own.

## Decisions

- **The heart is a moon.** A round shadow moves over the filled heart with the
  server distance band: a thin crescent far apart, **completely full** at the
  closest step.
- **The light is shared.** Each portrait keeps a tall glow. As the two come
  closer, wider glows and a shared light in the middle fade in.
- **The light has no visible end.** It lies behind the page content, reaches past
  the status bar to the screen edge and fades out inside the next module, so it
  never reads as a band. It stays clearly visible in Light too: there, the quiet
  text on it becomes firmer, so that small text keeps at least 4.5:1.
- **No connecting line** between the portraits in the Verbunden hero.
- **No visible first names in the Wir hero**, and nothing else changes: names
  stay everywhere else, accessible names stay, portraits without a photo keep
  their initials, and the waiting state keeps its invitation.
- **Nothing about the distance sits between the names' former places**, not
  even for a moment.
- **The word appears on request.** A tap on the heart hops one small light from
  each portrait to the heart; when they meet, the heart beats and the pin with
  the short word replaces the time above the heart for 3 seconds. Nothing
  alternates by itself.
- **A change is shown once when the app opens.** If the band differs from the
  step this device last showed, the old state is painted first, the same hop
  plays after the Wir opening, and the heart and light move to the new value.

## Demo example (Product Owner decision of 2026-11-25)

In the public Demo the heart plays by itself, and the word opens the map. This
narrows "Nothing alternates by itself" and "The word appears on request" above
for the Demo only; every other deployment keeps them.

- A Demo visitor shares no device position and Wir never opens the OS dialog,
  so the Demo cannot measure a distance. A Demo deployment therefore answers a
  distance read from the two example positions the Demo seed publishes (Lea and
  Alex) and reports the value as fresh. The position in the request is ignored,
  so the example does not age into an "earlier value" within a reset interval.
- A device without an earlier visit has nothing to compare with, so the
  existing "A change is shown once when the app opens" rule alone would show the
  first value quietly. In the Demo the first view therefore starts from the
  farthest step (a thin crescent) and plays the same hop after the Wir opening to
  the live step, then the word appears as after any hop. Nothing else is new: no
  new motion, and a second view on the same device shows the value quietly.
- The map shows the partner's example area and, from the example positions, the
  viewer's own point and the connection. It never reads the visitor's device
  position, and the sync never publishes a visitor's position over the example.
- Reduced motion, the 44 px heart control and the accessible name are unchanged.

## Mobile Interaction Contract

| Aspect | Contract |
| --- | --- |
| Reference | Product Reference v1, Wir (R4); the composition stays two portraits with the heart between them |
| Focal point | The two portraits; the heart and light are their shared state |
| Primary action | Unchanged; the plus and the message marks on the portraits |
| Heart | A 44 CSS px control with the full sentence as its accessible name and tooltip |
| Story | The time together remains the link to the couple's story; the heart control is its sibling, never nested |
| Map | While shown, the word opens the map when the partner shares it |
| Own position missing | The tap offers `partnerLocation.distanceShareShort`, leading to the settings |
| Compact | The pin sits above the word and the type follows the gap; long words wrap at their soft hyphen |
| Expanded | The same composition in the capped column; the light fades before the window edge |
| Earlier value | Dimmed heart, no light, no hop; the time of the value is in the accessible name |
| Important day | The day's full heart and Moment win; a change is applied without a hop |
| Offline, error, not shared | The hero shows the plain heart and gives no reason |
| Reduced motion | No flight; the final state and the word appear at once with the same announcement |

## Privacy and data

The visual derives only from the server band. The device keeps one record per
viewer and Space: the coarse step (0 to 6) and two timestamps. It holds no
position, kilometre value, direction or history, expires after 24 hours, is
removed when sharing ends and on sign-out, and is never synced. See
[PARTNER-LOCATION section 5](../../../../m9/PARTNER-LOCATION.md#5-retention-and-freshness).

## Motion

The hop is a Flight in the shared layer, followed by Feedback `affection` on the
filled shape only (M7) and Replace `value` for the word. The change on opening
is the recorded exception in
[Motion Contract 4.9](../../motion-contract.md#49-attention-unprompted-motion):
it uses the `arrival` attention slot, is dropped rather than queued, has no
haptic, and plays at most once per 30 minutes so that a value at a band edge
stays calm.

## Evidence

Screens from the local application with the demo Space and a fixture for the
distance read are in
[evidence/wir-hero-heart-light](../../evidence/wir-hero-heart-light/README.md).
