# M2 Client & QA Implementation Issues

**Status:** templates; no GitHub Issues created yet  
**As of:** August 24, 2026

These packages supplement the [M2 Delivery Plan](./DELIVERY-PLAN.md). They start only when the respective Backend/OpenAPI increment is stable. One Issue corresponds to one branch and one Pull Request.

## Shared PR boundaries

- no changes to Auth/Tenant foundations in a feature PR,
- no client-side invention of missing API fields,
- no divergent Web/Android terminology or Privacy rules,
- no content in Analytics, Logs, or Push Preview,
- mandatory states and demo fixtures in the same PR as the screen,
- visual, Accessibility, and Privacy evidence before merge.

## C1 – Shared M2 Client Contracts

**Title:** `[M2][Clients] Integrate shared route, DTO, and error contracts`

**Dependencies:** published M2 OpenAPI contract, M2 Domain decisions.  
**Scope:** route IDs, typed DTOs, Error Mapping, Query Keys, Privacy/Space-bound Cache Keys, Test Doubles.

**Acceptance**

- Web and Android generate/use the same contract.
- 401, 404, 409, 429, and 5xx are distinguished semantically.
- Cache Keys contain owner/Space context and no content values.
- PRIVATE is not a purely visual filter.
- Contract and fixture tests run reproducibly.

**Not included:** finished screens, independent Backend model.

## C2 – Story Timeline & Search Web

**Title:** `[M2][Web] Deliver Story Timeline, Search, and detail pane`

**Dependencies:** Story Query API, C1.  
**Scope:** Compact/Medium/Expanded, month groups, filters, Cursor, Search, detail pane, Back/Deep Link.

**Acceptance**

- Memory, Milestone, and Shared HeartMoment appear; PRIVATE never does.
- Filters/scroll/selection are restored when returning.
- Cursor Retry creates no duplicates.
- keyboard, 200% zoom, and Privacy-safe 404 pass.
- Web performance budgets are measured.

## C3 – Story Timeline Android

**Title:** `[M2][Android] Deliver Story Timeline, Search, and detail navigation`

**Dependencies:** Story Query API, C1.  
**Scope:** Navigation Destination, month groups, Filter Sheet, Cursor, Deep Link, Offline Read Cache.

**Acceptance**

- TalkBack/Switch Access/Back path complete.
- largest font does not clip required text.
- Cache is owner/Space-bound and locked after Logout/switch.
- PRIVATE Canary is absent from UI, cache, and network projection.
- startup/scroll performance budgets are measured.

## C4 – Memory Creator & Media Queue Web

**Title:** `[M2][Web] Deliver Memory form with safe Media queue`

**Dependencies:** Memory CRUD, Attachment Lifecycle, C1.  
**Scope:** Create/Edit, `happenedOn`, multiple Media, ordering, status, Retry/Remove, Shared notice.

**Acceptance**

- all Media states are visible and actionable per file,
- invalid file destroys neither text nor valid Media,
- Reorder works without Drag,
- Offline Write remains unsaved,
- double submit creates no duplicate,
- 409 preserves local input.

## C5 – Memory Creator & Media Queue Android

**Title:** `[M2][Android] Deliver Memory form with Photo Picker and Media status`

**Dependencies:** Memory CRUD, Attachment Lifecycle, C1.  
**Scope:** System Photo Picker, form, Media Tiles, Retry/Remove/Reorder, process/network status.

**Acceptance**

- no permission request at app startup,
- TalkBack announces file, status, and action,
- no Read URL or private file in Share Sheet/Clipboard/Backup,
- WorkManager creates no Offline Write Sync,
- draft remains in the current secure context.

## C6 – HeartMoment Privacy Flow Web & Android

**Title:** `[M2][Privacy] Deliver HeartMoment owner-only and Shared UX on both clients`

**Dependencies:** HeartMoment API/Policy, Attachment Parent Auth, `M2-D06`, `M2-D07`.  
**Scope:** mandatory selection, first-share explanation, owner area, Shared detail, visibility transition, Cache/Deep-Link rules.

**Acceptance**

- no preselected visibility without a documented decision,
- PRIVATE has no Comment/Story/partner action,
- partner Deep Link and all indirect paths remain neutral,
- transition requires Online + current version,
- Canary is absent from Story, Search, cache, Analytics, Log, Push, and Export,
- Privacy group is fully understandable with keyboard/TalkBack.

## C7 – Milestone Web & Android

**Title:** `[M2][Clients] Integrate dedicated Milestone flow`

**Dependencies:** Milestone CRUD, C1.  
**Scope:** Create/Edit/Detail, Story Card, date, Concurrency.

**Acceptance**

- Milestone is not a Memory type flag in the client,
- dedicated Story type and clear semantics,
- no disabled future Chapter/Recap controls,
- 404/409/Offline/Accessibility checked on both platforms.

## C8 – Comments & Privacy-safe Notification UX

**Title:** `[M2][Clients] Integrate Comments and safe Notification preview`

**Dependencies:** Comment API, Outbox/Notification Hook, Preview decision.  
**Scope:** List/Composer/Edit/Delete according to contract, send status, Retry, Deep Link from Notification.

**Acceptance**

- Composer only on permitted Shared targets,
- send state produces exactly one Comment,
- parent 404 remains neutral,
- Push Preview contains no Comment/Title text without explicit approval,
- Notification Deep Link reauthorizes,
- Screen Reader status and focus after sending are correct.

## C9 – System States, Offline & Conflict

**Title:** `[M2][Clients] Standardize M2 system states, Offline Read, and 409 conflict handling`

**Dependencies:** C1 and at least one integrated M2 flow.  
**Scope:** Skeleton, Empty, Partial, Offline Cache, Offline Write block, 401/404/409/429/5xx, draft preservation.

**Acceptance**

- State Matrix exists as visual tests for every M2 screen,
- no state leaks private Counts or existence,
- Offline Write never reports success,
- 409 has no automatic last-write-wins,
- focus and input remain stable.

## C10 – M2 Accessibility & Performance Gate

**Title:** `[M2][QA] Accept Accessibility and performance budgets for Web and Android`

**Dependencies:** C2–C9.  
**Scope:** keyboard, TalkBack, Switch Access, large font, contrast, Motion, focus, reference measurements.

**Acceptance**

- all core flows from `DEMO-SCENARIO.md` are exercised,
- no critical WCAG/TalkBack barrier remains open,
- touch/click targets match Tokens,
- performance budgets are documented; deviations have an owner and decision,
- Privacy Authorization is not bypassed for performance.

## C11 – M2 Privacy Abuse & Release Sign-off

**Title:** `[M2][Security] Exclude client, cache, and Notification leaks before release`

**Dependencies:** Backend Security suite, C2–C10.  
**Scope:** Canary scan across DOM/cache/Logs/Events/Push/Export, Cross-Tenant, revocation, Read URLs, Recents.

**Acceptance**

- all relevant client paths for `TM-01` through `TM-18` are assessed,
- Private Canary appears only in owner context,
- Logout/Space switch clears/locks caches,
- Deep Links and Notifications reauthorize,
- open High/Critical risks block Release,
- result is documented as Security/Privacy acceptance.

## Recommended sequence

```text
C1
├── C2 ── C4 ──┐
├── C3 ── C5 ──┤
├── C6 ────────┤
├── C7 ────────┤── C9 ── C10 ── C11
└── C8 ────────┘
```

C2/C3 and C4/C5 may run in parallel by platform but share contract, fixtures, copy, and acceptance criteria. C6 remains a shared Privacy package so Web and Android do not diverge semantically.
