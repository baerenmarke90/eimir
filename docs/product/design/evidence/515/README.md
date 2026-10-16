# Quiet Hours Settings visual evidence

These lossless WebP images are real Chromium captures of the Notification Settings
route at PR #1261 head `471a1c45f9d6e773c9160050aa3ce9d39a7b5099`, from the
[Web Browser QA run](https://github.com/baerenmarke90/eimir/actions/runs/36027171815).
The full-page screenshots preserve the current shell, per-event channel choices,
Quiet Hours, anniversary/birthday settings and inbox entry. Fixed navigation and
the skip link appear at their viewport scroll position in a full-page capture.

| Image | State |
| --- | --- |
| `notification-settings-360-light.webp` | Compact Light, enabled and saved |
| `notification-settings-390-light.webp` | Compact Light, initial off |
| `notification-settings-390-light-saved.webp` | Compact Light, enabled and saved |
| `notification-settings-390-dark.webp` | Compact Dark, enabled and saved, reduced motion |
| `notification-settings-430-light.webp` | Compact Light, enabled and saved |
| `notification-settings-1280-light.webp` | Expanded Light, enabled and saved |
| `notification-settings-1280-dark.webp` | Expanded Dark, enabled and saved, reduced motion |

The browser test uses owner-scoped API mocks. It checks open, enable, equal-time
rejection, save, returned state, independent channel toggle, re-entry, widths,
themes, axe and 320px reflow at 200% text with the time inputs active. The
backend integration suite separately exercises the real Account-scoped API,
invalid boundaries and clearing a persisted window.

## Comment Push opt-in

The following lossless WebP images are real Chromium captures from the
`#515` opt-in branch. They show the existing page with the new Comments Push
choice; the [generated pre-implementation composition](../../references/515/comment-push-optin-compact.png)
is a separate design guide.

| Image | State |
| --- | --- |
| `notification-settings-390-light-comment-push.webp` | Compact Light, opt-in off by default |
| `notification-settings-390-comment-opted-in-comment-push.webp` | Compact Light, explicit opt-in saved, transport unavailable |
| `notification-settings-390-dark-comment-push.webp` | Compact Dark, opted in, reduced motion |
| `notification-settings-360-light-comment-push.webp` | Compact Light at 360 px, opted in |
| `notification-settings-1280-light-comment-push.webp` | Expanded Light, opted in |

The browser test checks off → opt in → saved status → leave/return → opt out →
reload; it also exercises 320 px at 200% text, 360/390/430 px, Light/Dark,
reduced motion, axe and the continued anniversary/birthday reminder controls.
The backend integration test covers explicit Account ownership and the fact
that a saved preference is not an immediate per-comment Push or proof of an
available transport.

## Comment EMAIL opt-in

The following lossless WebP images are real Chromium captures from the
`#515` EMAIL opt-in branch. The [generated pre-implementation composition](../../references/515/comment-email-optin-compact.png)
is a separate design guide. Browser captures use an available mocked EMAIL
capability and the existing notification page, including Quiet Hours and
reminder controls.

| Image | State |
| --- | --- |
| `notification-settings-390-light-comment-email.webp` | Compact Light, comment EMAIL off by default |
| `notification-settings-390-opted-in-comment-email.webp` | Compact Light, explicit comment EMAIL opt-in saved |
| `notification-settings-390-dark-comment-email.webp` | Compact Dark, opted in, reduced motion |
| `notification-settings-360-light-comment-email.webp` | Compact Light at 360 px, opted in |
| `notification-settings-1280-light-comment-email.webp` | Expanded Light, opted in |
| `notification-settings-1280-dark-comment-email.webp` | Expanded Dark, opted in, reduced motion |

The browser test checks off → opt in → saved status → leave/return → opt out →
reload, separate Push and In-App choices, 320 px at 200% text, Compact and
Expanded widths, Light/Dark, reduced motion and axe. The backend integration
test covers owner scope, verified primary address and SMTP requirements,
revocation after lost capability, and the distinction between digest consent
and individual per-comment email.
