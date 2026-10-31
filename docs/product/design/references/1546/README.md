# Relationship surfaces, games, calendar and saved-memory map (#1546)

Product Owner scope clarification: remove only the Wir action labeled “Alle Rückblicke”. Monthly highlights, date-specific retrospectives, their personal settings and the monthly slideshow invitation remain. Also align Eure Geschichte and Eure Woche, remove the duplicate Passport entry from Profile, finish the game shelf, hand dated Plans to a calendar and add a Pro memory map. Requested delivery is a merge-ready PR; merge/release is not authorized by this task.

## Design preflight

Baseline main: `ef2c412a6c5fbdb253efe746066831faeece1638`.
[Owning issue and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/1546).
The generated whole-screen [Compact reference](generated-reference.webp) was linked in the issue before UI work, using the existing blue/periwinkle shell and actual destination screens. The PO subsequently clarified that only the action labeled “Alle Rückblicke” should be removed. The initial reference's broader Wir removal proposal is superseded by that clarification. Existing monthly highlights, retrospectives and slideshow behavior are restored from the reviewed main baseline; this correction introduces no new layout or component.

The image is a composition guide, not a replacement domain model: actual Story metrics remain Memory/HeartMoment/Milestone; discrete vibes, profile fields, dates and privacy follow existing contracts. No GPS button, invented analytics, photo assets or illustrated chart values ship from the generated reference.

Product Reference v1 R2/R3/R4/R5 governs. Reuse PageHeader, EimirIcon, UiState/ProblemState, TaskOrigin, generated clients, semantic surfaces and motion, owned Object URLs and the existing lazy Leaflet canvas. The map's equivalent location/source list remains usable without external tiles. Co-located Memory links are grouped without changing stored Places. Other nearby points remain individually selectable; this is not a heatmap or inferred itinerary. Pagination is explicit and bounded. All loaded locations can be found through the equivalent list.

Wir keeps daily rituals, focal content, upcoming plans, contextual signals, date-specific retrospectives, pinned lists, monthly photo/text highlights, monthly slideshow invitations and the quiet recent trace. Only the archive link labeled “Alle Rückblicke” below a ready monthly invitation is removed. “Jetzt ansehen”, playback/source return, the empty-state discovery link and the library's own Back navigation retain their behavior. Monthly visibility and ordering preferences remain fully available. Profile removes only its duplicate Passport entry; More continues to open the Passport library.

Games retain the existing three flows and add two finite authored sofa sessions: optional small missions and shared memory conversation prompts. Both require two current partners, support skip, finish, restart and exit, keep no answer history and never invent source memories or relationship scores. No new runtime provider/dependency.

## Weekly AI implementation

The explicit PO follow-up authorizes deeper weekly analysis and recommendations. The [weekly AI contract and generated preflight](weekly-ai.md) were linked in #1546 before this extension's UI work. The existing charts, week picker, tabs, observations and recap action remain in place.

The server derives comparable joint observations over up to eight weeks. Only dimensions with an own value and a currently VISIBLE partner value contribute. Sample thresholds cover weekly comparisons, repeated weekday/weekend differences and differing Vibe selections. Notes, names, photos, raw daily rows and hidden participation do not enter the model packet.

The existing operator-local model selects supplied observation/recommendation IDs through a bounded schema; canonical localized wording renders the result. It cannot invent prose, numbers, causes, diagnoses or relationship scores. Sparse data skips inference and explicitly presents general ideas. Missing configuration, contention, timeout and invalid output retain the deterministic fallback. Generation requires a deliberate action; GET/focus/polling never triggers inference.

Results stay ephemeral and tied to instance/account/Space/week plus a fresh evidence revision. Post-inference authorization and revision checks reject changed inputs; client revalidation hides obsolete results. Caller-private feedback excludes or prioritizes catalog entries for that caller only. Confirmed writes, clearing, offline errors and context changes are handled without replaying inference. A Free downgrade retains preferences and offers an explicit Core action to clear them.

## Calendar semantics and limits

Use [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html) with TEXT escaping, UTF-8 line folding, CRLF, stable Space/Plan UID and version. Date-only schedules stay all-day DATE with an exclusive next-day end; exact instants stay UTC and unknown end times remain unknown. No current date, guessed time zone or invented one-hour duration.

The explicit action shares a calendar File when supported or downloads it for import. This is a **one-time copy**, not an authenticated subscription or automatic sync. The product states that limitation. No credentials, external account, public bearer feed or automatic calendar write. Calendar-app acceptance on physical devices remains separate from Web serialization and browser handoff evidence.

## Reuse, business and privacy

The matrix records `memories.map` as Pro per the explicit PO follow-up; it is Space-owned and server-enforced. Basic Places, coordinates, direct maps and source memories remain Core, including after downgrade. Calendar handoff is Core; existing games/weekly insights/Passport retain their capabilities. The map/calendar/game changes add no persistence. The authorized weekly follow-up adds migration 0095 for at most six recommendation preferences per account and Space; no analyses or check-in content are copied into it.

Leaflet BSD-2-Clause and the existing OSM tile integration are reused. Current primary sources checked: [Leaflet reference](https://leafletjs.com/reference.html), [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/). Attribution remains visible, `referrerPolicy: origin`, no prefetch/offline tile packs and no tile request before explicit load. The provider receives IP/origin/viewport; memory titles, photos and source IDs stay local. Cloud/Self-Hosted use the same behavior, without a new paid provider or required user setup. The equivalent list is the provider-independent fallback.

Map reads apply the shared readable predicate to both Memory and Place plus the canonical same-Space relation. Cursor binding includes collection/Space; no private-derived totals, persistent map cache, tracking, GPS request or new events. Existing writes invalidate the map through shared Story/Place invalidation. The response is `Cache-Control: no-store`. Capability loss or context denial hides stale results.

## Verification

Evidence and exact test results are recorded in the PR. Actual-browser screenshots in `evidence/` use synthetic fixtures; the generated preflight is not implementation evidence. Cover Compact 360/390/430, Expanded, Light/Dark, reduced motion, source return, explicit map tile consent, Pro denial, finite games and calendar date semantics. Existing full reciprocal reveal, content authorization and source navigation tests remain cumulative.

### Actual implementation evidence

The earlier PR validation covered the additional map, games, calendar, profile, story and weekly surfaces. The clarified Wir correction restores the existing main implementation and its original regression cases. Current source validation and exact CI results are recorded in the PR; earlier green commits are not used as proof for this corrected revision.

| Surface | Compact evidence | Expanded / additional evidence |
| --- | --- | --- |
| Wir monthly slideshow without the archive action | [360 Light](evidence/wir-monthly-slideshow-360-light.webp), [390 Dark](evidence/wir-monthly-slideshow-390-dark.webp), [430 Light](evidence/wir-monthly-slideshow-430-light.webp) | [1280 Dark](evidence/wir-monthly-slideshow-1280-dark.webp) |
| Monthly photo/text highlights retained | [390 Light](evidence/monthly-highlights-390-light.webp) | [390 Dark](evidence/monthly-highlights-390-dark.webp) |
| Eure Geschichte | [Voluntary story metrics](evidence/wir-optional-statistics-390.webp) | Canonical filtered links retained; token-sized icons and unbroken labels |
| Weekly AI and private feedback | [360 Light](evidence/weekly-ai-360-light.webp), [390 Dark](evidence/weekly-ai-390-dark.webp), [430 Light](evidence/weekly-ai-430-light.webp) | [1280 Dark](evidence/weekly-ai-1280-dark.webp), [320 Dark / 200%](evidence/weekly-ai-320-dark-200pct.webp), [sparse / failed feedback](evidence/weekly-ai-sparse-error-390.webp) |
| Eure Woche | [390 Light](evidence/insights-week-390-light.webp) | [320 Dark / 200%](evidence/insights-week-320-dark-200pct.webp), [1280 Light](evidence/insights-week-1280-light.webp) |
| Profile without Passport | [360 Light](evidence/profile-without-passport-360-light.webp), [390 Dark](evidence/profile-without-passport-390-dark.webp), [430 Light](evidence/profile-without-passport-430-light.webp) | [1280 Dark](evidence/profile-without-passport-1280-dark.webp), [320 Light](evidence/profile-without-passport-320-light.webp), [large text](evidence/profile-without-passport-390-dark-large.webp) |
| Saved-memory map | [360 Light](evidence/memory-map-360-light.webp), [390 Dark](evidence/memory-map-390-dark.webp), [430 Light](evidence/memory-map-430-light.webp) | [1280 Dark](evidence/memory-map-1280-dark.webp) |
| Five playable games | [390 Light](evidence/games-390-light.webp) | [1280 Dark](evidence/games-1280-dark.webp) |
| Calendar handoff | [Dated Plan](evidence/calendar-plan-390-light.webp) | File content, escaping/folding, all-day/instant/leap/DST cases covered |

All screenshots use synthetic couple fixtures. Map tile pixels are deliberately synthetic and intercepted: these screenshots prove composition, markers, attribution and source navigation, not live provider availability or real geography. No private provider data or user photos were used.

The original monthly-highlight carousel/caption/source tests, retrospective presentation/dismissal tests, full visible settings order and visibility checks are restored. The full-home inventory now records its actual 28 cases and keeps its Full Regression disposition. The ready monthly invitation tests additionally prove that “Alle Rückblicke” is absent at 360/390/430/1280 while “Jetzt ansehen”, the real cover, period/status and accessibility remain. Playback still opens from Wir and returns there after completion; the Pro editing fixture remains explicitly Pro.

The map endpoint is registered in the central endpoint-isolation matrix, including anonymous, foreign/invented and malformed-Space cases. No backend, entitlement, storage or provider behavior changes in this Wir correction. No timeout, retry, assertion tolerance or CI gate is relaxed.

Corrected local acceptance: **142 component/composition tests passed**, with typecheck, formatting, inventory and **26 engineering-language tests** passing. **Eight targeted browser cases passed without configured retries**: the ready monthly invitation at four evidence widths without its archive action, full playback/source return, reduced-motion playback/editing, monthly photo/text highlights and date-specific retrospective dismissal. The original 28 full-home cases and complete settings regressions are restored for fresh CI. Local pinned-browser download/startup and multi-case cleanup attempts were not accepted as completed product checks; the final targeted cases use isolated Chromium 153 executions with extracted software-rendering support. Repository browser pins, dependencies, timeouts, assertions and retry gates remain unchanged.
