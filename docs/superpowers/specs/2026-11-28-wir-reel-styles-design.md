# Wir reel styles: circles, tiles and chips (#2345)

Status: design, awaiting Product Owner approval (2026-11-28).
Follow-up, not part of this work: #2361 (Wir designs adopt the reel styles).

## Intent

On Wir, two reels sit below the hero: "Neu für dich" (`WirNewForYouModule`) and "Du bist dran" (`WirWaitingGamesModule`). Since #2351 both show 64 px content circles, which the Product Owner chose as the right size next to the hero.

The Product Owner wants each person to be able to choose how these reels look, under Settings › Darstellung. The goal is both: Wir should feel more personal, and Pro should become more attractive. Two or three really good options are preferred over many. The Product Owner picked:

- **Kreise** (`circles`): the current presentation from #2351. Default, Free/Core.
- **Kacheln** (`tiles`): the larger content tiles from #2349, which show more of each item. Pro.
- **Chips** (`chips`): swipeable pills with a small round preview and two or three words (draft C from the 2026-11-27 proposals). Pro.

## Goals

- One personal setting chooses the style of both reels together.
- The choice works like the Erinnerungswelten (#2283). It is stored on the server per Account within its Space, never shared with the partner, and part of the personal export. A saved Pro style stays effective after Pro ends. Returning to Kreise is always Free.
- Every style shows the same items, in the same order, with the same read semantics and the same return refresh (#2353). Only the presentation differs.
- Each style is complete in its first merge: Compact 360/390/430, Expanded, Light/Dark, large text, screen readers, reduced motion.

## Non-goals

- Drafts A (one shared row), B (inside the hero) and D (two stacks) are not built.
- No separate styles per reel.
- No coupling to the Wir design (App-Design); that is #2361.
- No entry point to the setting on Wir itself.
- No change to the data, the notice kinds, the read semantics or the games capability.

## Anti-goals (a failure even if it works)

- Tiles that read as table rows or a list of bordered records. The Product Owner rejected that (feedback "tiles, not rows").
- A style switch that replays the card arrival for items already seen, or a Wir that pops in piece by piece after the switch.
- A Free person who loses a reel or gets a broken layout because a Pro style is unavailable.
- Pro gated only in the client.

## Constraints

- The business model applies: `docs/FREEMIUM-FEATURE-MATRIX.md`, row "Bespoke Themes, Covers & UI Personalization", capability `theme.bespoke_packs`. The row must name the reel styles with the same semantics as the Wir designs and the Erinnerungswelten.
- Smartphone-first, Product Reference v1, the Button contract, tokens at the boundary, no borders on chips (they get a tinted fill only), localization for all text.
- The Android app ships the same Web UI.
- Core-only installations refuse a new Pro style under any grant, as they do for memory worlds (`ensure_capability`).

## Approaches considered

1. **Server-stored personal preference, like the Erinnerungswelten (chosen).** The style is stored next to the icon, Wir design, person colours and memory world, with its own GET/PATCH and a server-side Pro check. It works across devices, is in the export and persists after expiry. It costs a migration, an API and a generated client; Docker is available for the generator.
2. **Device-local setting.** Faster, but the choice holds on one device only, is missing from the export, and Pro is checked only in the client. This conflicts with the matrix, so it was rejected.
3. **Coupled to the Wir design.** No separate setting, but the Product Owner wants an explicit choice under Darstellung. Deferred to #2361.

The Product Owner picked approach 1 and one shared setting for both reels (2026-11-28).

## Design

### Backend

- New enum `WirReelStyleId` (`circles`, `tiles`, `chips`) in `eimir/appearance/models.py`.
- `DEFAULT_WIR_REEL_STYLE = circles` and `FREE_WIR_REEL_STYLES = {circles}`.
- New nullable column `app_icon_preferences.wir_reel_style` (String 24). NULL means circles. It comes with a migration after the current head and a refreshed `schema_fingerprint.json`.
- `effective_wir_reel_style` resolves NULL or an unknown value to circles.
- `service.save_wir_reel_style` goes through `_save_selection`, with the same optimistic concurrency token as the other appearance choices.
- `GET` and `PATCH /spaces/{spaceId}/appearance/wir-reels`:
  - operation ids `getWirReelStylePreference` and `updateWirReelStylePreference`;
  - views `WirReelStylePreferenceView { styleId, version }` and `WirReelStylePreferencePatch { styleId }`;
  - ETag/If-Match and `private, no-store` headers;
  - a PATCH to a non-free style calls `ensure_capability(theme.bespoke_packs)` after membership.
- Export: the personal export (`eimir_pro/portability/export.py`, and `transfer/service.py` while it still exists) writes the saved style the same way it writes `memory_world`.
- Tests: integration tests modeled on `test_memory_world.py` cover:
  - the default read;
  - a Free save of circles;
  - a Pro save;
  - a Free refusal (403);
  - persistence after expiry;
  - a version conflict (409);
  - partner isolation;
  - an unknown stored value;
  - export.

### OpenAPI and client

- `backend/openapi.json` is updated, then `tools/openapi/generate.sh` regenerates `web/src/api/generated`.

### Web state

- `client/wirReelStyle.ts` and `client/wirReelStyleContext.tsx` mirror `memoryWorld.ts` and `memoryWorldContext.tsx`:
  - the query key per instance, account and Space;
  - the ETag snapshot;
  - a save mutation with If-Match;
  - the Pro capability via `useSpaceCapability`;
  - a cached last-known style for an instant first render (as `sessionPersistence` does for the memory world), so Wir never shows circles first and then switches.
- The provider sits next to the memory-world provider in `App.tsx`.

### Settings › Darstellung

- New `WirReelStyleSettings`, placed after `WirDesignSettings` in `ProfileAppearancePanel`.
- It follows `MemoryWorldSettings`: a summary row with the current style, then a sheet with the three styles. Each style has a small preview (a static sketch of the style with sample content, no real data), a name, a one-line description, and either a "Kostenlos" label or a `ProMark`. An explicit save follows.
- A Free person who picks a Pro style is led to the Pro paywall (`proPaywallPath`), as with memory worlds. The saved style stays unchanged.
- Name in the settings: "Neu für dich & Du bist dran". Style names: Kreise, Kacheln, Chips (de; en: Circles, Tiles, Chips).
- `ProFeatureCatalogue` gets an entry for the reel styles.

### Wir rendering

- Both modules read the style from the context and render one of three presentations from the same tile model (`noticeTiles`, `todayPlanTiles`, the waiting-game items).
- **Kreise:** unchanged from #2351.
- **First render without a saved style** (a new device, after sign-out, an expired cache): the reels already render nothing until their own reads return. They additionally wait for the style read, so each reel appears once, complete, in the right style. Wir itself is not held back, and the Wir opening timeline is unchanged. With a cached style, the reels render at once in that style and reconcile quietly if the server answers differently. (Builder's call.)
- **Kacheln:** restores the #2349 tiles, adapted to the current tile model:
  - a larger rounded tile with tone gradient;
  - kind line, title, quote or line, and list preview (up to three entries plus count);
  - games tiles with the game picture, title and reason.
  - Sizes come from tokens; the reel scrolls horizontally; no outline.
- **Chips:**
  - a pill with a tinted fill (no border), a 34 px round face with the same content face as the circle (time, leaf, list paper, bubble, emoji, heart, picture), and one line of text. The full text stays in the accessible name.
  - The text follows draft C, which showed for example "„Xyz" zum Strauß", "Picknick So 29.", "Einkauf", "Strauß für dich", "Saatgut" and "Pingpong". Notices show their title on one line, ending in an ellipsis at a maximum chip width. A comment also gets its quote before the title, a date proposal gets its weekday and day after it, and a Heute item gets its time before it. Games use the existing short labels (`games.waiting.labels.*`). No new notice labels are added. (Builder's call, from draft C.)
  - Notices and games stay two rows.
  - Draft C had no headings, but the Product Owner wants the section titles visible in this style too (review, 2026-11-28).
- Shared for all styles:
  - the link target and `onFollow` read;
  - the card arrival (`useCardArrivals`, per item key; a style switch does not replay seen items);
  - the return refresh (`usePrimaryTabReturn`);
  - the press feedback (scale) without reduced motion;
  - focus ring;
  - `sr-only` names.

### States

- Loading, empty and error stay as today: the module renders nothing.
- Offline: the cached style keeps rendering. A save while offline shows the same error state as the memory-world sheet.

### Evidence and tests

- Unit tests:
  - the style context (default, cache, save, conflict, Pro refusal);
  - each module renders each style with the expected accessible names;
  - the settings sheet (Free vs Pro marks, paywall route).
- e2e (`wir-new-for-you.spec.ts` or a new `wir-reel-styles.spec.ts` registered in `test-groups.json` and `test-impact.json`):
  - switch the style in Settings, then return to Wir and see the new style without a reload;
  - screenshots of Kacheln and Chips at 360/390/430, Light/Dark, reduced motion;
  - a Free account sees the Pro marks and the paywall.
- The PR carries the Product Design, Business/Freemium, Reuse and Cross-cutting sections, including the bold "Visual evidence" section.

## Decided by the Product Owner

- Approach 1; one setting for both reels; Kreise Free; Kacheln and Chips Pro (2026-11-28).
- Two or three really good styles rather than five.
- The setting lives only under Settings › Darstellung. Wir gets no switch or link to it, unlike "Welt wechseln" on Momente (2026-11-28).

## Left to the builder

- Exact token values for tile and chip sizes, tones and spacing, within the existing Wir tokens.
- The preview sketches in the settings sheet.
- Migration number (after the head at implementation time) and the matrix version bump.
- Whether the e2e goes into the existing spec or a new one.
