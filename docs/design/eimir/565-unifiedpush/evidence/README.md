# UnifiedPush device control visual evidence

These screenshots render the actual `NotificationSettingsPanel` component and
its production CSS in headless Chromium, with mocked notification preferences
and an active native Push state. They show the new device control in Compact
(360 and 390 CSS px), Dark (390 px), Expanded (1280 px), and 320 px at 200%
root text size. The account address and preferences are test data. The control preserves the existing settings
hierarchy and uses the existing button and token styles.

This is component-level visual evidence, not an Android screenshot or proof of
Push delivery. Device acceptance remains open: test distributor selection,
permission denial, encrypted wake delivery with the app foreground/background/
terminated, generic notification appearance and tap navigation, disable and
re-enable, logout/account switch, and a denied/unavailable backend origin on a
physical device or emulator with a configured distributor.
