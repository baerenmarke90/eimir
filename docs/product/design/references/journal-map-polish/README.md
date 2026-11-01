# Journal, map and relationship-surface polish

## Preflight

Baseline main: `921f5eb4c80cff165a005691306d782b1266f13a`.
Continuation: PR #1568, duration source `73937ed8ed7aa7486e3978eed1eaa1c949fa3199`.

[Generated reference board](preflight.png), produced before UI implementation.
The board guides hierarchy only. Existing privacy, map markers, attribution,
route contracts, icons and actual available features remain authoritative;
illustrative photographs, thumbnails and decorative controls are not new
runtime requirements. No legacy SideBySide source is needed: eimir already owns
an authorized retrospective selection, gallery and comment lifecycles.

Reviewed destination sources: StoryProductPage, StoryList, MemoryMapPage,
PlaceMapCanvas, TodayPage/todayComposition and dashboard/service.py,
MemoryPhotoGallery/MediaGallery, CommentsPanel, ProfilePage, SettingsPage,
M4ProductPages and engagement/service.py. Current R2/R4/R5, Screen Templates
3/4/8 and the existing Detail template govern this slice.

## Mobile interaction contract and implementation decisions

- Three compact peer modes share the Momente header: Memories, Diary and Map.
  Keep the canonical `/story/map` route and existing map selection/detail links.
  Tab navigation remains named, keyboard-operable, and preserves Diary filters.
- Place Diary's existing filter button next to its first visible month heading;
  retain a reachable fallback when empty/loading/error has no month heading.
  Existing browsing links, filters, loaded range and task return remain.
- Remove author avatars only from Discover/Diary overview content; preserve
  author identity in details, activities, comments and other domain surfaces.
- Follow the existing resolved theme for the shared Leaflet tile pane and
  controls, including explicit Light/Dark overriding system preference. Reuse
  OSM tiles and attribution without a new provider, setting or request stream.
- Use token-owned translucent navigation coverage and backdrop blur, with an
  opaque fallback when the browser cannot blur or requests reduced transparency.
  Preserve measured safe-area clearance, labels, selected state and targets.
- Make the existing authorized retrospective eligible daily, with a bounded
  date-seeded selection of historic shared Memories/Heart Moments/Milestones.
  Keep anniversary preference, authorization, sensitive-media handling and
  no-duplicate composition. A daily stable choice avoids reshuffling on reads.
  This PO decision supersedes the old one-weekday fallback/partner-signal-first
  product rule for the retrospective slot; no legacy code is copied.
- Keep comments attached to the whole moment, with the existing list, editor,
  versioning, permissions, offline behavior and write ownership. Use one named
  speech-bubble symbol on a photo beside reaction controls, or beside text when
  there is no photo. It opens the existing composer; no per-image comment model
  or second mutation lifecycle is introduced. Preserve drafts and focus.
- Move Pro information from Profile into Settings > App and Account, with
  localized concise groups describing only current authoritative capabilities.
  Keep one Space entitlement for both partners and retained-content semantics.
- Add a server-filtered Own activity scope alongside the existing curated shared
  feed. Filter before pagination; bind cursors/cache keys to viewer and scope.
  Preserve target authorization and account/Space isolation. Put scope in route
  state so detail return restores it; show a truthful Own empty state.

Compact starts at 360/390/430 px; Expanded retains the same hierarchy. Verify
Light/Dark, live System changes, long text/200% scaling, keyboard tab navigation,
map selection, detail/return, empty/error/offline, filter save/cancel, comment
create success/error and scope pagination. Reuse current motion primitives;
reduced motion keeps all actions and feedback.

## Reuse, business and quality review

No new provider/dependency: reuse Leaflet/OSM, CSS backdrop-filter with fallback,
existing semantic token adapters, segmented controls, ShortTaskSheet, authorized
Dashboard selection, CommentsPanel and Activity projection/cursor codec.
Browser and platform capabilities are sufficient; no custom map/network service.

Business/freemium impact reviewed: relationship context, history, comments and
activities remain Free/Core. Memory-map access retains its current Pro boundary;
Pro information merely moves. No entitlement, storage, quota, retention,
downgrade, provider fee, Cloud/Self-Hosted parity or existing-data rule changes.

Relevant cross-cutting work: i18n/contrast/semantics/focus and reduced transparency;
bounded SQL selection; server actor filtering and scope-bound cursors;
OpenAPI/client regeneration; no new private payload in logs, URLs or storage;
existing comment resource/task ownership. No native build or release is in scope.

## Evidence

Implementation evidence and exact validation results will be added after the
bounded changes are complete. The generated board is not runtime evidence.
