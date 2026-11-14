# Media overview and gallery feedback

## Design preflight

The overview preflight reviewed main at `1ff8f25aac55b88b5f5a7bbbd0690b95077b45c9`.
The reaction follow-up reviewed `790105977ea83fb4ace70978770343e9845accdf`.
The existing #601 photo overview, #1661 return flow, #1485 photo reactions and
#1741 media controls supply the starting experience. Product Reference v1 R2
and R5 guide the overview and the Detail View. Saved media and authored content
remain the focal points.

The generated Compact references were made before their respective changes.
The [overview reference](reference-overview.png) uses the #601 Compact capture
to integrate the renamed More destination, shared and private selection, a
video poster and a voice note into the existing month grid. The
[reaction reference](reference-reactions.png) uses the #1741 Diary capture to
place the reaction at the bottom left of the existing media frame. The
follow-up decision removes the chip outline and displays a count only from
two matching reactions.

## Mobile interaction contract

Open Media from More, select the shared or own-private audience, open a tile,
and return to the gallery or the saved entry. The month grid has two columns
in Compact and four in Expanded. Both modes keep the audience controls
visible and reuse the fullscreen viewer, accessible labels, focus and Back
behavior. The gallery restores the filter and position after a detail visit.
Video and voice playback require deliberate activation. Sensitive media uses
the existing reveal control. Empty, offline and retry feedback stays with the
current audience.

In the Detail View, confirmed photo reactions overlay the lower-left edge of
the media frame. Adding, changing or removing one keeps the reading layout
stable. A confirmed addition or change pulses the emoji once. The position
marker follows the native swipe and crossfades at the circular boundary and
between wrapped rows. Reduced motion shows the settled state immediately.

The existing authorizations, attachment reads, media players, query
pagination, motion and overlay tokens serve both Cloud and Self-Hosted. The
shared-photo endpoint stays available to older clients. The eight German and
English Public Domain love sayings use the established Daily Quote rotation
and carry their source editions and rights provenance in the catalog.

## Runtime evidence

The browser captures use synthetic fixtures.

| Surface | Capture |
| --- | --- |
| Compact mixed-media overview, Light | [390 px](evidence/overview-390-light.png) |
| Compact own-private voice note after reveal, Dark | [390 px](evidence/private-voice-390-dark.png) |
| Expanded dense overview, Light | [1280 px](evidence/overview-1280-light.png) |
| Compact borderless single reaction, Light | [390 px](evidence/reaction-390-light.png) |

Browser coverage includes gallery opening, both audiences, deliberate playback,
access revocation, cache reuse with reauthorization, paging recovery, the
canonical detail return, and both themes and large-text reflow. Reaction
coverage exercises confirmed add, replace and removal, then verifies the
persisted state after reload. Touch tests sample the marker during a swipe at
320 and 390 px, including the circular boundary. The keyboard checks cover
settled selection and reduced motion.
