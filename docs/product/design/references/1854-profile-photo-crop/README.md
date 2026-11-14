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
