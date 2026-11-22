# #2158 F: detailed push content, settings copy

Captured with Playwright Chromium (device scale factor 2) on Linux. The real `DevicePushOnboarding`
sheet was mounted with the app's stylesheets, i18n and a fake native controller in an untracked
local page, because the sheet only opens in the native Android app. Only its second paragraph
(`notificationSettings.deviceIntro`) changed: it now says that notices show what happened and that
the person's Android setting for sensitive content decides what a locked screen shows.

- `compact-390-light-de.png`, `compact-390-dark-de.png`, `compact-390-light-en.png`: Compact sheet.
- `compact-360-light-de-large-text.png` and `-scrolled.png`: 360 px at 200 % root font size. The
  text reflows inside the sheet's scroll area, no horizontal overflow, the actions stay reachable.
- `expanded-1280-light-de.png`, `expanded-1280-dark-en.png`: Expanded dialog.

The native notifications themselves cannot be captured here (no Android SDK or emulator in this
environment). Their exact German and English bodies for every kind are the expected values in
`android/app/src/androidTest/assets/push-preview-catalog.json` (`v3-*` cases), and a Pixel check is
open.
