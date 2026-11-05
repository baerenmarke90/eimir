# Decision 0014: Experimental native Android test client

**Status:** Experimental exception, requested by the Product Owner on October 28, 2026. Not accepted for
product delivery; ADR 0011 remains in force.  
**Date:** October 28, 2026  
**Builds on:** [ADR 0011](0011-web-first-pwa-capacitor-mobile-delivery.md), [ADR 0013](0013-legacy-android-package-migration.md)  
**Implementation:** [`android-native-test/`](../../android-native-test/README.md)

## Context

ADR 0011 makes the React/Vite application the single canonical product UI and retired the earlier
Kotlin/Compose client because of its parity cost. The Product Owner asked for a time-boxed experiment that
answers a different question: how well eimir. works as a genuinely native Android consumer app (navigation,
gestures, media, lifecycle, performance) while keeping the existing design language, functions and backend
architecture. The Capacitor app, its package identities (`de.sidebyside.app`, `de.eimir.app`), its update
channel and its signing must not be affected.

## Decision

1. The experiment lives in a separate Gradle build, `android-native-test/`, with its own package
   `de.eimir.nativetest`, version scheme and dedicated signing key. It never replaces or updates the
   Capacitor app; both install side by side with separate device sessions.
2. The backend stays the single authority. The client consumes only the existing versioned REST API through
   models generated from `backend/openapi.json`; it adds no backend service, endpoint, data store or
   business rule. Authorization, visibility, entitlements and conflict detection remain server-side.
3. Design is derived, not restated: colours, type, spacing, radii and motion are generated from
   `design/tokens.json`; icons are converted from the Web icon grammar; fonts are the repository's OFL files.
4. The build is pinned to the `eimir-test` origin. No release workflow, store listing or Capacitor update
   channel publication is created.
5. The Capacitor app remains the only Android product delivery until the Product Owner explicitly decides
   otherwise in a later ADR.

## Consequences

* Every product change the experiment should reflect must be implemented twice. The parity matrix in
  `android-native-test/docs/PARITY-MATRIX.md` makes the gap explicit instead of hiding it behind placeholders.
* OpenAPI changes require regenerating the native models (`android-native-test/tools/generate-api-models.sh`);
  `ApiContractTest` fails when a bound path, method or mandatory `If-Match` drifts.
* The test instance's App Links verify only `de.sidebyside.app`; native Magic Link delivery therefore relies
  on share/paste/"open by default". Native passkeys would need operator configuration on the test deployment
  (Android WebAuthn origin, Digital Asset Links) and are not part of this decision.
* No push provider is configured for `de.eimir.nativetest`; no Firebase project or app is registered.
* Ordinary Web/backend work is not blocked by the native client and has no native parity obligation.

## Exit criteria

The experiment ends with one of: (a) an explicit Product Owner decision to adopt a native client, which needs
its own ADR covering parity ownership, package identity, signing, store delivery and CI; or (b) removal of
`android-native-test/` with its findings recorded. Until then it is excluded from product acceptance gates.
