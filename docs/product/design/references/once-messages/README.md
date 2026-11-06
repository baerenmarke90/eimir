# One-time messages: design and integration evidence

Owning issue: [#1672](https://github.com/baerenmarke90/eimir/issues/1672).
The [generated composition](compact-reference.png) and [prompt](prompt.md)
preceded UI implementation. The [interaction and privacy contract](../../../once-messages.md)
governs behavior and records the reuse/business decisions.

## Baseline and dependency

Preflight main: `c5e15a4c29eb60adaec5a1d39f574fdc9b8c4d25`.
Integrated main: `e98202bff3aefe33c46724fa0ad7b5e2ac6f6e1c`.
Voice dependency: [PR #1671](https://github.com/baerenmarke90/eimir/pull/1671)
at `c47be4dfe0ec48d8786ee5ea1507b1be44b76e23`.
Combined source: `ec2cf95b6`. Broad checks began at `9f9b094e7`; the final
access/catalog correction at `92d6b3a1c` has dedicated regression evidence below.
The owning PR records final-head CI results.

The existing recorder, file normalization and player are reused. Temporary
ciphertext never enters Attachments, HeartMoments, Story, exports or offline
content caches. Existing permanent voice notes remain Free/Core and portable.

## Product evidence

| State | Actual client evidence |
| --- | --- |
| Wir with sealed incoming signal and ordinary relationship content | [390 Light](evidence/once-incoming-390-light.png) |
| Focused composer | [390 Light](evidence/once-composer-390-light.png), [360 Dark](evidence/once-composer-360-dark.png), [430 Dark](evidence/once-composer-430-dark.png) |
| Expanded adaptation | [1280 Dark](evidence/once-composer-1280-dark.png) |
| 320 px, 200% text, reduced motion | [Full scrollable composition](evidence/once-composer-320-large-reduced-full.png) |
| Deliberate opening | [Sealed](evidence/once-sealed-390-light.png), [active text view](evidence/once-open-390-light.png) |
| Locally normalized media | [Photo](evidence/once-photo-390-light.png), [shared voice player](evidence/once-voice-390-light.png) |

`once-messages.spec.ts` and the complete `heart-voice-notes.spec.ts` pass together:
**12 browser journeys, 47.9 seconds**, followed by a final feature-only run of
**3 journeys, 24.9 seconds** after the access-contract correction. Real browser JWE encrypts across independent
account/device contexts. The tests cover uncertain-send retry without duplication,
explicit claim, plaintext exclusion from Web storage, clearing on pagehide/close,
reload after consumption, audio import/decode/playback, photo canvas normalization,
reflow, both themes, reduced motion and axe. The voice dependency also exercises
real MediaRecorder encoding from a synthetic microphone, denial, save recovery and
unchanged editing. Screenshots were inspected with surrounding content visible.

## Runtime verification

- PostgreSQL/API integration: **76 passed** for temporary messages, permanent
  HeartMoments/audio, contextual push, entitlements and jobs. Two inherited voice
  transfer decoder cases are skipped in this isolated Python container because it
  has no restricted FFmpeg binary; their decoder evidence remains in #1671.
  After taking the final dependency corrections, the complete shared push/voice
  regression set passes **30 cases**, including its transfer validation stand-ins.
- Final authentication/tenant/malformed-ID and temporary lifecycle matrix:
  **50 passed**. The endpoint inventory and no-preview catalog regressions add
  **10 passed**, including both preview versions and digest choices.
- Final client/crypto/recorder/audio-share/Wir/localization suites: **136 passed**.
- Protected-payload and notification-policy units: **13 passed**; backup regressions:
  **8 passed**. Sender withdrawal, stale consent and late task responses are covered.
- Empty PostgreSQL upgrade through 0115, downgrade to 0114, re-upgrade and Alembic
  model-drift check pass. The legal model is registered explicitly in the test
  fixture so production-session races do not depend on collection order.
- Production Web build, Python lint/format and mypy (366 source files), Web
  lint/format, internal proof types, token/legal/i18n/PWA/Capacitor checks,
  OpenAPI and reproducible generated-client checks pass.
- Broader regressions: backend **1333 passed**, 45 environment/processor skips.
  Its two uncovered contract declarations are corrected and pass the 10-case
  targeted run above. Web **2750 passed**, two skips and three timing failures
  during high runner load; all **45 cases** in the two affected suites pass
  unchanged in isolation. No assertion or timeout was weakened.
- Browser planner regressions: **38 passed**. Inventory: **100 specs**; actual
  Playwright collection: **1122 tests**. The shared app-route changes deliberately
  retain conservative full-regression selection (73 PR specs + 27 additional specs); this feature adds no always-run
  core entry. The feature-owned spec contributes three journeys.
- npm advisory review has no high/critical findings and no `jose` finding. Six
  existing moderate findings belong to Capacitor CLI development dependencies.

Push verification exercises the real projection/delivery policy with a fake FCM
provider and a registered rich-preview key: one generic reference-only wake,
no excerpt/media/encrypted preview, no email, and no claim on notification tap.
Physical-device FCM receipt is not observed here. No external cryptographic audit,
device verification, forward secrecy or recovery is claimed. These limits and
the trusted key-directory/client assumptions remain explicit in the contract.
