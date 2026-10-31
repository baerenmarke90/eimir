# Saved-memory map refinement (#1554)

Baseline main: `08a376bb170ba420478cba6654bca6f9f764acd1`.
[Owning issue and Mobile Interaction Contract](https://github.com/baerenmarke90/eimir/issues/1554).
The [generated Compact reference](generated-reference.webp) is a composition guide created before UI implementation, using the current `/story/map` and the Product Owner screenshot. The actual implementation will retain the existing four destinations/central create action, title, grouped saved locations, bounded pagination, canonical memory links and selected-place return.

## Product decision

The Product Owner requests immediate map opening, no explanatory paragraphs above it, a plain Karte entry without its Pro suffix, and livelier memories. This supersedes #1546's additional tile-load tap for this read-only destination only. The separate place-selection composer remains outside this change. Required provider attribution and the provider-independent place/source list remain. Premium `memories.map`, Space ownership, Cloud/Self-Hosted parity, all underlying Core content and non-destructive downgrade/export behavior are unchanged. The new entry label is not a tier reclassification.

## Composition and interaction

Apply Product Reference v1 R2, content-before-chrome and create/find/return continuity. Title leads directly into the existing lazy Leaflet map after successful authorized data loading. Locations remain real, coordinate-grouped destinations. Selection reveals title-led text keepsakes with locale-aware day/month accents and the full date. Color, typography and small causal transitions supply personality without fake photos, scores or fetched per-memory previews. The map DTO contains no thumbnails; no N+1 media requests are introduced.

Compact is normative (360/390/430 and 320 reflow/large text); Expanded retains the same hierarchy. Reuse PageHeader, EimirIcon, UiState/ProblemState, AppErrorBoundary, TaskOrigin, semantic theme/spacing/type/motion tokens and native links/buttons. Use the existing disclosure motion for deliberate place selection, with no translation/scale under reduced motion. Touch targets remain at least 44 CSS px and the complete place list remains the keyboard alternative to markers.

The reference's extra chevrons, repeated place subtitles and illustrative map height are not new requirements. Implement the requested simpler hierarchy, preserve full titles and adapt the viewport to leave browsing space. Generated geography and fixture dates are illustrative; no generated imagery ships in the runtime.

## States and boundaries

- Loading reserves map space; empty/denied/error responses never load third-party tiles.
- Authorized nonempty data initializes the map without another tap; no automatic next-page traversal.
- A tile error retains usable locations and canonical memory links with the existing retry action.
- A memory opens its actual reader; return restores the selected place through TaskOrigin.
- No new provider, dependency, API/schema, persistence, analytics, GPS or background tile requests.
- Existing OSM IP/origin/viewport disclosure becomes implicit in deliberately entering the map; memory titles, source IDs and content never enter tile URLs. Attribution, origin referrer and ordinary interactive caching behavior remain.

## Evidence

The generated reference is not implementation evidence. The actual browser journeys and screenshots below demonstrate the implemented result. No separate native capability is changed.

## Implementation and verification

The implemented composition uses alternating existing rose/shared tints, title-led memory destinations, localized day/month badges and the complete date. Narrow containers and large text omit only the decorative badges. Deliberate location selection uses the shared disclosure primitive; URL restoration and ordinary query refresh do not replay it. Reduced-motion hover/press and disclosure retain the same information without travel.

The lazy Leaflet stylesheet could override the existing attribution background after other CSS had loaded. A bounded specificity correction in the shared Place map stylesheet makes the semantic theme background independent of import order, restoring Dark contrast for both map consumers. No provider/Leaflet behavior or picker consent flow changes.

Local validation:

- Production build, TypeScript, token and PWA checks passed. Existing bundle-size and dependency directive warnings remain.
- 24 focused tests passed across MemoryMapPage, PlaceMapPicker and TaskOrigin.
- Eight browser journeys passed without configured retries: map at 360 Light / 390 Dark / 430 Light with normal motion / 1280 Dark, 320 Dark with 200% text and failed tiles, entitlement denial, existing games and calendar handoff. The final map-only run additionally verifies reduced-motion hover behavior.
- Browser evidence uses available Chromium 153 with an external scratch configuration. The repository-pinned Chromium 151 download returned a truncated archive; no repository dependency, browser pin, timeout or retry gate was changed. CI with the repository browser remains a pre-merge requirement.
- The added 320px scenario found actual heading reflow and late-loaded attribution contrast failures; both were fixed before successful reruns. Assertions were not weakened. No remote CI retries occurred.
- Biome checks, engineering-language audit, diff checks and the browser inventory passed. The new case remains PR-critical (eight cases in this spec).

All actual browser screenshots use synthetic titles/dates/locations and intercepted tile images. Their synthetic green map pixels demonstrate viewport/marker/attribution composition, not real geography or live OSM availability. No user photo or original private screenshot is included in the implementation evidence.

### Evidence

| State | Actual browser evidence |
| --- | --- |
| Place selection / Compact | [360 Light](evidence/memory-map-places-360-light.webp), [390 Dark](evidence/memory-map-places-390-dark.webp), [430 Light](evidence/memory-map-places-430-light.webp) |
| Selected memory destinations | [360 Light](evidence/memory-map-360-light.webp), [390 Dark](evidence/memory-map-390-dark.webp), [430 Light](evidence/memory-map-430-light.webp) |
| Expanded | [Locations](evidence/memory-map-places-1280-dark.webp), [Memories](evidence/memory-map-1280-dark.webp) |
| Failed tiles / 320px / 200% text | [Dark](evidence/memory-map-320-dark-large-tile-error.webp) |

### Preflight publication chronology

The generated reference and local design record were completed in `b728ab81afbea5725aeff47e82dab3b0a2680e93` before UI implementation in `00b12ef06065cd76b5db8668cfa0b04c68230138`. Their initial publication was blocked by automatic approval review. The Product Owner explicitly authorized publishing the branch, reference and test images and merging after successful required checks. The generated reference is attached to #1554 with that publication; its earlier creation and the delayed issue attachment remain traceable rather than being described as a completed pre-code issue attachment.
