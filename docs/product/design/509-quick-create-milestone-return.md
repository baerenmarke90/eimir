# #509 — Quick Create Milestone return continuity

**Baseline:** `main@412e76df73ef780a17470b5492b76bf7f788c218` (2026-09-29). **Scope:** Web/Mobile Web navigation from the existing global Quick Create action through the existing Milestone task and its canonical result. The [owning issue preflight](https://github.com/baerenmarke90/eimir/issues/509#issuecomment-5894160819) records the Mobile Interaction Contract before implementation. The generated whole-screen #509 Memory and Heart Moment references establish the current capture language; the existing seven-destination sheet and Milestone create/detail composition remain visually unchanged in this bounded navigation correction.

## Current behavior and decision

Quick Create opens the existing Milestone create route. Unlike the other six destinations, it does not capture an origin for Milestone. The create Back and Cancel always lead to Story, and a confirmed Save opens the actual detail without the origin key. A person starting on Today or a scoped Story view cannot reliably return there. The destination, date/title editor, optional body disclosure, idempotent create and result API already exist.

Product Reference v1 F2 and the Create/Edit and Detail View templates govern. Reuse the existing `TaskOriginProvider` and opaque `taskOriginKey` router state. The provider admits only known account/Space and return paths, expires keys, restores scope/scroll/focus and falls back to `/story` for direct or stale entry. No path, filter, scroll position, account, Space or authored content is serialized into the navigation state.

## Mobile Interaction Contract

| Concern | Decision |
| --- | --- |
| Human outcome | Choose Milestone from global `+`, name a meaningful date, see the confirmed saved event, and return to the same source. |
| Compact / Expanded | Retain the existing sheet or anchored menu, dedicated create page, required title/date, optional body disclosure, and one Save. No new UI component, step, text or keyboard focus. |
| Back / Cancel | Use the validated scoped origin; direct, stale and invalid origin uses Story. The existing task and browser/system Back behavior remains. |
| Confirmed result | Carry the same key through Save into detail and through edit/back/cancel/save. The shell's Back then returns to the origin. No success before the authoritative write. |
| Loading, error, offline | Keep the existing request, retry/error and offline behavior; do not discard form input or claim a save. Navigation does not alter write identity. |
| Feedback / accessibility | Existing sheet dismissal, focus handoff, return focus, semantic controls and reduced-motion behavior apply. The Back label uses the existing localized generic label for a valid origin. |
| Privacy / relationship | Only a bounded opaque in-memory key moves through router state. The Milestone's existing shared visibility and API permissions do not change. |

## Reuse, business model and cross-cutting review

React Router state and the existing provider cover the handoff. A second composer, navigation store, provider, dependency or persistence layer would duplicate the current contract. Milestones and ordinary client navigation remain Free/Core in Cloud and Self-Hosted. No entitlement, quota, media, API, migration, export, downgrade or operating-cost consequence. The only new failure case is a missing/expired key; it resolves to the canonical Story home. Validate Quick Create → Save → detail → edit → return, cancellation, direct entry, Compact and Expanded screenshots, focus and browser Back. The prior #509 visuals and current design tokens remain the composition baseline because this correction changes navigation behavior and a Back label, not layout or styling.
