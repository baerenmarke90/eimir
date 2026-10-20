# Account-replacement lifecycle follow-up: 2026-10-20

The initial API 36 fixture and APK identities below are retained as historical
evidence. The subsequent [API 28 fixture diagnosis and dispatch-boundary
verification](account-replacement-api28-fixture-2026-10-20.md) records the
corrected test boundary without changing this runtime correction.

## Preflight before implementation

Baseline: PR #1271 head `26b0d5c4399d8a0fdea65f096d49af0bfb52f724`,
including runtime `45fde83d`. This follow-up addresses a separate, deterministic
native Account-replacement ordering defect. It does **not** establish the root
cause of the physical gCompat-UP `PUSH_SUBSCRIPTION_GONE` finding, whose first
new endpoint differed from earlier registrations. Physical first-attempt
delivery and the recorded display acceptance remain open.

Reuse review: retain the pinned UnifiedPush Connector 3.3.3 and its public
registration/distributor APIs. Inspection of that exact dependency confirms
that unregistering its last instance also removes its saved distributor;
registering without a saved distributor stores an instance but sends no
registration broadcast. The official Android registration contract requires
selecting/saving a distributor before registering. Therefore retire another
Account **before** distributor selection, while preserving the existing enable
request cancellation guard. No delay, blind retry or replacement transport is
appropriate. Tests use stock Android instrumentation and the real pinned
connector with a minimal distributor receiver confined to the test APK; no
new runtime/test dependency is needed.

Primary API contracts:
[unregister removes the distributor with the last instance](https://unifiedpush.org/kdoc/connector/org.unifiedpush.android.connector/-unified-push/unregister.html)
and [register requires a selected distributor](https://unifiedpush.org/kdoc/connector/org.unifiedpush.android.connector/-unified-push/register.html).

Product/design: this is an internal ordering correction within the existing
R5/F2 push activation and Account-ownership contract. It introduces no visible
composition, copy, motion, interaction or settings change, so the existing
generated references and device evidence remain applicable. No new visual
reference is required for this unchanged surface.

Business/freemium impact reviewed: notifications and official client access
remain Free/Core with identical Cloud/Self-Hosted semantics. No entitlement,
provider, credential, managed resource, quota, cost or downgrade change occurs.

Cross-cutting review: preserve Account-tagged callbacks and cancel superseded
enable requests before changing native state. Reuse the existing notification
cleanup when retiring a prior Account. No API/schema/migration, backend,
localization, accessibility or deployment configuration changes. The test
distributor is exported only in the instrumentation APK and never contacts an
external provider. New tests must fail on the baseline ordering and cover
replacement plus cancellation; local compilation and actual emulator/device
execution are reported separately.

## Implemented correction

`UnifiedPushBridge.selectAndRegister` now rejects obsolete enable calls before
touching native state, clears and unregisters a different active Account, and
then asks the existing connector to select its current/default distributor.
The existing callback cancellation check remains in place. The old Account's
generic notification is removed through the existing cleanup primitive.

Previously the connector selected a distributor first, then unregistered the
only old Account, which removed that just-selected distributor. Registering the
replacement stored its registration locally but dispatched no registration.
The corrected ordering retains a selected distributor and emits the new
Account's real `REGISTER` broadcast on its first enable call.

No new production abstraction, dependency, retry or delay was introduced.
The instrumentation APK alone contains a local protocol observer and a tiny
activation Activity to leave Android's initial stopped-package state. The
target WebView has JavaScript disabled, is replaced by a confirmed blank
document, and its existing Capacitor task queue is drained before setup;
the normal signed-out Web effect therefore cannot race this native fixture.

## Executed regression and validation

The real pinned connector and public plugin activation run in the existing
isolated API 36 emulator, fingerprint
`Android/sdk_phone64_arm64/emu64a:16/BE2A.250530.026.D1/13818094:userdebug/test-keys`.
No external distributor, network provider, backend, authenticated session or
physical device is involved in this verification.

- [Baseline instrumentation](account-replacement-baseline-api36-2026-10-20.log):
  **three tests executed, one expected failure**. Direct replacement reports
  `expected:<de.sidebyside.app.debug.test> but was:<null>` for the selected
  distributor. Both cancellation cases pass. The baseline APK changes only
  `UnifiedPushBridge.java` back to the PR head; the same final test APK is used
  before and after the fix.
- [Corrected instrumentation](account-replacement-fixed-api36-2026-10-20.log):
  **all seven tests pass without retry**: the three new Account replacement,
  cancelled enable and late permission callback cases, plus all four existing
  launcher/notification-URI cases. Direct replacement verifies the selected
  distributor, the actual connector `REGISTER` broadcast with a token, and the
  new active Account. This is registration dispatch proof, not a provider
  endpoint acknowledgment or delivery proof.
- Canonical `:app:assembleDebug`, `:app:assembleDebugAndroidTest`,
  `:app:lintDebug`, `:app:testDebugUnitTest`: **BUILD SUCCESSFUL**, JDK 21,
  strict dependency verification; four existing NativeSessionCipher unit tests
  remain green. `git diff --check` passes. Existing Gradle/resource warnings
  remain unchanged.

The native runtime file has Git blob
`f7f63c6912eab3d82a7d325cfa34e107df35d0ab`. SHA-256 identities:

| Artifact | SHA-256 |
| --- | --- |
| Baseline debug APK | `ea2a17dcf5a1a0b10fca1cf1efc6d42476b0b5242243fbd47c0ec26b39a133eb` |
| Corrected debug APK | `b29ee30fdc25682d097ea3f05330e8f189b33c577db1206585830da763cf43e7` |
| Shared instrumentation APK | `7b7bfba20074ccd4acff564f3dd5a2cc6c3735d109c2d63f4a3694b614cdd9d4` |

During fixture development, lint rejected an unflagged legacy receiver
registration; it was replaced with the existing AndroidX compatibility API.
The initial receiver could not run while its test package was stopped; the
explicit test-only activation above corrects that setup. Revoking a granted
runtime permission inside teardown killed the instrumentation process; that
unnecessary revocation was removed, and teardown instead uninstalls both
owned emulator test packages. An earlier emulator process was terminated by
the host with exit 137 while builds ran; the final successful run was performed
after builds completed, with a restarted emulator. These are preserved setup
findings and are not attributed to product behavior.

Both test packages were removed successfully and only emulator `emulator-5586`
was shut down after validation. No personal device settings or apps changed.
API 28 execution and fresh hosted verification of the eventual PR head remain
separate required gates. The physical gCompat-UP first-registration finding and
the previously recorded display-acceptance limit are not resolved by this test.
