# Contextual push validation

Baseline main: `36ccc13a162502a7122820a32b45569c17b72521`.
The [validation manifest](validation.json) binds the changed runtime/test sources,
exact fixture APK and observed results. It distinguishes fixture checks from real
provider delivery. The [product decision, generated references and interaction
contract](../../../../product/design/references/565-contextual-push/README.md)
were prepared for the Product Owner follow-up in #565.

- 1,267 combined backend/unit/PostgreSQL cases passed; the overlapping final
  registration/privacy group passed 24 and rollback/pipeline group passed three.
  Actual upgrade/downgrade preserves authored reminders and legacy registration.
  A fresh migrated database matches model metadata; mypy checks 332 source files.
  The final session/auth/pipeline run passed 1,307 cases; the overlapping final
  family/registration group passed 20. Revoked, deleted and expired families lose
  rich content; normal access expiry/rotation keeps it. Fresh sign-in rebinds
  the same endpoint. Account-before-family locks serialize revocation and handoff.
- The complete Web run passed 2,465 tests with two existing skips. One unchanged
  durable-media LRU test timed out at its existing five-second bound during
  parallel local work. Only that file was retried: all six cases passed. No test
  or timeout was weakened. Final navigation/read/privacy groups passed separately.
- All 37 installed Android fixture cases passed on Pixel 10 Pro Fold / API 36:
  real key wrapping/ownership/retirement, Python-produced JWE decryption,
  ciphertext alteration/expiry rejection, safe future-kind fallback, native
  redaction, distinct actual PendingIntents and replay suppression after dismiss.
- Nine full-shell browser journeys passed with synthetic authenticated APIs,
  360/390/430/1280 px, Light/Dark, reduced motion and a 360 px 200% text state.
  Every scoped axe run reported zero violations. The initial large-text overflow
  was fixed by reusing the shared read-detail wrapping contract and wrapping Back.
  The physical device's font setting was not changed.

Representative actual fixture captures:
[390 Light](reminder-390-light.png),
[430 Dark](reminder-430-dark.png),
[360 Dark at 200% text](reminder-360-dark-text200.png),
[1280 Dark](reminder-1280-dark.png).
The phone read view is deliberately plain, content-first and uses tertiary Back.

These local results are not hosted CI, a published signed application or real
contextual FCM delivery. The earlier generic real receipt and same-account inbox
tap remain valid for their original baseline. Their test reminder/preference and
observer cleanup succeeded. The new preview/source action still requires the
selected server and exact signed release; #565 stays open and #1577 owns later
Play-distributed acceptance. No whole-Cloud launch is certified here.
