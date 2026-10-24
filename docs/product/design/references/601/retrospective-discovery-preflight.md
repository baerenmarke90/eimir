# Momente retrospective discovery — product preflight (#601 Slice D)

**Baseline:** `main@24898604ed81086ca4781bcbf6c05a68149798e1` (2026-10-24).
**Normative UI:** shared Web, with Compact smartphone as the primary reference.
**Visual preflight:** [generated full-screen Compact composition](./retrospective-discovery-compact.svg) (schematic, not a production screenshot, not a new visual direction). It preserves the actual Momente header, Discover/Timeline tabs, Photos/Milestones/Chapters/Years browse row, existing featured Story lead, tapestry, and bottom navigation before adding the retrospective section.

## Existing composition, reuse and scope

- #601 already delivered the Momente shell, Discover/Timeline, Photos and year archive. Do not reopen those.
- The existing Discover API selects its own finite, authorized, daily editorial lead, sometimes marked `ON_THIS_DAY`. Preserve it and its canonical Story detail links; it is not #452's authoritative one-year / weekday fallback selector.
- #452's shared-only retrospective is already selected by `Dashboard.getDashboard`, with a ready Memory attachment ID when available. Reuse that exact API and `dashboardQueryKey(spaceId)` (shared with Today), `dashboardItemPath`, `MemoryPreview`, `openDiscoverItem` and existing Story task-origin/back behavior. No new client-side content choice, date arithmetic, API, persistence, provider or dependency.
- Render a **quiet, compact** contextual "Rückblicke" strip *after* Discover's featured lead, before its existing tapestry, only when the authorized Dashboard has a real candidate. A duplicate lead (same kind/ID) is not rendered twice. Absent candidate, failed Dashboard read or Timeline tab: no extra card, placeholder or invented memory. The original Discover content still works.
- The Today daily-dismiss action stays exclusive to Today; it does not erase the authorized retrospective from Momente. The same real Memory detail opens from either surface.
- Out of scope: wrapped (#473), book (#517), locations (#872), new TimeHop ranking, time capsules (#446), Android native code, live demo deployment/reset and #946 final acceptance. #601 remains open.

## Mobile interaction contract

- **Human task:** recognize a genuinely shared historic moment and open its canonical detail, then return to the same Momente context.
- **Hierarchy:** header → existing Discover/Timeline selection → four existing browse destinations → existing Story lead → one quiet retrospective (when eligible) → existing varied tapestry; no extra tab, global nav item, carousel or modal.
- **Primary interaction:** entire retrospective surface is one standard accessible Link with a 44px+ touch target, keyboard focus and native browser link behavior; it preserves task origin and does not add a separate redundant Open button.
- **Media/text:** READY Memory thumbnail via existing authorized loader only; missing photo is a deliberate text-first composition, not an empty image frame. Hearts and milestones remain text-only.
- **Compact/Expanded:** compact horizontal media/text panel with constrained artwork; expanded retains content hierarchy and uses available width without a second column of competing equal cards. Non-photo card should breathe.
- **States:** delayed Dashboard response does not block the Discover lead/tapestry; absent, denied, offline or failed optional Dashboard query adds no card. Cached Discover remains usable; pull-to-refresh refetches both selections when the Dashboard API is provided. The existing offline banner remains attached only to the cached Discover source.
- **Accessibility and motion:** semantic section/heading/time, localized text, focus-visible outline, no color-only meaning; shared existing motion tokens, hover only for fine pointers and reduced-motion suppression.

## Cross-cutting and business

- **Authorization/privacy:** only the server's currently authorized #452 candidate is shown; no selection from Timeline (which can contain a viewer's own OWNER_ONLY Heart Moment). Never infer another user’s private content from missing results. Attachment reads remain parent-scoped.
- **Data lifecycle:** no new storage or copied private content. The existing Dashboard query/cache is shared with Today and follows the app's current authenticated QueryClient lifecycle.
- **Date/locale:** OpenAPI date-only carriers are formatted in UTC calendar time, matching existing Story helpers.
- **Concurrency:** presentation binds to the current Space and preserves the existing Discover task origin and canonical navigation; no writes, retries, background jobs or new race-prone mutations.
- **Performance:** one existing Dashboard query when the Discover tab is active, deduplicated with Today by the canonical key; no new originals/media download until the existing thumbnail is near viewport.
- **Free/Core:** existing shared Memory and historic presentation, no entitlement or business/freemium change. Cloud and Self-Hosted share the same API and UI.
- **Validation:** focused component coverage for photo, text-only, absent, duplicate and Timeline states; existing browser QA for both Compact/Expanded and accessibility. Real-device/store QA and live demo state are not claimed.
