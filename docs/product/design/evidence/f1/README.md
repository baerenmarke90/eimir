# F1 visual evidence

Internal proof only; synthetic copy and the repository-approved CC0 cabin photograph. See [delivery and reproduction](../../f1-visual-foundations.md).

## Web

| State | Light | Dark |
| --- | --- | --- |
| Compact 390 | [Capture](f1-light-390.png) | [Capture](f1-dark-390.png) |
| Expanded 1280 | [Capture](f1-light-1280.png) | [Capture](f1-dark-1280.png) |
| Native dialog sample | [Capture](f1-sheet-light-390.png) | [Capture](f1-sheet-dark-390.png) |

- [200% text in 320 px sheet](f1-large-text-sheet-320.png)
- [Failed photo with retained content and retry](f1-media-error-390.png)
- [Text-only and explicitly simulated offline state](f1-text-offline-dark-360.png)
- [Light rendered geometry/contrast](f1-light-390.json), [Dark rendered geometry/contrast](f1-dark-390.json)

Adjacent JSON reports cover 320/360/390/430/1280, stable loading geometry and sheet contrast. The 19-test behavior suite covers return/focus, actual selection completion, retries, modal keyboard behavior, reflow and reduced motion. Images alone are not behavioral acceptance.

## Android

Android 15 / API 35 ARM64 emulator, source `0dffed3e`, with exact APK/screenshot hashes in the [completed capture report](f1-android-report.json). All 24 final PNGs and UIAutomator XML hierarchies are retained here. The report records eight interaction scenarios and measured targets; the [rendered contrast report](f1-android-contrast.json) supplements visual inspection with bounded role-color checks.

| State | Light | Dark |
| --- | --- | --- |
| Compact 320 | [Capture](f1-android-320-light.png) | [Capture](f1-android-320-dark.png) |
| Compact 360 | [Capture](f1-android-360-light.png) | [Capture](f1-android-360-dark.png) |
| Compact 390 | [Capture](f1-android-390-light.png) | [Capture](f1-android-390-dark.png) |
| Compact 430 | [Capture](f1-android-430-light.png) | [Capture](f1-android-430-dark.png) |
| Expanded 1280 | [Capture](f1-android-1280-light.png) | [Capture](f1-android-1280-dark.png) |
| Native sheet | [Capture](f1-android-overlay.png) | [Capture](f1-android-overlay-dark.png) |
| Completed utility selection | [Capture](f1-android-utility-selected.png) | [Capture](f1-android-utility-selected-dark.png) |

- [Stable loading](f1-android-loading.png), [failed photo and retry](f1-android-error.png), [successful retry](f1-android-retry-success.png)
- [No-photo composition](f1-android-empty.png), [explicitly simulated offline](f1-android-offline.png), [status](f1-android-success.png)
- [Full photo detail](f1-android-photo-detail.png), [reading detail](f1-android-text-detail.png)
- [200% text / disabled system animations](f1-android-390-dark-large-text-reduced-motion.png), [reachable large-text sheet Close](f1-android-390-dark-large-text-sheet.png)

The native helper checks System Back, visible Back, Close, selection, Retry and retained absent-media meaning through real device input. UIAutomator and Compose semantic checks do not establish human TalkBack focus restoration; no human TalkBack session or full release-device matrix is claimed.
