# eimir. product design

Start with [Product Reference v1](product-reference-v1.md). It is the **normative, Product Owner-approved direction** from [#955](https://github.com/baerenmarke90/eimir/issues/955), dated 2026-09-15. It answers what applies now; audit and calibration records explain why.

## Reading path

| Question | Source |
| --- | --- |
| What should eimir. feel like; which principles are binding? | [Product Reference v1](product-reference-v1.md): North Star, product principles, Design DNA, Interaction DNA and D1–D8. |
| Which five experiences define the product? | [Reference screens](reference-screens.md): R1 capture, R2 Moments, R3 Planning, R4 Today, R5 utility. |
| Which visual/input language applies? | [Design-system direction](design-system-direction.md): surfaces, images, type, color, shape, rhythm, motion, forms and content composition. |
| What gets implemented next? | [Implementation roadmap](implementation-roadmap.md): F1/F2 → R1–R5 → P1–P3 → C1. |
| How are F1 roles implemented and proven? | [F1 visual foundations](f1-visual-foundations.md): token/adapter mapping, bounded internal proof, usage limits and exact-build evidence. |
| Which older material still applies? | [Authority register](#authority-register) below. |
| Why was the direction chosen? | [Audit](audits/2026-09-15/product-design-audit.md), [calibration](audits/2026-09-15/visual-calibration.md), [evidence and decisions](audits/2026-09-15/evidence-and-decisions.md). |
| How is compliance reviewed? | [v1 acceptance](product-reference-v1.md#review-and-final-acceptance), [Partner-App Experience Standard](../../PARTNER-APP-EXPERIENCE-STANDARD.md), [PR template](../../../.github/pull_request_template.md) and final audit [#946](https://github.com/baerenmarke90/eimir/issues/946). |

## Authority model

1. Clean-Room, security, privacy, tenant isolation, accessibility, provenance, licensing, engineering language, business/freemium and technical domain contracts remain cumulative constraints. Design decisions do not weaken them.
2. **Product Reference v1** is the current product-design authority approved by #955. Its reference experiences and system direction elaborate that same authority; they are not competing specifications.
3. Domain/pattern guidance and semantic token/component contracts supply compatible lower-level rules. A reference surface is not permission to invent capabilities, entitlements or privacy states.
4. Implementation-specific evidence demonstrates a particular build, not a new source of design authority.
5. Historical audit/calibration, screenshots, old issues and old implementation details explain decisions. **When they conflict, v1 wins unless a later explicit Product Owner decision supersedes it.** Update the versioned references when that happens.

The accepted screen references bind hierarchy, content priority, composition, interaction model, rhythm and mobile behavior. They are **not pixel locks**. Richer implementation is welcome when it preserves those outcomes and accessibility; calm must not become empty or sterile.

## Authority register

Classifications apply to the stated scope, not indiscriminately to every sentence in an older file:

- **STILL_NORMATIVE:** currently binding within its compatible scope.
- **SUPPORTING:** useful rationale or evidence; cannot override v1.
- **SUPERSEDED:** an identified rule no longer governs; retain its history.
- **HISTORICAL:** a dated observation, proposal or implementation snapshot; not current acceptance.

| Source / reference | Classification | Current relationship and superseded scope |
| --- | --- | --- |
| [Product Reference v1](product-reference-v1.md), [reference screens](reference-screens.md), [system direction](design-system-direction.md) | STILL_NORMATIVE | Current approved product/design direction. |
| [Implementation roadmap](implementation-roadmap.md) | STILL_NORMATIVE | Accepted outcome order; issue states remain on GitHub. This does not change the repository's milestone order or declare completion. |
| [Design Principles](../../DESIGN-PRINCIPLES.md) and [Partner-App Experience Standard](../../PARTNER-APP-EXPERIENCE-STANDARD.md) | STILL_NORMATIVE | Compatible product principles, Mobile Interaction Contract, Product Design Preflight and acceptance gates; reconciled to v1. |
| [UX Patterns](../../UX-PATTERNS.md), [Screen Templates](../../SCREEN-TEMPLATES.md), [Component Contracts](../../COMPONENT-CONTRACTS.md), [Design System Delivery](../../DESIGN-SYSTEM-DELIVERY.md) | STILL_NORMATIVE | Lower-level mechanics, contracts and delivery evidence; generic defaults cannot override R1–R5. |
| [Information Architecture](../../INFORMATION-ARCHITECTURE.md) and [User Flows](../../USER-FLOWS.md) | STILL_NORMATIVE | Compatible destination/domain meaning and task semantics; v1 controls changed composition and create/read/return outcomes. |
| [Tokens](../../../design/tokens.json), [Token Policy](../../DESIGN-TOKEN-POLICY.md), [typography delivery ADR](../../decisions/0005-typography-delivery.md) | STILL_NORMATIVE | Single technical value/delivery sources. F1 maps approved visual roles and D7 to adapters; this documentation does not claim those changes have shipped. |
| [Clean-Room Master Specification](../../../specification/CLEAN-ROOM-MASTER-SPEC.md), [business model](../../BUSINESS-MODEL.md), [feature matrix](../../FREEMIUM-FEATURE-MATRIX.md), [cross-cutting quality](../../CROSS-CUTTING-QUALITY.md), [reuse rule](../../REUSE-BEFORE-BUILD.md), [engineering language](../../ENGINEERING-LANGUAGE.md) | STILL_NORMATIVE | Their technical, safety, commercial and engineering scopes are not superseded by aesthetic approval. Historical identity literals remain governed by the identity-migration policy. |
| [Brand Guidelines](../../eimir-brand-guidelines.md) | STILL_NORMATIVE | Name, mark, self-hosted type and compatible brand roles remain; current composition and active scheme usage follow v1. Older fallback color tables and muted helper-copy defaults are superseded. |
| [Navigation/route ADR 0003](../../decisions/0003-primary-navigation-and-route-model.md) | STILL_NORMATIVE in compatible scope | Stable routes and compatibility remain; old labels and reserved Discover placement follow subsequent ADRs and v1. |
| [Android navigation ADR 0004](../../decisions/0004-android-uses-bottom-navigation-at-every-size.md) | STILL_NORMATIVE | Native bottom navigation at every size; preserve platform behavior without pixel copying. |
| [Games ADR 0009](../../decisions/0009-games-primary-navigation-and-premium-capability.md) and [ADR 0010](../../decisions/0010-games-secondary-navigation-under-more.md) | STILL_NORMATIVE in compatible scope | ADR 0009 capability/privacy rules remain; ADR 0010 already superseded its primary-navigation placement. Games remain under More. |
| [IA harmonization ADR 0008](../../decisions/0008-product-ia-harmonization-and-domain-alignment.md) | STILL_NORMATIVE in compatible scope | Domain homes and route meaning remain; its reserved top-level Discover placement was already superseded by ADR 0009/0010. |
| [Date-only Plan scheduling](../../m3/decisions/DATE-ONLY-PLAN-SCHEDULING.md) and [#952](https://github.com/baerenmarke90/eimir/pull/952) | STILL_NORMATIVE | Preserve date/time meaning, progressive end times and human-readable ranges under R3. |
| [A1 shell decision](../../design/eimir/SHELL-RESCUE-A1.md) | SUPPORTING | Accepted horizontal Web shell and compatible route decisions are preserved by current guidance; the old document is not a competing product reference. |
| [Phase 3 checkpoint](../../design/eimir/DESIGN-CHECKPOINT-PHASE-3.md), its A/B previews and direction screenshots | HISTORICAL | Preserve earlier exploration and asset provenance. Selected direction B informs the retained identity; conflicting composition is superseded by v1. |
| [#825 mobile surface audit](../../design/eimir/MOBILE-FIRST-SURFACE-AUDIT.md) | HISTORICAL | Findings/PASS states describe their recorded builds, not acceptance against v1. |
| [#850 Today screenshots](../../design/eimir/screenshots/850-today/README.md), [#882 navigation screenshots](../../design/eimir/screenshots/882-floating-nav/README.md) | HISTORICAL | Useful before/after and regression evidence. A fixed six-section Today composition and old screen proportions do not constrain R4. |
| [M5 desktop UX audit](../../m5/WEB-DESKTOP-UX-AUDIT.md) | HISTORICAL | #340 desktop-first recommendations describe an earlier comparison and do not override the smartphone-first reference. |
| [M2 screenflow/handoff package](../../../design/m2/README.md) | SUPPORTING / HISTORICAL | Earlier milestone examples; compatible API/privacy/accessibility contracts remain, but visual compositions are not current v1 acceptance. |
| [M5 delivery/demo package](../../m5/README.md), earlier milestone screenflows and dated gate reviews | HISTORICAL for visual acceptance | Retain evidence and compatible contracts. Past milestone completion is not proof of current v1 compliance or final #946 acceptance. |
| [Planning #859](https://github.com/baerenmarke90/eimir/issues/859) and [Timeline #860](https://github.com/baerenmarke90/eimir/issues/860) near-1:1 reference expectations | SUPERSEDED where conflicting | R3/R2 now govern. Preserve successful chronology, segmentation, schedule, navigation and accessibility outcomes; screenshots remain historical. |
| Universal context/status-first Card anatomy, mandatory introductory subtitle, fixed Timeline three-pane layout, old mandatory sidebar/rail guidance, blanket minimum Compact 20/24 px gutters | SUPERSEDED | Content → meaning → action → metadata, purposeful surfaces, optional context and D7 replace those defaults. Safety consequences still stay visible. |
| Other earlier issue references: [#809](https://github.com/baerenmarke90/eimir/issues/809), [#849](https://github.com/baerenmarke90/eimir/issues/849), [#855](https://github.com/baerenmarke90/eimir/issues/855), [#881](https://github.com/baerenmarke90/eimir/issues/881), [#861](https://github.com/baerenmarke90/eimir/issues/861), [#862](https://github.com/baerenmarke90/eimir/issues/862), [#831](https://github.com/baerenmarke90/eimir/issues/831), [#837](https://github.com/baerenmarke90/eimir/issues/837) | SUPPORTING / HISTORICAL | Retain truthful story counts, optional Memory title, media pipeline, private boundaries and domain behavior. Old layouts, wording or screenshot-level expectations cannot override v1. |
| [2026-09-15 audit](audits/2026-09-15/product-design-audit.md) | HISTORICAL | Diagnostic evidence; its older wave plan is superseded by #955's sequence. |
| [2026-09-15 calibration](audits/2026-09-15/visual-calibration.md), original PDF/overview and [decision ledger](audits/2026-09-15/evidence-and-decisions.md) | SUPPORTING / HISTORICAL | Detailed design source and rationale; original candidate labels predate #955 approval. The distilled repository v1 states current rules. |

The earlier [design evidence directory](../../design/eimir/README.md) links here rather than maintaining a parallel normative tree. Raw ZIP artifacts remain outside git with fingerprints and custody limits recorded in the dated evidence ledger.

## Maintenance and review

Read v1 before implementing a design slice. Start from fresh main and inspect current issues/PRs; approved direction is stable, but component names and runtime behavior must be checked live. Record the chosen reference, Mobile Interaction Contract, reusable patterns, bounded proof and evidence plan before UI code.

Review the complete human journey and its states, then update the relevant domain/pattern guidance alongside implementation. Do not use an old screenshot test to reject an intentional v1 correction without checking the current contract. Equally, do not delete useful privacy, state, accessibility or navigation assertions while updating visual baselines.

The [final audit #946](https://github.com/baerenmarke90/eimir/issues/946) applies v1 plus its intuitive-mobile-interaction addendum, exact-build journey evidence and existing quality gates. It remains a later Product Owner acceptance decision. The documentation adoption PR must not close the full #955 implementation program.
