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

## All-variant home-screen mask correction — 2026-10-26

The owner reported an installed Android home-screen regression: Lavender
appeared as an undersized pre-rounded tile within the OS launcher mask.
The same original resource contract affected all eleven choices. The existing
generator puts every exact approved poster tile into the central 288px of a
transparent 432px foreground. Android's effective mask is 72dp inside a 108dp
canvas; the old tile covered that viewport without overscan, making the
source tile's rounded boundary visible.

Every choice now references a generated, centered \`132dp\` foreground
\`layer-list\`. The original 288/432 bitmap tile therefore spans \`88dp\`,
overscanning the mask by 8dp per side. This retains the exact approved artwork
and lets the Android launcher decide the final outer mask (round/squircle/etc.)
without displaying another rounded square inside it. It does not force a
square icon on launchers whose system mask is circular.

The build-time generator remains the source of all eleven resources.
\`python3 scripts/test_android_adaptive_icon_resources.py\` checks alias mapping,
resource XML, dimensions and matching source images for every choice; the API
28/36 native launcher workflow validates the compiled drawable geometry and
existing selection/session entry behaviour. No Java/React production logic,
permissions, origin, package/signing identity, provider or dependency changes.

**Still required:** a signed higher-version test APK with the same existing
package/signer, in-place data/session upgrade, and visual inspection of every
choice on the owner's real launcher (home, app drawer, system mask/theme modes).
Static validation or an emulator alone cannot close #1307. Previously captured
native screenshots are evidence of the old build, not this correction.
