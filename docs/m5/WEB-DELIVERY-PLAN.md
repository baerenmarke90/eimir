# M5 Web Delivery Plan

- **Parent issue:** #295
- **Scope:** Web only (Android is packaged from the Web product via Capacitor since ADR 0011)
- **Gate:** M5/G4 remains dependent on completed M4 and the full cross-platform
  evidence set

M5 productizes the already delivered M0-M4 Core. Per ADR 0006/#433, new
Relationship Depth domains (#429-#432 and later M7 work) are not added to M5
merely because client completion is active. Reusable navigation/settings/client
primitives may be prepared here, but new M7 Domain contracts remain outside the
M5/G4 boundary.

## Delivery sequence

```text
S0A Visual foundation + product entry (#296)
  |
  v
S0B App shell + routing + shared states (#297)
  |
  v
S1 Identity + relationship context (#298)
  |
  +--> S2 Memories + Story (#299)
  +--> S3 Shared planning (#300)
  +--> S4 Private Area (#301)
  +--> S5 Stable M4 Web surfaces (#302)
  |
  v
S6 prerequisite decisions: cache + portability contract (#303)
  |
  +--> Transfer Bundle backend/OpenAPI runtime (#345)
  |
  v
S6 Web runtime: Deep Links + hardened Read Cache + portability UI (#346)
  |
  v
M5 Web evidence -> combined M5/G4 parity and Core Release Candidate evidence
```

S2-S5 may use controlled parallelism only after S0B and the required S1 Space
context are delivered. Two branches must not independently redefine the route
registry, cache key policy, error mapping, generated client, or global tokens.

The Android offline/read-cache product runtime remains separately owned by #328.
It consumes the same M2-D18 decision as Web but may persist current-owner
`OWNER_ONLY` data only under the Android Keystore-backed encryption boundary
frozen by #303.

## Slice contracts

### S0A — Visual foundation and product entry

- semantic tokens and appearance behavior;
- independently authored Web brand primitives;
- responsive setup/sign-in surfaces;
- localized entry copy, keyboard focus, contrast, scaling, and reduced motion;
- no Domain behavior or new dependency.

### S0B — App shell, routing, and shared states

- authenticated route layout and responsive navigation;
- skip link, landmarks, active route, Deep-Link-safe route registry;
- shared loading, empty, error, permission, conflict, rate-limit, and offline
  presentation;
- Error Boundary and stable ProblemDetails mapping;
- no dead/future-contract navigation.

### S1 — Identity and relationship

- real session and authorized Space context;
- supported sign-in/recovery paths, Space, Invitation, Account/Profile,
  PartnerProfile, ProfilePreference, RelatedPerson, and ImportantDate;
- remove the build-time reference Space ID from normal product behavior;
- integrate #65 for explicit RelatedPerson delete policy.

### S2 — Memories and Story

- complete Memory, image Attachment, HeartMoment, Milestone, Comment, and Story
  screens;
- author/capability-aware actions and If-Match conflicts;
- separate owner view for private HeartMoments;
- video remains unavailable while the server rejects it fail-closed.

### S3 — Shared planning

- Wish, Plan, Place, Chapter, typed Relations, shared Collection, and Item UI;
- use server-authoritative transitions and exact-set reorder contracts;
- no Maps, Shopping, provider, or automation scope.

### S4 — Private Area

- PrivateNote, GiftIdea, PrivateCollection, and Item UI;
- owner/Space-bound query keys and complete account/Space cache isolation;
- no partner counts, requests, route state, previews, or error differences that
  disclose owner-only existence.

### S5 — stable M4 client integration

- Search, Dashboard, Activity, in-app Notifications, unread count, mark-one,
  and mark-all using contracts already merged to `main`;
- Thinking-of-you, Push, Reminders, and Rules enter later scoped work only after
  their owning contracts merge;
- no mock DTOs or speculative routes.

### S6 — Read Cache, Deep Links, and portability

S6 is deliberately split at the security/API boundary instead of inventing
runtime semantics inside the Web client.

#### S6 prerequisite decisions — #303

#303 freezes M2-D17 and M2-D18 plus the versioned neutral Transfer Bundle
contract in `S6-CACHE-PORTABILITY-DECISIONS.md`.

The binding decisions include:

- user portability scopes `SHARED` and `PERSONAL` with strict `OWNER_ONLY`
  isolation;
- essential portability as non-paywallable;
- a hard seven-day persistent read-cache maximum age;
- complete cache clearing on logout, Account change, and Space change;
- no Offline Write;
- Web persistent cache limited to explicitly approved `SPACE_SHARED` snapshots;
- no persistent Web `OWNER_ONLY` ProtectedPayload;
- Android owner-only persistence only behind Room plus a Keystore-protected
  encryption key;
- canonical Deep Links that contain identity but no protected presentation data;
- an asynchronous, server-owned Transfer Bundle Export/Import API with 24-hour
  temporary export artifacts and fail-closed archive validation.

#### Transfer Bundle runtime — #345

#345 owns the production FastAPI/PostgreSQL/Job/MediaStore implementation, the
v1 bundle manifest, Export/Import authorization, archive abuse protection,
cleanup, ProblemDetails, OpenAPI snapshot, and regenerated TypeScript
client (Kotlin generation was retired in #1009).

Web must not create a competing archive or transport contract while #345 is
unmerged.

#### Web S6 runtime — #346

#346 owns:

- the canonical/tested Deep Link registry and safe authentication return target;
- invalidation of the provisional S2 IndexedDB schema;
- Account/Space/scope-bound cache v2 with seven-day expiry;
- complete logout/Account/Space clearing and `SHARED -> PRIVATE` eviction;
- cache fallback only for availability failures, never 401/403/404/409;
- localized cache age/read-only UX and no offline mutation queue;
- generated-client Export/Import UI after #345 is on `main`;
- focused i18n, Accessibility, Privacy, routing, cache, and browser evidence.

## Reuse-before-build decision

Selected foundations:

- React composition and semantic HTML;
- React Router declarative routes and `NavLink` active/`aria-current` behavior;
- TanStack Query for server state with Account+Space+resource query keys;
- i18next/react-i18next for all product copy and pluralization;
- generated OpenAPI clients as the DTO/transport authority;
- CSS custom properties and the existing theme bootstrap for semantic tokens;
- the current Vitest/static rendering strategy for S0A, and #192 for the single
  Browser E2E/accessibility strategy;
- IndexedDB for the bounded Web read cache under the M2-D18 policy;
- existing PostgreSQL Job/Worker and private MediaStore infrastructure for the
  server-owned Transfer Bundle runtime.

Alternatives considered for S0A included a new component system, CSS utility
framework, icon package, form framework, web-font delivery, and a second browser
test harness. They are not selected: S0A has a bounded surface, the existing
stack already provides the required behavior, and new dependencies would add
bundle, license, CSP, privacy, maintenance, or competing-test-architecture cost
without solving a current gap. Later complex primitives such as dialogs may
receive a separate reuse decision when their requirements are concrete.

For S6, a second Web persistence framework, client-side application ZIP
implementation, custom offline-write/sync engine, separate router, public object
export link, direct predecessor database importer, and portability SaaS are
explicitly rejected. Any later dependency still requires the repository's
current Reuse/License/Privacy/Cloud/Self-Hosted/Cost/Fallback review.

## Business and freemium result

- official Web access and standard Light/Dark/System appearance: Free/Core;
- Accessibility, localization, account security, Privacy enforcement, cache
  isolation, and essential data portability: non-paywallable;
- basic offline read access to supported Core cached data: Free/Core;
- implemented M1-M3 capabilities: retain their authoritative Free/Core or
  documented Mixed baseline;
- no M5 slice may add ad-hoc Premium flags or infer entitlement in the client;
- **M6/#262 is the entitlement runtime boundary** under ADR 0006; M5 consumes no
  speculative Entitlement contract.

## Cross-cutting acceptance for every production screen

- localized default, loading, content, first-use empty, filtered empty,
  validation, 401, Privacy-safe 404, 409, 429, 5xx, and relevant offline states;
- semantic headings/landmarks, visible focus, 44 px targets, keyboard operation,
  200% scaling, reduced motion, and screen-reader names/status;
- authorization-first requests and query keys that contain Account and Space
  context where data isolation requires it;
- no ProtectedPayload, token, filename, private title, or sensitive content in
  logs, analytics, route metadata, or generic errors;
- generated client and API contract remain synchronized;
- representative performance, responsive, long-text, negative/privacy, and
  retry/conflict tests;
- complete Business/Freemium, Reuse, and Cross-Cutting Quality review in the
  owning pull request.
