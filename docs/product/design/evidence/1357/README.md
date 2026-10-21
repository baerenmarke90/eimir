# Native session retention: unchanged product UI

Baseline main: `599e6dd29380c4c79bbe9c8e5fb34ac4e78c227b`.

This background credential/lifecycle correction changes no markup, copy, style,
control, composition or native prompt. Product Reference v1 R5 and the existing
login/restoration/authenticated application remain the visual reference. No new
generated composition is required for this non-material visual change.

## Real App browser journey

`web/e2e/tests/session-retention.spec.ts` restores an expired-access session,
simulates a temporary refresh outage, verifies the real authenticated shell
retains its session, reconnects, verifies the rotated credential, reloads and
verifies the restored authenticated app again. A separate case verifies that
a definitive 401 clears credentials and returns to entry. Both cases pass.
The captured authenticated Settings destination uses synthetic accounts/tokens.

- [Compact 390, Light, reduced motion](compact-light.png)
- [Expanded 1280, Dark, reduced motion](expanded-dark.png)

The browser journey validates actual React orchestration. It does not exercise
the Android Keystore or prove physical process/update continuity. Lower-level
Web tests cover native-bridge hydration, clear, expiry, serialization, account
races and rotated-token persistence. JVM tests exercise real AES/GCM roundtrip,
random IVs, instance binding, tamper rejection and malformed framing. Actual
Android restart, update, logout/relaunch and Keystore failure checks remain
part of private-device acceptance rather than final Store certification.
