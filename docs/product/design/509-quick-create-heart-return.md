# #509 — Quick Create Heart Moment return continuity

**Baseline:** `main@1e454855dc760b58b7a87defd9b3e94946fb515d` (2026-09-29). **Scope:** Web/Mobile Web navigation from the existing global Quick Create action through the existing Heart Moment task and canonical result. The generated whole-screen Heart Moment reference and issue preflight are recorded in [the owning #509 design document](509-heart-moment-tags-preflight.md); the sheet, capture composition and result appearance do not change in this slice.

## Current behavior and decision

The Compact floating `+` opens the existing seven-destination `ShortTaskSheet`; Expanded uses its anchored menu. Memory, Wishes, Plans and private tasks capture a scoped return origin, but Heart Moment does not. The existing Heart Moment create route saves into its canonical detail while discarding any origin state. Consequently the detail header returns to `/story`, even if the user started at Today or a filtered Story view. Its create Back and Cancel also always go to Story. The destination and save API already exist; another quick-capture composer would duplicate them.

Product Reference v1 F2 and the Create/Edit and Detail View templates govern. Reuse `TaskOriginProvider` and the existing `taskOriginKey` handoff. Store an opaque key only in router state, never the origin path, filter, scroll, Space or content. The origin provider validates the account/Space and allowed destination, expires entries and falls back to `/story` for direct entry or a stale key. This is navigation continuity, not a new persistence or draft mechanism.

## Mobile Interaction Contract

| Concern | Decision |
| --- | --- |
| Human task | Tap `+` from a primary surface, choose Heart Moment, capture it, see its saved detail, and return to the same surface and scope. |
| Compact/Expanded | Retain the existing sheet/menu, Heart Moment photo/thought/tags/feeling/date/audience hierarchy and one Save action. No new screen or extra tap. |
| Focus and motion | The shared sheet owns dismissal and focus handoff. The existing route-entry and return handlers restore the origin scroll and Quick Create focus; reduced motion and keyboard behavior do not change. |
| Back/Cancel | Use the scoped return when valid; otherwise retain the canonical Story fallback. Existing draft and pending behavior is unchanged by this bounded correction. |
| Confirmed result | Carry the same key through Save into the canonical detail, then through edit and back to detail. The shell's existing Back control returns to the origin. No success is announced before persistence. |
| Loading/error/offline | Preserve the existing capture and read states. An invalid or expired origin never grants access and returns only to Story. |
| Privacy/security | No new API, event, analytics, storage, or external provider. Only an opaque in-memory key enters router state; the provider rejects cross-account/Space reuse. |

## Reuse, business model and quality

Framework router state and the existing task-origin service are sufficient. A new composer, navigation store, provider or dependency would create a second source of truth; no commodity component is needed. Heart Moment capture and ordinary client navigation remain Free/Core in Cloud and Self-Hosted. No entitlement, media quota, API contract, migration, retention, export, downgrade or operational setting changes. The relevant cross-cutting proof is a real Quick Create → tag-only Save → canonical detail → scoped return journey plus direct-entry fallback and edit-state retention; existing API idempotency and privacy tests continue to own writes.
