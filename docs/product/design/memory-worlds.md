# Erinnerungswelten: personal memory worlds (#2283)

Stage 1: the foundation plus the Stapel and Plattenkiste worlds. Stage 2: the Momentwolke. Later worlds follow in their own pull requests.

## Purpose

Momente > Erinnerungen rediscovers memories from the shared history. A **memory world** is an alternative, playful presentation of the same rediscovery selection: the memories, their order and what may be shown stay the same; only the presentation changes. Every person chooses their own world for themselves.

- **Story** (`story`) is today's presentation and the default. Without a stored choice, Erinnerungen looks exactly as before.
- **Stapel** (`stack`): a stack of prints. The top print is the focal point; swiping puts it back, tapping opens the memory.
- **Momentwolke** (`cloud`): every memory floats as a bubble in a honeycomb cloud seen through a fisheye lens, large in the middle and tiny at the rim. The cloud follows the finger, glides on with momentum and settles on the nearest bubble; a tap grows a bubble into a card, a long press makes the cloud playful. Unlike the other worlds it shows the rediscovery selection **and the diary entries already loaded** (the first diary page, and further pages as the diary loads them), without duplicates. The diary part follows the Tagebuch filters currently applied.
- **Fotoautomat** (`booth`): a photo booth that prints memories as strips of four pictures, in two device-local styles: a sixties cabin (Klassisch) and a modern booth with a camera and countdown (Modern). The style switch sits in the row of the world switch entry. Tapping a strip picks it up for a closer look; the open-in-diary action opens the memory.
- **Kühlschranktür** (`fridge`): a fridge door with photos and notes held by colourful magnets. Items can be taken off and moved around (by touch and keyboard); a tap opens the memory. The items do not sway (Product Owner decision in the prototype review).
- **Fotobuch** (`album`): a photo book whose pages are laid out from the memories by season, with a cover, photo pages, heart moment and milestone pages and an end page. Pages turn in 3D by drag or fling and by the keyboard (arrow keys, PageUp/PageDown, Home/End); a tap opens the memory. When the selection changes, the book turns over onto its new cover.
- **Rubbellos** (`scratch`): a scratch card. Scratching the silver layer (by finger or with a keyboard alternative) reveals which memory is waiting; a tap on the revealed memory opens it.
- **Plattenkiste** (`crate`): a crate of records. Tapping the front sleeve puts the record on; the record "plays" the memory (synced lines and photos) and the open-in-diary action opens it.

The setting lives in Settings > Appearance > "Erinnerungswelten", directly below the Momente layout: the current world with a small illustration, a sheet with all worlds as tiles (illustration, name, one sentence, Free label or Pro mark) and an explicit save. A quiet "Welt wechseln" entry above the Erinnerungen content leads to the setting; Back returns to Erinnerungen. The device-local switch that decides whether memories with sensitive photos appear in the worlds sits in the same section and is not stored on the server.

## Free and Pro

- Story and Stapel are **Free/Core**.
- Every alternative world (Momentwolke, Fotoautomat, Fotobuch, Plattenkiste, Rubbellos, Kühlschranktür) is an optional **Pro** selection of the "Bespoke Themes, Covers & UI Personalization" row, capability `theme.bespoke_packs`, exactly like alternative app icons, Wir designs and person-colour pairs.
- The backend checks the value in Core and calls `ensure_capability(theme.bespoke_packs)` after the membership check for a non-Free world only ([ADR 0017](../../decisions/0017-pro-plugin-seam.md): the capability is plugin-owned, the value check, the column and the enum stay Core). Without the Pro plugin a Pro world is refused under any grant (`403 PREMIUM_ENTITLEMENT_REQUIRED`); Free worlds keep working.
- Free accounts see the Pro world with the Pro mark and a path to the Pro page; the client attempts no save without the capability.

## Downgrade

A saved Pro world stays readable and in effect after the grant ends or the Pro plugin is removed. Only a new Pro choice needs Pro again, including saving the same Pro world once more. Returning to Story or Stapel is always Free. A stored world that this installation does not know (for example from a newer or an older version) resolves to Story and can be replaced with any allowed world.

## Privacy

The choice is personal to the Account within its Space and **never shared with the partner**; the API returns and changes only the caller's own value. A world shows only what the rediscovery selection, or for the Momentwolke the already loaded diary, already shows that person, and sensitive photos stay hidden by default. The choice is part of the personal export, removed with the account, and never used for analytics, recommendations, copy or push content. See [`docs/PRIVACY-MODEL.md`](../../PRIVACY-MODEL.md).

## Implementation map

| Concern | Where |
|---|---|
| Value enum, default, Free set | `backend/src/eimir/appearance/models.py`: `MemoryWorldId` (`story`, `stack`, `crate`, `cloud`, `booth`, `fridge`, `album`, `scratch`), `DEFAULT_MEMORY_WORLD`, `FREE_MEMORY_WORLDS`, `AppIconPreference.effective_memory_world` |
| Storage | column `app_icon_preferences.memory_world` (nullable `String(24)`, NULL means Story), migration `0179_memory_world.py` |
| Save and concurrency | `backend/src/eimir/appearance/service.py` `save_memory_world`, through the shared `_save_selection`: one row and one ETag for all appearance choices of a person, so a stale token after another appearance save is a `409 RESOURCE_VERSION_CONFLICT` |
| API | `GET` / `PATCH /api/v1/spaces/{spaceId}/appearance/memory-world` (`getMemoryWorldPreference` / `updateMemoryWorldPreference`), models `MemoryWorldPreferenceView` (`worldId`, `version`) and `MemoryWorldPreferencePatch` (`worldId`); own value only, `If-Match` required, `Cache-Control: private, no-store` |
| Export / deletion | personal export `personalAppearance.memoryWorld` (only when chosen) in the Core transfer and the Pro operator export; import ignores it (export-only); the row is removed with the account |
| World id, resolver, catalogue | `web/src/client/memoryWorld.ts` |
| Provider, read and save | `web/src/client/memoryWorldContext.tsx` |
| Settings question | `web/src/components/MemoryWorldSettings.tsx` |
| Worlds | `web/src/components/memoryWorlds/*` |
| Tests | `backend/tests/integration/test_memory_world.py`, `test_core_only_appearance.py`, `test_endpoint_matrix.py`, Pro portability tests in `backend/pro/pro_tests/integration/` |

## Business and freemium model

Business/freemium impact reviewed. The [feature matrix](../../FREEMIUM-FEATURE-MATRIX.md) row "Bespoke Themes, Covers & UI Personalization" and the downgrade section name the memory worlds. All underlying memories, rediscovery content and actions stay Free/Core; a world only changes the presentation. Self-Hosted with the Pro plugin is identical to Cloud; Core-only refuses a new Pro world. No managed provider, storage, compute or inference cost: worlds render on the client from the already loaded rediscovery selection and thumbnails.
