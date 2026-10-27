# Automatic photo places: implementation evidence

Owning issue: #1459. Current-main integration baseline: `e54fe0b843fa8e774d600d1bb71bba71ddd5a4a4`. UI source: merge commit `5ba2f198d8f5d2676c8b7a2b83e68f135574d2f0`; subsequent runtime edits concern backend place-name localization and clearing stale map links after location correction.

The generated references and exact built-in Imagegen prompts live one directory above. The original preflight was published before UI implementation; the second reference accounts for the subsequently merged diary composition and the owner's metadata-retention decision.

## Real browser evidence

- `settings-360-light.png`, `settings-390-dark.png`, `settings-430-light.png`, `settings-1280-dark.png`: actual default-on account setting, same bounded utility composition across sizes/themes.
- `settings-320-large-text.png`: 320 CSS px at 200% root text. The shared switch now scales/wraps without track overflow or forcing the description into an unusably narrow column.
- `memory-390-light.png`: current unframed diary reading composition, original content/gallery, quiet canonical place section, tertiary controls, comments and attribution.

`photo-locations.spec.ts` plus the current `memory-create-defaults.spec.ts`: **23/23 passed** after integrating main. The seven feature cases exercise settings load → switch off → return to index → reopen → persisted off → switch on; confirmed-state retention after failed writes and deliberate retry; precise Maps URL generation; manual short-link correction; relation removal; no automatic provider requests; 360/390/430/1280, Light/Dark, reduced motion, 320/200% reflow, and no serious/critical axe findings on the setting. The additional diary journeys cover file selection, localized dates/titles/tags, confirmed result, draft recovery, expired-upload replacement, uncertain create identity and retry of only a known-created entry's association.

Browser API responses are synthetic fixtures. Real PostgreSQL and encoded-image tests below prove server behavior separately; browser screenshots are not presented as live-instance persistence or physical Android evidence. No native capability or permission was added; Capacitor consumes the same shared UI.

## Backend, data and build evidence

- **19/19 final PostgreSQL feature cases**: actual encoded GPS ingest/binding, grouping nearby photos while retaining distant source coordinates, current preference at both stages, manual precedence, idempotent repeated gallery writes, explicit removal, private/shared boundaries and later sharing, foreign-Space denial, metadata retention independent of association, clean unrelated uploads, PERSONAL export without partner-preference disclosure, safe stored share URLs, and clearing stale URLs after coordinate correction while preserving URLs on renaming.
- A broader PostgreSQL regression covered attachment binding, Places, typed relations and transfer. Its only failure was a new test using PUT instead of the existing PATCH visibility route; the corrected feature file passes in full.
- **115/115 final backend contract/media/Immich tests passed**, including the explicitly updated closed API surface and upload-field contract. The earlier broad unit run had 816 passes and four outdated contract assertions; all affected files passed the final recheck.
- **105/105 final Web unit/component tests passed** across the changed flows, route registry, map-link parser, preference failure/stale-account ownership and existing capture/detail consumers. The earlier broad Web run had 2,131 passes, one existing skip, a route-expectation update and an unrelated DailyInsights timing failure; the corrected/isolated files subsequently passed **35/35**. Required CI remains the authority for a clean full-suite result.
- Web typecheck, production build, formatting, lint (existing warnings), token/PWA guards, and browser inventory pass. Backend Ruff, complete mypy and current OpenAPI contract checks pass. Generated clients match official OpenAPI Generator **v7.24.0** output; no generated source was edited manually.
- Alembic migration was exercised from **0086 → 0087** with an existing fixture account: default becomes true. A repeated upgrade preserves an explicitly disabled value. Only isolated temporary databases were used.

## Product and policy boundaries

The account setting is Free/Core, defaults on and introduces no per-entry confirmation or paid provider. Valid/readable EXIF and ICC metadata may remain in marked moment-photo primary files even when association is off; previews and unrelated uploads retain their clean behavior. This is an explicit Product Owner amendment recorded in ADR 0014, not a claim of blanket metadata removal. GPS never becomes generic attachment API metadata, logging, analytics or background tracking. Photos without available coordinates remain normal valid moments. Existing sanitized files are not retroactively recoverable. Stored map links are deliberate navigation; no geocoder, autocomplete, raw-URL fetch, native GPS permission or venue-name inference was added.
