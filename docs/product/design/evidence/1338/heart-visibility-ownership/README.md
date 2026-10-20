# Heart Moment visibility ownership — #1338

Base: `bb8ccd7b34c4c56c6b65fe296e0461b555a1d119` (merged #1337).
Product/reuse/business preflight and the bounded reflow extension are recorded in
[#1338](https://github.com/baerenmarke90/eimir/issues/1338). Parent: #503; related: #508.

## Result and contract

The audience remains server-confirmed. An admitted visibility write owns its
original Account, Space, Heart Moment, submitted version, API and exact authorized
Query. Cancellation is awaited and admission checked again before dispatch. A
late response cannot recreate a removed Query, replace another Query, clear a
later 401/403/404 denial, or overwrite equal/newer canonical content. Failure no
longer restores an old full snapshot. Persistent shared-cache revocation still
targets the original account/resource even after its session is gone; ownership
is checked again after that asynchronous revocation.

Existing scoped mutation tracking restores the same-version pending state after
an actual route unmount/return. Another version/scope remains usable and does not
inherit that pending/error feedback. One synchronous admission is allowed per
displayed version. Offline attempts settle through existing localized recovery;
reconnection does not replay a privacy change. Retrying requires another action.

Product Reference v1 R2/P1 and Screen Template 11 govern this existing detail
surface. Authored content, emotion, Edit, provenance, audience, comments, Back and
shell hierarchy remain intact. Reuse existing 44px visibility control, tokens,
localized status/error feedback and reduced-motion behavior. No new composition,
dialog, typing burden or relationship microcopy is introduced for this privacy
repair. Compact leads; Expanded retains the bounded reading surface. No new
generated reference is needed for this bounded behavior/renderer correction.

The large-text browser journey also proves two existing layout defects: a detail
grid item's automatic minimum size expands a 320px document to 560px, and the
returned SHARED comment action can widen an internal grid while decorative
overflow clipping hides the problem from document-width checks. The correction
is local to Heart detail: shrinkable container/card column, wrapping footer and
constrained wrapping comment label. Typography, tokens, global CommentsPanel and
Milestone styling are unchanged. Assertions retain document width, actual card
child/footer containment, 44px control size, keyboard reachability and Axe.

## Counterfactual and verification

- [Baseline component output](baseline-unit.txt): **20 failures / 1 passing
  normal-change control** on unchanged main, using the same 21-case test sidecar.
  Denial preconditions force a real fetch with `staleTime: 0`; recovery refetches
  are held at the invalidation boundary so they cannot mask callback corruption.
- [Baseline browser output](baseline-browser.txt): all seven new journeys fail
  at the intended pending-return or offline boundary on the old production build.
  These runs predate the additional child-containment/keyboard assertions.
- [Baseline reflow output](baseline-reflow.txt) and
  [320px baseline capture](baseline-320-dark-large.png) independently reproduce
  the old document expansion. [Baseline identity](baseline-identity.json) records
  its source and production assets.
- [Focused component output](focused-unit.txt): **42 passed**, including all 21
  ownership cases, existing product tests and real read-cache revocation tests.
  Negative cases cover newer/equal versions, Query removal/replacement, later
  authorization denial, original Account/Space, awaited cancellation/revocation,
  duplicate submission, pending/error version scope and offline/no replay.
- [Full Web output](web-unit.txt): **1,702 passed / 1 existing skipped test**.
  The focused suite was rerun after strengthening the newer-version UI assertions.
- [Affected production-browser spec](browser.txt): **15 passed, zero retries**,
  including all eight existing create/tag/photo/return cases and seven new
  visibility journeys. Each online journey performs create → visibility change
  → pending → More/unmount → return/pending → PRIVATE confirmation → failed
  SHARED attempt → deliberate retry → SHARED → More/unmount → return, with exact
  request bodies and If-Match versions. Offline journeys prove no reconnect write
  before deliberate retry. Unknown API requests fail closed and must remain empty.
- Build/typecheck, generated token adapters, PWA and Capacitor foundation, lint,
  format, browser inventory, 20 planner tests and both engineering/documentation
  language audits pass. Lint retains the existing 25 warnings and 13 infos.
  Hosted checks remain the separate current-commit gate.

Production preview: Vite, installed lockfiles, Playwright 1.62.1 with locally
available Chrome Headless Shell 153.0.8010.0, two workers, no retries. Hosted CI
uses its own pinned browser. All browser data are synthetic. [Identity](identity.json)
binds the sources, unchanged token authority and final production assets; no API,
schema, migration, dependency or deployment changes are included.

## Visual review

Inspect whole compositions and the behavioral output together. The retained
captures show real route-return/keyboard focus, including the existing skip link
where it is visible; screenshots are not substitutes for behavioral acceptance.

| Surface/state | Evidence |
| --- | --- |
| 390px Light, pending after return | [Capture](heart-visibility-390-light-return.png) |
| 390px Light, confirmed PRIVATE | [Capture](heart-visibility-390-light-private.png) |
| 390px Light, failed SHARED attempt | [Capture](heart-visibility-390-light-error.png) |
| 430px Dark, confirmed PRIVATE | [Capture](heart-visibility-430-dark-private.png) |
| 1440px Light, pending after return | [Capture](heart-visibility-1440-light-return.png) |
| 1440px Dark, confirmed PRIVATE | [Capture](heart-visibility-1440-dark-private.png) |
| 320px Dark / 200%, confirmed PRIVATE | [Capture](heart-visibility-320-dark-large-private.png) |
| 320px Dark / 200%, failed SHARED attempt | [Capture](heart-visibility-320-dark-large-error.png) |
| 320px Dark / 200%, returned SHARED with keyboard focus | [Capture](heart-visibility-320-dark-large-confirmed.png) |
| 360px Light, explicit offline attempt | [Capture](heart-visibility-offline-360-light.png) |
| 360px Dark, explicit offline attempt | [Capture](heart-visibility-offline-360-dark.png) |

Large-text geometry is **320px client / 320px scroll / scrollX 0**. PRIVATE,
pending, failure and returned SHARED children remain within the actual card.
Normal-width metadata retains its existing row. Existing localized errors and
confirmed visibility remain truthful; pending suppresses comment interaction.

## Business and cross-cutting review

**No business/freemium impact:** HeartMoments remain Free/Core and PRIVATE
enforcement remains non-paywallable in the authoritative feature matrix. No
entitlement, ownership model, Cloud/Self-Hosted behavior, managed resource/cost,
quota, retention, downgrade, export/restore or existing-data contract changes.

Reuse installed TanStack Query, `captureAuthorizedQuery`, generated versioned
DTOs, `ProductReadResult`, `assertOnlineWrite` and the existing persistent
revocation function. No custom queue/framework/provider, dependency/license/ToS,
external data flow or user setup is introduced. Authorization, If-Match, parent
comment privacy and revocation boundaries remain binding. No private payloads
are added to diagnostics. Loading/empty/denied semantics remain existing;
concurrency, offline/error/success/return and accessibility are explicitly tested.
No new native capability is introduced; physical-device release gates are not
claimed by these Web results. #946 and native drafts #1271/#1332 remain separate.
