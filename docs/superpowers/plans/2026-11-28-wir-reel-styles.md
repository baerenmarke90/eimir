# Wir reel styles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each person can choose under Settings › Darstellung how the Wir reels for new-for-you notices and waiting games look: Kreise (Free, default), Kacheln (Pro) or Chips (Pro).

**Architecture:** The style is a new personal appearance choice on `app_icon_preferences`, next to `memory_world`. It has its own GET/PATCH, a server-side `theme.bespoke_packs` check and an entry in the export. The Web mirrors the memory-world state (context, ETag, device cache) and the settings sheet. Both Wir modules render one of three presentations from their existing item models.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, pytest (backend); React, TanStack Query, vitest, Playwright, Biome (web); generated TypeScript client via `tools/openapi/generate.sh` (Docker).

**Spec:** `docs/superpowers/specs/2026-11-28-wir-reel-styles-design.md`

## Global Constraints

- Style ids: `circles`, `tiles`, `chips`. Default and only Free style: `circles`.
- Capability for `tiles` and `chips`: `theme.bespoke_packs`. A saved Pro style stays effective after expiry. Returning to `circles` is always Free.
- The choice is personal to the Account within its Space: never shared with the partner, included in the personal export, purged with the Account.
- User-facing names: de `wirReelStyleSettings.title`, styles "Kreise", "Kacheln", "Chips"; en "New for you & Your turn", "Circles", "Tiles", "Chips". All text goes through i18n (`web/src/i18n/locales/*.ts` for de, `en.json` for en).
- Reusable visual values are semantic tokens. Chips have a tinted fill and no border. No table or row look.
- Settings is the only entry point. Wir gets no link to the setting.
- English for code, comments, tests, commits and PR; `docs/FREEMIUM-FEATURE-MATRIX.md` is updated in the same PR.
- Local test recipe: backend tests with `EIMIR_TEST_DATABASE_URL` against the `eimir-pg-test` container (port 15432) or the eimir-dev Postgres; web via `node node_modules/vitest/vitest.mjs`, `tsc -p tsconfig.app.json`, the Biome exe on touched files only; e2e from `web/e2e` with `EIMIR_E2E_PORT=4391 --workers=1 --trace off`. Convert touched files to LF before Biome.

## Review Focus

1. A Pro style saved before Pro ended still renders on Wir after expiry, and the settings note says it is kept (T2 test `keeps a saved Pro style after Pro ends`, T3 test `notes a kept Pro style for a Free person`).
2. Changing the style in Settings and going back to the kept Wir tab shows the new style at once, with no arrival replay for seen items (T6 e2e `switching the style shows it on Wir without a reload or replay`).
3. Large text (200 %) and 360 px width: tiles and chips never push the page sideways; the reel scrolls inside itself (T6 e2e overflow assertion per style at 360 with `font-size: 200%`).
4. The server returns a style this client does not know (a newer installation): Wir shows circles and the settings show Kreise (T2 test `resolves an unknown style to circles`).
5. Saving while offline shows the offline message and leaves the style unchanged (T3 test `keeps the style and says so when offline`).

---

### Task 1: Backend preference, API and export

**Files:**
- Modify: `backend/src/eimir/appearance/models.py`. Add the `WirReelStyleId` enum next to `MemoryWorldId`, `DEFAULT_WIR_REEL_STYLE`, `FREE_WIR_REEL_STYLES`, the column and the `effective_wir_reel_style` property.
- Create: `backend/alembic/versions/0185_wir_reel_style.py`. Use the next free number after `alembic heads` at implementation time.
- Modify: `backend/src/eimir/appearance/service.py`. Add `save_wir_reel_style` and a `wir_reel_style` parameter in `_save_selection`, covering both the insert and the update branch.
- Modify: `backend/src/eimir/api/v1/appearance.py`. Add the views, the GET and the PATCH.
- Modify: `backend/src/eimir/transfer/service.py` and `backend/pro/src/eimir_pro/portability/export.py`. Add `personalAppearance.wirReelStyle` beside `memoryWorld`.
- Modify: `backend/openapi.json` via `python -m scripts.openapi_contract write`, and `backend/tests/fixtures/schema_fingerprint.json` via `python -m scripts.schema_fingerprint write`.
- Test: `backend/tests/integration/test_wir_reel_style.py`, modeled on `test_memory_world.py` and reusing its `couple` and `grant` fixture shapes.

**Interfaces:**
- Produces:
  - `class WirReelStyleId(StrEnum): CIRCLES = "circles"; TILES = "tiles"; CHIPS = "chips"`.
  - `AppIconPreference.wir_reel_style: str | None` (String 24, NULL means circles).
  - `AppIconPreference.effective_wir_reel_style -> WirReelStyleId`.
  - `service.save_wir_reel_style(session, authorization, style_id: WirReelStyleId, expected_token: str) -> AppIconPreference`.
  - `GET` and `PATCH /spaces/{spaceId}/appearance/wir-reels`:
    - operation ids `getWirReelStylePreference` and `updateWirReelStylePreference`;
    - `WirReelStylePreferenceView { style_id: WirReelStyleId, version: int }` (camelCase `styleId` on the wire);
    - `WirReelStylePreferencePatch { style_id }`;
    - ETag and `If-Match`, `Cache-Control: private, no-store`;
    - the status codes of the memory-world routes.
  - Export key `personalAppearance.wirReelStyle`, present only when a choice is stored.

- [ ] **Step 1: Write the failing tests** in `test_wir_reel_style.py`:
  - `test_circles_is_the_default_and_the_only_free_style`: `DEFAULT_WIR_REEL_STYLE == WirReelStyleId.CIRCLES` and `FREE_WIR_REEL_STYLES == {WirReelStyleId.CIRCLES}`.
  - `test_read_defaults_to_circles_and_never_creates_a_row`: GET returns `{"styleId": "circles", "version": 0}` with an ETag, and there is no row.
  - `test_circles_are_saved_without_pro`.
  - `test_tiles_and_chips_require_pro_for_both_partners`: 403 `PREMIUM_ENTITLEMENT_REQUIRED` without a grant, 200 with a grant.
  - `test_downgrade_keeps_the_style_blocks_a_new_pro_choice_and_circles_stay_free`.
  - `test_membership_scope_invalid_ids_and_required_concurrency`: an unknown id gives 422, a missing or stale If-Match gives 428/409, as in the memory-world test.
  - `test_style_shares_the_appearance_token_without_overwriting_other_choices`.
  - `test_a_style_unknown_to_this_installation_resolves_to_circles`.
  - `test_personal_export_includes_only_the_callers_style`: `wirReelStyle` appears only when stored, the partner's value never, and it is absent from the shared scope.
- [ ] **Step 2: Run them and see them fail**
  Run: `python -m pytest backend/tests/integration/test_wir_reel_style.py -q` (PYTHONPATH and `EIMIR_TEST_DATABASE_URL` per the recipe).
  Expected: collection or import errors for `WirReelStyleId`.
- [ ] **Step 3: Implement** the model, the migration (`upgrade` adds the nullable `wir_reel_style` column with a "NULL keeps the default circles" comment; `downgrade` drops it), the service, the API (Pro check `if body.style_id not in FREE_WIR_REEL_STYLES: ensure_capability(...)` after membership, as in `update_memory_world_preference`) and both export writers.
- [ ] **Step 4: Regenerate the contract and the fingerprint**
  Run: `python -m scripts.openapi_contract write` and `python -m scripts.schema_fingerprint write` in `backend`.
  Expected: `openapi.json` gains the two operations and schemas; the fingerprint gains the column.
- [ ] **Step 5: Run the new tests, `test_memory_world.py` and the contract check**
  Run: `python -m pytest backend/tests/integration/test_wir_reel_style.py backend/tests/integration/test_memory_world.py -q` and `python -m scripts.openapi_contract check`.
  Expected: all pass. The memory-world tests must still pass because they share `_save_selection`.
- [ ] **Step 6: Run `ruff format` and `ruff check` on the touched backend files, then commit**
  `git commit -m "feat(appearance): personal Wir reel style preference (#2345)"`

### Task 2: Generated client and Web state

**Files:**
- Regenerate: `web/src/api/generated` via `tools/openapi/generate.sh`.
- Create: `web/src/client/wirReelStyle.ts`, modeled on `memoryWorld.ts`:
  - type `WirReelStyle = \`${WirReelStyleId}\``;
  - `WIR_REEL_STYLES = ['circles', 'tiles', 'chips']`;
  - `DEFAULT_WIR_REEL_STYLE = 'circles'`;
  - `isWirReelStyle`, `isProWirReelStyle`, `WIR_REEL_STYLE_CAPABILITY = APP_ICON_CAPABILITY`;
  - storage prefix `eimir-wir-reel-style-v1:` with `wirReelStyleStorageKey`, `readWirReelStyle`, `rememberWirReelStyle`, `forgetWirReelStyle`, `clearWirReelStylePreferences`.
- Create: `web/src/client/wirReelStyleContext.tsx`, modeled on `memoryWorldContext.tsx`:
  - `wirReelStyleQueryKey(instance, accountId, spaceId) = ['wir-reel-style', instance, accountId, spaceId]`;
  - `WirReelStyleProvider`;
  - `useWirReelStyle()`, which returns the full state for the settings;
  - `useWirReelStyleId(): { style: WirReelStyle; pending: boolean } | null`, for the modules, in a separate memoized context;
  - after a save, invalidate `['app-icon']`, `['wir-design']`, `['person-colours']` and `['memory-world']`.
- Modify: `web/src/client/memoryWorldContext.tsx:130`. Add `'wir-reel-style'` to its sibling list.
- Modify: `web/src/client/sessionPersistence.ts:334`. Call `clearWirReelStylePreferences()` on sign-out.
- Modify: `web/src/App.tsx:1616`. Nest `WirReelStyleProvider` inside `MemoryWorldProvider` with the same props and key pattern `wir-reel-style:${apiBaseUrl}:${account.id}:${spaceId}`.
- Test: `web/src/client/wirReelStyle.test.ts` and `web/src/client/wirReelStyleContext.test.tsx`, modeled on `memoryWorld.test.ts` and `appearanceContexts.test.tsx`.

**Interfaces:**
- Consumes: the generated `AppearanceApi.getWirReelStylePreferenceRaw` and `updateWirReelStylePreferenceRaw`, and `WirReelStyleId`.
- Produces:
  - `useWirReelStyle(): { style, pending, ready, saving, capability, inspectCapability(), save(next: WirReelStyle): Promise<Snapshot> } | null`;
  - `useWirReelStyleId()` as above. It returns `null` outside a signed-in Space; modules treat `null` as circles, not pending.

- [ ] **Step 1: Generate the client.** Run `tools/openapi/generate.sh` from the repo root, then `tools/openapi/generate.sh --check`. Expected: the new models and operations exist and the check is clean.
- [ ] **Step 2: Write the failing tests:**
  - `isWirReelStyle` accepts only the three ids.
  - `isProWirReelStyle('circles') === false`; `tiles` and `chips` return true.
  - The storage round trip, and expiry after 30 days.
  - Context: `pending` is true without a remembered style until the read returns.
  - Context: a remembered `tiles` renders `tiles` at once (placeholder).
  - Context: `resolves an unknown style to circles`. The server answers `styleId: 'stripes'` and the snapshot rejects it; the state shows circles.
  - Context: `keeps a saved Pro style after Pro ends`. The server answers `tiles` while the capability is false; the style stays `tiles`.
  - Context: a save sends `If-Match` and invalidates the four sibling keys.
  - Context: a 403 `PREMIUM_ENTITLEMENT_REQUIRED` withdraws the capability.
  - Sign-out clears the cache.
- [ ] **Step 3: Run them and see them fail** (missing modules).
- [ ] **Step 4: Implement** both files and the three modifications.
- [ ] **Step 5: Run the new tests, `memoryWorld*.test.ts*`, `appearanceContexts.test.tsx` and `tsc`.** Expected: all pass, and `tsc` is clean apart from the known local haptics resolution.
- [ ] **Step 6: Commit** `feat(web): Wir reel style state (#2345)`.

### Task 3: Settings › Darstellung

**Files:**
- Create: `web/src/components/WirReelStyleSettings.tsx` and `WirReelStyleSettings.css`, following `MemoryWorldSettings.tsx`:
  - a summary with the current style's preview art, name and tier mark;
  - a "Ändern" button;
  - a `ShortTaskSheet` with a fieldset of three radio options. Each option has a preview, name, one-line description and tier mark;
  - footer states for loading, unavailable and retry, denied, offline, conflict and save error;
  - for a Free person who selected a Pro style: a hint and a "Pro entdecken" button to `proPaywallPath()`;
  - the kept note for a saved Pro style without Pro, and a saved status line.
  - No anchor link from Wir.
- Create: `web/src/components/WirReelStyleArt.tsx`. Static preview sketches (sample faces, no real data), one per style, each with `aria-hidden`.
- Create: `web/src/i18n/locales/wirReelStyleSettings.ts` (de), and register it in `germanPack.ts`. Add the matching `wirReelStyleSettings` block in `en.json`. Keys mirror `memoryWorldSettings` (`title`, `help`, `change`, `choices`, `intro`, `close`, `free`, `pro`, `kept`, `saved`, `proHint`, `discover`, `choose`, `selected`, `saving`, `proLoading`, `proUnavailable`, `retry`, `denied`, `offline`, `conflict`, `saveError`). Add `styles.{circles,tiles,chips}.{name,description}`, with the names from Global Constraints.
- Modify: `web/src/components/ProfileAppearancePanel.tsx`. Insert `<WirReelStyleSettings />` after `<WirDesignSettings />`.
- Modify: `web/src/components/ProFeatureCatalogue.tsx:43`. Add `'wirReelStyles'` to the `style` group and the feature copy keys where `memoryWorlds` has them.
- Test: `web/src/components/WirReelStyleSettings.test.tsx`.

**Interfaces:**
- Consumes: `useWirReelStyle()` from Task 2.
- Produces: `WirReelStyleArt({ style }: { style: WirReelStyle })`. Task 6 reuses it in nothing else.

- [ ] **Step 1: Write the failing tests:**
  - Renders nothing until `ready`.
  - Shows Kreise with "Kostenlos", and Kacheln and Chips with the Pro mark.
  - Saving Kacheln with Pro calls `save('tiles')` and shows the saved line.
  - `notes a kept Pro style for a Free person`.
  - A Free person who selects Chips sees the Pro hint, and the button navigates to `proPaywallPath()`.
  - `keeps the style and says so when offline`: `save` rejects with `offline`, the offline text shows, and the style is unchanged.
  - Conflict shows the conflict text.
  - The sheet has a legend, and the radios have accessible names "Kreise", "Kacheln" and "Chips".
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** the component, the art, the i18n and the panel and catalogue changes.
- [ ] **Step 4: Run the new test, `ProfileAppearancePanel`, `ProPaywallPage` and `src/i18n` tests, plus `tsc` and Biome on the touched files.** Expected: all pass. The i18n parity test confirms the de and en keys match.
- [ ] **Step 5: Commit** `feat(web): choose the Wir reel style in Darstellung (#2345)`.

### Task 4: Kacheln on Wir

**Files:**
- Modify: `web/src/components/WirNewForYouModule.tsx` and `WirWaitingGamesModule.tsx`. Read `useWirReelStyleId()`; while `pending` is true, render nothing, exactly like the existing "no data yet" path. Then choose the presentation by style. Circles stays the current code path, unchanged.
- Create: `web/src/components/WirNoticeTile.tsx` and `WirGameTile.tsx` (the tile bodies) plus `WirReelTiles.css`. Restore the tile presentation of `git show ba824acfe:web/src/components/WirNewForYouModule.tsx` (`TileBody`) and its CSS, adapted to the current `Tile` model:
  - kind line, title, quote or line;
  - list preview of up to three entries plus `moreItems` (the notice preview already carries three);
  - date leaf;
  - the game tile with `WirGameTileArt`, title and reason.
  - Sizes and tones come from tokens in the CSS; the reel scrolls horizontally; no outline or border.
- Modify: in `noticeTiles` (`COLLECTION_SENT`), keep `LIST_PREVIEW_ITEMS = 1` for circles. Expose the full preview items on the tile (for example `allItems`) so Kacheln can show up to three. The count then joins the rest.
- Test: extend `WirNewForYouModule.test.tsx` and `WirWaitingGamesModule.test.tsx`.

**Interfaces:**
- Consumes: `useWirReelStyleId()` from Task 2. Tests wrap the modules in a test provider or mock the hook.
- Produces: the tile bodies, internal to the modules.

- [ ] **Step 1: Write the failing tests:**
  - With style `tiles`, the list tile shows "Strawberries" and "Baguette" and the count `moreItems` for 5.
  - The date tile shows the weekday and the day.
  - Links keep their targets, and opening a tile still marks its ids read (reuse the existing fold test with `tiles`).
  - The games reel with `tiles` shows the game title and reason text.
  - While `pending`, both modules render nothing.
  - With style `circles`, the existing assertions still hold.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run both module tests, `TodayPage.test.tsx`, `tsc` and Biome.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(wir): Kacheln reel style (#2345)`.

### Task 5: Chips on Wir

**Files:**
- Create: `web/src/components/WirReelChips.css`, and a `WirNoticeChip` and `WirGameChip` render inside the modules or a small `WirReelChip.tsx`:
  - a pill with a tinted fill per tone and no border;
  - a 34 px round face reusing `TileFace` (export it from `WirNewForYouModule.tsx`) or `WirGameTileArt`;
  - one line of text with ellipsis at a token max width.
- Chip text, as decided in the spec:
  - a notice shows its `title`;
  - a comment shows `„quote" title`;
  - a date proposal shows `title weekday day`;
  - a Heute item shows `time title`;
  - a game shows `games.waiting.labels.<game>`.
  - Build these strings with i18n interpolation keys in `wirNotices` (for example `chip.quoteOn`, `chip.dated`, `chip.timed`), not concatenation.
- With style `chips`, the visible section title is visually hidden (`sr-only` class on the `h2`), and the region keeps `aria-labelledby`.
- Test: extend both module tests.

**Interfaces:**
- Consumes: `useWirReelStyleId()`, `TileFace`, `WirGameTileArt`, `games.waiting.labels`.

- [ ] **Step 1: Write the failing tests:**
  - With `chips`, the comment chip text contains the quote and the title.
  - The plan chip starts with the formatted time.
  - The date chip ends with the weekday and the day.
  - The game chip reads "Pingpong".
  - The `h2` has the `sr-only` class, and `getByRole('region', { name: wirNotices.title })` still resolves.
  - The link accessible name still carries kind, quote, line and count.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run both module tests, `src/i18n`, `tsc` and Biome.** Expected: all pass.
- [ ] **Step 5: Commit** `feat(wir): Chips reel style (#2345)`.

### Task 6: Browser journey, evidence, matrix and PR

**Files:**
- Create: `web/e2e/tests/wir-reel-styles.spec.ts`. Reuse the mock server shape of `wir-new-for-you.spec.ts`, and add GET/PATCH `/appearance/wir-reels` plus an entitlement toggle. Register it in `web/e2e/test-groups.json` and `web/e2e/test-impact.json`, with roots `TodayPage.tsx`, `WirNewForYouModule.tsx`, `WirWaitingGamesModule.tsx`, `WirReelStyleSettings.tsx` and `ProfileAppearancePanel.tsx`.
- Modify: `docs/FREEMIUM-FEATURE-MATRIX.md`:
  - in the row "Bespoke Themes, Covers & UI Personalization", add a sentence on the Wir reel styles with the Global Constraints semantics;
  - bump the version from 1.54 to the next free version at implementation time;
  - add a Revision line naming #2345 and the Product Owner decision of 2026-11-28, and move the old revision to "Previous revision".
- Modify: `docs/product/design/` with a short `wir-reel-styles.md`: the three styles, chip text rules and states. Link it from the design README if that README indexes such notes.

- [ ] **Step 1: Write the e2e tests:**
  - `switching the style shows it on Wir without a reload or replay`. Open Wir with circles, go to Settings › Darstellung, save Kacheln with Pro, then use `page.goBack()` to Wir. The tiles are visible and the seen items have no `wir-card-arrive` class.
  - Per style (`tiles`, `chips`) at 360 Light, 390 Light, 390 Dark and 430 Dark: screenshots `2345-reel-<style>-<width>-<theme>.png` via `VISUAL_EVIDENCE_DIR`, `documentElement.scrollWidth - innerWidth <= 0`, and axe on both reel sections reports no violations.
  - Large text: at 360 with `document.documentElement.style.fontSize = '200%'`, there is no page overflow for either style.
  - Reduced motion: no running animations in either style.
  - A Free account sees the Pro marks in the sheet and lands on the paywall from "Pro entdecken".
- [ ] **Step 2: Run the spec and `wir-new-for-you.spec.ts`.**
  Run (in `web/e2e`): `EIMIR_E2E_PORT=4391 npx playwright test tests/wir-reel-styles.spec.ts tests/wir-new-for-you.spec.ts --workers=1 --trace off`.
  Expected: all pass. Send the Product Owner the PNGs of Kacheln and Chips (390 Light and Dark) via SendUserFile.
- [ ] **Step 3: Run the browser-selection planning checks** named in `CONTRIBUTING.md#web-browser-test-selection`, and run `tools/ci/test_engineering_language_audit.py`. Expected: clean.
- [ ] **Step 4: Update the matrix and the design note, then commit** `docs: Wir reel styles in the freemium matrix and design notes (#2345)`.
- [ ] **Step 5: Run `biome lint . --diagnostic-level=error`, `alembic heads` (one head), and `python -m scripts.schema_fingerprint check`.** Expected: clean.
- [ ] **Step 6: Push the branch and open the PR** with `--label ci:full` and a body that has all gate sections, including the bold `**Visual evidence**` section and the Business/Freemium result naming the matrix change. Then switch Auto-fix on. Merge only on the Product Owner's go.
