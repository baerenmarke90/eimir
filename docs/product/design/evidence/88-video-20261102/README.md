# Short-video browser evidence — 2026-11-02

Owning issue: [#88](https://github.com/baerenmarke90/eimir/issues/88).
Implementation: [#1598](https://github.com/baerenmarke90/eimir/pull/1598), stacked on #1592.

## Source and reproduction

These are inspected screenshots of the running canonical React application,
not generated reference art. The pre-implementation generated reference and
Mobile Interaction Contract remain in [the reference directory](../../references/88-video/README.md).

- Branch source: `6c4f42e7f4c21c921613d37deebc6d692386678c`.
- Actual Actions merge checkout: `f564c7ced7c3640501b5a9008c4a0dde3dcdbbf4`.
- Both have tree `e0805fb6d197f8451652b69f8142d7b254d60472`; the base is #1592 `a64a6183`.
- [Media Video run](https://github.com/baerenmarke90/eimir/actions/runs/41467102598): seven browser journeys passed in 33.1 seconds **without retries**.
- Artifact `13153915350`, `video-browser-f564c7ced7c3640501b5a9008c4a0dde3dcdbbf4-attempt-1`.
- Run `web/e2e/node_modules/.bin/playwright test tests/video-attachments.spec.ts --workers=1 --retries=0` from `web/e2e` after locked installs and its pinned Chromium installation.
- The later evidence/documentation commit changes no runtime code.

The browser journeys use strict mocked HTTP responses and the actual application,
native browser video controls and a real synthetic H.264/AAC file. The backend
is tested separately: this same workflow passed **45** codec, byte-range,
streaming and PostgreSQL lifecycle/privacy tests, plus the restricted optional
image build and advisory-evidence check. This is not a claim of physical Android
acceptance or a browser-to-production-media-worker full-stack run.

## Observed behavior

The five viewport journeys open Memory capture, choose an image and a video,
wait for confirmed readiness, save their order, observe the canonical Memory,
navigate to the video using native touch below 600px, open the player, deliberately
play, seek, pause and return to the same Memory. The test verifies the visible
player is in front of neighbouring content and reads a blue decoded frame after
seeking, rather than accepting a loaded poster as playback evidence.

The remaining journeys close the Pro explanation without losing the current
narrative and open retained video while upload availability is disabled and the
Space is Free. No original video is requested through the image loader. The
gallery owns one player, issues one transient grant per opening, retains the
native controls, and clears the player on close. Video gallery/privacy overlays
sit above the native seek/volume controls.

Capture passed automated Axe checks at every viewport; journeys verify no
horizontal overflow. All use reduced motion. The 320px journey uses 200% root
text size. Light/Dark, keyboard/focus and control ownership were reviewed
alongside the existing gallery tests. Automated checks do not establish
complete accessibility or native-device acceptance.

The solid blue frame is deliberate test content (96×64, one second with silent
AAC). The sunset poster/photo is an existing demo image, not a frame claimed to
come from that synthetic movie. Names, narrative, IDs, credentials and grants
are test fixtures. No personal video or third-party media provider is involved.

## Screenshots

| View | Capture | Native player after seek |
| --- | --- | --- |
| 320px Light, 200% text | [Capture](video-capture-320-light.png) | [Player](video-playback-320-light.png) |
| 360px Light | [Capture](video-capture-360-light.png) | [Player](video-playback-360-light.png) |
| 390px Dark | [Capture](video-capture-390-dark.png) | [Player](video-playback-390-dark.png) |
| 430px Light | [Capture](video-capture-430-light.png) | [Player](video-playback-430-light.png) |
| 1280px Dark | [Capture](video-capture-1280-dark.png) | [Player](video-playback-1280-dark.png) |

Playback captures use the fixed modal's viewport. Whole-page captures temporarily
resize Chromium's capture surface and can capture a neighbouring poster during
native video compositing; they are not used as playback proof.

## Remaining acceptance

Physical Android picker/playback acceptance, broader full-stack regression and
the security review of the undetermined upstream CVE-2025-52290 remain explicit
merge/production-activation gates in the PR and [operations contract](../../../../operations/video-uploads.md).
No merge, deployment or release is authorized by this evidence.
