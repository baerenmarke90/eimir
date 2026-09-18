# Decision 0011: Web-first PWA and Capacitor mobile delivery

**Status:** Accepted  
**Date:** September 17, 2026  
**Owning issue:** #1005  
**Supersedes:** ADR 0007 (`0007-kotlin-multiplatform-shared-mobile-core.md`) as the target Android/iOS architecture  
**Narrows:** ADR 0004 (`0004-android-uses-bottom-navigation-at-every-size.md`) to the legacy native Android client while it remains in maintenance  
**Preserves:** backend/OpenAPI authority, privacy/security contracts, product routes and the current Product Reference

## Context

eimir. is now developed and accepted Web-first. Mobile Web is the normative product reference, and the React/Vite application increasingly implements the consumer-mobile interaction model directly: content-first composition, compact contextual controls, touch-first behavior and responsive navigation.

The repository also contains a native Android client implemented in Kotlin/Jetpack Compose. Earlier architecture work planned a second native UI in SwiftUI and a Kotlin Multiplatform shared non-visual core. That approach would require eimir. to maintain three product UI implementations -- Web, Android and iOS -- and to repeat feature implementation, product acceptance, visual calibration and regression work across them.

The native Android client has already demonstrated that this parity cost is material. Android has therefore been removed from ordinary feature-parity scope: Web/backend work is not blocked by a missing Compose implementation, and Android is touched only for critical defects, security, required build/release compatibility or deliberate migration work.

At the same time, eimir. benefits from App Store / Google Play distribution and selected native capabilities such as push notifications, photo access, deep links and sharing. The architecture therefore needs store-grade mobile delivery without reintroducing a second and third product UI stack.

## Decision

### One canonical product UI

The React/Vite Web application is the **single canonical product UI implementation** for:

- Desktop Web,
- Mobile Web,
- installed PWA,
- Android store delivery,
- iOS store delivery.

Mobile Web remains the normative Product Owner reference for hierarchy, interaction model, content priority and responsive behavior. Platform containers may adapt system integration, insets, keyboards and operating-system affordances, but they do not independently redesign or reimplement normal product screens.

Target delivery shape:

```text
React / Vite eimir. UI
        |
        +--> Browser / Desktop Web
        |
        +--> Mobile Web / PWA
        |
        +--> Capacitor
              |--> Android / Google Play
              `--> iOS / App Store
```

### Product development and mobile distribution are separate tracks

PWA and Capacitor are a **delivery/distribution track**, not a prerequisite for the product roadmap.

New product functionality continues to be designed, implemented and accepted Web-first against the shared React UI and backend contracts before, during and after the PWA/Capacitor work. A feature must not be deferred merely because the store clients do not exist yet, and completion of #1005 is not a gate for ordinary Web/backend feature delivery.

The intended relationship is:

```text
Product track
  current product/design consolidation
  -> normal Web-first feature development
  -> continued feature development

Distribution track
  sufficient UI/product stability
  -> PWA foundation
  -> Capacitor foundation
  -> Android/iOS store delivery
  -> native capability adapters
```

The distribution track may begin once the shared UI is stable enough that packaging work is not repeatedly invalidated by foundational redesign. It does **not** require all future product features or milestones to be complete first.

Once Capacitor is established, ordinary features implemented in the canonical React UI are expected to become available on Web, PWA, Android and iOS without separate screen implementations. A feature may add platform-specific work only when it genuinely depends on a native capability such as push, photos, deep links, sharing or an authentication bridge.

### PWA first

Before store packaging, the Web application is completed as a robust installable PWA foundation. This includes, where appropriate for the product contract:

- Web App Manifest and install metadata,
- complete icons and theme/display metadata,
- standalone/safe-area behavior,
- a deliberate service-worker/update strategy,
- app-shell/offline/failure behavior,
- installability on supported mobile browsers,
- preservation of normal browser operation.

PWA support does **not** imply broad offline write synchronization. Server authority, privacy boundaries, cache rules and conflict handling remain unchanged unless separately approved.

### Capacitor is the Android/iOS delivery layer

Android and iOS store packages use Capacitor around the built React/Vite application. The product bundle is shipped as part of the application package rather than treating the native app as a trivial launcher for a remote public website.

Capacitor is a delivery and native-capability boundary, not a second presentation architecture.

Normal eimir. screens remain React components. Kotlin/Compose or Swift/SwiftUI are introduced only for narrow platform integration where a Web implementation is insufficient or materially worse.

### Native capability boundary

Native/platform-specific code is appropriate for capabilities such as:

- push notifications and notification routing,
- camera and photo-picker integration,
- share sheet / share target where supported,
- Android App Links and iOS Universal Links,
- native authentication/passkey bridges when required,
- haptics used as meaningful product feedback,
- application lifecycle and connectivity integration,
- status bar, safe-area, keyboard, splash/icon and store integration,
- narrowly scoped background/platform services when a real product requirement exists.

Native code must stay thin and platform-focused. Business rules, authorization, feature semantics and ordinary product composition stay in the shared Web/backend contracts.

### Existing native Android client becomes a legacy maintenance client

The current Kotlin/Jetpack Compose application is **not** the future feature-delivery target.

Until the Capacitor replacement passes explicit Product Owner acceptance:

- it remains in the repository,
- it receives no ordinary feature-parity work,
- missing Compose parity does not block Web/backend acceptance,
- it may receive critical bug, security, build/release compatibility and migration fixes,
- existing contracts should not be intentionally broken when avoidable.

Removal or archival of the native Android client requires a separate explicit decision after replacement acceptance.

ADR 0004 continues to describe the navigation behavior of that legacy Compose client while it exists. It no longer defines the target Android presentation architecture.

### Previous KMP / SwiftUI target is superseded

ADR 0007's target architecture -- Jetpack Compose on Android, SwiftUI on iOS and a Kotlin Multiplatform shared mobile core -- is superseded by this decision.

Do not start or resume KMP extraction, a native SwiftUI product UI or Android feature-parity work on the basis of ADR 0007. Historical analysis in that ADR remains useful context for security, API and platform boundaries, but it is not an active delivery plan.

## Security and privacy boundary

Moving to a shared Web UI does not weaken existing security or privacy requirements.

- The backend remains the authorization authority.
- Client UI state never grants access that the server has not authorized.
- `OWNER_ONLY` and other privacy scopes retain their existing semantics.
- Native bridges expose the minimum required capability and data surface.
- Tokens, passkey material and sensitive payloads must not be logged or leaked across the Web/native bridge.
- External navigation and deep-link handling must be allowlisted and validated.
- Service-worker/cache behavior must respect existing privacy and retention contracts.
- A PWA or Capacitor layer must not silently create a new offline write queue.
- Platform credential/storage choices require focused review when persistent credentials are introduced.

## Store-quality requirement

The store packages must provide a credible mobile application experience rather than a low-value remote-site wrapper.

At minimum, the release plan must demonstrate meaningful platform integration appropriate to eimir., expected to include push notifications, media/photo integration and deep links, with sharing where supported and product-useful.

The shared UI must also behave correctly as an installed application with:

- safe areas and display cutouts,
- system keyboard handling,
- Android back behavior / iOS navigation expectations where relevant,
- external link handling,
- lifecycle/resume behavior,
- update/reload behavior that protects in-progress user work,
- accessibility and reduced-motion support.

## Migration sequence

### 1. PWA foundation

Complete installability, app-shell/update behavior and mobile installed-mode QA in the existing Web client.

### 2. Capacitor foundation

Add Android and iOS wrapper projects around the same production Web bundle. Establish environment configuration, application identity, signing ownership and CI/build boundaries without duplicating screens.

### 3. Native capability adapters

Add platform capabilities incrementally, starting with those needed for a convincing mobile product and store release: push, photo/media access and deep links; then sharing, authentication bridges or haptics where justified.

### 4. Replacement acceptance

The legacy Android feature client remains until the shared client proves the accepted critical journeys on real Android and iOS devices.

Replacement acceptance requires:

- accepted core product journeys on both platforms,
- push/media/deep-link behavior proven on real devices,
- acceptable performance,
- correct safe areas, keyboards and lifecycle behavior,
- accessibility and reduced-motion compliance,
- no material privacy/security regression,
- explicit Product Owner acceptance.

Only then may a separate issue deprecate or remove the old native Android implementation.

## Consequences

### Positive

- Product UI work is implemented and accepted once instead of three times.
- New product features are not blocked by PWA/Capacitor delivery work.
- Mobile Web improvements automatically benefit the store clients unless a platform boundary requires adaptation.
- Android and iOS can still provide native capabilities where users expect them.
- Product/design drift between Web, Android and iOS is structurally reduced.
- The current Product Reference remains the single presentation authority.
- Store delivery no longer requires a native SwiftUI product rewrite or a KMP migration program.

### Costs / trade-offs

- The mobile apps depend on WebView rendering behavior for most UI.
- Native integrations require careful bridge, lifecycle and security design.
- Some highly platform-specific future experience may justify native code, but it must be explicitly scoped rather than becoming an alternative product UI by default.
- PWA/service-worker caching and app updates introduce their own release semantics that need dedicated testing.
- Existing native Android code remains temporarily as maintenance overhead until replacement acceptance.

## Alternatives considered

### Continue Kotlin/Compose + SwiftUI + KMP

Rejected as the target architecture. It preserves maximal native UI control but creates two native presentation implementations in addition to Web and makes feature/design parity an ongoing product cost.

### React Native / Expo

Rejected for the current product. Although React knowledge and some logic could be reused, the existing React DOM UI would still require significant presentation reimplementation, undermining the value of the current Mobile Web reference.

### Flutter

Rejected. It would replace the established React/TypeScript presentation stack and require a broad UI rewrite in Dart.

### Tauri

Not selected. It can wrap Web technology across platforms, but adds a Rust application layer without a current product requirement that justifies that extra stack over Capacitor.

### PWA only

Insufficient as the complete distribution strategy. PWA remains a required foundation, but eimir. also wants conventional App Store / Google Play distribution and dependable native integration for capabilities central to the product.

### Trivial remote WebView wrapper

Rejected. It provides little store-specific value, couples application launch to the remote site and does not establish the intended native capability boundary.

## Follow-up boundary

Implementation work is tracked from #1005. Do not interrupt current product/design consolidation merely to begin packaging. PWA and Capacitor implementation slices should be opened when the active product sequence reaches an appropriate stability boundary.

That boundary does not pause the feature roadmap. New functionality continues Web-first, and the distribution track is introduced alongside normal product development when capacity and UI stability permit.

> **One product UI, multiple delivery surfaces. Native code exists to unlock platform capabilities, not to duplicate the product.**
