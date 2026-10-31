# Relationship surfaces, games, calendar and saved-memory map (#1546)

Product Owner request: remove all retrospective entries from Wir, align Eure Geschichte and Eure Woche with the current product, remove Passport from Profile, finish the game shelf, hand dated Plans to a calendar and add a Pro memory map. Requested delivery is a merge-ready PR; merge/release is not authorized by this task.

## Design preflight

Baseline main: `ef2c412a6c5fbdb253efe746066831faeece1638`.
[Owning issue and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/1546).
The generated whole-screen [Compact reference](generated-reference.webp) was linked in the issue before UI work. It uses the built-in imagegen skill, current Wir screenshot and earlier weekly screenshot as composition inputs. Prompt: retain current periwinkle/blue shell, people/content-first hierarchy and existing capabilities; show Wir without recaps, canonical Story counts, coherent weekly charts, five playable games, explicit Plan calendar handoff, consent-first saved-memory map and Profile without duplicate Passport.

The image is a composition guide, not a replacement domain model: actual Story metrics remain Memory/HeartMoment/Milestone; discrete vibes, profile fields, dates and privacy follow existing contracts. No GPS button, invented analytics, photo assets or illustrated chart values ship from the generated reference.

Product Reference v1 R2/R3/R4/R5 governs. Reuse PageHeader, EimirIcon, UiState/ProblemState, TaskOrigin, generated clients, semantic surfaces and motion, owned Object URLs and the existing lazy Leaflet canvas. The map's equivalent location/source list remains usable without external tiles. Co-located Memory links are grouped without changing stored Places. Other nearby points remain individually selectable; this is not a heatmap or inferred itinerary. Pagination is explicit and bounded. All loaded locations can be found through the equivalent list.

Wir keeps daily rituals, focal content, upcoming plans, contextual current signals, pinned lists and the quiet recent trace. Month-highlight and retrospective invitations no longer render or request recap data; Passport remains under More. Profile removes only its duplicate Passport entry. Existing source and privacy gates remain.

Games retain the existing three flows and add two finite authored sofa sessions: optional small missions and shared memory conversation prompts. Both require two current partners, support skip, finish, restart and exit, keep no answer history and never invent source memories or relationship scores. No new runtime provider/dependency.

## Weekly AI feasibility

**Feasible as optional wording assistance; deliberately not activated in this UI change.** The existing operator-configured local model seam (`recaps/local_ai.py`) accepts bounded authorized source evidence. Weekly insights (`daily_checkins/insights.py`, `dailyInsightsModel.ts`) currently derive facts and privacy-aware visible observations deterministically. That separation is valuable and remains.

A safe later implementation should send only selected already-derived, mutually revealed observations (for example shared-day count and a supported energy comparison), with period and locale, after explicit action. Never send private/vibe notes, unavailable partner values, raw profiles or missing-day guesses. The model may shorten wording; it must not calculate facts, diagnose, rate the relationship, claim causes, infer feelings or convert missing daily entries into absence of care. Existing recap wording checks are not sufficient semantic verification for health-adjacent trend language and cannot be reused blindly.

Reuse the same operator-only local inference configuration, bounded queue/timeout and deterministic fallback; add a distinct constrained prompt/output validator, per-Space admission and rate limit before runtime use. Keep `daily.insights` entitlement and optional-module/reveal boundaries. No browser model call, new provider, user API key, automatic private-data upload or inference on every render. This PR performs the requested feasibility review, not an unreviewed expansion of daily-entry processing.

## Calendar semantics and limits

Use [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html) with TEXT escaping, UTF-8 line folding, CRLF, stable Space/Plan UID and version. Date-only schedules stay all-day DATE with an exclusive next-day end; exact instants stay UTC and unknown end times remain unknown. No current date, guessed time zone or invented one-hour duration.

The explicit action shares a calendar File when supported or downloads it for import. This is a **one-time copy**, not an authenticated subscription or automatic sync. The product states that limitation. No credentials, external account, public bearer feed or automatic calendar write. Calendar-app acceptance on physical devices remains separate from Web serialization and browser handoff evidence.

## Reuse, business and privacy

The matrix records `memories.map` as Pro per the explicit PO follow-up; it is Space-owned and server-enforced. Basic Places, coordinates, direct maps and source memories remain Core, including after downgrade. Calendar handoff is Core; existing games/weekly insights/Passport retain their capabilities. No data migration or new persistence.

Leaflet BSD-2-Clause and the existing OSM tile integration are reused. Current primary sources checked: [Leaflet reference](https://leafletjs.com/reference.html), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Attribution remains visible, `referrerPolicy: origin`, no prefetch/offline tile packs and no tile request before explicit load. The provider receives IP/origin/viewport; memory titles, photos and source IDs stay local. Cloud/Self-Hosted use the same behavior, without a new paid provider or required user setup. The equivalent list is the provider-independent fallback.

Map reads apply the shared readable predicate to both Memory and Place plus the canonical same-Space relation. Cursor binding includes collection/Space; no private-derived totals, persistent map cache, tracking, GPS request or new events. Existing writes invalidate the map through shared Story/Place invalidation. The response is `Cache-Control: no-store`. Capability loss or context denial hides stale results.

## Verification

Evidence and exact test results are recorded in the PR. Actual-browser screenshots in `evidence/` use synthetic fixtures; the generated preflight is not implementation evidence. Cover Compact 360/390/430, Expanded, Light/Dark, reduced motion, source return, explicit map tile consent, Pro denial, finite games and calendar date semantics. Existing full reciprocal reveal, content authorization and source navigation tests remain cumulative.

### Actual implementation evidence

Final local acceptance on the completed runtime: **43 browser journeys passed**, with zero configured local retries (`acceptance-results/.last-run.json`: `passed`, no failed tests). The affected Web unit suite passed **2353 tests** with two pre-existing configured skips and external networking disabled; after the final visual adjustments the focused calendar/map/games/settings/story checks passed **111 tests**. Build, typecheck, format, scoped lint, Ruff/mypy, engineering-language tests and canonical API-client drift checks passed. PostgreSQL acceptance runs in CI; local unavailability is not reported as a passed database test.

| Surface | Compact evidence | Expanded / additional evidence |
| --- | --- | --- |
| Wir without recaps | [360 Light](evidence/wir-without-recaps-360-light.webp), [390 Dark](evidence/wir-without-recaps-390-dark.webp), [430 Light](evidence/wir-without-recaps-430-light.webp) | [1280 Dark](evidence/wir-without-recaps-1280-dark.webp) |
| Eure Geschichte | [Voluntary story metrics](evidence/wir-optional-statistics-390.webp) | Canonical filtered links retained; token-sized icons and unbroken labels |
| Eure Woche | [390 Light](evidence/insights-week-390-light.webp) | [320 Dark / 200%](evidence/insights-week-320-dark-200pct.webp), [1280 Light](evidence/insights-week-1280-light.webp) |
| Profile without Passport | [360 Light](evidence/profile-without-passport-360-light.webp), [390 Dark](evidence/profile-without-passport-390-dark.webp), [430 Light](evidence/profile-without-passport-430-light.webp) | [1280 Dark](evidence/profile-without-passport-1280-dark.webp), [320 Light](evidence/profile-without-passport-320-light.webp), [large text](evidence/profile-without-passport-390-dark-large.webp) |
| Saved-memory map | [360 Light](evidence/memory-map-360-light.webp), [390 Dark](evidence/memory-map-390-dark.webp), [430 Light](evidence/memory-map-430-light.webp) | [1280 Dark](evidence/memory-map-1280-dark.webp) |
| Five playable games | [390 Light](evidence/games-390-light.webp) | [1280 Dark](evidence/games-1280-dark.webp) |
| Calendar handoff | [Dated Plan](evidence/calendar-plan-390-light.webp) | File content, escaping/folding, all-day/instant/leap/DST cases covered |

All screenshots use synthetic couple fixtures. Map tile pixels are deliberately synthetic and intercepted: these screenshots prove composition, markers, attribution and source navigation, not live provider availability or real geography. No private provider data or user photos were used.

The completed 43-case run covers source return, optional statistics toggling, Profile removal plus More discovery, retained Free Passport playback, Pro-only editing, reduced-motion pause, explicit tile consent, Pro denial, finite game skip/finish/restart/exit and calendar handoff. Earlier local runs during source refinement were not used as final acceptance. Legacy Profile/Wir entry expectations and the playback test's Pro-editing fixture were corrected to the requested product contract; no assertions, timeouts, privacy checks or CI gates were relaxed. No manual GitHub workflow rerun was used.

The endpoint is also registered in the central endpoint-isolation matrix, adding its anonymous, foreign/invented and malformed-Space negative cases. The completeness assertion passes against the complete generated OpenAPI contract. The initial CI run exposed that missing registration; the map-specific database acceptance and the other integration shards passed, and the registration is corrected with fresh checks on the new source.

The older full-home browser spec is aligned with the explicitly removed surfaces as well: eight overlapping retired monthly-carousel/caption cases are replaced by three one/two/three-photo source-retention and recap-absence cases. The retrospective presentation/dismissal case now proves removal across Compact/Expanded and themes. Existing source uniqueness, focal content, current navigation, hierarchy, focus, reduced motion, 320px/200% reflow and axe assertions remain. All **23 updated full-home browser cases passed locally**; its inventory disposition remains Full Regression. No failure was hidden with a weaker timeout, tolerance or retry.
