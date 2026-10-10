# UnifiedPush device control visual evidence

These screenshots render the actual `NotificationSettingsPanel` component and
its production CSS in headless Chromium, with mocked notification preferences
and an active native Push state. They show the new device control in Compact
(360 and 390 CSS px), Dark (390 px), Expanded (1280 px), and 320 px at 200%
root text size. The account address and preferences are test data. The control preserves the existing settings
hierarchy and uses the existing button and token styles.

This is component-level visual evidence, not an Android screenshot or proof of
Push delivery. The separate [2026-10-07 device verification](device-verification-2026-10-07.md)
records physical Pixel captures, executed acceptance cases, automated checks,
and the remaining limitations against implementation commit `25ef1034`.
