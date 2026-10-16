# M2 UX-to-Engineering Handoff

**Status:** Implementation preparation  
**Version:** 1.0  
**As of:** August 24, 2026

This package refines the existing eimir. design foundation for **M2 - Memory Core**. It replaces neither the product, API, nor security specification; instead, it connects them into implementable screens, states, and platform rules.

## Target experience

M2 should feel like the same product on Web and Android:

- shared terminology and equivalent domain outcomes,
- platform-appropriate navigation and overlays,
- visible privacy before, during, and after saving,
- honest media, sync, offline, and error states,
- no private information in Story, search, comments, push, or partner export,
- one complete core flow that does not depend solely on a mouse, touch precision, or visual cues.

## Files

- [Screen Flows](./SCREEN-FLOWS.md) - navigation, task paths, and transitions
- [Screen State Matrix](./SCREEN-STATE-MATRIX.md) - required states, copy, and actions
- [Platform Handoff](./PLATFORM-HANDOFF.md) - Web/Android adaptation, accessibility, and performance
- [Graphical Screen Flow](./m2-screenflow.svg) - compact overview for Product, Design, and Engineering
- [Privacy Threat Model](../../docs/m2/PRIVACY-THREAT-MODEL.md) - data flows, threats, and controls
- [Demo Scenario](../../docs/m2/DEMO-SCENARIO.md) - reproducible end-to-end data set
- [Implementation Issues](../../docs/m2/IMPLEMENTATION-ISSUES.md) - issue-ready client and QA packages

## Authoritative foundations

| Topic | Source |
|---|---|
| navigation and terminology | [Information Architecture](../../docs/INFORMATION-ARCHITECTURE.md) |
| general interactions | [UX Patterns](../../docs/UX-PATTERNS.md) |
| existing task flows | [User Flows](../../docs/USER-FLOWS.md) |
| layout types | [Screen Templates](../../docs/SCREEN-TEMPLATES.md) |
| components | [Component Contracts](../../docs/COMPONENT-CONTRACTS.md) |
| privacy communication | [Content & Privacy Guidelines](../../docs/CONTENT-PRIVACY-GUIDELINES.md) |
| accessibility acceptance | [Accessibility QA Matrix](../../docs/ACCESSIBILITY-QA-MATRIX.md) |
| design tokens | [tokens.json](../tokens.json) |
| M2 domain/API/media | [M2 Technical Readiness](../../docs/m2/README.md) |

If sources conflict, the binding product specification or the OpenAPI contract published at implementation start takes precedence. Open domain questions are decided in the [M2 Decision Log](../../docs/m2/DECISION-LOG.md), not hidden in the client.

## Definition of Ready for an M2 screen

A screen is ready for implementation when:

1. entry point, success outcome, and return path are defined.
2. allowed roles and privacy class are named.
3. data source and relevant API operation are defined.
4. Loading, Empty, Offline, 401, 404, 409, 429, and 5xx states are assessed.
5. focus/TalkBack order and large-text behavior are described.
6. analytics contain no content, search text, file names, or private attributes.
7. Web and Android use the same domain contract.

## Intentional boundaries

- No real E2EE in the MVP; only E2EE-ready data and media boundaries.
- Offline Read is allowed; Offline Write deliberately remains disabled.
- Private HeartMoments use a dedicated owner-only path, not a filter in the shared Story.
- Chapter, Place, Recap, public links, and temporary shares are not part of this package.
- This package does not silently resolve domain decisions that are still open.
