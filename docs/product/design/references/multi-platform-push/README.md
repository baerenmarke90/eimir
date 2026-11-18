# Push settings reference (#1811)

The [generated Compact reference](compact-reference.webp) follows the existing
Notifications settings at main revision `12c650ebf`. The device switch reuses
the existing consent and preference controls. The app displays the browser
switch only in a supported browser or installed Web App.

## Implementation evidence

Chromium renders the checked state after authenticated endpoint confirmation.
The fixture uses synthetic endpoints and accounts.

- [Browser Compact, 360 px Light](evidence/browser-360-light.webp)
- [Browser Compact, 430 px Dark](evidence/browser-430-dark.webp)
- [Browser Expanded, 1280 px Light](evidence/browser-1280-light.webp)
- [Native Android settings fixture, 390 px Dark](evidence/android-webview-390-dark.webp)

`browser-push.spec.ts` exercises enable, stale and current notification opens,
and disable. The native settings fixture verifies the runtime-specific switch
and revocation. The iOS bridge fixture verifies APNs registration and arrival
at the sealed page without opening the message. System delivery acceptance
requires configured services and physical devices.
