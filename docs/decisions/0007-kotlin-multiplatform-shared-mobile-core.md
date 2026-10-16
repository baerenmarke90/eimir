# ADR 0007: Kotlin Multiplatform for a shared non-visual mobile core

- **Status:** Superseded by [ADR 0011](0011-web-first-pwa-capacitor-mobile-delivery.md)
- **Date:** 2026-09-03
- **Parent:** #621, IOS-0
- **Scope:** Android/iOS architecture only; no iOS product UI is implemented by this ADR
- **Decision type:** Mobile architecture / OpenAPI / privacy boundary

> **Superseded — not an active roadmap.** ADR 0011 (#1005) replaced this
> decision: the React/Vite Web application is the single product UI, and Android
> (and later iOS) ship it through Capacitor. The Kotlin/Jetpack Compose client,
> the Kotlin Multiplatform shared core and the SwiftUI plan described below were
> never delivered as a product; the Compose client was removed in #1009 and
> `android/` now holds only the Capacitor wrapper. The KMP issues #626-#630 are
> closed as superseded. The text below is kept unchanged as historical context
> for why that direction was considered; do not implement from it.

## Context

eimir. has a native Android application and plans a native iOS application. The
product decision in #621 is **semantic parity, not pixel-identical platforms**:
Android remains Jetpack Compose and iOS will use SwiftUI. The open architectural
question is whether non-visual mobile logic should be shared with Kotlin
Multiplatform (KMP), and if so where the boundary belongs.

This ADR is based on the current repository state, not on the historical starting
point of M5.

### Current Android shape

The Android Gradle root currently contains a single application module:

```text
android/
  settings.gradle.kts       -> :app only
  app/
  api/generated/            -> generated Kotlin OpenAPI models
```

The application itself has already grown into feature packages. Its central state
and orchestration are still concentrated in `ReferenceViewModel`, while transport is
behind `ReferenceContract` and implemented by `OkHttpReferenceApi`.

Current important seams are:

- `ReferenceContract` is the broad API abstraction consumed by application logic;
- `OkHttpReferenceApi` is the Android/JVM HTTP implementation;
- generated API models live under `android/api/generated` and are compiled as a
  generated source tree;
- `ReferenceViewModel` owns the authenticated `SessionView`, active Space, session
  epoch/invalidation, page cursors and large parts of feature orchestration;
- `SpacePreferenceStore` already expresses Space selection behind a small interface,
  although its current production/default implementation is in-memory;
- `ProductReadCache` owns the M2-D18 cache policy but is implemented directly around
  Room DAOs and Android Keystore-backed encryption;
- Compose, Android resources, Navigation, Photo Picker/media I/O and lifecycle state
  are Android application concerns.

There is currently no WorkManager-based product flow in the Android runtime and no
Android push-provider implementation in the inspected source. In-app notifications
already exist as API-backed product state. Deep-link target semantics exist in the
route model, while OS-level link handling remains a platform concern.

### Current OpenAPI Kotlin output is not commonMain-compatible

The generated model layer is a strong candidate for sharing because it is already the
authoritative DTO source for Android. However, it cannot simply be moved to
`commonMain` today.

`tools/openapi/kotlin-models.yaml` deliberately targets the JVM-oriented
`jvm-retrofit2` generator library, even though only models are generated. The output
contains JVM types such as:

- `java.util.UUID`;
- `java.time.LocalDate`;
- `java.time.OffsetDateTime`.

For example, `AccountMembershipView.spaceId` is a `java.util.UUID`, and many models
carry `java.time` values. Kotlin/Native/iOS cannot compile those JVM classes in
`commonMain`.

Therefore the first KMP implementation slice must solve the generated type contract.
Moving the current tree first and repairing compiler failures afterward is explicitly
rejected.

### Authentication is partly portable and partly platform-native

The REST contract contains session, magic-link, passkey and OIDC-related server
operations. Android currently has generated passkey request models and serialization
coverage, but the inspected Android main source does not yet contain a platform
Credential Manager passkey ceremony or an OIDC browser/session implementation.

This makes the boundary clear:

- backend request/response models, session state and post-authentication rules can be
  shared;
- WebAuthn/passkey UI, browser-based OIDC, redirect capture and secure credential
  storage remain platform implementations.

### Cache policy and cache technology are different concerns

The current Android read cache combines two layers that should be separated before
sharing:

**Portable policy**

- Account + Space namespace;
- Owner in the key for `OWNER_ONLY` material;
- seven-day maximum age;
- fallback only for server/transport availability failures;
- never hide 401, 403, privacy-safe 404 or 409 with stale data;
- clear on account/Space changes and logout;
- no offline write queue;
- fail closed when protected persistence is unavailable.

**Android implementation**

- Room database/DAOs;
- Android Keystore AES/GCM key boundary;
- Android/JVM clocks and UUIDs.

The policy is valuable to share. The storage and key-management implementation is
not.

## Decision

**Adopt Kotlin Multiplatform for a shared, non-visual mobile core.**

Do not use Compose Multiplatform and do not rewrite the Android application. Native UI
and native platform integrations remain authoritative on each platform:

- Android -> Kotlin + Jetpack Compose;
- iOS -> Swift + SwiftUI;
- shared mobile core -> Kotlin Multiplatform where behavior is genuinely
  platform-neutral.

KMP is selected because eimir. already has substantial Kotlin domain/client logic,
a generated Kotlin contract and explicit repository/state seams. Sharing those pieces
avoids re-implementing security-sensitive rules independently in Swift while still
letting the iOS application behave like an iOS application.

KMP is **not** selected as a reason to maximize shared code percentage. A smaller,
well-tested core is preferred to platform abstractions that obscure native behavior.

## Reuse-before-build decisions

### Keep the existing Android Gradle root

Do not move the Android application into a new repository-wide Gradle hierarchy merely
to make the folder names symmetric.

The first KMP module should be added as:

```text
android/
  settings.gradle.kts
  app/                         # existing Android application
  shared/                      # new :shared KMP module
    src/
      commonMain/
      commonTest/
      androidMain/
      androidUnitTest/
      iosMain/
      iosTest/
ios/                           # future native Xcode/SwiftUI application
```

`android/shared` is a repository-layout compromise, not an Android-only module. It
keeps the existing Gradle root and CI/wrapper intact, avoids a mass path move and can
still produce an iOS framework/XCFramework. A future cosmetic repository move is not
part of IOS-0.

### Do not introduce Ktor merely to make networking shareable

The Android application already has a working OkHttp transport. Replacing it with Ktor
before an iOS client exists would be a dependency and runtime migration without a
closed product gap.

Initial KMP extraction therefore defines portable API/repository contracts and keeps:

- Android transport -> existing OkHttp adapter in `androidMain`/Android application;
- iOS transport -> a native Foundation/URLSession adapter when the iOS vertical slice
  is implemented.

Ktor may be reconsidered later only if duplicated transport behavior becomes larger
than the adapter cost. It is not a prerequisite for KMP.

### Do not share a database in IOS-0

Room + Android Keystore is already correct for Android. Replacing it with SQLDelight,
a cross-platform database or a new crypto layer would turn a mobile-core extraction
into a persistence migration.

Share cache policy and storage interfaces first. Android keeps Room/Keystore. The iOS
implementation must use an Apple-appropriate secure storage/data-at-rest boundary and
prove the same M2-D18 behavior before owner-only persistence is enabled.

## Target module boundary

### commonMain

The following belong in `commonMain` after their JVM dependencies are removed:

1. **KMP-compatible generated OpenAPI transport models**
   - generated from the same `backend/openapi.json`;
   - never hand-edited;
   - no `java.*`, Android or Foundation types;
   - deterministic serialization parity with the current contract.

2. **Portable identifiers/time representation and mapping**
   - one explicit mapping policy for OpenAPI `uuid`, `date` and `date-time`;
   - no implicit platform-default parsing;
   - wire format remains exactly the REST/OpenAPI format.

3. **Session state machine**
   - signed out / authenticating / authenticated / awaiting Space / active Space;
   - token expiry/refresh decision logic when introduced;
   - session epoch/generation invalidation rules;
   - logout/account-switch effects expressed as platform-neutral commands.

4. **Space context policy**
   - active-membership selection;
   - remembered-Space decision policy;
   - account/Space switch invalidation;
   - no hard-coded/build-time Space identity.

5. **Repository/use-case orchestration**
   - API contracts expressed in portable types;
   - feature repositories as they are migrated;
   - pagination/cursor rules;
   - If-Match/conflict orchestration where it is not UI-specific.

6. **Portable error classification**
   - HTTP status + `ProblemDetails.code` -> platform-neutral problem kind;
   - privacy-safe 403/404 equivalence where required;
   - no localized UI string/resource IDs in the shared layer.

7. **Cache policy**
   - namespace/key composition rules;
   - freshness/retention;
   - fallback eligibility;
   - account/Space/owner isolation;
   - invalidation commands;
   - no-offline-write rule.

8. **Pure validation and state machines**
   - validation that is already a product rule rather than a screen concern;
   - server-authoritative entitlement/feature-state interpretation where a shared
     contract exists;
   - no client-side reimplementation of backend authorization.

### androidMain / Android application

These stay Android-specific:

- `OkHttpClient`, request bodies, Android connectivity callbacks;
- Room database, DAOs and migrations;
- Android Keystore cipher/key lifecycle;
- Credential Manager/passkey platform ceremony;
- OIDC browser/custom-tab/redirect integration;
- Activity lifecycle and process-death restoration;
- Compose, Android resources, Material adapters and navigation controller;
- Android Photo Picker, `ContentResolver`, URI access and media bytes;
- Android notification channel/provider implementation;
- Android App Links/deep-link dispatch;
- WorkManager if/when background jobs are added;
- Play distribution/signing and Android-specific release identity.

The shared layer may emit commands or parse portable payloads for these concerns, but
it must not hide the platform APIs behind an artificial lowest-common-denominator UI
or lifecycle abstraction.

### iosMain / native iOS host

`iosMain` or thin Swift adapters will eventually own:

- Foundation/URLSession transport;
- Keychain and Apple data-at-rest key handling;
- `ASAuthorizationController`/AuthenticationServices passkeys;
- `ASWebAuthenticationSession`/native OIDC redirect handling;
- PhotosUI/media access;
- APNs/UserNotifications integration;
- Universal Links and URL routing into the shared target model;
- BGTaskScheduler/background execution if a real product requirement exists;
- iOS lifecycle/connectivity adapters;
- platform conversion at the Swift/Kotlin boundary where required.

The iOS **UI itself is not `iosMain` Kotlin**. It is the future SwiftUI application
under `ios/`.

## OpenAPI/code-generation plan

### Phase 1: parallel KMP-safe model target

Do not break the current Android generator as the first move. Add a second deterministic
generator target for `:shared` and keep both generated from `backend/openapi.json`
while the Android app still consumes its existing model tree.

The KMP generator acceptance test is simple and fail-closed:

- generated sources compile for JVM/Android and iOS simulator targets;
- generated sources contain no imports/usages of `java.*`, `android.*` or Apple
  platform types in `commonMain`;
- UUID/date/date-time round-trip tests use representative contract values;
- discriminated unions/oneOf wrappers and passkey free-form `JsonElement` still
  compile and serialize;
- generated model names and JSON field names stay contract-equivalent;
- regeneration is deterministic and CI fails on drift.

The implementation spike must evaluate the generator's supported mappings and choose
one portable representation for:

| OpenAPI format | Current Android output | KMP requirement |
|---|---|---|
| `uuid` | `java.util.UUID` | portable type or explicitly validated wire string |
| `date` | `java.time.LocalDate` | portable date type or explicitly validated wire string |
| `date-time` | `java.time.OffsetDateTime` | portable instant/date-time type with exact wire serialization |
| free-form object | `JsonElement` | keep `kotlinx.serialization.json.JsonElement` |

Preferred implementation order is: use supported Kotlin/Kotlinx portable types when
the generator and Swift interop are deterministic; otherwise keep the generated wire
value as a string and map it into a shared typed domain wrapper. Do **not** add a
hand-written DTO shadow model merely to make KMP compile.

### Phase 2: Android consumes the shared generated models

Only after the KMP generated tree is proven on both targets should Android switch from
`android/api/generated` to the shared model source. Remove the old generated tree in
the same slice so two Kotlin DTO authorities do not survive the migration.

### Phase 3: optional service/client generation

Continue models-only generation initially. A generated runtime client is not required
to prove KMP and would prematurely choose a cross-platform HTTP stack. Revisit service
code generation after both native transport adapters have real duplication to remove.

## Migration sequence

### IOS-0A - KMP build and contract portability

No product behavior change.

- add `:shared` KMP module;
- configure Android + `iosArm64` + `iosSimulatorArm64` targets;
- add KMP-safe OpenAPI model generation;
- prove UUID/date/date-time/passkey/union serialization;
- add Linux/Android and macOS/iOS compile gates;
- retain current Android app/model consumption until the new output is proven.

### IOS-0B - Shared session and Space primitives

- extract platform-neutral session state and session-generation rules;
- extract active Space selection/invalidation policy;
- extract portable error classification;
- keep token persistence absent until secure platform adapters exist;
- adapt Android `ReferenceViewModel` to consume the shared primitives without changing
  screens.

This slice should reduce `ReferenceViewModel` responsibility rather than moving the
whole class into KMP.

### IOS-0C - Shared repository boundary and first read-only vertical slice

- define shared transport/repository interface;
- Android adapter reuses `OkHttpReferenceApi`/OkHttp behavior;
- extract one low-risk, read-oriented path first (instance/session context plus a
  simple authenticated read);
- prove cancellation, error mapping, pagination and serialization on both targets;
- expand repositories feature-by-feature only after the seam is stable.

### IOS-0D - Shared cache policy, platform persistence adapters

- move freshness, fallback, namespace and invalidation decisions to common code;
- Android keeps Room + Keystore;
- add storage/cipher interfaces rather than a common database;
- prove OWNER_ONLY isolation and fail-closed behavior with platform-specific tests;
- do not enable persistent OWNER_ONLY data on iOS until its secure storage tests pass.

### IOS-0E - Auth/session platform adapters

- shared core owns session transitions and REST requests;
- Android/iOS own passkey and OIDC ceremonies;
- secure token storage is platform-specific;
- platform result is handed back to common code as a bounded credential/session result;
- no WebAuthn credential JSON, token or ProtectedPayload is logged.

### IOS-1 - Native iOS bootstrap and minimal vertical flow

This is deliberately **after** IOS-0 and is not implemented by this ADR.

- create SwiftUI host application;
- consume the shared framework;
- implement native platform adapters;
- demonstrate authentication/session context and one server-authorized read;
- no attempt to port Compose UI or copy Android navigation pixel-for-pixel.

### Later domain migration

Move feature repositories/use cases incrementally. Each slice must leave the Android
application releasable. There is no big-bang conversion milestone.

## State-management boundary

`ReferenceViewModel` currently mixes at least four categories:

1. platform lifecycle/ViewModel concerns;
2. shared session/Space state;
3. domain orchestration and pagination;
4. presentation-specific `UiMessage`, resource IDs and screen state.

The migration must split these categories instead of exporting `ReferenceViewModel`
as the KMP API.

Target shape:

```text
SwiftUI / Compose
      |
platform presentation adapter
      |
shared use cases / state machines
      |
shared repository contracts
      |
platform transport + storage adapters
      |
eimir. REST/OpenAPI
```

Shared state must use semantic states/events, not Android resource IDs, `ViewModel`,
`LiveData`, Compose types or SwiftUI types.

## Authentication and token rules

- tokens are never placed in generated logs, crash metadata or saved UI state;
- secure persistence is not introduced by the KMP extraction itself;
- Android may continue current in-memory session behavior until a separately reviewed
  secure persistence slice exists;
- iOS uses Keychain when persistent credentials become a requirement;
- passkey private keys always remain owned by the OS/authenticator;
- OIDC browser state/PKCE/verifier material is platform-private and short-lived;
- switching account or Space invalidates all bound in-flight work and cache context;
- the backend remains authorization authority. Shared code must not infer permission
  from UI state or entitlement presentation.

## Media boundary

Do not move Photos/URI/file access into common code. Share only server-side media
contracts and portable upload/read orchestration:

- request upload descriptor;
- distinguish eimir. authenticated STREAM from external signed upload;
- never forward bearer tokens to signed storage URLs;
- finalize and poll attachment state;
- request/read server-authorized descriptor.

Android and iOS supply bytes/streams through native picker and file APIs.

## Notifications and deep links

Share only logical target semantics that are already platform-neutral, such as target
kind + target ID and route/domain identifiers.

Keep platform dispatch native:

- Android App Links/intent/NavController;
- iOS Universal Links/URL handling/NavigationStack;
- Android push provider/NotificationManager;
- APNs/UserNotifications.

Notification content remains server-authorized. A push payload must never become a
shortcut around the normal API/privacy checks.

## Background work

There is no benefit in inventing a KMP scheduler abstraction before a product
requirement exists.

If Android later uses WorkManager and iOS uses BGTaskScheduler, share the idempotent
operation/use-case they invoke, not scheduler semantics. Each platform decides when it
is permitted to execute background work.

## Test strategy

### commonTest

Required for every shared slice:

- session-state transitions and cancellation/invalidation;
- Account/Space/owner cache-key isolation;
- cache retention and availability-only fallback;
- 401/403/404/409 negative cases;
- pagination/cursor behavior;
- ProblemDetails classification;
- UUID/date/date-time and generated-model serialization;
- passkey free-form JSON round-trip;
- representative oneOf/discriminator models;
- no platform type leakage in generated sources.

### Android

Keep the existing Android unit/integration/Compose tests. Add adapter tests that prove
shared behavior is wired to the same OkHttp, Room and Keystore implementations. Do not
replace Android privacy tests with common tests; both layers matter.

### iOS

On macOS CI:

- compile/link the KMP framework for `iosSimulatorArm64` and `iosArm64`;
- run KMP iOS tests;
- once the Swift host exists, compile Swift against the exported framework;
- add native tests for Keychain, AuthenticationServices/redirect handling, Universal
  Links and persistence boundaries as those adapters arrive.

### Cross-platform contract parity

For selected wire fixtures, assert that Android/KMP encode and decode the same JSON
shape expected by `backend/openapi.json`. The contract is the authority; neither
platform owns a competing DTO definition.

## CI requirements

### Linux/hosted runner

On changes to OpenAPI, shared code or Android integration:

- OpenAPI contract write/check;
- deterministic KMP model generation and drift check;
- `commonTest`;
- Android/JVM shared compilation/tests;
- existing Android gates;
- dependency verification remains strict.

### macOS runner

On changes to `android/shared/**`, KMP generator configuration or future `ios/**`:

- `iosSimulatorArm64` compile/link;
- `iosArm64` compile/link;
- iOS KMP tests;
- future Swift host build/test.

A Linux-only green build is not enough to claim `commonMain` compatibility.

## Privacy and security acceptance

A KMP extraction is rejected if it weakens any existing boundary.

Specifically:

- `OWNER_ONLY` cache keys remain Account + Space + Owner + kind + resource;
- no ProtectedPayload is added to generic logs, analytics, saved UI state or push
  metadata;
- 403/404 behavior remains privacy-safe;
- cache fallback never masks auth/permission/conflict failures;
- session/Space switches cancel or invalidate stale work;
- bearer tokens never reach signed third-party/object-storage requests;
- platform secure storage may fail closed to memory-only/no-cache behavior;
- Self-Hosted does not gain an external SaaS dependency merely because iOS exists.

## Risks and mitigations

### Generated type portability

**Risk:** JVM UUID/date types currently prevent KMP compilation.

**Mitigation:** IOS-0A is a dedicated codegen portability gate before any model move.

### Swift interop quality

**Risk:** generated enums, sealed/oneOf wrappers, coroutines/Flow and exceptions can be
awkward from Swift.

**Mitigation:** expose a deliberately small shared facade; add Swift compile tests;
do not export raw implementation graphs merely because Kotlin can.

### Android regression from extraction

**Risk:** moving logic can alter mature Android behavior while adding no Android
feature.

**Mitigation:** adapter-first migration, one slice at a time, existing Android tests
remain authoritative, no screen rewrite.

### Shared-core overreach

**Risk:** pressure to maximize shared code leads to abstractions over Photos, push,
navigation, secure storage or lifecycle.

**Mitigation:** the platform boundary in this ADR is normative; exceptions require a
new ADR/reuse review.

### Cache/privacy divergence

**Risk:** iOS implements a superficially similar but weaker owner-only cache.

**Mitigation:** common policy tests plus platform-specific encryption/persistence
tests; persistent owner-only cache remains disabled until proven.

### CI cost

**Risk:** macOS/iOS builds are slower and scarcer than Linux builds.

**Mitigation:** path-filter relevant KMP/iOS jobs, but require macOS before merging a
change that claims iOS/common compatibility.

### Binary/API compatibility

**Risk:** Swift-facing KMP APIs become difficult to change after the iOS app depends on
them.

**Mitigation:** keep the initial exported facade narrow and internalize implementation
types; version the shared facade deliberately once iOS moves beyond the first slice.

## Consequences

### Positive

- Android is not rewritten.
- iOS gets native SwiftUI UX.
- security/privacy-sensitive session, Space, repository and cache rules can be tested
  once and reused.
- OpenAPI remains the single wire-contract source.
- platform integrations stay understandable and native.
- the migration is reversible slice-by-slice until iOS begins consuming the shared
  facade.

### Costs

- a second compilation target and macOS CI are required;
- OpenAPI Kotlin codegen needs a real portability solution before model sharing;
- Swift/Kotlin interop requires deliberate API design;
- some logic will correctly remain duplicated at platform-adapter level.

## Explicit non-goals

- no Compose Multiplatform UI;
- no Flutter/React Native/WebView rewrite;
- no Android screen redesign in IOS-0;
- no SwiftUI implementation in this ADR;
- no Ktor migration in IOS-0;
- no shared database migration in IOS-0;
- no new background scheduler abstraction;
- no client-side authorization or entitlement authority;
- no replacement of `backend/openapi.json` as contract authority.

## Acceptance criteria for IOS-0 architecture

- [x] KMP is accepted only for non-visual shared core.
- [x] Native Compose/SwiftUI boundary is explicit.
- [x] Current single-module Android shape and extraction seam are documented.
- [x] OpenAPI JVM portability blockers are identified before implementation.
- [x] `commonMain`, `androidMain` and `iosMain` responsibilities are explicit.
- [x] Session/Auth/OIDC/Passkey boundaries are explicit.
- [x] Space context, cache, networking, media, notifications, deep links and
  background-work boundaries are explicit.
- [x] Migration is incremental and keeps Android releasable.
- [x] Test and CI requirements include a real Apple target.
- [x] Privacy/OWNER_ONLY/ProtectedPayload invariants are preserved.
- [x] Follow-up slices are small enough to become focused issues.

## Follow-up issue structure

Use #621 as the parent visual/platform epic. Do not create a second iOS architecture
epic. Focused implementation issues should follow this ADR:

1. **IOS-0A:** KMP module + KMP-safe OpenAPI generated models + Apple compile gate.
2. **IOS-0B:** shared session/Space/error primitives consumed by Android.
3. **IOS-0C:** shared repository boundary + first read-only vertical slice.
4. **IOS-0D:** common cache policy + platform persistence interfaces.
5. **IOS-0E:** native passkey/OIDC/secure-session adapters around shared auth state.
6. **IOS-1:** native SwiftUI host + one authenticated read vertical slice, only after
   the design/reference-surface work in #621 is ready.

Each implementation issue must perform its own reuse/dependency review and must not
silently expand into UI redesign.
