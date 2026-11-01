# Journal and relationship-surface acceptance (#1570)

These are actual Chromium captures with synthetic couple fixtures. The map tiles
are intercepted synthetic pixels, not real geography or provider-availability
proof. Thumbnails use the repository's authorized demo image; no user's private
photos or production service was accessed. The generated composition reference
remains under `references/journal-map-polish/` and is not runtime evidence.

## Journeys and visual evidence

- Three peer modes, Diary filter beside the first month, no overview avatars,
  retained type/year through Map and back, keyboard End retaining focus:
  [Diary, 390 Dark](diary-filter-month-390-dark.png).
- Photo-circle marker, count badge, photo/source list, canonical detail and
  selected-place return: [360 Light](memory-map-360-light.png),
  [390 Dark](memory-map-390-dark.png), [430 Light](memory-map-430-light.png),
  [1280 Dark](memory-map-1280-dark.png). Location lists:
  [360 Light](memory-map-places-360-light.png),
  [390 Dark](memory-map-places-390-dark.png),
  [430 Light](memory-map-places-430-light.png),
  [1280 Dark](memory-map-places-1280-dark.png).
- Explicit appearance overriding the opposite OS scheme, live System changes
  without reloading the map or its preview, image dimensions constrained against
  Leaflet's intrinsic-width reset, glass navigation and reduced-transparency
  fallback: [Light](map-explicit-light-390.png),
  [Dark](map-explicit-dark-390.png).
- Tile-error fallback, source opening, 320 px / 200% text, reduced motion and axe:
  [provider-independent browsing](memory-map-320-dark-large-tile-error.png).
- Own activity request scope, older page, canonical source and return with
  `scope=own`, then shared feed without cache mixing:
  [Own activities](own-activities-390.png).
- One speech-bubble icon on the photo, focus into the existing composer, one POST,
  confirmed comment and restored trigger focus; text-only content uses the same
  icon/task inline: [photo comments](photo-comments-390.png).
- Profile omits Pro information; its old anchor and current discovery entries
  resolve to Settings > App and Account:
  [Pro information](pro-app-account-390.png).

The tests exercise actual production components and canonical routes. Existing
retrospective source/dismissal and all three comment parents' create/offline
mutation journeys remain covered. Physical-device acceptance and a live tile
provider are not claimed.

## Validation

- Full Web run: 2,423 passed, two pre-existing skips. After the final bounded
  preview/focus changes: 95 focused tests passed, including photo-failure fallback,
  task-origin allowlisting, held-route keyboard behavior and comment ownership.
- Browser journeys: four new relationship-surface cases; six map cases across
  Compact/Expanded, Light/Dark and 320 px large text; 17 retained retrospective
  and comment create/offline cases passed. No test retries, delays or relaxed
  assertions. The old avatar/two-mode/profile-Pro assertions were updated for
  the explicit Product Owner decision. Ambiguous map test selectors now scope
  the equivalent location list because map markers have proper accessible names.
- Backend non-integration run: 1,094 passed and 24 existing environment-dependent
  skips. One environment-only S3 factory failure required the scratch runtime's
  optional `socksio` package; its isolated recheck passed. PostgreSQL integration
  checks for daily rotation/shared-only selection, map photo authorization and
  Own activity pagination/cursor binding require GitHub CI.
- Production Web build, typecheck, changed-file formatting/lint, semantic-token
  and PWA checks, OpenAPI drift, regenerated client, focused Mypy/Ruff, identity
  scan (zero MUST_RENAME) and engineering-language audit passed. Existing lint
  warnings and bundler directive/chunk notices remain.
- OpenAPI Generator 7.24.0 ran with the repository's unchanged TypeScript config.
  Local browser runs use scratch Chromium 153. The pinned browser download was
  truncated in this environment; an initial serverless single-process launch
  closed later contexts. Final runs use fresh standard multiprocess contexts,
  with ordinary browser security settings and no repository browser-pin changes.

CI status on the actual pushed commit is recorded in PR #1568. The PR stays draft;
this task does not merge or publish a release.
