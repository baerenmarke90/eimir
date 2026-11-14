# #1467 Google selection task: visual evidence

Captured by `web/e2e/tests/polish-people-photo-sources.spec.ts` (`google task offers reopening the window and
retrying a failed photo`) against the built Web bundle with a mocked API, in the person-avatar editor, which uses the
shared `PhotoSourcePicker` sheet.

| File | State |
| --- | --- |
| `google-task-chooser-360-light.png` | Compact 360 px, Light: source chooser with the short Google contract |
| `google-task-chooser-390-dark.png` | Compact 390 px, Dark: same state |
| `google-task-chooser-1440-light.png` | Expanded 1440 px, Light: same state |
| `google-task-waiting-360-light.png` | Compact 360 px, Light: waiting for Google with the reopen action |
| `google-task-waiting-390-dark.png` | Compact 390 px, Dark: same state |
| `google-task-waiting-1440-light.png` | Expanded 1440 px, Light: same state |
| `google-task-retry-360-light.png` | Compact 360 px, Light: failed photo with the retry action |
| `google-task-retry-390-dark.png` | Compact 390 px, Dark: same state |
| `google-task-retry-1440-light.png` | Expanded 1440 px, Light: same state |

All states ran with reduced motion, an Axe check of the sheet and a horizontal-reflow check. They are not a real-device
or live-Google check.
