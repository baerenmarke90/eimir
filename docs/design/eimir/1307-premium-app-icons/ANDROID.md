# Android launcher-icon correction

Owner: #1307. Baseline: `ca91790823d5e57ccd3a375cb9c8658315331938`.
The owner requested correction of the shipped Android test application on
2026-10-19. The supplied version is `0.2.0-test.5`, from the private test channel
on `feat/1331-android-test-updates`; that channel must retain its updater and
encrypted session storage when integrating this correction.

## Preflight and reuse decision

The existing Appearance screen, full eleven-choice catalog, ShortTaskSheet,
explicit save, central `theme.bespoke_packs` check, ownership/ETag boundary,
and focus/pending/error behavior remain the product contract. Product Reference
v1 R5 and the existing Mobile Interaction Contract in README.md apply. The
generated full-catalog reference already linked in #1307 remains the composition
reference: no controls, navigation or catalog layout are replaced. Only the
platform feedback gains native applying, failure/retry and confirmed states.

Use Android's activity aliases and PackageManager through one local Capacitor
plugin, following the existing NativeSessionStorage plugin registration pattern.
Sources reviewed on 2026-10-19:

- https://developer.android.com/guide/topics/manifest/activity-alias-element
- https://developer.android.com/reference/android/content/pm/PackageManager
- https://capacitorjs.com/docs/android/custom-code

There is no portable Web API that changes the APK's launcher. Manifest/favicons
cannot implement this Android requirement. A third-party icon plugin would
still need app-specific aliases, catalog resources and upgrade handling; the
small platform adapter requires no new runtime dependency or external provider.

Keep the historical `de.eimir.app.MainActivity` launcher component as the
Original alias, targeting a permanently enabled shell activity. This preserves
the old component identity on upgrade and keeps authentication entry independent
of whichever icon is selected. Enable the destination before disabling other
aliases on older Android; use one atomic component update on API 33+. Never
disable the shell, kill/restart the application, reinstall or clear user data.

## Business/freemium impact reviewed

The authoritative matrix's alternative-icon row remains Mixed: Original is
Free/Core; the ten alternatives use existing Space Pro entitlement, with a
personal saved preference and non-destructive expiry retention. The adapter
applies only a successfully loaded/saved authorized preference. Failure to apply
locally does not undo a successful account save or falsely announce completion;
retry only the local application. Cloud/Self-Hosted parity, export/deletion,
quotas, provider costs and entitlement enforcement are unchanged.

## Lifecycle and acceptance contract

- Preview never changes the launcher. Authorized read applies a previously
  saved choice, including after updating from test.5.
- Native completion is acknowledged separately from server persistence. Native
  errors retain the saved choice and expose an explicit retry; no timer infers
  success. A legacy APK without the plugin asks for an application update.
- Default/loading/unmount do not reset the installed icon. Logout and owner
  teardown cannot silently remove an installed cosmetic choice. Late results
  cannot overwrite the new owner's displayed state.
- Original remains free to select. Fixed alternatives survive theme changes.
  The OS may briefly retain its cached artwork; the app verifies the enabled
  launcher component, without claiming control over vendor launcher refresh.
- Reuse the exact approved artwork with deterministic Android adaptive-icon
  resources. No generated replacement artwork or new visual system.
- Verify fresh install and update, every alternative and Original, exactly one
  launchable alias, OIDC/email entry, process restart, launcher rendering,
  failed native application/retry, pending save and entitlement rejection.
- Check Compact Light/Dark, large text, reduced motion and existing browser
  behavior. Web/PWA installation is separate from this APK correction.

The test-channel sideload App Links must target the permanently enabled shell,
not the selectable Original alias. Preserve package/signing identity and use a
higher version code for delivery; never replace published APK bytes.
