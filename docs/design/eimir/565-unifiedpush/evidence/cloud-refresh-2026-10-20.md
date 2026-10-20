# UnifiedPush integration preflight: 2026-10-20

The Product Owner requested continuation of existing PR #1271. Reviewed baseline
main is `50dcc7fcc39fec288fc800615ea7948fde30e5fe`; the previous PR head is
`5cb91e25022bfe5a684d91f18350e620b382cc65`. The published test.13 does not contain
the native receiver. This work updates the existing PR, without claiming a merge,
test-channel publication or physical-device acceptance.

## Reuse and product contract before implementation

Keep the official UnifiedPush connector 3.3.3, generated Notifications API,
existing notification policy and existing inline Notification Settings control.
Reuse the shared session owner/rotating-token facade and React effect ownership;
do not introduce another credential store, transport, provider or product UI.
The permanently enabled LauncherActivity is now the Android entry contract;
MainActivity is the historical, switchable Original icon alias.

The existing Product Reference v1 R5, Settings template 8 and versioned
[Mobile Interaction Contract](../../../../product/design/references/565/unifiedpush-device-preflight.md)
remain applicable. Review of current Settings/NotificationSettingsPanel finds no
replacement composition necessary. Keep all existing preferences, Quiet Hours,
Compact/Expanded layout, tokens, localization, status announcements, motion and
permission actions. No new screen, copy or material layout change is planned;
the existing whole-screen reference directs the unchanged device control.

Primary references reviewed: [Capacitor App v8](https://capacitorjs.com/docs/apis/app),
[React effect cleanup](https://react.dev/reference/react/useEffect), and
[UnifiedPush implementations](https://unifiedpush.org/developers/implementations/).
The adopted protocol/SDK and its Apache-2.0 license are unchanged. No new provider,
account, runtime dependency, telemetry or managed-service cost is introduced.

## Integration risks and intended checks

- Preserve all main fixes, encrypted session storage, launcher icons and current
  strict dependency verification while resolving the merge conflicts.
- Route notification taps through LauncherActivity even when Original is disabled.
- Stop native receipt immediately on sign-out. Revoke the endpoint and server
  session while the original session owner is still usable; only then clear local
  state and navigate. A late completion must not sign out a replacement login.
- Reject stale queued endpoint work before it writes, and prevent an obsolete
  endpoint error from disabling a replacement Account's native receiver.
- Exercise credential rotation, cancellation, sign-out order and stale work using
  regression tests; execute related Web/build checks and available Android checks.

**No business/freemium impact:** notifications and secure client maintenance stay
Free/Core for Cloud and Self-Hosted. No entitlement, quota, retention, privacy,
relationship ownership, pricing or export contract changes.

Security/privacy review: generic decrypted wakes only; no content in system
notifications. Account-scoped cleanup, exact server ownership and current-origin
allowlisting remain authoritative. No API/schema/migration change is planned.

## Acceptance boundaries

Historical Pixel/ntfy evidence retains its exact original source and APK identity.
The remaining real second-distributor delivery and physical unfolded/Dark/system-
font checks in the 2026-10-16 assignment remain open. Cloud, host and emulator
checks do not satisfy those physical gates. PR #1271 remains Draft until they are
completed. FCM, live server configuration and a new signed test-channel release
are separate from this PR refresh.

## Implemented continuation

- Merge current main without dropping encrypted native sessions, icon aliases or
  strict artifact verification. Notification taps use the permanent activity;
  the existing Android launcher instrumentation now checks this for every icon
  and checks registration of all three native plugins.
- Reject queued registrations after their effect ended, ignore obsolete 422
  responses and scope native wake/status events to their originating Account.
- Reuse the canonical session owner for endpoint revocation and sign-out across
  token rotations. A five-second remote-cleanup budget aborts unavailable I/O;
  the endpoint ID remains available for later cleanup. A replacement login is
  never cleared or redirected by the old completion.
- Hide private content using the existing localized loading composition while
  signing out. Await encrypted local-session cleanup before document navigation.
  A signed-out bootstrap stops stale native receipt after native hydration.

## Local verification

- **78 focused tests passed:** device Push, Notification Settings, session sign-out
  and AppShell. Two added endpoint-ownership regressions fail on the previous
  merged baseline before the fixes. Sign-out tests use the real generated clients
  and rotating-session facade, including account replacement, timeout/abort,
  failed cleanup and delayed local persistence.
- TypeScript, changed-file Biome lint, token/PWA/Capacitor foundation, production
  Web build, browser inventory and diff/XML checks pass. Existing Vite bundle-size
  and dependency directive warnings remain visible.
- **Three browser journeys pass without retries** against the production Web
  bundle using official Chrome Headless Shell **151.0.7922.34**, the pinned
  Playwright runtime. The same unchanged assertions/deadlines cover deep-route
  reload, sign-out/server order/privacy masking/reload and demo-session reload.
  [390 px sign-out pending state](sign-out-pending-390.png) is an actual product
  rendering with fictional API fixtures, not native/device evidence.
- An earlier combined Web run reported **2045 passes, three timeouts and one
  existing skip**. The unchanged private-collection, private-deletion and Timeline
  filter files subsequently pass **all 90 cases** in an isolated run. No test,
  assertion, retry, timeout or workflow was weakened. This does not claim the
  intermittent timing cause is proven. Fresh exact-head repository CI remains
  required.

The standard browser CDN returned truncated ZIPs; downloading the exact official
Chrome-for-Testing archive from its Google origin produced the verified runnable
pinned browser. A development-server repetition exhausted existing deadlines;
that failure is retained as such, not rewritten as a production result. Normal
hosted Browser QA still runs the canonical repository configuration.

Native compilation and fresh hosted CI are recorded on PR #1271 separately.
Neither build success nor browser/component mocks close the physical gates above.

## Additional integration preflight and correction

Final review compared notification entry with the current mailbox entry and
confirmed that direct notification navigation bypassed the shared document-leave
guard. Warm and cold regression cases reproduce the draft loss before correction.
Reuse the same guard/external-store contract and existing localized Snackbar;
keep the pending handoff scoped to Account/API identity and consume it only when
the draft/save guard releases. No new composition, token, provider or screen.

The fresh Supply Chain audit also reports three upstream aiohttp 3.14.3
advisories, fixed in 3.14.4: GHSA-494j-54xm-rwp3, GHSA-5wr8-gcqf-gqf3 and
GHSA-2g87-pp6c-29x5. Regenerate the existing transitive lock with the pinned uv
0.12.15; preserve the audit gate. This security maintenance has no business,
entitlement, API, schema or new-provider impact.


Both notification-entry regressions fail on the integration baseline and pass
with the shared guard. The 78 focused cases include warm/cold entry without
losing an active draft. The lock diff changes only aiohttp and its exact artifacts.

Hosted checks on integration commit `be191bd15e303bd6893414c6b618049cc41394c7`
passed Web Reference Flow (2049 tests passed, one existing skip), Android launcher
instrumentation on API 28 and API 36,
and Release Evidence (unsigned APK/AAB, packaging and configuration). These are
CI/emulator results, not physical-device acceptance. The initial local Android
attempt was blocked by network access to Gradle/Maven, before source compilation;
it is not recorded as a passing build. The subsequent head also changes bundled
Web entry and the backend lock, so its fresh CI remains required.

Pinned uv lock verification passes; its frozen audit reports no known
vulnerabilities or adverse project statuses across 76 packages. All five existing
backend UnifiedPush unit tests pass under the updated lock.

After the draft-entry correction, TypeScript, lint, formatting, Capacitor/token/
PWA checks and production build pass again. All three production-browser session
journeys pass again without retries, with unchanged assertions and deadlines.
