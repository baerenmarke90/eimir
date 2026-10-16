# R4 — Wir / Today: preflight and delivery contract

**Owner:** [#989](https://github.com/baerenmarke90/eimir/issues/989), within the #955 Product Reference program.  
**Authority:** [Product Reference v1](product-reference-v1.md), [R4 reference experience](reference-screens.md#r4--wir--today), [system direction](design-system-direction.md), the Today [Screen Template](../../SCREEN-TEMPLATES.md#3-template-today), and the accepted F1/F2/R1/R2/R3 contracts.  
**Fresh baseline:** work began from `fd490e9f64fe56672aba47eb0b167258e456e0ee`; current `origin/main` at `3243c06322807dc63782b3f35726e89092375a25` was integrated on 2026-09-17 before the final product-source freeze.
**Normative client:** Web / Mobile Web. Android is intentionally deferred and is not an acceptance criterion for this slice.  
**Status:** Product Design Preflight recorded before R4 runtime changes. Product Owner acceptance remains a separate decision. Later accepted #1189 and #1194 decisions govern the default order and personal Settings order where this preflight describes an older composition.

## Human outcome

Wir is the emotional entry point to the relationship right now. It should answer, through actual authorized content:

- who we are;
- what matters now;
- what is next;
- what is worth rediscovering.

The screen is an intentionally curated relationship home, not a configurable dashboard. Couple presence establishes the shared place. One real current subject carries the most visual weight. Near-future planning, a relationship impulse, rediscovery, recent trace, and the closing story summary appear only when they add current meaning and remain subordinate to the focal content.

## Current implementation inventory

The existing Web implementation already uses the authoritative Space-scoped Dashboard read model plus separate Activity and Dashboard-preference reads. `CouplePresence`, `ThinkingOfYouButton`, the server-selected Keepsake, deterministic `selectLivingModule`, `selectMonthlyStrip`, upcoming-count preference, module visibility preferences, canonical route builders, `MemoryPreview`, React Query freshness invalidation, AppShell, Quick Create, and the accepted #976 bottom-navigation behavior are all production contracts to preserve.

The accepted R1/R2/R3 surfaces already own capture, Memory/Momente presentation, Plan presentation, detail routes, and their mutation lifecycles. Today must project those domains and never implement a second editor, feed, planner, activity system, media pipeline, or return-history mechanism.

The following gaps are bounded R4 work:

- when no eligible photo can render, the current Keepsake area substitutes generic photo-onboarding copy even when real text relationship content exists;
- item links use canonical paths but do not capture the existing F2 in-memory Today origin, so explicit detail Back can fall through to a domain home instead of returning to Today;
- dense data can produce all supporting regions even when an upcoming Plan already covers the same planning role;
- the closing story summary uses three decorative statistic badges and can read as a KPI group rather than a quiet shared-history reflection;
- Activity failure is silently ignored even though the rest of Today can remain trustworthy;
- several source comments still describe historical #850 as the normative fixed composition instead of recognizing Product Reference v1 authority.

No backend/API/schema gap was found. The existing Dashboard contract provides authoritative couple context, upcoming items, Keepsake, retrospective, recent shared content, summary counts, and Thinking-of-You cooldown. Existing server integration tests already enforce Dashboard exclusion of OWNER_ONLY/private data, private birthdays, and cross-Space access.

## KEEP

- Couple and person presence, real names/avatars, connection state, and server-derived relationship duration.
- Server-authoritative Dashboard selection, including Keepsake and retrospective roles.
- Dashboard freshness invalidation, independent module-preference loading, personal 1–3 upcoming-count preference, and stable preference visibility semantics.
- Thinking-of-You idempotency, server-authoritative cooldown, pending lock, localized confirmed/error feedback, and privacy behavior.
- Real shared Memory imagery through the existing authorized preview loader and source-object authorization.
- R2 content presentation principles and canonical Memory/HeartMoment/Milestone destinations.
- R3 human-readable upcoming presentation and canonical Plan/Wish destinations.
- F2 in-memory, Account+Space-scoped origin/return primitive; no sensitive payload or resource data in the URL.
- AppShell, global Quick Create, root `/today` route behavior, and #976 persistent Today bottom navigation.
- Existing semantic tokens, focus behavior, reduced-motion rules, and localized product copy architecture.
- Summary eligibility: at least two nonzero categories and at least five combined items.
- Selection de-duplication: the same shared content is not repeated as focal content, contextual signal, monthly image, and recent trace.

## AVOID

- equal widget/card grids, one permanent card per feature, an on-page widget catalogue, or a desktop dashboard wall; the supported Settings visibility/order preference is distinct from these patterns;
- large status panels, KPI/statistic walls, activity/audit dominance, or planning-first administration;
- nested cards, generic feature tiles, permanent toolbars, duplicated create forms, or embedded Plan/Memory editors;
- duplicating accepted Momente chronology/filtering or Plan lifecycle logic;
- AI ranking, engagement scoring, streaks, relationship scores, guilt, urgency, or auto-sent affection;
- fake/demo relationship data, stock imagery, fabricated anniversaries, photo-shaped blanks, or romance decoration without relationship meaning;
- new backend domains, aggregation storage, schemas, recommendation services, dependencies, providers, entitlements, quotas, or paywalls;
- OWNER_ONLY, sealed, unrevealed, GiftIdea/private, or cross-Space content in rendering, eligibility, counts, placeholders, logs, URLs, or evidence metadata;
- R4-specific navigation behavior or changes to focused R1/R3 task shells and global Quick Create.

## TRANSLATE

### Compact 320 / 360 / 390 / 430

Use one vertical relationship-first flow. Couple presence stays compact and stable; Thinking-of-You may take its own line but remains a quiet contextual control. The supported 1–3 upcoming preference uses compact, readable intent/date items. One photo or text focal item becomes the visual subject. Supporting sections collapse when irrelevant; no filler balances a sparse screen. At 320 px and 200% layout zoom, content wraps without horizontal page overflow, targets remain at least 44 CSS px, and the bottom navigation does not cover the final action.

### Expanded Web

Preserve the same sequence and reading order. Use added width for larger natural media, comfortable text measure, and compact supporting clusters. Do not introduce a sidebar, dashboard columns, extra modules, permanent actions, or a narrow centered mobile column with accidental dead space. Validate 1280/1440 and a 1920 sanity state.

### Light / Dark

Use existing F1 semantic roles. Photographs stay natural and unfiltered. Text-first content keeps editorial warmth and readable contrast without simulating a missing image. Supporting copy uses the compliant secondary role. State is never conveyed through color alone.

### Reduced motion

Existing semantic reveal/lift/feedback motion may reinforce page entry and Thinking-of-You confirmation. Reduced motion removes transforms and animation while retaining identical content, focus, pending, success, cooldown, error, and return information.

### Large text / 200% zoom

Names, duration, upcoming details, focal prose, and actions wrap in semantic reading order. No fixed-height crop may hide text; no horizontal carousel is required to discover a primary action. Expanded reflow at an effective 320 CSS px follows the Compact composition.

## Orchestration contract

| Projection | Trigger | Priority / displacement | Role | Exit | Privacy |
| --- | --- | --- | --- | --- | --- |
| Couple presence | Authorized Dashboard Space context exists | First by default; a personal module order may move it without changing its identity role | Relationship identity | Only hidden by the existing personal module preference; an accessible page heading remains | Space/member identity and authorized profile media only |
| Thinking-of-You | Connected partner and current cooldown permit or explain interaction | Contextual inside couple presence; never displaces focal content | Relationship signal/action | Cooldown disables it truthfully; absent partner yields no send | Existing notification contract; no free text or inferred private state |
| Upcoming projection | At least one authoritative near-future item survives the personal 1–3 limit | Compact after the focal item by default (#1189); a saved personal module order may place it earlier (#1194); suppresses a duplicate Plan/Wish fallback signal | Current/next context | Disappears when nothing is eligible or preference hides it | Dashboard-authorized SPACE_SHARED items only |
| Focal shared item | Server Keepsake or an eligible shared Memory, Heart Moment, or Milestone is available | Dominant content after couple context and before the practical horizon by default; displaces generic onboarding and duplicate lower modules | Shared content / rediscovery | Disappears only when no real eligible item exists or preference hides the role | Authorized shared item; media loader follows source authorization; no private eligibility influence |
| Contextual relationship module | Genuine partner comment, retrospective, Wish, Plan, or Milestone qualifies after exclusions | Exactly one; never duplicates the focal/current planning role | Relationship signal / rediscovery | Recomputed deterministically; absent/duplicate candidates collapse | Authorized Activity/Dashboard data only |
| Monthly imagery | Current-month shared Memory previews remain after higher-priority exclusions | Secondary below focal/context by default; never creates a photo placeholder | Shared life texture | Disappears with no eligible real images or hidden preference | Authorized Memory preview only |
| Recent trace | Authorized recent shared items remain after all higher-priority exclusions | Quiet secondary trace; capped and never an audit-log lead | Recent context | Disappears when empty or hidden | Authorized shared items only |
| Story closing reflection | Existing eligibility threshold is met | Last by default, quiet and sentence-like rather than a KPI panel | Shared-story summary | Disappears below threshold or when hidden | Server-provided shared counts under existing privacy contract |

The default ordering is deterministic and explainable: couple presence, focal relationship content, then compact next context when relevant. There is no engagement rank or randomness. The existing Account-and-Space Dashboard preference (#1194) persists each person's supported module order independently; hiding a module does not discard its position. Roughly three dominant elements/interactions appear above the initial fold, depending on optional content and viewport size.

## Mobile Interaction Contract

| Concern | Bounded contract |
| --- | --- |
| Primary Compact state | Quiet couple presence → one real photo/text focal item → optional compact next context → only relevant supporting relationship content by default; supported modules follow a saved personal order when present. |
| Dominant action | Open the focal shared item. Global Quick Create remains the only global capture action; an empty/new relationship may offer one local Memory-capture invitation. |
| Immediate vs disclosed | Identity, current/next context, and focal content are immediate. Full Momente, Planen, and Activity remain canonical destinations; no embedded management detail. |
| Interaction pattern | Ordinary vertical page, semantic links for destinations, one existing button for Thinking-of-You, and standard Browser Back/F2 explicit Back return. No new gesture or modal. |
| Loading | Initial Dashboard loading uses the shared loading state. Module preferences resolve before configurable content appears so hidden content cannot flash. |
| Empty / first use | Couple presence, calm explanation, and at most one Memory capture action. No fabricated plan, memory, image frame, or empty module grid. |
| Sparse | One real Plan, relationship signal, or shared photo/text item forms a complete composition. No filler sections. |
| Dense | One focal item; bounded upcoming preference; deterministic single contextual module; de-duplicated monthly/recent content; closing summary only when eligible. |
| Error / refresh | A failed initial Dashboard read is an error, not empty. Known safe React Query content remains renderable during refresh failure. Preference/Activity failures remain local, visible, and retryable without collapsing trustworthy relationship content. |
| Offline | Current Dashboard has no durable Today cache promise. If the request is unavailable, show an honest unavailable/error state; never fabricate empty content or claim queued writes. Source-domain cached detail behavior remains unchanged. |
| Success | Thinking-of-You shows pending then server-confirmed feedback/cooldown. Navigation opens the real canonical object. |
| Return | A normal Today content activation captures the existing F2 opaque in-memory origin and scroll position. Detail Back and browser Back return naturally; direct links use safe canonical fallbacks. |
| Privacy | Only existing authorized Space-scoped Dashboard/Activity projections contribute. Hidden/private existence cannot affect focal selection, counts, placeholders, or missing-state copy. |
| Typing / keyboard | Today introduces no text entry and no automatic keyboard. Keyboard order follows visual order; all content links/buttons have visible focus. |
| Motion | Existing tokenized reveal/feedback is brief and non-blocking. Reduced motion removes movement without removing result or hierarchy. |
| Expanded | Same hierarchy and DOM order; more media width and breathing room, not more modules or management UI. |
| Visual acceptance | Exact-build fixtures cover 320/360/390/430, Light/Dark, reduced motion, 200% zoom/small height, sparse/dense/empty, photo/text/no-photo, Plan present/absent, signal present/absent, partial failure, 1280/1440, and 1920 sanity. |

The page is not a conventional list, table, or master-detail surface. Its vertical flow is intentional because a person reads one current relationship composition from identity through focal content, next context, and quieter rediscovery by default.

## Reuse decision

No current external search is warranted because the slice adds no infrastructure, integration, dependency, or provider. The selected implementation reuses React/React Router, TanStack Query, native link/button semantics, current APIs, F1 tokens/adapters, F2 task-origin return, R1 Memory capture, R2 canonical content destinations/media presentation, R3 Plan destinations/schedule copy, current Dashboard selectors/preferences, `CouplePresence`, `ThinkingOfYouButton`, `MemoryPreview`, `ProblemState`, AppShell, Quick Create, and existing browser-test fixture patterns.

Alternatives rejected:

- a new Today backend or aggregated database duplicates authoritative Dashboard/domain state;
- a widget framework encodes the anti-pattern R4 exists to remove;
- client-side AI or engagement scoring is unexplainable, privacy-sensitive, and explicitly out of scope;
- a second Memory feed or Plan model would break canonical ownership and return behavior;
- a new component dependency is unnecessary for semantic links, responsive CSS, and deterministic pure selectors already supported by the stack.

## Business / freemium consistency

**No business/freemium impact.** `Zero-Decision Dashboard & Activity`, relationship context, Memories/Timeline, Wish/Plan lifecycle, Thinking-of-You, official Web access, Light/Dark, privacy, and accessibility remain Free/Core under the authoritative matrix. R4 only recomposes existing capabilities. It introduces no entitlement, Premium classification, quota, managed-service dependency, storage/compute/provider cost, downgrade behavior, data migration, or Self-Hosted degradation. Existing source-domain entitlements and authorization remain authoritative.

## Cross-cutting quality review

- **Security / authorization / abuse:** no new endpoint or authorization surface. Existing Space-scoped clients and server authorization remain. Thinking-of-You idempotency, rate limit, and server cooldown are unchanged.
- **Privacy / lifecycle:** only already-authorized Dashboard/Activity data is composed. OWNER_ONLY/private content remains excluded server-side and must not influence client eligibility. Origin state is bounded, opaque, in-memory, and invalidated across Account/Space changes.
- **Internationalization / locale:** all new product copy uses the localization layer. Dates/counts continue through active-locale formatters and pluralization.
- **Accessibility:** semantic headings, links/buttons, accessible names, 44 px targets, focus, keyboard, axe, 320 reflow, 200% zoom, contrast, image alternatives, and reduced motion are acceptance gates.
- **Concurrency / consistency:** no new writes except the unchanged Thinking-of-You mutation. Existing pending lock, unique request id, server-confirmed success, cooldown, and Query cache update remain.
- **Resilience / offline:** initial, empty, and partial errors remain distinct. Loaded trustworthy content is not removed by a secondary failure. No offline-write or Today-cache promise is added.
- **Observability:** no content, resource titles, media URLs, private data, or origin metadata is added to logs/analytics/evidence filenames.
- **Performance / resources:** deterministic selectors are linear over existing bounded Dashboard/Activity arrays. No extra per-item request, media processing, dependency, or persistent state is introduced.
- **API / migration:** no OpenAPI, DTO, generated-client, database, export, or migration change is planned.
- **Operations / Self-Hosted:** identical client composition and existing APIs; no configuration, secret, provider, deployment, backup, or restore change.
- **Testing:** targeted pure selectors/components, Today browser journeys, R1/R2/R3/F2/#976 regressions, axe/reflow/zoom/reduced-motion, full Web unit/Browser QA, type/lint/format/build/tokens, and exact-build evidence are required.

## Implemented R4 result

- The server-selected Keepsake remains authoritative. When it has no usable photo, its real text is now the focal content; when no Keepsake exists, the first eligible shared Memory, Heart Moment, or Milestone can carry the same deliberate text-first role. Today no longer fabricates a photo-shaped onboarding state around real text content.
- Upcoming content remains the compact R3 projection. When it is present, the contextual selector no longer duplicates that planning role with a Wish or Plan fallback. Genuine partner activity, retrospective, and Milestone candidates remain eligible in deterministic order.
- Memory, Plan, Wish, Heart Moment, and Milestone items keep canonical detail routes. Normal Today activations now capture the existing F2 Account+Space-scoped in-memory origin so explicit detail Back restores Today; modified-click and deep-link behavior remains native.
- Activity-read failure is presented as a local, retryable status while safe Dashboard content stays visible. The initial Dashboard error, preferences error, and existing freshness/cache behavior remain distinct and unchanged.
- The story summary retains its server-provided eligibility threshold and canonical filtered Momente destinations, but reads as a quiet closing reflection with text links rather than a decorative KPI badge group.
- Empty/new relationship presentation retains couple presence, calm localized guidance, and one Memory-capture action. Sparse content is allowed to form a complete composition; dense content is de-duplicated and bounded through the established preference and selectors.
- AppShell, global Quick Create, Thinking-of-You mutation/cooldown behavior, and `/today` persistent bottom navigation are unchanged. Android, backend, OpenAPI, generated clients, schema, and dependencies were not changed.

## Validation result before evidence freeze

- Latest `origin/main` was fetched again immediately before publication and had advanced to `3243c06322807dc63782b3f35726e89092375a25`. The R4 branch was rebased onto it without conflict. The final upstream delta added CodeQL merge-protection handling and the Compact Momente browse layer; Today remained unchanged, while the shared story surface was revalidated with the R4 closing-reflection tests and visual evidence.
- Product-role token check, TypeScript typecheck, Biome lint, Biome format check, production build, internal visual-proof typecheck, and `git diff --check` passed.
- Full Web unit/component suite: 142 files passed, 1 skipped; 898 tests passed, 1 skipped.
- Full Playwright CI-mode browser/axe gate: 333 tests passed with one worker.
- Targeted R4 coverage includes photo and text-first focal selection, planning-fallback suppression, canonical detail routes, Memory and Plan F2 return, local Activity failure, empty/sparse/dense composition, de-duplication, keyboard focus, axe, 320 reflow, 360/390/430 Compact, small-height, 200% zoom, reduced motion, Light/Dark, 1440 Expanded, and 1920 sanity.
- Existing Thinking-of-You tests cover pending, confirmed, error, cooldown, and restored usability. Existing server Dashboard integration coverage remains the privacy authority for OWNER_ONLY/private exclusion and cross-Space access.
- Backend tests and generated-client drift checks are not applicable because no backend, API contract, or generated client changed.
- Product Owner acceptance remains outstanding.

## Evidence and delivery boundary

Deterministic real-app evidence belongs in `docs/product/design/evidence/r4/`. Its README must map every requested state to a screenshot or behavioral assertion, record the exact product-source commit and reproducible command, and carry SHA-256 checksums. Evidence is generated only after integrating current `main` and validating the final product-source commit. A later evidence-only commit may add the captures and provenance; it must not silently change product source.

The Draft PR closes #989 only after review/merge. It keeps #955 open, does not claim Android parity or Product Owner acceptance, and must not be marked ready or merged by this delivery.
