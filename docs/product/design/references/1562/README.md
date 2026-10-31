# Independent couple experiences and quieter Wir settings (#1562)

## Product Owner request and current baseline

Promote Glücksmomente and Zeitreise from Games into independent features. Also simplify Settings → Wir: remove Edit shortcuts for Daily Quote and relationship statistics, retain one statistics opt-in in the upper ordering list with a Pro badge, and replace the drag frame with a quiet hover-like emphasis.

Baseline main: 850ab01c81fb9f2bed57bc54d8a8cf794508ffea. Inspected StoryProductPage, GamesProductArea, LocalCoupleGame, App routes, settings composition, dashboard module order/visibility, useWirStatistics and quote preferences.

## Product Design Preflight / Mobile Interaction Contract

Product Reference v1 R2/R3 and Detail View/short focused task. Momente retains its map action, Discover/Diary tabs, current authored-content hierarchy and navigation. Add two quiet named entry links in Discover without replacing existing content. Each opens its own canonical route (/story/happiness, /story/time-travel), a content-led finite experience with one prompt at a time, deliberate next/skip/restart/finish, and normal Back to Momente. Remove those two entries from Games, which retains its other three games. No score, answer fields, streaks or required completion. Six existing authored prompts per experience remain intact. Back and forward use actual route history; entry does not erase the Momente tab/scope/position. Session state remains in memory and clears on context/entitlement loss.

Compact 360/390/430 is primary; Expanded shares the same bounded reading surface. Reuse PageHeader, EimirIcon, ProMark, semantic token roles, ProblemState, existing participant loading and prompt-session behavior. Preserve 44px targets, wrapping, focus on the current prompt and reduced motion. Loading, unavailable Pro, no second partner, request failure and retry are explicit. No claimed offline write or durable answers.

Settings retains the existing ordered list/handles and separate Daily Quote source preferences. Replace Edit jumps with actual row controls. The statistics row must use the existing personal Pro-controlled useWirStatistics preference rather than the intentionally retired shared_story_summary visibility flag. Remove the duplicate lower statistics section. Retain quote's own preference semantics. Dragging uses a subtle surface change without border/outline/elevation; ordinary keyboard focus remains visible.

Generated full-composition Compact visual reference will be attached here before feature UI implementation.

## Reuse-before-build

Reuse React Router canonical routes, the existing two authored prompt collections, finite session behavior, participant loader, entitlement boundary, token adapter and current reordering primitive. No new provider/dependency/platform infrastructure. Avoid copying either feature or building a second session engine. Native Android/Kotlin is outside this slice; canonical Web UI is packaged unchanged.

## Business/freemium impact reviewed

These two existing Pro experiences retain games.couple as their existing shared entitlement, now exposed independently from the game catalog; this is a navigation/product presentation extraction, not a new paid capability or changed price. Explicitly clarify the authoritative matrix's existing Premium games/experiences row. Both current partners and Cloud/Self-Hosted keep the same eligibility. Statistics remains relationship.passport Pro; Daily Quote remains daily.quote. No new backend data, provider/inference cost, quota, retention, export or downgrade semantics; revocation hides the session and retains existing authorized data/preferences.

## Cross-Cutting Quality

No new answer collection, storage, logs, telemetry, AI or memory access. Only existing entitlement and two-partner reads. Scope query/session identity by instance/account/Space. Fail closed on authorization/grant failures. Preserve local-only statistics consent and quote server ownership. Screen-reader/keyboard controls, localized copy, focus, reduced motion and long-text reflow are part of implementation. Validate direct links, game-catalog removal, finite sessions/skip/restart/exit, Free/Pro/error states, Momente return and persistence/serialization of existing settings. Visual browser evidence must reflect the final source.

## Generated reference, before UI implementation

![Generated Compact reference](generated-reference.webp)

Generated with built-in Imagegen before feature UI implementation. The prompt preserves the existing Momente map/tabs/Discover story, four named dock destinations and plus, adds two named experience entries and illustrates their existing first prompts plus the requested settings correction. It uses the current periwinkle/blue tokens and avoids game scores, forms and recording. Generation approximates typography, icon details, names of unrelated settings and exact spacing; these are not new requirements. Current runtime labels and supported source/category controls remain authoritative. The invented switch appearance is illustrative; reuse current accessible controls. No decorative divider, shadow or border is required by the image.

Expanded keeps the same reading/action sequence with bounded line length. Full runtime Compact/Expanded, Light/Dark and large-text evidence will be added after implementation. Neither the generated image nor browser transport mocks prove real Android calendar save/cancel behavior.
