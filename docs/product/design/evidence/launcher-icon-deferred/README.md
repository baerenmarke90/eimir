# Launcher icon: deferred switch (PR #2259)

Compact evidence for the only visible change: the settings hint after an
icon choice now says the new icon appears once the person leaves the app.

| File | State |
| --- | --- |
| `settings-hint-390-light.jpg` | Mehr › Einstellungen › Darstellung, App-Icon, 390 × 844 px, Light |
| `settings-hint-390-dark.jpg` | Same, Dark |

## How it was captured

- 2026-11-24, local web build of this branch against the local demo instance,
  in the desktop app's browser pane.
- The hint renders only inside the Android app. For the capture, the web
  launcher adapter (`web/src/client/nativeAppIcon.ts`) was temporarily
  forced to report an Android launcher. That change is not committed.
  Component, styles and tokens are the real ones.

## Not covered

- No device recording. The Product Owner waived device screenshots for this
  PR on 2026-11-24. The behavior (the app stays open after sign-in and the
  icon switches after leaving) is to be confirmed on the Pixel with the debug
  build installed that day.
- Expanded/Web is unaffected because the hint is Android-only.
