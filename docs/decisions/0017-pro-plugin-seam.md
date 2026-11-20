# Decision 0017: A Pro plugin seam inside the Core backend

**Status:** Accepted (merged 2026-11-20, PR #2050)  
**Date:** November 18, 2026; updated November 19, 2026 for the Product Owner's repository-visibility direction;
updated November 20, 2026 for the current `main` baseline and the owning issue  
**Owning issue:** [#2082](https://github.com/baerenmarke90/eimir/issues/2082) (Phase 1). Phases 2 and 3 get their own
issues when they start.  
**Builds on:** [ADR 0006](../m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md) (capability entitlements),
[`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md), [`FREEMIUM-FEATURE-MATRIX.md`](../FREEMIUM-FEATURE-MATRIX.md) (Version 1.37),
[`PREMIUM-BILLING-STRATEGY.md`](../PREMIUM-BILLING-STRATEGY.md) and [`SELF-HOSTING.md`](../SELF-HOSTING.md)  
**Baseline:** `origin/main` at `d923c685b`; every file reference and figure below was re-read at that revision
(the first draft used `10b42f9f5`; `couple_games` was added in between).  
**Update of November 20, 2026:** the figures were re-checked against `origin/main` at `9197ec3f0`. Since
`d923c685b`, backend changes touched the Pro surface in three places: `identity/deletion.py` (C13) now deletes the
personal rows of eight more Pro tables itself (and calls `presence.service.delete_owner_presence`), migrations
`0163` to `0165` were added, and `presence` and `once_messages` gained code. The affected rows and counts below carry this update. The
Core-importing file list is otherwise unchanged (16 files, same sites C1 to C19); only `identity/deletion.py` grew,
from two to seven Pro import lines.

## Context

The Product Owner is evaluating "Variant 3A": the eimir. Core stays public, Premium-only server code moves into a
private package that is delivered to eimir. Cloud and to paying Self-Hosted operators as a private image. The Core
imports the Premium modules directly today, so no repository split is possible before a seam exists. The Product
Owner approved designing that seam first: this decision and its hook contracts. It moves no code and splits no
repository.

**Repository direction (Product Owner, November 19, 2026).** Before go-live the whole project becomes private.
Afterwards the Core is published and Pro stays private. The cleanup path recorded with this decision's pull
request keeps the current repository and its pull-request history as a private archive and publishes the Core
from a vetted snapshot in a fresh public repository; affected release assets and images are retired only after
clean replacements and an update path for Self-Hosted installations exist. This decision follows that direction:
development continues in one private repository that holds Core and Pro, and the public Core repository is
produced from it (decision 7).

### What is Premium-only server code today

The backend has 101,328 lines in 453 Python files under `backend/src`. The standalone Premium surface is 12,771
lines:

| Module (`backend/src/eimir/`) | Lines | Tables | Matrix row and classification | Whole module Premium? |
| --- | ---: | --- | --- | --- |
| `garden` | 1,088 | 6 (`gardens`, `garden_*`) | Couple games, Premium (`games.couple`) | Yes |
| `heart_hunt` | 540 | `heart_hunt_rounds` | Couple games, Premium | Yes |
| `picture_ping_pong` | 399 | `picture_ping_pong` | Couple games, Premium | Yes |
| `couple_games` | 1,102 | `couple_games` | Couple games, Premium (remote rounds, #2048) | Yes |
| `once_messages` | 681 | `once_messages`, `once_devices`, `once_receptions` | Premium sending / non-paywallable reception and deletion | No: Mixed |
| `calendar_sync` | 1,471 | 4 (`calendar_*`, `space_calendar_targets`, `plan_calendar_links`) | External Integrations, Premium (`integration.external_sync`) | Yes |
| `photo_sources` | 1,374 | `photo_source_connections`, `photo_source_selections`, `google_account_hints` | External Integrations, Premium; disconnect stays available after downgrade | Yes, with a downgrade exit |
| `date_ideas` | 505 | none (packaged catalog) | Date inspiration, Premium (`planning.date_inspiration`) | Yes, but Core consumes its catalog (see below) |
| `quotes` | 561 | `daily_quote_preferences` | Daily Quote, Premium (`daily.quote`) | Yes |
| `presence` | 1,164 | `partner_location_consents`, `presence_snapshots`, `presence_device_credentials` | Partner location, Premium; reading one's own consent, Stop/`OFF`, lowering and deletion non-paywallable | No: Mixed |
| 11 routers in `api/v1/` | 3,886 | | `garden`, `games`, `heart_hunt`, `once_messages`, `calendar_sync`, `photo_sources`, `date_ideas`, `daily_quote`, `picture_ping_pong`, `partner_location`, `couple_games` | |

The ten modules hold 23 tables. Their ORM models are 1,342 lines.

Deliberately **not** part of the plugin, with the reason:

- `recaps` (3,881 lines) stays Core. Its matrix row is "Premium composition / Free retained artifacts" and
  retained editions must stay readable without Pro. The local model helper now lives in the Core module
  `eimir.local_ai`, used by `context_tags` and `daily_checkins`.
- `wish_selections` (884 lines) stays Core. The matrix classifies it Free/Core; only the date-idea candidate
  branch checks `planning.date_inspiration` (`wish_selections/service.py`, `DATE_IDEAS_CAPABILITY`).
- `eimir.games` (275 lines) is split: `games/questions.py` stays Core because the Free/Core Memory API validates
  guided-experience question IDs against it (`api/v1/memories.py`, `QUESTION_IDS`); `games/service.py` is the read
  model of the Premium games router and moves with it.
- Four capabilities are plain gates inside shared Core code and stay there: `memories.map`
  (`api/v1/places.py`), `relationship.passport` (`api/v1/dashboard.py`, `recaps/service.py`),
  `partner.quick_actions.extended` (`api/v1/engagement.py`) and `theme.bespoke_packs` (`api/v1/appearance.py`,
  `appearance/models.py`). [#2084](https://github.com/baerenmarke90/eimir/issues/2084) moves them into the plugin
  one by one; `memories.map` is done (route `api/v1/memory_map.py` and read model `places/memory_map.py` are
  plugin code, the capability is plugin-owned), and so is `partner.quick_actions.extended` (route
  `api/v1/partner_quick_actions.py`, package `partner_quick_actions` with the `support_gesture_requests` model and a
  manifest row, whose existing migration stays in the Core chain like the other Pro-table migrations of
  decision 6; the gesture vocabulary, the notification projection and the Free thinking-of-you signal stay Core).
  `relationship.passport` is plugin-owned as well: the passport and Wir lifeline routes
  (`api/v1/relationship_passport.py`) and their read models (package `relationship_passport`) are plugin code, while
  `getDashboard`, its shared Story summary and recap composition stay Core for now, so a Core-only instance treats
  recaps like an expired Pro (see the recap gap below). `theme.bespoke_packs` is plugin-owned too, but it has no
  server feature code to move: the three value checks in `api/v1/appearance.py`, the stored columns and the value
  enums stay Core, and the designs themselves live in the clients
  ([#2086](https://github.com/baerenmarke90/eimir/issues/2086)). Without the plugin a Pro value is refused under
  any grant, Free values keep working and a stored Pro value stays in effect.
- `media.video_upload` (`api/v1/video.py`, `attachments/videos.py`, `attachments/video_jobs.py`,
  `jobs/video_worker.py`, gate also in `attachments/service.py` and `photo_sources/service.py`) and
  `daily.insights` (`daily_checkins/insights.py`, `recaps/mood.py`, `api/v1/daily_checkins.py`) are extractable,
  but they are woven into attachments and recaps. Their extraction is deferred to a later phase.
  [#2085](https://github.com/baerenmarke90/eimir/issues/2085) extracts them under the Product Owner's rule "what is
  Free is Core; what Premium newly creates is plugin". `daily.insights` is done: the insight and weekly-review routes
  (`api/v1/daily_insights.py`) and the package `daily_insights` (insights, weekly patterns, weekly review) are
  plugin code and the capability is plugin-owned; today's check-in, the rating route (clearing a retained rating is
  Free) with `daily_checkins/feedback.py` and the `daily_insight_feedback` table stay Core. `media.video_upload` is
  done too: the video processor (package `video_processing`, `videos.py`) and its validation job are plugin code,
  the job kind is in `PLUGIN_JOB_KINDS` and the capability is plugin-owned. The shared media pipeline
  (`attachments/video_jobs.py`), the restricted process runner (`attachments/media_process.py`), voice notes,
  admission, playback, export, restore, deletion and retention stay Core. Without the plugin a server behaves like
  one without a video processor: no new video, queued video validations stay pending, transfer bundles with video
  are refused.
- `storage.cloud_quota_50gb` is an operating-model capability, already removed on Self-Hosted by
  `CLOUD_ONLY_CAPABILITIES` in `entitlements/service.py`. It stays Core.

`backend/src/eimir/entitlements/models.py` defines 19 capabilities. Six have no implementation anywhere:
`chapter.rich_presentation`, `occasion.automation`, `recap.pdf_yearbook`, `recap.video_montage`,
`question.5_year_mirror`, `surprise_mode.vault`. Their first implementation should be written as plugin code from
day one.

### Coverage of the 19 capabilities

The Product Owner's condition for this decision is that every Premium feature is protected. This table states, per
capability of `entitlements/models.py`, what this decision protects and what it does not. Only the first group is
protected by Phase 1 and 2; the others are named gaps with an owning issue, and the Product Owner decides per gap
whether it is closed before Phase 3 or accepted.

| Capability | Server code today | Covered by this decision | Owner for the rest |
| --- | --- | --- | --- |
| `games.couple` | `garden`, `heart_hunt`, `picture_ping_pong`, `couple_games`, games router | Yes: moves into the plugin | |
| `integration.external_sync` | `calendar_sync`, `photo_sources`, `providers/caldav.py` | Yes | |
| `daily.quote` | `quotes` | Yes | |
| `partner.once_messages` | `once_messages` (sending Premium; reception and deletion stay non-paywallable through manifest rules) | Yes | |
| `presence.location` | `presence` (own consent, Stop and deletion stay non-paywallable) | Yes | |
| `planning.date_inspiration` | `date_ideas` and its catalog | Yes; the Core consumer in `wish_selections` goes through a hook | |
| `memories.map` | Plugin route `api/v1/memory_map.py` and read model `places/memory_map.py` (tag `places` kept); Places, coordinates and Memory–Place links stay Core | Yes: moved into the plugin by [#2084](https://github.com/baerenmarke90/eimir/issues/2084) | |
| `relationship.passport` | Plugin routes `api/v1/relationship_passport.py` and package `relationship_passport` (passport and lifeline, tag `dashboard` kept); recap composition still gated in shared Core (`recaps/service.py`) | Partly: passport and lifeline moved, the capability is plugin-owned; recap composition follows | [#2084](https://github.com/baerenmarke90/eimir/issues/2084), [#2085](https://github.com/baerenmarke90/eimir/issues/2085) |
| `partner.quick_actions.extended` | Plugin route `api/v1/partner_quick_actions.py` and package `partner_quick_actions` (command and `support_gesture_requests`, tag `notifications` kept); vocabulary, projection, thinking-of-you and the module switch stay Core | Yes: moved into the plugin by [#2084](https://github.com/baerenmarke90/eimir/issues/2084) | |
| `theme.bespoke_packs` | Value checks in shared Core (`api/v1/appearance.py`, `appearance/models.py`); the capability is plugin-owned, the packs live in the clients | Partly: Core-only refuses Pro values; the check itself stays public code | [#2084](https://github.com/baerenmarke90/eimir/issues/2084), [#2086](https://github.com/baerenmarke90/eimir/issues/2086) |
| `media.video_upload` | Plugin package `video_processing` (processor and validation job); pipeline, voice notes, playback and the retained-media lifecycle stay Core | Yes: processor and job moved, the capability is plugin-owned | [#2085](https://github.com/baerenmarke90/eimir/issues/2085) |
| `daily.insights` | Plugin routes `api/v1/daily_insights.py` and package `daily_insights` (OpenAPI tag kept); the rating route, its table and the mood rhythm of recaps (`recaps/mood.py`) stay Core | Yes for the insights; the recap mood rhythm follows with recap composition | [#2085](https://github.com/baerenmarke90/eimir/issues/2085) |
| `storage.cloud_quota_50gb` | Operating-model capability, removed on Self-Hosted | Not Pro code; stays Core by design | |
| `chapter.rich_presentation`, `occasion.automation`, `recap.pdf_yearbook`, `recap.video_montage`, `question.5_year_mirror`, `surprise_mode.vault` | None (no implementation) | Nothing to protect yet: the first implementation is written as plugin code | |

Two further gaps are not capabilities:

- **Recap composition.** `recaps` stays Core so that retained editions remain readable without Pro; the Premium part
  of composition is part of [#2085](https://github.com/baerenmarke90/eimir/issues/2085). Because
  `relationship.passport` is plugin-owned since #2084, a Core-only instance already behaves like an expired Pro:
  stored editions and reflections stay readable and exportable, members can still edit or withdraw their own words,
  new composition answers `403` and queued composition pauses (`tests/integration/test_core_only_recaps.py`).
- **Clients.** The Web and Android clients contain the Pro screens and generated Pro client code. This decision is a
  backend seam; [#2086](https://github.com/baerenmarke90/eimir/issues/2086) decides what the public export contains.

Result: six capabilities with server code are protected, four plain gates and two deferred capabilities are not, and
the clients are undecided. The Core must not be published (Phase 3) before the Product Owner has decided each open
row. Publishing earlier would expose the gate-only features and the client Pro code.

### Direct Core-to-Pro coupling (verified)

These are the call sites the seam replaces. They are the real work.

| # | Core file and function | What it imports or calls today |
| --- | --- | --- |
| C1 | `api/v1/__init__.py` (module level) | Imports the 11 Pro routers and mounts them on `normal_router` |
| C2 | `db/registry.py` `MODEL_MODULES` | 9 Pro model modules (all except `date_ideas`, which has no tables) |
| C3 | `alembic/env.py` (module level) | 8 Pro model modules for autogenerate; `garden.models` is missing (see follow-ups) |
| C4 | `security/lifecycle.py` `payload_tables()` | Discovers encrypted payload tables through `db/registry.load_all_models()`; 6 Pro modules have `ProtectedPayloadJSON` columns: `once_messages`, `calendar_sync`, `photo_sources`, `presence`, `picture_ping_pong`, `couple_games` |
| C5 | `jobs/runner.py` `main()` | `register_handlers()` of `calendar_sync.jobs`, `heart_hunt.retention`, `once_messages.service`, `photo_sources.retention`, `presence.retention` |
| C6 | `jobs/runner.py` `_ensure_maintenance()` | `ensure_scheduled(session)` of `heart_hunt.retention`, `presence.retention`, `photo_sources.retention` |
| C7 | `jobs/maintenance.py` `run_security_retention()` | `once_messages.service.prune_expired` |
| C8 | `engagement/service.py` `project_event()` | `calendar_sync.on_outbox_event`; projection branches for `ONCE_MESSAGE_SENT`, `HEART_HUNT_HIDDEN`/`HEART_HUNT_FOUND`, `GARDEN_SEED_ARRIVED`/`GARDEN_BOUQUET_GIVEN` (with `garden.notice_taken_today`), `PICTURE_PING_PONG_TURN` and `COUPLE_GAME_TURN` (module-level `couple_games` and `CoupleGameKind` imports, `_COUPLE_GAME_SUBJECTS`) |
| C9 | `engagement/service.py` `_TARGET_MODELS`, `_COUPLE_GAME_TARGETS`, `_target_is_projectable()`, `_projectable_predicate()`, `_picture_turn_exists()` | Target availability for `ONCE_MESSAGE` (`OnceMessage`, `once_messages.available_predicate`), `GARDEN_SEED` and `GARDEN_BOUQUET` (`garden.seed_is_waiting`, `garden.bouquet_is_open`), `PICTURE_GAME` (`PicturePingPong`), `WHO_OF_US_GAME`, `WISH_DETECTIVE_GAME` and `OUR_MOMENTS_GAME` (`couple_games.notice_is_current`) |
| C10 | `relationship/service.py` `add_member()` | `couple_games.purge_space`, `picture_ping_pong.purge_space`, `garden.purge_space` |
| C11 | `relationship/service.py` `end_membership()` | `couple_games.purge_space`, `once_messages.purge_space`, `heart_hunt.purge_space`, `picture_ping_pong.purge_space`, `garden.purge_space` |
| C12 | `relationship/offboarding.py` `leave_space()` | `calendar_sync.on_membership_ended` |
| C13 | `identity/deletion.py` `apply_core_cleanup()` | Deletes `PhotoSelection`, `PhotoConnection`, `GoogleAccountHint`, `CalendarConnection`, `CalendarOAuthTransaction` rows. Since `9197ec3f0` it also deletes, through `PERSONAL_ACCOUNT_ROWS`, the rows of `GardenReader`, `GardenWatering`, `OnceDevice`, `OnceReception`, `PresenceDeviceCredential`, `PresenceSnapshot`, `PartnerLocationConsent` and `DailyQuotePreference`, and calls `presence.service.delete_owner_presence` to reset the consent a departing recipient had received |
| C14 | `transfer/service.py` `build_export_archive()` | `PhotoConnection`, `GoogleAccountHint` into `personalPhotoSources` and `personalGoogleAccountHint` |
| C15 | `attachments/binding.py` `parent_of()` | `HeartHuntRound` to resolve parent type `HEART_HUNT_ROUND` |
| C16 | `attachments/retention.py` `classify_owner_attachment()` | `HeartHuntRound.hider_id` for account cleanup |
| C17 | `attachments/service.py` `_require_readable_parent()` | `heart_hunt.can_read_photo` |
| C18 | `wish_selections/service.py`, `api/v1/wish_selections.py` | `date_ideas.catalog.get_catalog`, `IDEA_ID_PATTERN`, `date_ideas.images.get_images` |
| C19 | `demo/__init__.py` `_ensure_demo_quote_preferences()`, `demo/feature_examples.py` `_ensure_partner_location()` | `quotes.service`, `presence.service`, `presence.models.SharingLevel` |

Two further facts shape the design:

- **Shared closed vocabularies stay Core.** `EventType`, `NotificationKind`, `EngagementTarget`, the job kinds and
  the attachment parent type `HEART_HUNT_ROUND` (also listed in `api/v1/attachments.py`) are database check
  constraints and client contract. Of the 162 Alembic migrations, 17 create or alter Pro tables and 6 more are
  Core migrations that rewrite the shared notification-kind and target constraints and restate Pro values in them
  (`0126`, `0139`, `0140`, `0143`, `0151`, `0159`): 23 in total at `d923c685b` (25 of 165 at `9197ec3f0`, see the
  update in the header). `backend/openapi.json` holds 426 operations, 81 of
  them tagged with the Pro router tags; the generated Web client contains them as well.
- **Space deletion is already plugin-independent.** Every Pro table references `spaces.id` or `accounts.id` with
  `ON DELETE CASCADE`. Account deletion is not: Account rows are pseudonymized, so their cascade never fires and
  `apply_core_cleanup()` deletes rows explicitly (C13).

### Corrections to the initial measurement

The Product Owner's session measured the surface before this decision. These points were confirmed or corrected
against the code:

- Confirmed at `10b42f9f5`: total size, per-module sizes, the 3,105 router lines, 19 capabilities, the six
  unimplemented ones, `recaps` and `wish_selections` staying Core. The figures in this document come from the
  re-verification at `d923c685b`, after `couple_games` (remote couple-game rounds, #2048) joined the Pro surface
  with its own router, table, encrypted payload, notification targets and lifecycle purges.
- `authorization/retention.py` does **not** import Pro models. It scans `Base.metadata` for tables with both
  `owner_id` and `privacy_class`; no Pro table has both, so the generic `OWNER_ONLY` cleanup never covered them.
- `jobs/runner.py` calls `ensure_scheduled` for three Pro modules only (`heart_hunt`, `presence`,
  `photo_sources`); `calendar_sync` and `once_messages` only register handlers and enqueue on demand.
- `relationship/offboarding.py` calls `calendar_sync.on_membership_ended`, which is a database delete of the
  leaving sponsor's `SpaceCalendarTarget`, not an OAuth revocation. Account deletion revokes nothing at a provider
  either; only an explicit disconnect does (`calendar_sync/service.py`, `provider_for(row).revoke()`).
- `providers/caldav.py` is used only by `calendar_sync`. Instead of relocating `calendar_sync/ical.py` into Core,
  both move into the plugin together.
- Missing from the initial list: C4 (encryption lifecycle), C7 (security retention), C18 (a Free/Core feature
  consumes the Pro catalog) and the `eimir.games` split.
- The migration count was 22, not 21, at `10b42f9f5` (16 touch Pro tables, 6 shared Core migrations restate Pro
  values in shared constraints); it is 23 at `d923c685b`. At `9197ec3f0` there are 165 migrations and 25 of them
  touch Pro tables or Pro values (`0164` adds a Pro column and index, `0165` resets once-message data), plus `0163`,
  a Core data migration that deletes personal rows of completed accounts, including rows of Pro tables. All stay
  in the Core chain (decision 6).

## Reuse review (`docs/REUSE-BEFORE-BUILD.md`)

| Candidate | Finding |
| --- | --- |
| Open standard | None applies: an in-process extension contract between two Python packages of the same product is not a protocol problem. |
| Python packaging entry points (`importlib.metadata`, standard library) | **Selected for discovery.** The packaging standard for "an installed distribution offers an object to a host". It also yields the distribution name and version for the lock-step check. No new dependency. |
| `typing.Protocol` (standard library) | **Selected for the contract.** Static checking with the existing `mypy`, no runtime framework. |
| FastAPI `APIRouter.include_router` | **Reused as is** for mounting plugin routes under `normal_router`, so `require_normal_operation` and the existing error handling apply unchanged. |
| Alembic `version_table` and a second environment | **Reused** for future plugin tables (decision 6). A branch in the Core `version_locations` was considered and rejected, see decision 6. |
| SQLAlchemy `Base.metadata`, `table()`/`column()` constructs | **Reused** for the Core lifecycle manifest: generic deletes and expiry purges need only lightweight table constructs, not the plugin's ORM classes. |
| `pluggy` 1.6.0 (MIT) | Rejected. It is present in `uv.lock` only as a `pytest` development dependency, so runtime use would be a new production dependency under the `docs/DEPENDENCIES.md` inventory gate. Its value is many independent plugins with ordered, multi-result hooks; this seam has at most one trusted plugin, and hook order and results must be explicit Core code (purge order, transaction boundaries). |
| `stevedore` (Apache-2.0, OpenStack) | Rejected. A thin layer over the same entry points with driver/extension managers; it adds a dependency for about 30 lines of loader code and no isolation. |
| Separate service or process for Pro (HTTP or queue) | Rejected for this phase. It would need its own authentication, authorization and transactions; lifecycle purges and target predicates run inside Core transactions and SQL queries today. |
| Keep everything public (no seam) | Superseded by the Product Owner's November 19 direction: Core public, Pro private. |
| Repository-level filter instead of a seam (publish the Core by deleting Pro directories from a snapshot) | Not sufficient alone: the Core imports Pro modules directly (C1 to C19), so a filtered snapshot would not build or start. The seam is what makes a Core-only snapshot runnable; the export filter in decision 7 builds on it. |

**Why custom code is still needed:** the loader (allow-list, version check, duplicate-route and capability
validation) and the lifecycle manifest are product rules. They are small (estimate: loader 150 to 250 lines,
manifest executor 250 to 400 lines) and use only the standard library, FastAPI, SQLAlchemy and Alembic, which are
already adopted. No third-party component is introduced, so license, cost, provider and privacy questions for a
new component do not arise.

## Decision

### 1. An internal seam with lock-step versions, not a public plugin API

The seam is internal to the eimir. product. It promises no compatibility to third parties.

- The plugin may import any Core module. Core must never import a plugin package. A Core unit test walks Core's
  source with the standard-library `ast` module and fails on any import of a registered plugin package (no
  `import-linter` dependency).
- Core declares an integer `PLUGIN_SEAM_VERSION`. It is raised whenever the Protocol, the manifest format or a hook
  signature changes. The plugin declares the seam version it implements; any mismatch refuses to start.
- **Correction to "pin the exact Core version":** `backend/pyproject.toml` keeps the static version `0.1.0`, so a
  distribution-version pin cannot tell two builds apart. Lock-step is therefore bound to the build revision that
  Core already reports (`EIMIR_BUILD_REVISION`, read by `build_revision()` in `api/v1/health.py`; Phase 1 moves the
  function to a neutral module). The Pro image is built `FROM` the exact digest of the Core image of the same
  release and records the Core revision it was built against; at startup the plugin's recorded revision must equal
  Core's. A local checkout (`unverified-local-checkout`) checks the seam version only.

### 2. Discovery through entry points, enabled only by an explicit setting

- The plugin exposes one object in the entry-point group `eimir.plugins` (name `pro`).
- A new setting `EIMIR_PLUGINS` (comma-separated entry-point names) is the allow-list. A plugin is loaded only when
  it is named; an installed but unnamed plugin is ignored and logged once. Every name must resolve to exactly one
  entry point from the expected distribution (`eimir-pro` after Phase 2; the `eimir` distribution while the
  plugin is in-tree). Duplicate names, a foreign distribution claiming the name, or a named but missing plugin
  refuse to start.
- **Challenge to "default empty":** in Phase 1 and 2 the plugin ships inside the one public image. An empty
  default would switch Pro off on every existing Cloud and Self-Hosted installation, which contradicts "behavior
  identical". The default is therefore `pro` while the plugin is in-tree; the Core-only configuration is exercised
  by tests and CI. When the code leaves the public image (Phase 3) the Core default becomes empty and the Pro image
  sets `EIMIR_PLUGINS=pro` in its own environment.
- Entry points need installed distribution metadata. Running from a plain `PYTHONPATH` without an installed
  project finds no plugin and, with the Phase 1 default, refuses to start with a clear message. Local recipes must
  use the installed environment (`uv sync`).
- The `api`, `worker` and `migrate` processes load plugins through the same function and the same setting, and so
  does the optional media role (`jobs/video_worker.py`) since #2085: it claims video validation only when a loaded
  plugin registered it.

### 3. The hook contract

The contract is one `typing.Protocol` (`eimir.plugins.contract.ProPlugin`) plus a narrow Core facade object
handed to hooks that need Core services (notification projection, attachment deletion, job queue). Hooks receive
the caller's `Session` and never commit, roll back or open their own transaction.

| Hook | Replaces | Transaction and idempotency contract | Failure behavior |
| --- | --- | --- | --- |
| `seam_version`, `core_revision`, `name` | (new) | Constant attributes | Mismatch refuses to start (decision 1). |
| `capabilities() -> frozenset[str]` | (new) feeds the filter next to `CLOUD_ONLY_CAPABILITIES` in `entitlements/service.py` `_grant_capabilities()` | Pure; read once at startup | A string that is not a `Capability` value refuses to start. Absent plugin: decision 5. |
| `routers() -> Sequence[APIRouter]` | C1 | Mounted once, in `create_app()` (`main.py`), under `/api/v1` after all Core routers, with the same `require_normal_operation` dependency as `normal_router` (the Core router stays assembled at import time) | A `(method, path)` pair that collides with Core or another plugin refuses to start. Absent plugin: the paths do not exist and FastAPI answers `404`. |
| `model_modules() -> Sequence[str]` | C2, C3 | Import only | Import error refuses to start. Lifecycle correctness never depends on this hook (decision 4). |
| `migrations() -> MigrationSpec` (script location, `version_table`); not part of the contract yet, added with the first new plugin table | (new, decision 6) | Run by the `migrate` service after Core reaches head, in the same deploy step | A failing plugin migration fails `migrate`, which blocks the runtime exactly like a failing Core migration (`SELF-HOSTING.md`, "Upgrade and rollback semantics"). |
| `register_jobs(registry)` | C5 | Handlers run in the job's `unit_of_work` with the existing retry, `DeferredJobError` and `RetryableJobError` semantics | Registering a kind that Core or the manifest does not declare as plugin-owned refuses to start. |
| `ensure_scheduled(session)` | C6 | Called inside `_ensure_maintenance()`'s `unit_of_work`; must stay idempotent with the existing advisory-lock pattern of each module | An exception aborts the worker start, as today. |
| `on_outbox_event(session, event, event_type)` | C8 (`calendar_sync.on_outbox_event`) | Runs inside `project_event()` before `_event_effects_allowed()`; may only enqueue work; must be idempotent under Outbox replay | An exception fails the projection job, which retries, as today. |
| `project_notification(session, event, event_type, core) -> bool` | C8 projection branches | Runs after `_event_effects_allowed()`; uses the facade's target-notification projection, whose `ON CONFLICT` keys keep replays idempotent; returns `True` when it handled the event | Absent plugin: events of plugin types are not projected, so no new notification appears. |
| `engagement_targets() -> Mapping[EngagementTarget, TargetRule]` (row check and SQL `exists` predicate) | C9 | Pure SQL expressions composed into Core queries; no I/O, no writes | Absent plugin: the predicate is `false()`, so existing notifications for those targets are hidden (fail closed). |
| `attachment_read_rules() -> Mapping[str, AttachmentReadRule]` | C17 | Read only | Absent plugin: the existing `privacy_absence` branch denies the read. |
| `on_partner_joined`, `on_membership_ended`, `on_member_left`, `on_account_deleted`, `prune_expired` | C7, C10 to C13 | Run in the caller's transaction at the existing call sites; with the plugin loaded they own its tables' lifecycle (update of decision 4) | An exception rolls the whole lifecycle transaction back (fail closed, as today). Absent plugin: the manifest rules alone apply. |
| `export_account_document(session, authorization, scope) -> Mapping` | C14 | Read only, inside the export transaction | Absent plugin: the manifest export rule produces the same keys (decision 4). |
| `date_ideas() -> DateIdeaSource \| None` (`revision`, `view`); the shared DTOs live in the Core contract `eimir.wish_selections.date_idea_contract` | C18 | Pure, cached | Absent plugin: Core treats the catalog as unavailable, which is the existing paused state of a round that contains date ideas (#465 within #1535): Wish-only rounds are unaffected, nothing is deleted, export keeps catalog IDs only. `IDEA_ID_PATTERN` stays a Core contract constant. |
| `seed_demo(session, result, *, created)` | C19 | Inside the demo seed transaction after the demo Pro grant; idempotent like the existing demo helpers; `created` limits the location share to a new or reset demo Space | Absent plugin: the demo Space has no quote preferences and no location share. |
| `validate(settings) -> None`; not part of the contract yet (no plugin setting needs it) | (new) | Startup only | Raising refuses to start with the plugin's diagnostic. |

C15 and C16 (attachment parent resolution and owner classification) and C4 are **not** hooks. They become
manifest rules, because they must work without the plugin. C7 is both: the plugin's `prune_expired` hook with
the plugin loaded, the manifest's expiry rules without it (update of decision 4).

### 4. Data lifecycle never depends on the plugin being loaded

A Core instance can run without the plugin after it once ran with it: an operator removes the Pro image, a
license lapses and the operator switches images, or a Self-Hosted installation is restored from a Pro backup.
Deletion, retention, encryption and export must stay correct in that state. Core therefore owns a declarative
manifest of every plugin-owned table (`eimir.plugins.manifest`), one row per table, with:

- the table name, the owning capability and the scope columns (`space_id`, account columns);
- `purge_on`: `PARTNER_JOINED`, `MEMBERSHIP_ENDED` and `ACCOUNT_DELETED`, executed by Core in the places of C10 to
  C13 (Space deletion keeps relying on the `ON DELETE CASCADE` foreign keys). The eight Pro tables that
  `PERSONAL_ACCOUNT_ROWS` in `identity/deletion.py` deletes today move into manifest rows with `ACCOUNT_DELETED`;
  Core keeps its own account rows in that list;
- `expires_column` for time-based retention, executed by Core's existing security-retention job (replaces C7 and
  the database part of the `presence`, `heart_hunt` and `photo_sources` retention jobs);
- `attachment_columns` with the parent type (`HEART_HUNT_ROUND`), so `binding.parent_of()` keeps attachment
  exclusivity, account cleanup keeps classifying the hider's photo, and purges hand attachments to
  `mark_for_deletion` (replaces C15, C16 and the attachment part of `heart_hunt.purge_space`);
- `protected_payload` with its crypto context, so `security/lifecycle.py` migrates, rotates and verifies these
  tables without importing the plugin (replaces C4). This is required by the at-rest encryption goal: without it a
  Core-only key rotation would silently skip six Pro tables;
- `export`: the account-document keys and the columns or payload fields they contain (replaces C14 for the
  Core-only case);
- `job_kinds`: the job kinds the plugin owns. A Core-only worker does not claim them, instead of failing them
  permanently as "unknown job kind" (`jobs/worker.py`), so they resume when the plugin returns. Their privacy
  effect is covered by `expires_column` rules, not by the jobs.

Alembic autogenerate in a Core-only checkout must not propose dropping manifest tables: `alembic/env.py` gains an
`include_object` filter for them.

The plugin's own hooks add only behavior a table rule cannot express. At the baseline that is nothing for
lifecycle: every Pro purge is a database delete, and the only provider-side effect (calendar credential
revocation) happens on explicit disconnect, not on membership end or account deletion. (Superseded by the update
below: the plugin-loaded purges are not plain deletes.)

**Required Core tests:**

- every table of every plugin's `model_modules()` has a manifest row, and every manifest row names an existing
  table with the declared columns;
- every plugin table with a `ProtectedPayloadJSON` column has `protected_payload` in the manifest;
- with the plugin unloaded, partner join, membership end and account deletion remove the same rows as with the
  plugin loaded, and expired rows are purged.

A new Pro table therefore needs a manifest row in Core in the same change (decision 7).

**Update of November 20, 2026 (Phase 1, pull request b).** Implementing C7 and C10 to C13 showed that the
statement "every Pro purge is a database delete" does not hold at `origin/main` `03c48d084`:
`once_messages.purge_space` first deletes the notifications that point at the messages, the once-message expiry
empties the payload at `claim_until` and keeps the row, presence retention suspends shares and removes the owner's
location, and account deletion resets the location consents a departing recipient had received. Running the
manifest first and the plugin hooks afterwards would change behavior with the plugin loaded. With the coordinator's
approval the rule is therefore:

- **Plugin loaded:** its hooks own the lifecycle of its tables. They call the existing functions unchanged and at
  the existing call sites (`on_partner_joined`, `on_membership_ended`, `on_member_left`, `on_account_deleted`,
  `prune_expired`), so plugin-loaded behavior stays identical. The manifest executor does not run for that
  plugin's tables (no double execution).
- **Plugin absent:** Core's manifest executor (`eimir.plugins.lifecycle`) applies the rules of the absent plugin's
  tables only: `purge_on` deletes at the four lifecycle points, `expires_columns` deletes at retention, `transient`
  tables are emptied, `attachment` hands photos to `mark_for_deletion`, `export` builds the personal-export keys,
  and the new `notification_targets` field deletes the notifications that point at deleted rows. A purge rule may
  name `dependents`, tables whose rows with the same `space_id` and `account_id` go with each matched row.

The executor is never weaker than the plugin. Its known, deliberate differences from the plugin-loaded behavior:

| Situation | Plugin loaded | Plugin absent |
| --- | --- | --- |
| Once message after its claim window | Payload emptied, row kept as a receipt until `expires_at` | Row deleted with its notifications |
| Recipient of a location consent deletes their Account | Consent reset to `OFF` for the remaining partner, owner location removed | Consent deleted, owner location and publish credentials removed (`dependents`) |
| Location snapshots, photo picker selections, calendar OAuth transactions | Retention by their own timers | Deleted at the next security-retention run (`transient`) |
| Notifications of purged games and garden rows | Kept and hidden by the target predicate | Deleted with the row (`notification_targets`) |

### 5. Failure policy and capability visibility

- A plugin that is named in `EIMIR_PLUGINS` but fails to import, fails `validate()`, has a seam or revision
  mismatch, or collides with a Core route **refuses to start** `api`, `worker` and `migrate`. There is no silent
  degradation: a Cloud deploy with a broken Pro image must fail its health gate, not serve Free.
- Core-only: plugin routes do not exist, and **effective capabilities are granted and implemented.**
  `_grant_capabilities()` removes plugin-owned capabilities that no loaded plugin provides, next to the existing
  removal of `CLOUD_ONLY_CAPABILITIES` on Self-Hosted. Phase 1 marks as plugin-owned only the capabilities whose
  implementation moves (`games.couple`, `integration.external_sync`, `partner.once_messages`, `presence.location`,
  `daily.quote`, `planning.date_inspiration`). The six unimplemented capabilities keep today's behavior and become
  plugin-owned when their first implementation lands in the plugin.
- `/api/v1/instance` gains one Boolean, for example `proFeaturesAvailable`, so the Web client can tell "this server
  has no Pro package" apart from "this Space has no Pro". On a Self-Hosted Core-only server the client then shows a
  calm "needs the Pro package on this server" state instead of the paywall, because a store purchase cannot unlock
  a Self-Hosted Space (`PREMIUM-BILLING-STRATEGY.md`). That client state is a separate user-facing task with its
  own Product Design preflight; this decision only provides the signal.
- A Core-only instance with dormant plugin data logs one startup warning with table names and row counts (never
  content), and the ServerAdmin health view shows the same. An explicit ServerAdmin command may purge dormant
  plugin data; it never runs automatically.

### 6. Migrations

- The 25 existing migrations that touch Pro tables or Pro values stay in the Core chain. Rewriting the chain of
  existing installations is not acceptable.
- **Challenge to "a separate Alembic branch in `version_locations`":** a branch records its head in the same
  `alembic_version` table. A Core-only `migrate` that cannot locate that revision exits non-zero, which is exactly
  the refused-rollback path in `SELF-HOSTING.md`. A Core-only start after Pro would become impossible. New plugin
  tables therefore use a **separate Alembic environment with its own `version_table`** (for example
  `alembic_version_pro`), run by the same `migrate` service after Core reaches head. Core never sees it.
- Plugin migrations may reference Core tables; Core migrations never reference plugin tables. Pro values in shared
  Core vocabularies (`EventType`, `NotificationKind`, `EngagementTarget`, job kinds, attachment parent types) stay
  Core migrations, because they are shared contract.
- Consequence for the public Core: existing installations know these 23 revisions, so the published Core chain must
  contain them unchanged. The public Core therefore shows the schema of the existing Pro tables (not their logic),
  as does the manifest in decision 4. Tables of future Pro features live only in the private plugin environment.

### 7. Repository layout and API contract

Following the Product Owner's direction, there is **one private development repository** that holds Core and Pro,
and the public Core repository is **produced from it**. This replaces the two-repository workflow the first draft
assumed.

- **One change, one PR.** A Pro feature that needs contract, Web client, manifest rows or shared vocabulary values
  lands with its implementation in one pull request of the private repository. Lock-step versions (decision 1)
  hold by construction, because Core and Pro are built from the same revision.
- **Public Core export.** A publication step copies the Core from a reviewed private revision into the public
  repository. Its input is an allow-list of Core paths, not a deny-list of Pro paths, so a new Pro directory is
  private by default. The step fails when the exported tree imports a plugin package (the `ast` test of decision
  1), when it does not build and start Core-only, or when it contains Pro-only package data (for example the
  `date_ideas/data` catalog and images). Whether it publishes one snapshot per release or a continuous mirror is
  an open decision.
- **Community contributions.** `BUSINESS-MODEL.md` welcomes pull requests to the public Core. They are reviewed in
  the public repository and applied to the private repository by a maintainer; the next export then carries them
  back. The CLA continues to govern them.
- **The OpenAPI contract.** Phase 1 and 2 change nothing: `backend/scripts/openapi_contract.py` builds
  `backend/openapi.json` from `eimir.main.app` with the plugin loaded. The private repository keeps that complete
  contract for the official Web and Android clients. The public Core export carries a Core-only `openapi.json`,
  generated without the plugin; the export step checks that it equals the complete contract minus the plugin's
  declared tags and paths, so the two can never drift apart.
- **Clients are outside this seam.** The official Web and Android clients contain the Pro screens and the generated
  Pro client code. Whether the public export contains client code, and with which Pro parts removed, is a separate
  decision; this backend seam does not answer it.
- Rejected alternative: keeping the Pro routers and DTOs in Core with plugin-provided services. It keeps one
  OpenAPI source but publishes the full HTTP layer, its validation and its error mapping, and it turns "route
  absent" into "route present, returns an error" on Core-only.
- Superseded alternative: two repositories (public Core, private Pro) with a Core PR merged before every Pro PR.
  It remains possible later, but it is not needed for the chosen direction and costs a second CI and review cycle
  per contract change.

**Update of November 20, 2026: Phase 1 implemented.** Pull requests #2091 (a), #2093 (b), #2108 (c) and
#2116 (d) implement Phase 1; `main` at `d3503cc5f` was checked against the acceptance criteria. The code
differs from the text above in these points, which the hook table now reflects:

- `PLUGIN_SEAM_VERSION` is `3` (raised with the hooks of b and d).
- Plugin routers are mounted on the application under `/api/v1` with the `require_normal_operation`
  dependency, not into a rebuilt `normal_router`; OpenAPI and the route resolution of every operation are
  unchanged.
- The date-idea hook is `date_ideas() -> DateIdeaSource | None`; the vocabulary and DTOs a Wish selection
  round shares with the catalog moved into the Core contract `eimir.wish_selections.date_idea_contract`.
- The demo hook is `seed_demo(session, result, *, created)`.
- Plugin-owned job kinds, notification targets and capabilities are Core sets in the manifest
  (`PLUGIN_JOB_KINDS`, `PLUGIN_ENGAGEMENT_TARGETS`, `PLUGIN_CAPABILITIES`), not per-row fields.
- `alembic/env.py` already used `db/registry.load_all_models()` before Phase 1, so C3 was resolved through C2.

Not implemented in Phase 1, because nothing uses them yet: the `migrations()` hook and the separate plugin
Alembic environment of decision 6 (no new plugin table exists), the `validate(settings)` hook, and the
ServerAdmin view of dormant plugin data from decision 5. The startup warning for dormant plugin data of decision 5
is implemented (#2121, `eimir.plugins.dormant`); the admin view is not. The `/api/v1/instance` field stays a
separate task.

The Core-only configuration runs as `Backend Core-only` in the full CI tier of pull requests and in the
nightly regression of `main` (#2096); pushes to `main` start no CI run, and the cheap pull-request tier skips it.

### 8. Phasing

**Phase 1: the seam, code stays in this repository.** The Pro modules move nowhere. One in-tree plugin object
(`eimir.pro_plugin`) registers them through the hooks; Core calls them only through the seam. Behavior is
identical with the plugin loaded.

Acceptance criteria for Phase 1:

1. No Core module imports `garden`, `heart_hunt`, `picture_ping_pong`, `couple_games`, `once_messages`,
   `calendar_sync`, `photo_sources`, `date_ideas`, `quotes`, `presence`, `providers/caldav.py` or
   `games/service.py`; the `ast` test enforces it.
2. `db/registry.py` and `alembic/env.py` list no Pro model module; the plugin contributes them.
3. The manifest covers the 23 Pro tables; the manifest tests in decision 4 pass.
4. The backend test suite runs in two configurations in CI: plugin loaded (today's suite, unchanged results) and
   Core-only. Core-only asserts: every Pro path answers `404`; plugin-owned capabilities are absent from the
   effective entitlement even with an active `PREMIUM` grant; partner join, membership end and account deletion
   still purge the Pro rows; expired presence snapshots, once messages and photo selections are still purged; the
   encryption verify command reports the six Pro payload tables; notifications for plugin targets are hidden.
5. A plugin named but missing, a seam mismatch, a revision mismatch and a route collision each refuse to start
   (unit tests on the loader).
6. `backend/openapi.json` is byte-identical before and after.
7. Startup logs name the loaded plugins, their seam version and revision, and the provided capabilities.

Phase 1 can be cut into reviewable PRs: (a) loader, contract, manifest, registry, Alembic and encryption wiring;
(b) jobs, retention, engagement and attachment hooks; (c) routers, capability filter and the Core-only CI
configuration; (d) date ideas, `eimir.games` split and demo hooks.

**Phase 2: relocation.** The modules move into a separate distribution (`eimir-pro`, for example
`backend/pro/`) inside the same repository, with its own tests. That directory is the boundary the public Core
export leaves out. No behavior change.

**Phase 3: publication and delivery.** The repository becomes private (the cleanup path in the Context section),
the Core export of decision 7 publishes the Core into a fresh public repository, a Core image is built from the
exported tree, and a private Pro image is built `FROM` that Core image digest with its own release identity and
the distribution channel the Product Owner selects (open decisions). Before go-live, Phase 1 and 2 must be complete:
otherwise the exported Core does not start without Pro. The open rows of the coverage table (section
"Coverage of the 19 capabilities" in the Context: #2084, #2085, #2086) must also be decided before the first export, because the
export would otherwise publish the gate-only features and the client Pro code.

**Effort estimate (an estimate, not a commitment):** Phase 1 about 8 to 12 working days of agent-assisted work
including review cycles, about 1,500 to 2,500 changed lines across the 19 call sites, the seam and the Core-only
test configuration. Phase 2 about 4 to 6 days. Phase 3 about 6 to 12 days for the export step and its checks, both
image builds, release identities, Self-Hosted documentation and license delivery; the repository visibility change
and the retirement of old artifacts are operational work on top.

## Business/freemium consistency

**Business/freemium impact reviewed.** No tier changes; `docs/FREEMIUM-FEATURE-MATRIX.md` stays unchanged.

- No capability changes its Free, Premium or Mixed classification. Non-paywallable exits keep working wherever the
  Pro package is present, including after a commercial downgrade.
- Self-Hosted equals Cloud when the Pro image is used. Core-only Self-Hosted remains the complete Free/Core
  product; nothing Core moves into the plugin, so this is no artificial degradation (`BUSINESS-MODEL.md`).
- Entitlement ownership stays Space-scoped; the seam only filters capabilities that cannot be served.
- Downgrade and existing data: the manifest keeps deletion, retention, encryption and export correct even when the
  package is absent.
- **Open question that touches the model:** a private image needs a registry credential at install and update
  time. `SELF-HOSTING.md` states that normal Self-Hosted installation needs no GHCR credential and that the images
  are anonymously pullable; `PREMIUM-BILLING-STRATEGY.md` and the matrix require "offline-verifiable signed license
  material without mandatory phone-home". A credentialed pull is a network dependency at install and update time,
  not at runtime, but it is a new obligation for paying Self-Hosted operators and must be decided explicitly
  before Phase 3.
- **Existing Self-Hosted installations:** today's public images contain the Pro code. After Phase 3 the public
  Core image does not; an operator with a Pro license switches to the Pro image, and an operator without one keeps
  the complete Free/Core product on the Core image. The release notes and `SELF-HOSTING.md` must say so before the
  first Core-only release.
- **Interpretation to confirm:** "package absent" is an operating choice, not a commercial downgrade. The matrix
  promises, for example, that pending once messages stay openable and that photo integrations can be disconnected
  after a downgrade. With the package absent the manifest still enforces lifetimes and deletion, but the
  interactive exits (open a pending once message, disconnect an integration, change a location consent) need the
  package. This decision proposes that interpretation; the Product Owner confirms or rejects it.

## Cross-cutting quality

- **Security and supply chain:** the allow-list, the single-distribution check and the revision pin stop an
  unrelated installed package from claiming the plugin name. The plugin runs in-process with full Core privileges;
  the seam is a code-organization boundary, not a sandbox. The Pro image must carry the same digest, attestation
  and immutable-release guarantees as the Core images. Fail-closed startup prevents a half-loaded Pro. The public
  Core export is a publication path: allow-list input, the import check and a Core-only start are its gates.
- **Privacy and data lifecycle:** decision 4. Plugin target predicates fail closed. Startup diagnostics contain
  table names and counts only.
- **Concurrency and transactions:** hooks run in the caller's transaction and never commit; existing lock order
  (`relationship.lock_space`, account locks in `project_event`) is unchanged because the hooks are called at the
  same points. A loaded plugin's hooks purge its tables; the manifest executor runs only for absent plugins.
- **Resilience:** a broken plugin stops the process instead of serving partial Pro behavior. Core-only workers
  leave plugin jobs unclaimed rather than failing them.
- **Observability:** one structured log line per process start with loaded plugins, seam version, revision and
  capabilities; one warning for dormant plugin data; no content.
- **Performance:** loading happens once at startup. Target predicates are the same SQL as today.
- **Contracts and migrations:** decisions 6 and 7. `openapi.json` is unchanged in Phase 1.
- **Operations and Self-Hosted:** one new setting, `EIMIR_PLUGINS`. Core-only startup after Pro works because
  plugin migrations use their own version table.
- **i18n and accessibility:** not affected by the seam; the future Web state in decision 5 needs localized text
  and its own review.
- **Testing:** the Core-only CI configuration and the manifest tests are the regression proof; a happy-path
  Pro-loaded run alone would not prove the seam.

## What this does not protect

- **Copies that already left stay out there.** Making the repository private stops further downloads from
  publisher-controlled locations, and a fresh public Core repository carries no Pro history. But every module
  listed above, the editorial date-idea catalog and its 25 images (`date_ideas/data`) and the quote catalog were
  public until then: existing forks stay public when the upstream becomes private, local clones and cached views
  remain, and published release assets and public GHCR images contain the backend `src/` tree until they are
  retired (the cleanup path in the Context section). What was published stays usable under the license it was
  published with.
- **The public Core shows the schema of existing Pro tables.** The 25 migrations and the manifest must stay in the
  public Core chain (decision 6). They reveal table and column names, not behavior.
- **Paying Self-Hosted operators receive the code.** A Python package in an image is readable source or bytecode.
  Protection there is the license and its terms, not secrecy.
- **Gates in shared Core code stay patchable.** `relationship.passport` (recap composition),
  `theme.bespoke_packs`, `media.video_upload` (admission) and `daily.insights` (recap mood rhythm, setting a rating) are checks in
  public code. Anyone running a modified Core can remove them, as they can today.
- **Workflow cost.** With one private development repository there is no second PR per change, but there is an
  export step to maintain, a public repository whose contributions must be carried over by hand, and two images per
  release. The lock-step pin turns every Core release into a Pro release.
- **A wrong export publishes Pro again.** The allow-list input and the export checks in decision 7 reduce that
  risk; they do not remove it. An export is a publication and needs the same review as a release.
- **The seam itself is not secret.** The Protocol, the manifest and the vocabulary values describe what Pro does.

## Consequences

- Core gains `eimir.plugins` (contract, loader, manifest, manifest executor) and one setting. Phase 1 needs no
  database migration: the existing tables and the migration chain stay as they are.
- The hand-maintained model lists in `db/registry.py` and `alembic/env.py` shrink to Core modules; the manifest
  becomes the single place that knows plugin tables.
- New Premium-only server features are written against the seam from Phase 1 on.
- `docs/IMPLEMENTATION-STATUS.md` and the matrix are not changed by this decision.

## Follow-ups found while reviewing (not part of this decision)

- `alembic/env.py` does not import `eimir.garden.models` or `eimir.shared_notes.models`. Autogenerate does not see
  those tables and could propose dropping them. The seam work fixes the Pro side; the Core side needs its own fix.
- Account deletion pseudonymizes the Account, so `ON DELETE CASCADE` on `accounts.id` never fires. This review
  found no code path that deletes `daily_quote_preferences` or `partner_location_consents` rows of a deleted
  Account. Verify and fix in a separate issue; the manifest's `ACCOUNT_DELETED` rule would cover it.

## Open decisions for the Product Owner

Decided on November 19, 2026 and restated by the Product Owner on November 20, 2026: the main repository becomes
private as soon as that is feasible and justifiable given the implementation state (Phases 1 and 2 are the
precondition, see decision 8). The Core is then published as its own public repository; the main repository and
the Pro code stay private. Still open:

0. **Where the Pro code lives after Phase 2:** inside the private main repository as a separate distribution
   (`backend/pro/`, the layout this decision assumes) or in a second private repository. The Product Owner's wording
   of November 20 ("main repository and Pro repository stay private") allows both. Phase 1 does not depend on the
   answer; Phase 2 does. A second repository is the superseded alternative of decision 7 and would bring back the
   cost described there (a second CI and review cycle per contract change).

1. **How the public Core is produced:** one reviewed snapshot per release, or a continuous mirror of reviewed
   revisions (decision 7).
2. **Which clients the public export contains**, and how their Pro screens and generated Pro client code are
   handled; this backend seam does not cover clients.
3. **Distribution channel for the Pro image:** a credentialed private registry, an image delivered with the
   signed license, or another channel; and how that fits "offline-verifiable without mandatory phone-home".
4. **Package absent versus downgrade:** confirm the interpretation in the business review.
5. **Extraction of `media.video_upload` and `daily.insights`:** deferred here; decided by the Product Owner for
   [#2085](https://github.com/baerenmarke90/eimir/issues/2085) and done there.
6. **License of the private package** for paying Self-Hosted operators (the public code is PolyForm
   Noncommercial 1.0.0).
