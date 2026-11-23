# #2079 Playback and Scene domains on the motion layer

Captured with Playwright Chromium on Windows against the mocked API. The garden and Wir images come from the new permanent regressions on this branch. The recap images come from the existing `automatic-recaps.spec.ts` captures, run on this branch.

The composition of every screen is unchanged. This step changes how the existing motion is built and when the loops run. The images show the settled result; the motion itself is measured below. A real device has not been tested; see "Open".

## The garden scene: open → play → page hidden → off screen → return

Test: `garden-game.spec.ts`, "garden scene loops only while seen and continues where it paused".

Per view:
- `2079-garden-scene-<view>-playing.png`: the garden after opening, with its loops running;
- `2079-garden-scene-<view>-returned.png`: after the page was hidden and shown again and, on Compact, after the scene was scrolled off screen and back;
- `2079-garden-scene-390-light-reduce.png`: with reduced motion.

Views:
- Compact 360 px Light, 390 px Dark and 430 px Light;
- 390 px Light with reduced motion;
- Expanded 1280 px Dark.

| View | Seen | Page hidden | Off screen | Returned |
| --- | --- | --- | --- | --- |
| 360 Light | playing, 50 of 50 running | paused, 0 of 53 running | paused, 0 of 53 running | playing, 52 of 53 running |
| 390 Dark | playing, 50 of 50 running | paused, 0 of 53 running | paused, 0 of 53 running | playing, 52 of 53 running |
| 430 Light | playing, 50 of 50 running | paused, 0 of 53 running | paused, 0 of 53 running | playing, 52 of 53 running |
| 390 Light, reduced motion | paused, 0 animations | – | – | – |
| 1280 Dark | playing, 50 of 50 running | paused, 0 of 53 running | not measured | playing, 52 of 53 running |

How each column is measured:
- **State:** the scene controller's `data-motion-scene` on the scene root.
- **Running:** CSS animations inside the scene in `document.getAnimations()` whose play state is `running`, of all animations inside it. A paused scene renders no animation frames.
- **Page hidden:** `visibilityState` reported as `hidden` with a `visibilitychange` event, as when the app goes to the background.
- **Off screen:** the scene scrolled above a 420 px high viewport. At 1280 px such a viewport is landscape, where the garden opens its landscape view instead, so Expanded checks the page only.
- **Returned:** every loop that was held continues from its held time. None restarted (M4). One one-shot finished in between, so 52 of 53 run.

## The Wir garden: hidden kept view and return

Test: `wir-garden.spec.ts`, "the Wir garden pauses in its hidden kept view and continues on return".
- `2079-wir-garden-390-light-shown.png`: Wir with the garden preview, which is `playing` within its 12 s ambient rest.
- Momente hides the kept Wir view. The preview is `paused` with 0 running animations.
- `2079-wir-garden-390-light-returned.png`: back on Wir, the same preview continues. The module does not enter again.

## Playback: the recap reader and film

From `automatic-recaps.spec.ts` on this branch. Playback behaviour is unchanged:
- `useStoryPlayback` pauses with the page and with the play/pause control;
- with reduced motion it never starts on its own;
- the film's scene keyframes moved unchanged into `motion/playback.css`.

Images:
- `2079-recaps-reader-360-light.png`, `2079-recaps-reader-390-light.png`: the reader.
- `2079-recaps-film-00-390-light.png`, `2079-recaps-film-10-1280-dark.png`: the monthly film, Compact and Expanded.
- `2079-recaps-playback-360-dark-large-reduced.png`: reduced motion and large text. Watch now opens paused.
- `2079-recaps-momente-entry-390-light.png`, `2079-recaps-momente-entry-430-dark.png`: the new recap lead on Momente. It opens with a fade at full height (Replace `disclose` option 1).
- `2079-recaps-momente-after-390-light.png`, `2079-recaps-momente-after-1280-dark.png`: after the recap was opened and the person returned, the lead has collapsed away. That is the one row transition (option 3), and "with motion the opened recap card collapses away after return" passes.

## Checked elsewhere

- **Unit tests:**
  - `motion/scene.test.tsx`: page, viewport, kept view, `active` and reduced motion;
  - `motion/ambientRest.test.ts`: the visible-time budget and the page-hidden rest;
  - `scripts/check-motion-layer.test.mjs`: the empty allowlist and the registered loops counted exactly.
- **Browser specs run on this branch:**
  - `automatic-recaps`, `garden-game`, `garden-story`, `wir-garden`, `story-discover-tapestry` (story playback and its pause);
  - `heart-hunt`, `picture-ping-pong`, `memory-map-and-couple-games` (Who of us and the shared experience note), `wish-detective`, `perspective-game`;
  - `occasion-memory-mark`, `relationship-reflections`, `shared-experience-answers`, `shared-notes`, `media-overview`, `wish-selection-date-ideas`, `memory-experiences`, `chapter-experience`, `map-place-stacks`, `heart-moment-reading`.

  See the PR validation for the results.

## Open

Pixel device acceptance:
- the garden, its full screen and the Wir preview: smooth loops, a pause in the background and on another tab, and no restart on return;
- the recap film and the story: play, pause, background and return;
- the games;
- reduced motion;
- Light and Dark.
