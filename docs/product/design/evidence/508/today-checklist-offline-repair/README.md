# Deliberate offline Today checklist — #508

Runtime source: `793cc3b14dae4ca93f9a57c13c6784022557b6fa`, based on
`main@3bac184b8cd1dcf82cbf4831c9845fbf252d3aef` (2026-10-16).
This later evidence commit changes no runtime source.

## Observed behavior

All 26 cases in `today-pinned-collection.spec.ts` pass against the production
preview with one worker and zero retries. The three new journeys cover Compact
390px Light, Expanded 1280px Dark and 320px Dark at 200% root text, reduced
motion, offline activation,
readable error and unchanged checkbox, reconnect with zero writes, canonical
detail read and return, deliberate check/reopen and exact If-Match versions.
Full-page Axe WCAG 2.2 AA and horizontal-overflow checks pass in all three new error
states. Existing cases retain 320px/200% text, 360/390/430 widths, empty/sparse/
dense lists, online rollback/retry, reorder, personal pinning and server-confirmed
celebration. These are synthetic authorized API fixtures in real production Web
UI, not live-backend or native-device acceptance.

Seven component characterizations fail against the original baseline and pass
after repair. They cover both offline signals, queued dispatch after success or
failure, and an offline activation while an online predecessor is held. All 18
component cases preserve online rapid-toggle ordering and confirmed versions.
The complete Web suite passes 1,473 cases (one existing skip); the final focused
suite, production build/TypeScript, scoped lint/format, internal visual-proof
typecheck and both language audits also pass.

## Browser probe corrections

The initial production-browser run exposed two concrete existing problems: the
checkbox error referenced a nonexistent translation key, and `signIn` asserted
only `/today`, which is also the unauthenticated URL. The final correction reuses
the existing localized offline/unknown titles and waits for the real login form
to disappear before navigating. No artificial delay, automatic retry, timeout
increase, forced scroll or relaxed assertion was introduced. The final complete
26-case execution passes directly.

## Captures

Each file is an actual full-page capture from the same passing run. Fixed
navigation and the snackbar remain positioned inside the original viewport;
visible focus/skip controls are real browser states. The unavailable quote is an
existing independent fixture state; this slice does not change quote behavior.

| State | Compact Light | Expanded Dark |
| --- | --- | --- |
| Rejected offline attempt | [390px](today-checklist-offline-390-light.png) | [1280px](today-checklist-offline-1280-dark.png) |
| Deliberate check/reopen confirmed | [390px](today-checklist-confirmed-390-light.png) | [1280px](today-checklist-confirmed-1280-dark.png) |

Large-text captures: [320px offline](today-checklist-offline-320-dark-200pct.png), [320px confirmed](today-checklist-confirmed-320-dark-200pct.png). Their checkbox/error wrapping, actionability and no-overflow assertions are covered; existing header/avatar composition is not accepted anew by this bounded repair.

The [preflight and interaction contract](../../../references/508/today-checklist-offline-repair.md)
preceded runtime implementation. One localization key repairs the missing attempt-failure text; no new composition, token,
provider, entitlement, persistence, API, native capability or operating-model
change. Other write families and broader #508/#946 acceptance remain separate.

## SHA-256

```text
80ed3c495699e975e5f5f6916e915cd334f408c331f54c0fd3f4aa7acd3a3ba3  today-checklist-confirmed-1280-dark.png
7fbbf65ada75055928be143c3f4bc1ec407533daac5dbaaaab95055cb2c36537  today-checklist-confirmed-320-dark-200pct.png
f8f0aa1b3d68af781ec53ec5bddddb3f2dbd7101596059a67f7cb60eae0e3556  today-checklist-confirmed-390-light.png
094ab50fca8b460ddda747bfdef185c4d3f5a4193892fad8fa32d74c374a020d  today-checklist-offline-1280-dark.png
ea4fcde952ca7ae5a3fa2b5e64a333dbc0c33659751d0b45e4d7be6dfb430ac7  today-checklist-offline-320-dark-200pct.png
2d94ecb1c7c42ad41aeffa509dffcf8a14d60dab3559f58bed338eea0b9941d2  today-checklist-offline-390-light.png
```
