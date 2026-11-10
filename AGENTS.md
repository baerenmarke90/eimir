# eimir. - Implementation Rules

These rules apply to AI-assisted and human implementation work in this repository.

## Task continuity and delivery evidence

- **Establish the current baseline.** Before implementation or release work, inspect
  current `main`, the working branch, relevant Issues/PRs and comments, dependencies,
  and applicable checks. Refresh affected assumptions after dependent merges or when
  resuming work. Follow [Status Sources and Drift Rules](docs/STATUS-SOURCES.md);
  chat history and remembered SHAs are orientation, not proof of current state.
- **Make the requested outcome traceable.** Translate requests, screenshots, and
  follow-up corrections into proportionate acceptance criteria in the existing
  Issue or PR. Preserve agreed scope and authorization across follow-ups. Use one
  coherent work record for related implementation and fixes; do not require the
  Product Owner to repeat requirements in multiple tools.
- **Verify execution readiness for the actual scope.** Confirm the checkout/ref,
  required dependencies, commands, services, and access before claiming that an
  environment can build or test the change. Repository connectivity or an available
  terminal alone does not establish readiness. Reuse an existing project setup;
  documentation-only work does not require a full application or Android build.
  State concrete missing capabilities and continue work that does not depend on them.
- **Coordinate parallel work and handoffs.** Give independent changes separate
  branches/worktrees and explicit dependencies. Related work should continue in its
  owning task/PR where practical. A handoff records the exact revision, completed
  validation, unresolved findings, and next action. Preserve other contributors'
  work and check the integration baseline before combining dependent changes.
- **Report observed delivery states.** Distinguish implemented, validated, merged,
  and published. Bind validation to the tested revision and relevant environment,
  naming failed or unperformed checks and product/device acceptance still outstanding.
  Confirm a merge against the actual target branch. Confirm publication through the
  release/version, source revision, successful publishing run, and available expected
  artifacts; include the relevant PR, run, release, and download links in the result.
  A requested release is complete only when its published result is verified.
- **Make background continuation verifiable.** Claim that cloud work continues only
  when an actual task/workflow is running or a follow-up process has been configured.
  Record its reference and the mechanism responsible for reviewing completion and
  handling failures; starting a build alone does not establish that follow-up.
  Report a pause or missing continuation explicitly instead of implying unattended
  progress after a completed response.

Use the existing Issue/PR validation sections and authoritative status sources for
this evidence. This contract adds no parallel status document, unconditional test
suite, or additional approval gate. Reuse authorization already given for the task;
merge and publication still require authorization and all applicable protections.

## Mandatory sources

Before relevant work, read at least these documents:

1. `docs/ENGINEERING-LANGUAGE.md`
2. `specification/CLEAN-ROOM-MASTER-SPEC.md`
3. `docs/REUSE-BEFORE-BUILD.md`
4. `docs/CROSS-CUTTING-QUALITY.md`
5. `docs/BUSINESS-MODEL.md`
6. `docs/FREEMIUM-FEATURE-MATRIX.md`
7. `docs/EXTERNAL-PROVIDER-CANDIDATES.md` when providers, infrastructure, or platform components are affected
8. `docs/ROADMAP.md` and the relevant milestone/project-control documentation

For every user-facing Web change (Android ships the same UI through the Capacitor wrapper), the following are additional mandatory sources before implementation starts:

9. `docs/product/design/README.md`, `docs/product/design/product-reference-v1.md`, and the relevant reference experience/system direction
10. `docs/DESIGN-PRINCIPLES.md`
11. `docs/PARTNER-APP-EXPERIENCE-STANDARD.md`
12. `docs/UX-PATTERNS.md`
13. `docs/SCREEN-TEMPLATES.md`
14. `docs/COMPONENT-CONTRACTS.md`
15. `docs/DESIGN-SYSTEM-DELIVERY.md`
16. `design/tokens.json`

## Engineering language

English is the mandatory engineering language for this repository. Follow `docs/ENGINEERING-LANGUAGE.md`.

Use English for source identifiers, comments/docstrings, tests, logs/internal diagnostics, scripts, CI/developer tooling, API/schema descriptions, active technical documentation, issues, pull requests, reviews, and commit messages.

User-facing product text remains localization-driven. German and other languages belong in the appropriate i18n resources or intentionally locale-specific fixtures; do not replace localized product content with hardcoded English.

## Reuse before build

Before implementing infrastructure, integration logic, or technical commodity functionality from scratch, perform a current reuse review.

Check in particular:

- open standards/protocols
- OS/platform capabilities
- framework/runtime capabilities
- established open-source components
- external providers/APIs

The concrete checklist and decision rules are defined in `docs/REUSE-BEFORE-BUILD.md`.

### Required before implementation starts

When the change is relevant, the issue or pull request must document:

- which alternatives were considered
- which solution was selected
- why it fits
- why custom implementation is necessary, if applicable
- for third-party components: license/ToS, Cloud/Self-Hosted support, privacy, cost, fallback, and user effort

`docs/EXTERNAL-PROVIDER-CANDIDATES.md` is a starting list; it does not replace a current search for better or newer options.

## Business / freemium model consistency

Consistency with `docs/BUSINESS-MODEL.md` and `docs/FREEMIUM-FEATURE-MATRIX.md` is a mandatory development invariant, not a launch-only or monetization-only review.

Every development issue and pull request must explicitly assess whether the change is consistent with the current eimir. business/freemium model. The review is mandatory even when the conclusion is that the change has no business-model impact.

For capabilities already classified in `docs/FREEMIUM-FEATURE-MATRIX.md`, that versioned matrix is the authoritative product-tier baseline. Until remaining future/unimplemented Free/Premium decisions from #262 are promoted into authoritative repository documentation, #262 remains the working source for those pending decisions. It must not become a permanent substitute for versioned repository documentation.

### Required before implementation starts

Assess at least the following when relevant:

- Free, Premium, Mixed, or explicitly non-paywallable capability classification, including the current matrix row or the need to add/update one;
- entitlement/capability boundaries and relationship/couple ownership semantics;
- Self-Hosted versus eimir. Cloud/Managed behavior;
- managed infrastructure, storage, compute, rendering, provider/API, inference, email/push, or support cost;
- quotas, storage limits, fair-use rules, retention, or other managed-resource constraints;
- downgrade, trial, grandfathering, restore, export, and existing-data behavior;
- whether the change would artificially degrade Self-Hosted solely to promote Cloud;
- whether the authoritative feature/plan matrix or business-model documentation must be updated.

The issue or pull request must record one of:

- **Business/freemium impact reviewed** — with the relevant matrix classification/decision or link to the owning product decision; or
- **No business/freemium impact** — with a short rationale.

A generic unchecked statement such as `not relevant` without rationale is insufficient.

### Required before merge

Re-evaluate the business/freemium result when implementation decisions changed the product surface, entitlement model, Self-Hosted/Cloud behavior, managed-resource usage, storage/quota behavior, operating cost, or downgrade/data semantics.

A pull request is not merge-ready when it introduces or changes a recognizable monetization, entitlement, Premium, Cloud/Self-Hosted, managed-resource, storage/quota, or downgrade behavior that conflicts with the current model or lacks an explicit owning decision.

If the product-tier contract changes, update `docs/FREEMIUM-FEATURE-MATRIX.md` before or with the implementation. Do not silently reinterpret an existing row from Free to Premium, Premium to Free, or change a Mixed boundary without versioned rationale and migration semantics where existing data/users are affected.

Business-model consistency does not replace security, privacy, architecture, accessibility, reuse, or cross-cutting-quality review. All applicable gates remain cumulative.

## Product design and partner-app experience

User-facing client work is product-design work, not a functional implementation followed by optional styling.

eimir. is a private partner app. Couple-facing screens must follow `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` and must not default to generic CRUD, admin-console, spreadsheet, or dashboard presentation.

[eimir. Product Reference v1](docs/product/design/product-reference-v1.md), approved by #955, is the normative current product-design source. It takes precedence over conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. In particular, older near-1:1 Planen and Momente/Timeline references are no longer absolute constraints. Lower-level privacy, security, accessibility, domain/business contracts, tokens, and platform delivery gates remain binding. Start from the [design index](docs/product/design/README.md), then the relevant reference experience, pattern, and implementation evidence.

### Required before implementation starts

For every new or materially changed user-facing Web feature or native capability, identify in the issue or PR:

- the relevant Product Reference v1 rules/reference experience, followed by the owning Screen Template or the reason a new pattern is required;
- the existing design-system components and tokens to reuse;
- the primary human/content focal point;
- the primary action and visual hierarchy;
- Compact and Expanded behavior;
- Loading, Empty, Error, Offline, and Success states where applicable;
- motion and feedback behavior, including reduced-motion behavior;
- privacy and relationship-state presentation where applicable.

A new feature must use the shared product language in its first mergeable implementation. `Functionality first, design later` is not an acceptable UI delivery strategy.

### Generated visual product reference is mandatory before implementation

For every new or materially changed user-facing feature, the owning issue MUST contain at least one generated visual reference image before UI implementation starts.

The visual-reference preflight is repository-aware, not a free-form concept exercise:

- inspect current `main` and the actual destination screen/route before generating the image;
- account for the existing functions, content hierarchy, shell/navigation, interaction primitives, design-system components, tokens, and relevant states already present there;
- preserve existing visible capabilities that remain in scope and represent them as they currently exist instead of silently replacing or omitting them;
- integrate the new feature into the whole composition so placement, hierarchy, density, interaction entry points, and coexistence with neighboring features can be reviewed;
- use Compact/smartphone as the primary generated composition; add an Expanded/Web visual only when its adaptation is materially different;
- do not satisfy this gate with an isolated feature card, a blank replacement screen, generic SaaS/admin artwork, or a mockup detached from the current eimir. product;
- attach/link the generated reference in the issue and record the baseline `main` SHA plus the existing screen/functions that were reviewed;
- if the affected screen changes materially before implementation starts, regenerate or update the image against the new baseline;
- for an existing feature issue that lacks this artifact, perform this visual preflight before writing or continuing UI implementation.

The requirement to generate the image is binding. The generated image guides composition and Product Acceptance but is not automatically a pixel-perfect lock; normative Product Reference rules, accessibility, privacy, security, business/domain contracts, and later explicit Product Owner decisions still govern. If an issue needs particular visual decisions to be exact, it must say so explicitly.

[#1151](https://github.com/baerenmarke90/eimir/issues/1151) may be consulted as a **non-binding example of the workflow only**. It does not establish a reusable layout, style template, or precedence for unrelated features.

### Couple-facing anti-patterns

Unless an explicit product decision justifies them, do not use these as the primary presentation of relationship content:

- dense tables;
- repeated metadata-heavy bordered rows;
- equal dashboard tiles with no real hierarchy;
- nested card landscapes;
- raw form stacks without product composition;
- technical IDs, enum values, or API terminology in normal-user surfaces;
- layouts whose dominant visual structure is indistinguishable from inventory, invoicing, or server administration software.

Administration and diagnostics may legitimately use denser information design, but that visual language must not leak into normal couple-facing surfaces.

### Smartphone-first is a mandatory implementation invariant

The Product Owner decision in `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 0 is binding for all AI-assisted and human implementation work:

- Smartphone/Compact is the normative product reference for couple-facing client work, not a later reduction of a desktop design.
- Read the relevant design foundations (`docs/DESIGN-PRINCIPLES.md`, `docs/PARTNER-APP-EXPERIENCE-STANDARD.md`, `docs/UX-PATTERNS.md`, `docs/SCREEN-TEMPLATES.md`) before writing UI code, not after.
- A Mobile Interaction Contract (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 10) must exist before UI implementation starts. If the owning issue lacks one, perform and document a Product Design Preflight first (section 15) rather than implementing against an incomplete brief.
- Implementing a desktop/table/CRUD-first UI and making it responsive afterward is not an acceptable delivery strategy. Such a PR is not merge-ready regardless of functional correctness.
- A technically complete UI is not automatically product-complete. Functional acceptance criteria do not by themselves satisfy this invariant.
- Screen Templates (`docs/SCREEN-TEMPLATES.md`) are subordinate to this invariant: when a template's wording conflicts with it, the invariant wins. Correct the template, or document the conflict in the issue/PR, rather than following the template literally.
- `Reuse before build` remains mandatory, but reuse is not a design justification by itself. No agent may argue "I reused the existing table/list component, therefore the design is correct" — an existing pattern that produces the wrong UX for the task is a design-system gap to close (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 17), not a pattern to keep reusing.

### Motion is required behavior

Every material interaction must deliberately decide whether motion or feedback is needed. Reuse motion tokens and platform capabilities. State changes, reordering, sheets/panes, success feedback, and emotionally meaningful actions should not feel like abrupt DOM/data replacement.

All motion must remain non-blocking, accessible, and understandable with reduced motion enabled.

### Visual evidence before merge

A PR that changes couple-facing UI must include visual evidence sufficient to review the product result, including representative Compact and Expanded states where applicable. Theme-sensitive changes must be checked in Light and Dark. A textual assertion that the UI looks correct is not sufficient evidence by itself.

A user-facing PR is not merge-ready when it is functionally correct but violates Product Reference v1 or the partner-app experience standard. Validate **Open → interact → save/complete → observe result → return**, including draft safety and restored context where applicable; screenshots alone cannot establish behavioral acceptance. Cover relevant ~360/~390/~430 px, sparse/dense, Light/Dark, and reduced-motion states alongside existing accessibility/reflow and native-device gates.

## Semantic design tokens

Standalone create/add task entry points must remain visibly filled buttons in
empty and populated views. Apply the binding [Button contract](docs/COMPONENT-CONTRACTS.md#31-button)
rather than styling an icon/text or tertiary action as the main creation control
(Product Owner correction #1688). Preserve the single-primary-action hierarchy.
All create/add entry points reuse the shared `AddActionButton`, `AddActionLink`
or `AddActionContent` presentation: a filled canonical-blue pill with the shared
contextual icon (defaulting to the plus) and a visible localized action label,
as in Planning. The Product Owner correction #1724 uses photo, photo-library,
Place, list and tag motifs for the corresponding enrichment actions. This includes
People, important days, authored tags, media and inline insertion controls.
The Product Owner correction #1697 supersedes #1693's icon-only circular
interpretation. The later #1726 correction uses the shared soft, full-width
media-intake choices inside composers instead of blue pills for device/external
source selection; see the Button contract for this narrow exception. Keep native task/link/input lifecycles; local CSS may arrange
the action but must not replace its surface, radius, spacing or visible label.

Reusable visual values must use semantic design tokens instead of repeated component-level literals.

Rules:

- define reusable colors, spacing, radii, typography, shadows, motion, and similar visual constants through semantic tokens;
- name tokens by interface meaning, not by their current literal value;
- consume tokens through the platform design-system adapter instead of local visual constants;
- keep literal values at the token-definition boundary unless a value is genuinely one-off and does not provide reusable meaning;
- tokenize theme-, branding-, accessibility-, and motion-sensitive values so they can be adjusted centrally.

Prefer:

```css
--color-text-inverse-muted: rgb(255 255 255 / 90%);
color: var(--color-text-inverse-muted);
```

Avoid:

```css
color: rgb(255 255 255 / 90%);
```

or implementation-only names such as `--purple-600` when the semantic role is known.

This rule does not require meaningless token proliferation for isolated values without reuse or semantic value. See `docs/DESIGN-PRINCIPLES.md` and `docs/DESIGN-TOKEN-POLICY.md` for the design-system guidance.

## Cross-cutting quality

Cross-cutting requirements are architecture and product requirements, not late release cleanup.

Before implementation begins and again before merge, apply `docs/CROSS-CUTTING-QUALITY.md` to larger runtime slices, client features, and production user flows. Deliberately assess at least these areas when relevant:

- security, authentication, authorization, and abuse resistance;
- privacy and data lifecycle;
- internationalization and locale behavior;
- accessibility;
- concurrency and consistency;
- resilience, offline behavior, and retry semantics;
- observability;
- performance and resource usage;
- API, contract, and migration consequences;
- operations, Self-Hosted behavior, and release impact;
- testing and negative cases.

Not every area applies to every change. `Not relevant` is acceptable when the decision is traceable. A pull request is not merge-ready when a recognizable cross-cutting consequence is left untreated or deferred in a way that creates an incompatible contract, privacy/security gap, or hard-to-reverse architecture.

For client work in particular, user-facing text, date/number formatting, and pluralization must use the localization layer from the start, and accessibility must be implemented as part of the feature rather than postponed to final UI review.

## User rule

Normal couples must not need to configure technical infrastructure. API keys, technical URLs, provider selection, tokens, and server details belong in the backend or hoster/admin layer.

The Product Owner decision for #1444 (2026-10-27) permits a narrow exception: a Pro user may link their own Immich HTTPS service address. The personal, revocable read-only credential required by Immich is handled in the dedicated consent/setup task, never as a shared operator credential or general infrastructure settings surface. See `docs/product/integrations/1444-photo-source-delivery.md`. Other integrations retain the rule above.

## Do not weaken existing gates

Reuse, business-model, product-design, or cross-cutting decisions must never weaken Clean-Room, security, privacy, tenant-isolation, provenance, licensing, or engineering-language rules.

## Pull requests

### CI preflight, consolidated fixes, and targeted retries

This policy applies to human contributors and coding agents handling any pull request. Follow the [contributor CI procedure](CONTRIBUTING.md#retrying-failed-ci-jobs). The goal is informed convergence to merge readiness, not repeated speculative pushes or reruns.

- Before implementation and the initial PR push, inspect the applicable Actions workflows, event/path filters and classifiers, required checks, base/dependency context, and PR-body, documentation, and design-evidence gates. Prepare a proportionate validation plan and complete required metadata/evidence before requesting final review.
- Run cheap relevant preflight checks before pushing; run independent checks in parallel where supported. Broader suites need a relevant risk or required gate, not an automatic all-suites rule for every small change.
- Collect available failures and diagnostics from useful independent jobs/shards on the current revision. Distinguish root causes, dependent symptoms, transient infrastructure failures, and unrelated baseline issues. Start diagnosis immediately, but normally let still-useful independent checks finish before a correction push.
- Resolve known related causes and predictable follow-on errors as one coherent validated batch. Several meaningful local commits are fine; do not trigger another remote cycle for each isolated red message while known failures remain untreated. Do not bundle unrelated changes or wait indefinitely for hung/unavailable jobs.
- Retry an unchanged revision only for a diagnosed, plausibly transient failure, using **Re-run failed jobs** or a specific-job rerun. Preserve successful independent jobs. Repeated failure requires further diagnosis; do not use speculative rerun-all, empty commits, close/reopen loops, or artificial draft/ready transitions.
- Code, test, or workflow fixes require a new commit and fresh applicable checks. Confirm the final head and relevant integration/merge context; older success is not evidence for changed source. For PR-metadata failures, correct the actual body/evidence and use the supported fresh event if rerunning would retain stale event data.
- Cancel only demonstrably obsolete or diagnosed-hung runs owned by the current work, after preserving useful diagnostics. A shared PR does not authorize cancelling another contributor's work; required merge/deployment checks and missing evidence must not be treated as successful.
- When changing workflows, keep independent expensive checks separately retryable where practical and retain `fail-fast: false` for independent matrix jobs. Required aggregates must reject failed, cancelled, or unexpectedly skipped required work. Do not weaken checks, assertions, coverage, protections, or required context names to shorten the cycle.
- Diagnostic artifacts from retries must distinguish attempts or use an explicit safe replacement contract. Preserve stable artifact names consumed by release workflows.
- Record the relevant root causes, correction batch, validation, and any retry reason briefly in the existing PR validation section. This adds no separate approval process or arbitrary limit on the number of justified pushes.

### Mandatory Web browser test selection

For Web product, browser-test and browser-CI work, the [Browser impact selection contract](docs/m5/BROWSER-IMPACT-SELECTION.md) is binding for human contributors and coding agents.

- Use the shared validated plan: the always-run cross-surface core plus complete affected feature/reference specs. Do not restore an unconditional growing feature suite for every unrelated Web PR.
- New or changed browser journeys must have reviewed ownership in both `web/e2e/test-groups.json` and `web/e2e/test-impact.json`. Include all relevant production entry roots and cross-surface destinations; a historical filename is not evidence of ownership. Revisit roots when journeys or source paths change.
- Feature-specific acceptance evidence and broad viewport/theme variants must not automatically become global always-run work. An addition to, or material expansion of, the always-run core needs a concrete cross-surface contract and a traceable rationale in the PR, including overlap with existing coverage and the collected selection impact.
- Prefer equivalent deterministic lower-level coverage for pure invariants. Delete browser cases only after proving redundancy, obsolescence or an equivalent committed replacement; retain real-browser layout, focus, navigation, privacy and accessibility protection where required.
- Shared foundations, unknown/unmapped changes and incomplete dependency analysis must remain conservative. Preserve validation of complete PR-file responses, revision binding, changed surviving specs, disjoint execution groups and rejection of malformed/empty plans or unexpectedly skipped required work.
- Preserve full automatic regression on `main` and manual execution, stable required contexts, independent retry boundaries and useful diagnostics. Impact-based scheduling is not permission to reduce required product contracts or weaken protection rules.
- Before pushing browser-selection changes, run the planning regressions and inventory checks and document actual Playwright collection counts and relevant measured runtime when available. Historical baselines and target durations do not establish current coverage or justify weaker assertions.

The recorded test counts are measurements, not permanent quotas. Change the core deliberately as product contracts evolve; do not allow unrelated feature additions to silently recreate a large unconditional PR suite. Follow the [contributor procedure](CONTRIBUTING.md#web-browser-test-selection).

### Required reviews

A relevant pull request without a traceable reuse review is not merge-ready. Pure domain changes may mark the review as `not relevant` with a short rationale.

Every development pull request must contain a traceable Business/Freemium Model Consistency result. `No business/freemium impact` is acceptable only with a short rationale. A recognizable conflict with `docs/BUSINESS-MODEL.md`, `docs/FREEMIUM-FEATURE-MATRIX.md`, or the current working decisions for unclassified future features must be resolved before merge or routed through an explicit owning product decision.

Every pull request must also record whether it has user-facing UI/UX impact. A PR with user-facing Web changes, or wrapper/native-capability changes that alter what couples see, must complete the Product Design / UX review from the pull-request template and satisfy the partner-app experience standard.

Larger runtime slices, client features, and production user flows must document their relevant cross-cutting consequences in the pull request. The pull-request template is the minimum review surface; deeper decisions belong in the owning issue, decision document, or ADR.

A pull request that introduces non-English engineering content without an allowed exception from `docs/ENGINEERING-LANGUAGE.md` is not merge-ready.
