# UnifiedPush cloud refresh: 2026-10-16

PR #1271 remains **Draft**. The initial refresh merged baseline main
`b9c7ce1c88823f3a35337a50e0e67cf63bd884c1`; the final integration merges main
`159f38a21e8fef03f36de7c1cef1874da60e5f14` after regular merges of #1319
(semantic Today browser readiness) and #1303 (Gradle 8.14.6 security patch).
The merge preserves the current routes, generated API, notification preferences,
dependency repairs and Android artifact-verification policy. No native or Web
Push behavior is intentionally changed.

## Cloud checks

- Complete Web suite at the initial refreshed source: **1496 passed, one existing
  skip**, with `npm test -- --maxWorkers=2`. The final main integration changes
  browser-test readiness and build verification, with no additional Web runtime
  or unit-test changes.
- `npm run typecheck`, `npm run lint`, `npm run format:check`,
  `npm run cap:check`, and `npm run build`: passed.
- `npm audit --audit-level=high`: passed; three moderate transitive findings
  remain in `@capacitor/cli -> xcode -> uuid`. This is not a zero-findings claim.
  No audit threshold, dependency assertion or security gate was changed.
- Fresh PR CI and Android Release Evidence must pass at the updated head.
  Historical red npm/Mako/PyJWT audit runs remain historical records; they are
  not current-head acceptance evidence.

The regular Android package graph still uses the official UnifiedPush connector,
strict Gradle artifact verification and the shared generated Notifications API.
The independent Gradle security-toolchain repair from #1303 is included:
Gradle 8.14.6, AGP 8.13.0, Capacitor 8.5.2 and JDK 21. Both release-workflow
JAR pins and the verified Kotlin metadata POM remain intact alongside this PR's
UnifiedPush artifact pins. No verification policy is relaxed.

These cloud checks do not execute Android distributor delivery, Android system
permission/settings UI, physical fold transitions or system font scaling. They
do not supersede or expand the claims in the
[2026-10-07 device report](device-verification-2026-10-07.md).

## Minimal remaining physical-device acceptance

Use an isolated QA app/backend and fictional Accounts, preserving the personal
app and server. Record the exact updated commit, APK SHA-256, Android/WebView and
distributor versions, actual CSS viewports, steps and observed results. Use the
same APK for both checks below; cloud/component renders cannot satisfy them.

1. **One successful second distributor beyond ntfy.** Obtain an endpoint with
   Sunup or another supported distributor on a network where its real service
   hostname resolves. The prior Sunup attempt resolved
   `push.services.mozilla.com` to `0.0.0.0`, before registration; it was not a
   delivery test. If filtered again, record that exact failure and use an
   authorized QA network/distributor rather than claiming success or changing
   personal DNS settings. The QA operator must allow only the distributor's
   actual required HTTPS origin in the backend policy. Verify registration,
   encrypted generic wake in foreground (query refresh, no system notification),
   background and process-terminated states (one private generic notification),
   inbox tap/authentication, then disable/revocation and absence of further
   notifications. Terminated means killed process, not Android force-stop.
2. **One combined unfolded + Dark + enlarged Android system-font pass.** Open
   Notification Settings, activate, observe active state, open system permission
   settings and return, disable, then return to the prior app context. Capture
   unfolded and folded states including a fold transition, and record the real
   Android font setting. Require readable/wrapping status text, reachable actions,
   no clipping/overlap/horizontal overflow and correct resume state. Restore QA
   settings afterwards. Existing component large-text renders remain separate.

Existing Pixel/ntfy evidence covers the broader lifecycle matrix, including
logout, Account changes, permission denial, rejected origins and unavailable
transport. Repeat those cases only if the updated integration/native build
changes the corresponding behavior or a regression appears; do not relabel the
old evidence as a run against the new APK. Revoke QA endpoints and remove only
QA app/services/port forwards when finished.

No new product-tier, commercial, provider-credential or UI design decision is
required for these checks. FCM credentials and FCM implementation remain outside
this PR's scope and are not merge blockers for the UnifiedPush slice.
