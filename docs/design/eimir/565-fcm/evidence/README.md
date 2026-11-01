# Push provider notice — presentation verification, 2026-10-21

Baseline: `d25cb137d701c41ec9206fd1bb099bca4fd8e9f8` (#1392). The existing
`SettingsPage`, `NotificationSettingsPanel`, reminders and quiet-hours components
were rendered with synthetic preferences/controller methods and shared shell CSS.
The authenticated AppShell/navigation, real Account/API and native bridge were
not mounted. The earlier generated whole-screen #565 reference remains the
composition preflight; these captures verify its longer provider notice.

Seven headless Chromium tests passed across 19 rendered states: 320/390/430 px,
Light/Dark, off/on/error, plus 320 px Dark with 200% root text and reduced motion.
There was no horizontal document/body/paragraph overflow. Push actions met the
44 px target; 19 axe checks scoped to `.notification-device-push` had no findings.
The notice occupied five lines at 320 px and four at 390/430 px with normal text.
At 200%, the paragraph wraps and the actions remain reachable by vertical scroll.

- [390 px Light, off](390-light-off.png)
- [390 px Dark, on](390-dark-on.png)
- [430 px Dark, error](430-dark-error.png)
- [320 px, 200% text and reduced motion](320-dark-text200-reduced-motion-off.png)

All 19 captures are retained alongside measured [presentation results](review-results.json),
[scoped accessibility results](accessibility-results.json) and the [manifest](manifest.json).
The synthetic harness was retained in the local review artifact and removed from
application/test entry points after capture. CUA had no available browser session,
so the repository's separate headless Playwright browser was used. No user browser,
phone font or other personal device setting was changed.

This is component/page presentation evidence, not authenticated full-shell,
native-permission, FCM/UnifiedPush delivery, server-rollout or physical Product
Acceptance. The manifest records exact source hashes and further limits. Capture
used Vite 8.2.2 before its isolated build-tool security patch to 8.2.4; the reviewed
component/style/locale sources are unchanged by that patch. Standard Web/Expanded
keeps the existing Settings UI; the device control is native-only. Existing
Expanded notification-settings evidence remains under `docs/product/design/evidence/515/`.
