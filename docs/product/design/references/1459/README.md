# Automatic photo places — implementation preflight (#1459)

Baseline: current main `3b6d51d06f91a030b0cf51c2e7ff4ecff374b82d`, inspected before generating this reference on 2026-10-27.
The older issue reference at `4ec19998` remains historical preflight. This reference updates the actual destination screens.

![Compact whole-screen composition](compact-current.png)

## Inspected product and mobile interaction contract

R5 utility owns Settings index → Memories → Automatically add places. R1/R2 owns the saved Memory and shared HeartMoment reading result. Reuse SettingsIndex, PageHeader, PreferenceSwitch, StoryDetailPageShell, canonical Place detail/edit, labeled links, ShortTaskSheet, inline error/status and semantic tokens. Preserve the existing settings categories, shell/More navigation, personal photo/prose/date/edit/tags/comments/provenance and protected private visibility.

The photo and authored words remain the focal content. Places appear as quiet secondary context after content. Open the canonical Place to correct its name/coordinates; remove only the association through a contextual action. An explicit external map link uses the coordinates and makes no request on viewing. One person can complete everything alone; partner participation is optional reading, with no bilateral confirmation or score.

Compact is primary (320/360/390/430); Expanded keeps the same constrained reading width and hierarchy. No table, map dashboard or nested cards. Back follows category → settings index → More; detail/edit return retains the original moment. No automatic keyboard. The immediate switch waits for authoritative account state, disables while pending, announces confirmation, keeps the confirmed value on failure, refreshes conflicts, and blocks offline writes. Empty GPS is ordinary absence. Loading, error/retry, offline and success remain inline. Keyboard names/focus, text reflow, Light/Dark and reduced motion reuse existing contracts; motion never conveys the only state.

The generated composition is guidance: preserve the runtime More navigation highlight and current plain Settings rows (do not copy decorative generated row icons). The switch is default ON, so final copy explicitly describes automatic behavior and that OFF affects future photos. The image's illustrative optional phrasing is not the final product copy.

## Reuse review

### Alternatives considered
Pillow's existing EXIF/GPS decoder; EXIF standards; native picker metadata; browser geolocation; reverse-geocoding/map SDK services; Google Maps universal URLs.

### Selected solution
Reuse Pillow (already adopted, permissive HPND), the existing sanitized upload pipeline, canonical Place CRUD and typed same-Space relations. Use an ordinary explicit Google Maps URL (official API=1 coordinate format, no API key or SDK). No added dependency, daemon, provider account, inference or recurring API charge. Cloud/Self-Hosted behave identically. OS selection supplies only the user-selected files; no location permission or tracking.

Primary sources reviewed 2026-10-27: https://pillow.readthedocs.io/en/stable/reference/ExifTags.html and https://developers.google.com/maps/documentation/urls/get-started. Maps opens only after deliberate activation; the provider then receives the selected coordinates under its own terms. Fallback is readable canonical coordinates and editable Place content. No tile caching, API credentials or third-party asset attribution is introduced.

### Custom implementation
Only domain consent, protected transient staging, atomic association, manual precedence and privacy/lifecycle policy need project code. Do not write a second EXIF parser or geocoder.

## Business/freemium impact reviewed
Automatic extraction and basic Place creation/linking are Free/Core, identical in Cloud and Self-Hosted. The existing Mixed Place row keeps advanced journey/clustering/heatmap analytics Premium; batch-local coordinate deduplication is only ingest normalization. Source selection remains independently Pro for Google/Immich. No entity micro-limit, new managed provider cost or destructive downgrade behavior.

## Cross-cutting contract
Account-global default ON; check the server state during extraction and binding. OFF invalidates pending metadata and affects future work only; never delete existing Places/links. Never auto-share GPS from private HeartMoments, including later sharing. Manual edits, links and removals win. No inference for missing GPS. Validate finite/range-safe pairs, sanitize original/thumbnail EXIF, retain coordinates only in protected owner-only staging until shared commit, exclude it from generic attachment APIs/export/logs/events, and consume it atomically with typed relations. Preserve same-Space checks, idempotent retries, lifecycle cleanup, portable canonical Places and explicit navigation.

Generated image: original project workflow asset (ImageGen); no separate public license grant. It is design guidance, not runtime acceptance evidence.
