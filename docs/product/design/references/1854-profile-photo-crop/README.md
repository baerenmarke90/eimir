# Choose the visible section of a profile photo (`photoCrop.title`) — visual reference (#1854)

Issue: #1854. Product Owner request (2026-11-14, chat): let users choose the
visible section of a photo in the app before upload, because round avatars cut
off parts of the picture.

## Sources

| File | Variant | Baseline |
| --- | --- | --- |
| `01-profile-photo-crop-390-light.png` | Light, 390 px | `main` `6b9c44810` |
| `01-profile-photo-crop-390-dark.png` | Dark, 390 px | `main` `6b9c44810` |

The images were composed from the real application in the browser-test harness
(API mocked with the profile fixtures of
`web/e2e/tests/hidden-file-inputs.spec.ts`): the shipped profile page under
More with profile editing open, and the shipped bottom sheet surface, header,
title, footer and button styles. The crop stage, zoom control and copy were
added by live DOM edits as placeholders for the new step. The photo is a drawn
placeholder, not a real person.

## Composition

1. The existing profile page stays behind the scrim; the step opens right after
   a photo was chosen through the existing change-image action.
2. The photo takes the largest area. A round frame shows exactly what avatars
   will show; the area outside the circle is dimmed but still visible so the
   user sees what can be moved in.
3. One zoom control, one short help line.
4. Footer: secondary cancel, one filled primary action (`photoCrop.confirm`).

Existing functions represented: the profile page heading and Back, the shared
sheet handle and dismissal, the shared secondary and primary buttons.

Expanded uses the same sheet in its centered variant; no separate composition.

## Crop decision

The crop is applied on the device before upload: the chosen square section is
rendered to a canvas, exported as JPEG (longest edge at most 1024 px) and sent
through the unchanged attachment flow. There is no crop metadata, no backend,
API or schema change, and every existing avatar consumer shows the choice as
is. The original photo is not kept on the server; choosing a different section
later means choosing the photo again. Existing profile photos are unchanged.
The export carries no EXIF or location metadata and is upright, because the
browser applies the EXIF orientation while decoding. A photo the device cannot
decode (for example HEIC in a browser without HEIC support) skips the step and
is uploaded unchanged.

## Implementation evidence

Captured by `web/e2e/tests/profile-photo-crop.spec.ts` against the production
bundle with mocked API data (`SCREENSHOT_EXPORT_DIR`), on the branch
`feat/photo-crop-before-upload`. The photo is drawn by the test.

| State | Files in `evidence/` |
| --- | --- |
| Crop step after moving the photo | `profile-photo-crop-360-light.png`, `-390-dark.png`, `-430-light.png`, `-320-light.png` (320 x 568), `-1280-dark.png` (Expanded) |
| Saved result on the profile | `profile-photo-saved-360-light.png`, `-390-dark.png`, `-430-light.png`, `-1280-dark.png` |

The profile fixture has no partner profile, so the saved-result images show the
existing error state of the partner section below the own profile card; it is
unrelated to this change.
