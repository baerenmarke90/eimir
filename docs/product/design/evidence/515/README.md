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
