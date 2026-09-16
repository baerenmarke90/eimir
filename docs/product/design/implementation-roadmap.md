# Product Reference v1 implementation roadmap

**Status:** Accepted execution sequence; implementation remains tracked by [#955](https://github.com/baerenmarke90/eimir/issues/955).<br/>
**Decision date:** September 15, 2026.

This roadmap executes [Product Reference v1](product-reference-v1.md), the [five reference experiences](reference-screens.md), and [system direction](design-system-direction.md). Those documents define the target; [historical evidence](audits/2026-09-15/evidence-and-decisions.md) explains its origin. A slice below is planned work, not a claim that its behavior already ships.

## Sequence and scope

**F1 → bounded F2 → R1 → R2 → R3 → R4 → R5 → P1 → P2 → P3 → C1.**

This is D8's accepted delivery order. Later preparation may proceed when useful, but must not preempt an earlier slice's product decisions. Native implementation for a reference experience belongs to that experience's acceptance; P3 closes remaining parity gaps rather than postponing every native journey. F2 provides a minimum real-flow proof before R1, and R1 revalidates it in the finished capture composition.

The identity migration #953 is complete. Every implementation starts from fresh `origin/main`, rechecks #955 and its comments, and reconciles open PRs and the relevant audit-remediation owners. Do not repeat completed #951/#952 work or overwrite newer valid decisions. This design sequence complements the [milestone roadmap](../../ROADMAP.md) and [implementation status](../../IMPLEMENTATION-STATUS.md); it does not redefine G5 or waive unresolved privacy, security, lifecycle, or release findings.

Complexities below are relative: **M** = bounded shared change; **L** = a complete journey with several states; **XL** = multiple native journeys and device evidence. They are not delivery estimates.

## Shared entry and acceptance rules

Before UI code, each owning issue records a Product Design Preflight and the [Mobile Interaction Contract](../../PARTNER-APP-EXPERIENCE-STANDARD.md), including its Screen Template, existing components/tokens, focal content, dominant action, Compact/Expanded behavior, state matrix, privacy, motion, and reduced motion. Recheck the [reuse](../../REUSE-BEFORE-BUILD.md), [business model](../../BUSINESS-MODEL.md), [feature matrix](../../FREEMIUM-FEATURE-MATRIX.md), and [cross-cutting quality](../../CROSS-CUTTING-QUALITY.md) requirements before implementation and before merge.

Acceptance records evidence from the actual commit/build:

- Follow **open → interact → save/complete → observe result → return**, with browse-only variants where no write exists; screenshots alone do not establish continuity.
- Demonstrate Compact at approximately 360/390/430 px, 320 px reflow, representative Expanded, Light/Dark, long localized labels, 200% text, keyboard/focus, and reduced motion where relevant.
- Distinguish empty, sparse, dense, loading, no-match, error/retry, offline, pending, uncertain write outcome, and confirmed success. Never promise offline write synchronization or unsupported Undo.
- Verify native System Back, TalkBack, picker interruptions, keyboard/insets, and orientation on a device/emulator for affected native journeys. Record platform evidence and remaining gaps explicitly.
- Keep authorization, existing data, canonical links, compatibility mappings, and valid privacy boundaries intact. Reuse current APIs and media derivatives; a new backend, durable draft store, provider, or tier boundary requires a separate explicit decision.

## F1 — Visual roles / design-system foundations

- **Objective:** Make the minimum visual vocabulary for v1 usable consistently by Web and Android.
- **In-scope outcomes:** Map bare/reading/content/tinted/elevated surfaces, editorial/UI typography, image treatment, radius/border/depth, rhythm/gutters, and restrained motion to existing semantic roles; add only demonstrated gaps. Reconcile token/adapter/prose drift and implement D7 through the token boundary. Document contracts and actual delivery status.
- **Out of scope:** Palette/font replacement, a design-system rewrite, broad selector overrides, screen redesigns, a universal card abstraction, new image processing, or new component dependencies without a current reuse decision.
- **Dependencies:** Committed v1; current baseline and collision review. F2 consumes the resulting visual roles.
- **Reference:** [System direction](design-system-direction.md), visual language and content composition; [Product Reference](product-reference-v1.md), D1/D2/D7 and Design DNA.
- **Likely components/patterns:** `design/tokens.json`, `web/src/theme.css`, existing Web media/text/state components, Android `EimirTheme`, `EimirDimensions`, `EimirTypography`, generated token pipeline, component contracts/manifest. Exact changes follow the live consumer inventory.
- **Acceptance concept:** One bounded internal proof composition demonstrates a photo memory, a text memory, and a compact utility group in both adapters, with a controlled sheet/depth sample. No public product route is required for the proof. Essential contrast pairs, image fallback, no-photo composition, touch targets, Light/Dark and 360/390/430 layouts are evidenced. Any global token effect receives representative regression evidence; evidence fixtures do not count as completed R1–R5.
- **Suggested complexity:** M.

## F2 — Task boundaries / sheets / return model

- **Objective:** Establish the smallest shared interaction contract needed for safe capture and predictable return.
- **In-scope outcomes:** A complete short-sheet contract; deliberate page-versus-sheet boundary; safe dismissal and nested Back; narrow origin/scope restoration; create/read/edit and confirmed-save handoff; explicit dirty/pending/interrupted behavior. Consolidate working mechanics before introducing a new primitive.
- **Out of scope:** All-app UX remediation, a replacement router, universal form engine, new persistence/sync, new domain APIs, migrating every editor/filter, or R1/R2's full composition.
- **Dependencies:** F1; existing lifecycle and audit-safety owners reconciled. R1 and R2 verify the contract again in their complete experiences.
- **Reference:** [Product Reference](product-reference-v1.md), Interaction DNA and input philosophy; [reference experiences](reference-screens.md), R1/R2; [system direction](design-system-direction.md), sheets, state and motion.
- **Likely components/patterns:** `QuickCreateMenu`, `PlanningEditorLifecycle`, `useEditorHistoryEntry`, `RelatedPersonEditorSheet`, `routes.ts`, `routeEntryHandoff.ts`, `MemoryCreatePage`, existing Story URL/query state; Android `AppNavigation`, `QuickCreateFab`, `PlanningSheets`, reference-flow/ViewModel ownership. These are candidates for reuse, not declarations of compliance.
- **Acceptance concept:** Prove one existing Quick Create → Memory create → canonical saved detail → origin journey, plus a scoped Timeline detail/return case. A sheet has visible Close, meaningful initial focus, keyboard containment/inactive background and focus restoration; deliberate navigation hands focus to the destination. Back unwinds the innermost task; dirty/pending/error states retain work and do not create duplicate writes. Return preserves the relevant tab/filter/loaded range/position without persisting sensitive payloads. A direct link has a safe fallback when origin is absent. Only the minimum consumer integration needed to prove this contract belongs here.
- **Suggested complexity:** L.

## R1 — Neuer Moment

The heading preserves the intentional de-DE product label; engineering prose remains English.

- **Objective:** Capture → optionally enrich → done, with one actual saved result.
- **In-scope outcomes:** Photo/text-first capture; optional enrichment; intentional create/edit boundary; fixed shared-audience presentation; upload, draft/interruption, save and result continuity across global/local entry points.
- **Out of scope:** Durable drafts, new media types, new attachment infrastructure, a private Memory mode, or rewriting the Timeline.
- **Dependencies:** F1/F2; current Memory/attachment and mutation contracts.
- **Reference:** [R1 reference experience](reference-screens.md), capture hierarchy, states and continuity; [system direction](design-system-direction.md), input/media/state roles.
- **Likely components/patterns:** `MemoryCreatePage`, `MemoryProductPage`, `AttachmentDraftPicker`, `useAttachmentDrafts`, `memoryAttachmentDraft`, existing detail/gallery/feedback, native reference flow and ViewModel; a small capture/completion composition only if reuse is demonstrated.
- **Acceptance concept:** Image-only, text-only, title-only and mixed input; no mandatory title burden; main content visible before optional detail; no unsolicited keyboard; failed/pending upload retains work; delayed response cannot erase newer input; one confirmed save opens the returned object. Verify cancel, Back, picker interruption and keyboard clearance in the full R1 composition.
- **Suggested complexity:** L.

## R2 — Momente / Timeline

- **Objective:** Browse and rediscover shared history through recognizable content and predictable scope.
- **In-scope outcomes:** Natural photo/text/mixed composition; visible scope and applied filters; coherent Discover/Timeline/year entry; sparse/dense chronology; detail and Search return continuity.
- **Out of scope:** New archive/search backend, private content in shared Story, new media derivatives, or a universal content-card renderer.
- **Dependencies:** F1/F2/R1; current Story pagination, ordering and authorization.
- **Reference:** [R2 reference experience](reference-screens.md), scope/return and chronology; [Product Reference](product-reference-v1.md), D2/D4 and content priority.
- **Likely components/patterns:** `StoryProductPage`, `StoryList`, Story presentation/grouping helpers, filters in the current Story composition, `StoryYearsPage`, existing route/search/cache APIs and native Story equivalents.
- **Acceptance concept:** Media and authored words dominate; text-only/failed-media entries remain complete; active scope remains readable when filters close; peer tabs are operable; no duplicated featured item; years/chapters are discoverable. Back from an older item restores scope, loaded range and position. Shared chronology reveals no private content or private counts.
- **Suggested complexity:** L.

## R3 — Planen

- **Objective:** Put anticipation of the next shared experience before administration.
- **In-scope outcomes:** Upcoming focal intention and compact supporting plans/wishes; local creation; read-first detail; contextual schedule/edit/complete; optional canonical Memory continuation.
- **Out of scope:** Project-management boards, unsupported Plan photos/reminder features, new lifecycle states, or reopening the accepted #952 schedule semantics.
- **Dependencies:** F1/F2/R1/R2 in the delivery sequence; current Wish/Plan contracts and #952 baseline.
- **Reference:** [R3 reference experience](reference-screens.md), anticipation and operational disclosure; [Product Reference](product-reference-v1.md), D5.
- **Likely components/patterns:** `SharedPlanningOverviewPage`, `PlanProductPage`, `WishProductPage`, current schedule fields/sheets, `PlanStoryContinuation`, canonical create handoff and native planning components.
- **Acceptance concept:** One clear upcoming experience leads; local create is reachable without traversing a long list; Wish return retains Wish context; date-only/range/cross-day behavior remains truthful. Completing without a Memory remains valid, and failure of a later Memory save does not undo or misrepresent confirmed Plan completion.
- **Suggested complexity:** L.

## R4 — Wir / Today

- **Objective:** Make the relationship right now the emotional entry point.
- **In-scope outcomes:** Personal focal content; current/next/rediscovery hierarchy; relevant contextual actions; natural imagery and rhythm; truthful closing summary.
- **Out of scope:** Widget dashboard, new ranking/scoring/streaks, invented anniversaries, AI selection, new domains, or unrelated preference changes.
- **Dependencies:** F1/F2/R2/R3; current Today selector and preference contracts.
- **Reference:** [R4 reference experience](reference-screens.md), focal point and relevance; [partner-app standard](../../PARTNER-APP-EXPERIENCE-STANDARD.md), Today orchestration.
- **Likely components/patterns:** `TodayPage`, `TodayAgendaRow`, `CouplePresence`, keepsake/media, `SharedStorySummary`, existing preference/selection logic and native Today destinations.
- **Acceptance concept:** Identity, anticipation and rediscovery have differentiated weight; irrelevant regions collapse; existing upcoming-count preferences and count eligibility remain correct; sparse/no-photo/hidden-hero states feel composed. Every offered action opens its real target; image and supporting text work in both themes.
- **Suggested complexity:** M.

## R5 — Mehr / Profil / Einstellungen

- **Objective:** Make utilities calm, explicit and easy to find.
- **In-scope outcomes:** Named utility destinations; readable profile/preferences; settings categories with one task at a time; explicit save semantics; category/index/Mehr return; legacy-link mapping where routes change.
- **Out of scope:** Forced romantic decoration, new entitlement gates, billing changes, settings-data migration, new reminder channels, or weakened sensitive-action checks.
- **Dependencies:** F1/F2 and R4 in the sequence; existing identity, privacy, authentication and offboarding contracts.
- **Reference:** [R5 reference experience](reference-screens.md), practical hierarchy; [Product Reference](product-reference-v1.md), D6.
- **Likely components/patterns:** `MoreOverviewPage`, identity/preference panels, settings panels, existing mutations/visibility, category navigation and native equivalents.
- **Acceptance concept:** Profile and settings are explicitly reachable through Mehr; Pro placement does not interrupt personal preferences or invent a gate. Immediate versus staged save is clear; private partner notes stay owner-only; Back and old links work; export/import and destructive-action scopes remain intact.
- **Suggested complexity:** L.

## P1 — Private content

- **Objective:** Complete the same create/find/read/return promise for personal content with clear privacy.
- **In-scope outcomes:** Findable owner-only HeartMoments; read-first notes/gifts/private collections; deliberate editing/checking/reordering; safe relevant Search return.
- **Out of scope:** Sharing private data by presentation inference, a new privacy model, unsupported Undo, or repurposing private content into shared previews.
- **Dependencies:** F2/R1/R2/R5; owning private-retrieval and lifecycle findings remain mandatory.
- **Reference:** [System direction](design-system-direction.md), private composition and state; [Product Reference](product-reference-v1.md), privacy and create/find/return.
- **Likely components/patterns:** Existing Private Area, HeartMoment list contract, notes/gifts/collections, owner authorization and privacy-safe cache lifecycle.
- **Acceptance concept:** A saved private thought is findable without remembering a Search phrase. Private context is concise and explicit; no private content/count leaks into shared Story. Read/check comes before edit/reorder/delete; denial and account/Space switches remain safe.
- **Suggested complexity:** L.

## P2 — People / Places / Chapters / Conversations

- **Objective:** Carry the established product grammar into secondary relationship domains.
- **In-scope outcomes:** Natural people/date/place/chapter presentation, content-opening relations before unlink actions, safe comments and understandable notification/activity destinations and states.
- **Out of scope:** New social/chat domains, provider/location integration, entitlement changes, inferred edit permission, or broad API redesign.
- **Dependencies:** F2/R2/R3/R5/P1; existing capability and lifecycle remediation owners.
- **Reference:** [System direction](design-system-direction.md), content types and states; [Product Reference](product-reference-v1.md), read-before-edit and consequences.
- **Likely components/patterns:** Accepted person/date editors, relation pickers/services, `CommentsPanel`, current notification/activity components and canonical target helpers.
- **Acceptance concept:** Read access never implies write access. Linked content opens before unlink is offered; delayed comment submission preserves newer text; loading failure differs from empty notifications; target/Back behavior retains the correct context; private/cross-tenant negatives remain covered.
- **Suggested complexity:** L.

## P3 — Android / native parity

- **Objective:** Close remaining native journey gaps against the proven references and contracts.
- **In-scope outcomes:** Remaining route targets, results, draft safety, state distinctions, navigation hierarchy and content priority across accepted reference/private/secondary tasks; native device evidence and parity inventory.
- **Out of scope:** Treating a Web screenshot as native acceptance, deferring core native R1–R5 work until this slice, OS App Links or new Games/features without their own approved scope.
- **Dependencies:** F2 and accepted R1–R5/P1/P2 contracts; current native capability baseline.
- **Reference:** [Reference experiences](reference-screens.md), native implications; [design-system delivery](../../DESIGN-SYSTEM-DELIVERY.md), semantic/platform parity.
- **Likely components/patterns:** `ReferenceFlowScreen`, ViewModels, `AppNavigation`, current Compose product screens, native media/cache and design adapter.
- **Acceptance concept:** No accepted action has an omitted callback or generic fallback; editor reset follows confirmed success; nested destinations/System Back, TalkBack, 200% text, IME/insets, rotation and interruption are verified on device/emulator. The parity record separates supported, proven behavior from future scope.
- **Suggested complexity:** XL; split into coherent PRs against this bounded parity inventory.

## C1 — Cleanup / retire old patterns

- **Objective:** Make accepted, proven v1 patterns the maintained default.
- **In-scope outcomes:** Remove unused duplicated composers/wrappers and obsolete presentation mechanisms after migration; reconcile contracts/manifest/tests and link accepted-build evidence; document replacements and retirement.
- **Out of scope:** Removing compatibility links, data migrations, privacy/lifecycle guards, or useful historical evidence merely because the UI changed; weakening tests to fit regressions.
- **Dependencies:** R1–R5 and applicable P1–P3 accepted on their actual builds. Open trust/release gates cannot be waived as cleanup.
- **Reference:** [Product Reference](product-reference-v1.md), standardize proven outcomes; [documentation index](README.md), authority and legacy-reference classification.
- **Likely components/patterns:** Retired CSS/consumer wrappers, duplicate completion forms, migrated hash-scroll create paths, component manifest, governance and regression evidence.
- **Acceptance concept:** Each removed mechanism has a proven replacement and no active consumer; canonical/legacy links and existing data survive; token values retain one source; tests assert intended behavior; historical provenance remains accessible. [Final audit #946](https://github.com/baerenmarke90/eimir/issues/946) assesses product consistency against v1, not superseded near-1:1 screenshots.
- **Suggested complexity:** M.

## Issue preparation and completion tracking

Prepared implementation owners: [F1 #957](https://github.com/baerenmarke90/eimir/issues/957) and [F2 #958](https://github.com/baerenmarke90/eimir/issues/958). Both link the immutable adopted-reference commit and require a fresh baseline/reuse/preflight check before runtime implementation; F2 depends on F1. Creation of these issues does not mark either slice complete. F1 implementation and evidence are now under review in [#960](https://github.com/baerenmarke90/eimir/pull/960); see the [delivered roles and validation](f1-visual-foundations.md). F2 starts after F1 acceptance.

F1/F2 issues must link the committed reference revision, identify the bounded proof consumers, record current-main and open-PR checks, and include the preflight, reuse, business/freemium and cross-cutting reviews. Their later implementation must refresh those checks; planning is not a permanent reuse approval.

#955 owns completion across all eleven slices. A documentation PR establishes the reference and prepares execution; it does not close the master issue or claim any runtime slice complete. Merge and product acceptance remain separate decisions.
