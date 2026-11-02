# Implemented Android sign-in links and push setup (#1599 / #1601)

Source head: `147863aebfe138c146d09b1d430625293dc8ec1d`.
Tested PR merge ref: `a66ac1525a85ca2abdc445aabbe0e200dc9139ef`.

These are actual implementation captures from [Browser QA run 41499965253](https://github.com/baerenmarke90/eimir/actions/runs/41499965253), shard 1, artifact 13170611036. That shard completed all 187 tests successfully, including all 11 new post-sign-in notification journeys. The captures were extracted from the workflow artifact and losslessly encoded as WebP; decoded pixels were verified equal to the original PNGs. Original and stored SHA-256 digests are in [captures.json](captures.json).

The browser runs the actual shared product UI and push controller with a bounded Capacitor/native transport test double. It proves authentication gating, explicit consent, one authenticated endpoint POST, no premature success while that POST is held, confirmed completion, denial/settings recovery, Later/reload behavior and ordinary Web exclusion. It is not proof of FCM delivery to a physical phone.

## Reviewed composition and accessibility

The original [generated preflight](../README.md) remains composition guidance; these captures verify the implemented result. Inspect Compact Light/Dark, the shared Expanded dialog and 200% text with keyboard scrolling. All eight visual journeys retain strict Axe assertions, check no horizontal overflow and complete Later -> same destination -> reload -> no repeated prompt. The large-text journey focuses the named reading region and scrolls with End while footer actions remain available.

| State | Light | Dark |
| --- | --- | --- |
| 360 px | [Capture](push-consent-360-light.webp) | [Capture](push-consent-360-dark.webp) |
| 390 px | [Capture](push-consent-390-light.webp) | [Capture](push-consent-390-dark.webp) |
| 430 px | [Capture](push-consent-430-light.webp) | [Capture](push-consent-430-dark.webp) |
| 1280 px | [Capture](push-consent-1280-light.webp) | [Capture](push-consent-1280-dark.webp) |
| 360 px, 200% text, scrolled with End | — | [Capture](push-consent-360-dark-text200.webp) |

## Native and release boundaries

All API 28, 36 and 37.1 runs pass in [Android verification 41499965405](https://github.com/baerenmarke90/eimir/actions/runs/41499965405). This includes actual installed-manifest matching of all five demo identity paths and rejection of foreign/unrelated URLs, plus existing push/session, notification-open, renderer recovery and photo/calendar regression coverage. The API 36 file-through-Web/API/worker pipeline also passes. Exact-source Web Reference Flow passes 2,527 tests, with two existing configured skips; lint, format, typecheck, token/PWA/Capacitor checks, production bundle, unsigned Android release build/SPDX evidence and CodeQL pass.

Installed-manifest matching uses the debug package and is distinct from canonical-signer OS domain verification on a real user's phone. The live demo website already associates the existing canonical package and certificate. No key or association was replaced. A newly built APK is required; an existing test.39 installation does not receive a bundled-code or manifest update merely because the PR merges.
