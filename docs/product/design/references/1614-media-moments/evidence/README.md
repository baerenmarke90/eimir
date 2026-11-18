# Runtime evidence

Synthetic authenticated browser fixtures against the #1614 runtime tree
`dd9f2c1eeba735afcd374047f6bc3fdb1fa5f01f`. The final follow-up additionally guards the video-policy pending/error state;
the captured ordinary photo/provider/Moments composition is unchanged except for
the source-choice capture, refreshed after the Product Owner excluded Google
Photos. That final five-case Immich run passed at 320/360/390/430/1280, asserting
the unavailable Google option is absent and preserving the complete Save journey. The
separate final video and delayed-policy journeys verify that bounded state. These are actual Chromium captures, not generated
references. They do not prove live provider approval or physical Android behavior.

| State | Capture |
| --- | --- |
| Diary: one media entry and redundant sharing block removed | [390 Light](diary-media-entry-390-light.webp) |
| Device/Immich choice, with Google Photos excluded | [390 Light](source-choice-390-light.webp) |
| Immich: visible selection, bounded previews, retry, adopt then Save | [390 Light](immich-selection-390-light.webp), [1280 Dark](immich-selection-1280-dark.webp) |
| Moments: unchanged selection/order with landscape/portrait rhythm | [390 Light](moments-390-light.webp), [1440 Light](moments-1440-light.webp), [1440 Dark](moments-1440-dark.webp) |
| Narrow Moments and enlarged text | [320 Dark](moments-320-dark-large-text.webp) |

The nine-case capture run passed. Five Immich journeys prove link -> select ->
optional failed-preview retry -> stage -> explicit Save -> canonical result at
320/360/390/430/1280, including reduced motion, 200% text and Axe checks. Four
Moments journeys prove order/count, two different image proportions, independent
Diary return, narrow text reflow and theme accessibility. Other valid browser
runs cover mixed photo/video Save/playback, Free Pro explanation, disabled
processing, retained media, draft/recovery/partial failure and the shared
Memory/HeartMoment/Plan capture journeys. See the parent README for results and
independent native gates. Google Photos is excluded by the Product Owner.
