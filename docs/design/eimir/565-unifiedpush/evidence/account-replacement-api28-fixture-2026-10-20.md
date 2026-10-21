# API 28 Account-replacement fixture follow-up: 2026-10-20

## Diagnosis and preflight

The first hosted execution at PR head `cac175d6` passed all seven API 36
instrumentation cases. API 28 passed the existing four launcher cases and the
first new lifecycle case, but the other two failed in setup while waiting for
the initial Account's test-distributor report. This is not attributed to a
product registration defect or to the physical gCompat-UP finding.

An unchanged local reproduction on a newly isolated API 28 Google APIs ARM64
emulator also failed initial registration observation. Its private Android
broadcast dump shows two actual connector `REGISTER` requests still pending
in the OS background queue after the tests, with no dispatch timestamp.
Meanwhile a different package's background broadcast occupied that queue for
40 seconds. Test-Activity return signals were delivered in approximately
117 milliseconds. This separates the connector's real dispatch from its
subsequent OS delivery: neither a missing legacy PendingIntent identity nor
a delayed test-observer return hop explains these queued requests. One local
case also missed blank-document readiness during first-boot load; that result
remains visible in the original reproduction log.

Android does not guarantee broadcast delivery times; its
[broadcast documentation](https://developer.android.com/develop/background-work/background-tasks/broadcasts)
distinguishes sending from eventual delivery. The regression's existing
contract is registration **dispatch**, not provider acknowledgment or delivery.
The original five-second fixture-delivery expectation added an unrelated OS
scheduling dependency to that contract.

Reuse decision before this test correction: use stock instrumentation
`newActivity` to substitute an observing `LauncherActivity` subclass only for
explicitly marked test launches. A plain ContextWrapper cannot replace the
Bridge context because Capacitor stores an AppCompatActivity and uses the same
object for `getActivity`. Both connector-used `sendBroadcast` overloads in the
test Activity delegate the original Intent, permission and options unchanged
to Android. The real pinned Connector 3.3.3, its database, real PackageManager
discovery and production plugin remain in use. The initial SDK registration
also uses that actual recording Activity. No production object or hidden
Android field is modified. The minimal manifest receiver remains discoverable but inert.
Its activation Activity and the second reporting broadcast are removed.

The observing subclass stops the product document and disables JavaScript
directly after `super.onCreate`, before `onResume`, then confirms the same
blank-document callback with the unchanged five-second bound. The existing
native queue barrier follows it. This also removes the original fixture's
unnecessary window between Activity startup and document isolation.

The corrected test requires exactly one real `REGISTER` dispatch with a fresh
token and the new active Account; cancellation permits no distributor request.
The baseline must still expose both the removed distributor and zero new
registration dispatches. No product code, SDK request flag, timeout, retry,
security gate, dependency, UX or business/freemium behavior changes.
The previously checked runtime blob remains
`f7f63c6912eab3d82a7d325cfa34e107df35d0ab`; physical acceptance belongs to the
separate physical recheck report.

## Activity resource lifecycle

The first API 36 execution of the dispatch observer, still using the old
manual `startActivitySync`/`finish()` fixture lifecycle, crashed in WebView
between its first and second cases. The
[instrumentation result](account-replacement-api36-dispatch-crash-2026-10-20.log)
and [small lifecycle extract](account-replacement-api36-dispatch-crash-lifecycle-2026-10-20.log)
retain that failure. The extract contains only Activity startup, destruction,
renderer-exit and fatal-pointer diagnostic lines; it excludes all broadcast
extras, unrelated logcat and crash minidumps.

The old teardown issued `finish()` without awaiting completed destruction.
Capacitor destroys its WebView on window detachment, separately from its
plugin `onDestroy` cleanup. Therefore the old helper did not own the full
Activity resource lifecycle. This observation does not establish a product
WebView or registration root cause for the renderer failure.

The final fixture uses the already available AndroidX Test core 1.7.0
`ActivityScenario` for all test-owned launcher Activities, including the
existing launcher-start test. Its
[`close()` contract](https://developer.android.com/reference/androidx/test/core/app/ActivityScenario#close())
waits for the managed Activity to reach `DESTROYED`; the pinned implementation
also waits for the main queue to become idle. The push fixture closes in
`finally`/`@After`, and the launcher test uses try-with-resources. All original
assertions remain. No custom lifecycle framework, test dependency, sleep,
retry or deadline adjustment is added.

## Historical intermediate results

The original unchanged local reproduction is retained in the
[instrumentation log](account-replacement-api28-original-reproduction-2026-10-20.log).
The [sanitized Android broadcast dump](account-replacement-api28-pending-dispatch-2026-10-20.log)
retains both pending actual connector requests and the concurrent queue
occupation; all broadcast extras are omitted.

Before the ActivityScenario correction, the observing fixture was verified
on API 28 against both original and corrected product APKs:

- API 28 [baseline run](account-replacement-api28-dispatch-baseline-2026-10-20.log):
  three cases executed, exactly the expected replacement regression fails.
  Its [secret-free trace](account-replacement-api28-dispatch-baseline-fixture-2026-10-20.log)
  confirms a missing selected distributor **and zero registration dispatches**.
- API 28 [corrected run](account-replacement-api28-dispatch-fixed-2026-10-20.log):
  **all seven original cases pass, without retry**. The
  [trace](account-replacement-api28-dispatch-fixed-fixture-2026-10-20.log)
  confirms the selected distributor and exactly one replacement dispatch;
  both cancellation cases emit zero operations. The new token differs from the
  prior token, compared as a boolean so no token value enters failure logs.
- These runs used intermediate instrumentation APK SHA-256:
`64b3903b729e869e6a9e275ae938162154ab7116a17defc910adfcf66fd095aa`.

## Final ActivityScenario verification

The final instrumentation APK SHA-256 is
`a2538eba1a3cff1cf15a629c28ef0be22a20c73be2ea897b642ec1d9d71db0bc`.
It is used unchanged against both product APKs and on both emulator APIs.
The baseline and corrected product APKs retain the first report's respective
SHA-256 identities:

- Baseline: `ea2a17dcf5a1a0b10fca1cf1efc6d42476b0b5242243fbd47c0ec26b39a133eb`.
- Corrected: `b29ee30fdc25682d097ea3f05330e8f189b33c577db1206585830da763cf43e7`.

Final test-APK build, app lint and app unit tests pass with JDK 21 and strict
dependency verification; four unchanged NativeSessionCipher cases remain
green. No test deadline or workflow retry changed.

- API 36 [baseline run](account-replacement-api36-scenario-baseline-2026-10-20.log):
  three cases execute, exactly the expected replacement regression fails.
  The [trace](account-replacement-api36-scenario-baseline-fixture-2026-10-20.log)
  confirms a missing distributor and zero replacement registrations.
- API 36 [corrected run](account-replacement-api36-scenario-fixed-2026-10-20.log):
  all seven original cases pass in 6.317 seconds without retry. The
  [trace](account-replacement-api36-scenario-fixed-fixture-2026-10-20.log)
  confirms exactly one replacement registration and no cancellation requests.
- API 28 [baseline run](account-replacement-api28-scenario-baseline-2026-10-20.log):
  three cases execute, exactly the expected replacement regression fails.
  The [trace](account-replacement-api28-scenario-baseline-fixture-2026-10-20.log)
  confirms a missing distributor and zero replacement registrations.
- API 28 [corrected run](account-replacement-api28-scenario-fixed-2026-10-20.log):
  all seven original cases pass in 12.918 seconds without retry. The
  [trace](account-replacement-api28-scenario-fixed-fixture-2026-10-20.log)
  confirms exactly one replacement registration and no cancellation requests.

The isolated Google APIs ARM64 emulator fingerprints were:

- API 28: `Android/sdk_gphone_arm64/generic_arm64:9/PSR1.210301.009.B6/9767327:userdebug/dev-keys`.
- API 36: `Android/sdk_phone64_arm64/emu64a:16/BE2A.250530.026.D1/13818094:userdebug/test-keys`.

Both emulator app/test packages were removed after these checks, and both
owned emulators were stopped. No physical device was modified during this
fixture follow-up. These cases prove connector dispatch and cancellation;
they do not assert OS manifest-broadcast delivery or provider acknowledgment.
