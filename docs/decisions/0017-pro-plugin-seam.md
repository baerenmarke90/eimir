# Decision 0017: A Pro plugin seam inside the Core backend

**Status:** Proposed; becomes accepted when the Product Owner merges the pull request  
**Date:** November 18, 2026  
**Owning issue:** none yet. No issue owns this work; open one ("Pro plugin seam, Phase 1") before any
implementation starts and link it here.  
**Builds on:** [ADR 0006](../m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md) (capability entitlements),
[`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md), [`FREEMIUM-FEATURE-MATRIX.md`](../FREEMIUM-FEATURE-MATRIX.md) (Version 1.36),
[`PREMIUM-BILLING-STRATEGY.md`](../PREMIUM-BILLING-STRATEGY.md) and [`SELF-HOSTING.md`](../SELF-HOSTING.md)  
**Baseline:** `origin/main` at `10b42f9f5`; every file reference below was read at that revision.

## Context

The Product Owner is evaluating "Variant 3A": the eimir. Core stays public, Premium-only server code moves into a
private package that is delivered to eimir. Cloud and to paying Self-Hosted operators as a private image. The Core
imports the Premium modules directly today, so no repository split is possible before a seam exists. The Product
Owner approved designing that seam first: this decision and its hook contracts. It moves no code and splits no
repository.

### What is Premium-only server code today

The backend has 98,946 lines in 444 Python files under `backend/src`. The standalone Premium surface is 10,830
lines:

| Module (`backend/src/eimir/`) | Lines | Tables | Matrix row and classification | Whole module Premium? |
| --- | ---: | --- | --- | --- |
| `garden` | 1,088 | 6 (`gardens`, `garden_*`) | Couple games, Premium (`games.couple`) | Yes |
| `heart_hunt` | 540 | `heart_hunt_rounds` | Couple games, Premium | Yes |
| `picture_ping_pong` | 370 | `picture_ping_pong` | Couple games, Premium | Yes |
| `once_messages` | 681 | `once_messages`, `once_devices`, `once_receptions` | Premium sending / non-paywallable reception and deletion | No: Mixed |
| `calendar_sync` | 1,471 | 4 (`calendar_*`, `space_calendar_targets`, `plan_calendar_links`) | External Integrations, Premium (`integration.external_sync`) | Yes |
| `photo_sources` | 1,374 | `photo_source_connections`, `photo_source_selections`, `google_account_hints` | External Integrations, Premium; disconnect stays available after downgrade | Yes, with a downgrade exit |
| `date_ideas` | 505 | none (packaged catalog) | Date inspiration, Premium (`planning.date_inspiration`) | Yes, but Core consumes its catalog (see below) |
| `quotes` | 532 | `daily_quote_preferences` | Daily Quote, Premium (`daily.quote`) | Yes |
| `presence` | 1,164 | `partner_location_consents`, `presence_snapshots`, `presence_device_credentials` | Partner location, Premium; reading one's own consent, Stop/`OFF`, lowering and deletion non-paywallable | No: Mixed |
| 10 routers in `api/v1/` | 3,105 | | `garden`, `games`, `heart_hunt`, `once_messages`, `calendar_sync`, `photo_sources`, `date_ideas`, `daily_quote`, `picture_ping_pong`, `partner_location` | |

The nine modules hold 22 tables. Their ORM models are 1,173 lines.

Deliberately **not** part of the plugin, with the reason:

- `recaps` (4,208 lines) stays Core. Its matrix row is "Premium composition / Free retained artifacts", retained
  editions must stay readable without Pro, and `eimir.recaps.local_ai` is shared by `context_tags`,
  `daily_checkins` and `config`.
- `wish_selections` (884 lines) stays Core. The matrix classifies it Free/Core; only the date-idea candidate
  branch checks `planning.date_inspiration` (`wish_selections/service.py`, `DATE_IDEAS_CAPABILITY`).
- `eimir.games` (274 lines) is split: `games/questions.py` stays Core because the Free/Core Memory API validates
  guided-experience question IDs against it (`api/v1/memories.py`, `QUESTION_IDS`); `games/service.py` is the read
  model of the Premium games router and moves with it.
- Four capabilities are plain gates inside shared Core code and stay there: `memories.map`
  (`api/v1/places.py`), `relationship.passport` (`api/v1/dashboard.py`, `recaps/service.py`),
  `partner.quick_actions.extended` (`api/v1/engagement.py`) and `theme.bespoke_packs` (`api/v1/appearance.py`,
  `appearance/models.py`).
- `media.video_upload` (`api/v1/video.py`, `attachments/videos.py`, `attachments/video_jobs.py`,
  `jobs/video_worker.py`, gate also in `attachments/service.py` and `photo_sources/service.py`) and
  `daily.insights` (`daily_checkins/insights.py`, `recaps/mood.py`, `api/v1/daily_checkins.py`) are extractable,
  but they are woven into attachments and recaps. Their extraction is deferred to a later phase.
- `storage.cloud_quota_50gb` is an operating-model capability, already removed on Self-Hosted by
  `CLOUD_ONLY_CAPABILITIES` in `entitlements/service.py`. It stays Core.

`backend/src/eimir/entitlements/models.py` defines 19 capabilities. Six have no implementation anywhere:
`chapter.rich_presentation`, `occasion.automation`, `recap.pdf_yearbook`, `recap.video_montage`,
`question.5_year_mirror`, `surprise_mode.vault`. Their first implementation should be written as plugin code from
day one.

### Direct Core-to-Pro coupling (verified)

These are the call sites the seam replaces. They are the real work.

| # | Core file and function | What it imports or calls today |
| --- | --- | --- |
| C1 | `api/v1/__init__.py` (module level) | Imports the 10 Pro routers and mounts them on `normal_router` |
| C2 | `db/registry.py` `MODEL_MODULES` | 8 Pro model modules (all except `date_ideas`, which has no tables) |
| C3 | `alembic/env.py` (module level) | 7 Pro model modules for autogenerate; `garden.models` is missing (see follow-ups) |
| C4 | `security/lifecycle.py` `payload_tables()` | Discovers encrypted payload tables through `db/registry.load_all_models()`; 5 Pro modules have `ProtectedPayloadJSON` columns: `once_messages`, `calendar_sync`, `photo_sources`, `presence`, `picture_ping_pong` |
| C5 | `jobs/runner.py` `main()` | `register_handlers()` of `calendar_sync.jobs`, `heart_hunt.retention`, `once_messages.service`, `photo_sources.retention`, `presence.retention` |
| C6 | `jobs/runner.py` `_ensure_maintenance()` | `ensure_scheduled(session)` of `heart_hunt.retention`, `presence.retention`, `photo_sources.retention` |
| C7 | `jobs/maintenance.py` `run_security_retention()` | `once_messages.service.prune_expired` |
| C8 | `engagement/service.py` `project_event()` | `calendar_sync.on_outbox_event`; projection branches for `ONCE_MESSAGE_SENT`, `HEART_HUNT_HIDDEN`/`HEART_HUNT_FOUND`, `GARDEN_SEED_ARRIVED`/`GARDEN_BOUQUET_GIVEN` (with `garden.notice_taken_today`) and `PICTURE_PING_PONG_TURN` |
| C9 | `engagement/service.py` `_TARGET_MODELS`, `_target_is_projectable()`, `_projectable_predicate()`, `_picture_turn_exists()` | Target availability for `ONCE_MESSAGE` (`OnceMessage`, `once_messages.available_predicate`), `GARDEN_SEED` and `GARDEN_BOUQUET` (`garden.seed_is_waiting`, `garden.bouquet_is_open`), `PICTURE_GAME` (`PicturePingPong`) |
| C10 | `relationship/service.py` `add_member()` | `picture_ping_pong.purge_space`, `garden.purge_space` |
| C11 | `relationship/service.py` `end_membership()` | `once_messages.purge_space`, `heart_hunt.purge_space`, `picture_ping_pong.purge_space`, `garden.purge_space` |
| C12 | `relationship/offboarding.py` `leave_space()` | `calendar_sync.on_membership_ended` |
| C13 | `identity/deletion.py` `apply_core_cleanup()` | Deletes `PhotoSelection`, `PhotoConnection`, `GoogleAccountHint`, `CalendarConnection`, `CalendarOAuthTransaction` rows |
| C14 | `transfer/service.py` `build_export_archive()` | `PhotoConnection`, `GoogleAccountHint` into `personalPhotoSources` and `personalGoogleAccountHint` |
| C15 | `attachments/binding.py` `parent_of()` | `HeartHuntRound` to resolve parent type `HEART_HUNT_ROUND` |
| C16 | `attachments/retention.py` `classify_owner_attachment()` | `HeartHuntRound.hider_id` for account cleanup |
| C17 | `attachments/service.py` `_require_readable_parent()` | `heart_hunt.can_read_photo` |
| C18 | `wish_selections/service.py`, `api/v1/wish_selections.py` | `date_ideas.catalog.get_catalog`, `IDEA_ID_PATTERN`, `date_ideas.images.get_images` |
| C19 | `demo/__init__.py` `_ensure_demo_quote_preferences()`, `demo/feature_examples.py` `_ensure_partner_location()` | `quotes.service`, `presence.service`, `presence.models.SharingLevel` |

Two further facts shape the design:

- **Shared closed vocabularies stay Core.** `EventType`, `NotificationKind`, `EngagementTarget`, the job kinds and
  the attachment parent type `HEART_HUNT_ROUND` (also listed in `api/v1/attachments.py`) are database check
  constraints and client contract. Of the 160 Alembic migrations, 16 create or alter Pro tables and 6 more are
  Core migrations that rewrite the shared notification-kind and target constraints and restate Pro values in them
  (`0126`, `0139`, `0140`, `0143`, `0151`, `0159`): 22 in total. `backend/openapi.json` holds 408 operations, 67 of them
  tagged with the Pro router tags; the generated Web client contains them as well.
- **Space deletion is already plugin-independent.** Every Pro table references `spaces.id` or `accounts.id` with
  `ON DELETE CASCADE`. Account deletion is not: Account rows are pseudonymized, so their cascade never fires and
  `apply_core_cleanup()` deletes rows explicitly (C13).

### Corrections to the initial measurement

The Product Owner's session measured the surface before this decision. These points were confirmed or corrected
against the code:

- Confirmed: total size, per-module sizes, the 3,105 router lines, 19 capabilities, the six unimplemented ones,
  `recaps` and `wish_selections` staying Core.
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
- The migration count is 22, not 21: 16 touch Pro tables and 6 shared Core migrations restate Pro values in
  shared constraints.

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
| Keep everything public (no seam) | Not a seam option; it remains the Product Owner's alternative to Variant 3A and is listed under open decisions. |

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
- The `api`, `worker` and `migrate` processes load plugins through the same function and the same setting.

### 3. The hook contract

The contract is one `typing.Protocol` (`eimir.plugins.contract.ProPlugin`) plus a narrow Core facade object
handed to hooks that need Core services (notification projection, attachment deletion, job queue). Hooks receive
the caller's `Session` and never commit, roll back or open their own transaction.

| Hook | Replaces | Transaction and idempotency contract | Failure behavior |
| --- | --- | --- | --- |
| `seam_version`, `core_revision`, `name` | (new) | Constant attributes | Mismatch refuses to start (decision 1). |
| `capabilities() -> frozenset[str]` | (new) feeds the filter next to `CLOUD_ONLY_CAPABILITIES` in `entitlements/service.py` `_grant_capabilities()` | Pure; read once at startup | A string that is not a `Capability` value refuses to start. Absent plugin: decision 5. |
| `routers() -> Sequence[APIRouter]` | C1 | Mounted once, in `create_app()` (`main.py`), into `normal_router`, after all Core routers; today the router is assembled at import time of `eimir.api.v1`, which Phase 1 changes into a builder function | A `(method, path)` pair that collides with Core or another plugin refuses to start. Absent plugin: the paths do not exist and FastAPI answers `404`. |
| `model_modules() -> Sequence[str]` | C2, C3 | Import only | Import error refuses to start. Lifecycle correctness never depends on this hook (decision 4). |
| `migrations() -> MigrationSpec` (script location, `version_table`) | (new, decision 6) | Run by the `migrate` service after Core reaches head, in the same deploy step | A failing plugin migration fails `migrate`, which blocks the runtime exactly like a failing Core migration (`SELF-HOSTING.md`, "Upgrade and rollback semantics"). |
| `register_jobs(registry)` | C5 | Handlers run in the job's `unit_of_work` with the existing retry, `DeferredJobError` and `RetryableJobError` semantics | Registering a kind that Core or the manifest does not declare as plugin-owned refuses to start. |
| `ensure_scheduled(session)` | C6 | Called inside `_ensure_maintenance()`'s `unit_of_work`; must stay idempotent with the existing advisory-lock pattern of each module | An exception aborts the worker start, as today. |
| `on_outbox_event(session, event, event_type)` | C8 (`calendar_sync.on_outbox_event`) | Runs inside `project_event()` before `_event_effects_allowed()`; may only enqueue work; must be idempotent under Outbox replay | An exception fails the projection job, which retries, as today. |
| `project_notification(session, event, event_type, core) -> bool` | C8 projection branches | Runs after `_event_effects_allowed()`; uses the facade's target-notification projection, whose `ON CONFLICT` keys keep replays idempotent; returns `True` when it handled the event | Absent plugin: events of plugin types are not projected, so no new notification appears. |
| `engagement_targets() -> Mapping[EngagementTarget, TargetRule]` (row check and SQL `exists` predicate) | C9 | Pure SQL expressions composed into Core queries; no I/O, no writes | Absent plugin: the predicate is `false()`, so existing notifications for those targets are hidden (fail closed). |
| `attachment_read_authorizer(parent_type)` | C17 | Read only | Absent plugin: the existing `privacy_absence` branch denies the read. |
| `on_partner_joined`, `on_membership_ended`, `on_account_deleted` | Only those parts of C10 to C13 that a manifest rule cannot express | Run in the caller's transaction **after** Core has applied the manifest rules | An exception rolls the whole lifecycle transaction back (fail closed, as today). Absent plugin: the manifest rules alone apply. |
| `export_account_document(session, authorization, scope) -> Mapping` | C14 | Read only, inside the export transaction | Absent plugin: the manifest export rule produces the same keys (decision 4). |
| `date_idea_catalog() -> Catalog` | C18 | Pure, cached | Absent plugin: Core treats the catalog as unavailable, which is the existing paused state of a round that contains date ideas (#465 within #1535): Wish-only rounds are unaffected, nothing is deleted, export keeps catalog IDs only. `IDEA_ID_PATTERN` stays a Core contract constant. |
| `seed_demo(session, result)` | C19 | Inside the demo seed transaction; idempotent like the existing demo helpers | Absent plugin: the demo Space has no quote preferences and no location share. |
| `validate(settings) -> None` | (new) | Startup only | Raising refuses to start with the plugin's diagnostic. |

C15 and C16 (attachment parent resolution and owner classification) and C4 and C7 are **not** hooks. They become
manifest rules, because they must work without the plugin.

### 4. Data lifecycle never depends on the plugin being loaded

A Core instance can run without the plugin after it once ran with it: an operator removes the Pro image, a
license lapses and the operator switches images, or a Self-Hosted installation is restored from a Pro backup.
Deletion, retention, encryption and export must stay correct in that state. Core therefore owns a declarative
manifest of every plugin-owned table (`eimir.plugins.manifest`), one row per table, with:

- the table name, the owning capability and the scope columns (`space_id`, account columns);
- `purge_on`: `PARTNER_JOINED`, `MEMBERSHIP_ENDED` and `ACCOUNT_DELETED`, executed by Core in the places of C10 to
  C13 (Space deletion keeps relying on the `ON DELETE CASCADE` foreign keys);
- `expires_column` for time-based retention, executed by Core's existing security-retention job (replaces C7 and
  the database part of the `presence`, `heart_hunt` and `photo_sources` retention jobs);
- `attachment_columns` with the parent type (`HEART_HUNT_ROUND`), so `binding.parent_of()` keeps attachment
  exclusivity, account cleanup keeps classifying the hider's photo, and purges hand attachments to
  `mark_for_deletion` (replaces C15, C16 and the attachment part of `heart_hunt.purge_space`);
- `protected_payload` with its crypto context, so `security/lifecycle.py` migrates, rotates and verifies these
  tables without importing the plugin (replaces C4). This is required by the at-rest encryption goal: without it a
  Core-only key rotation would silently skip five Pro tables;
- `export`: the account-document keys and the columns or payload fields they contain (replaces C14 for the
  Core-only case);
- `job_kinds`: the job kinds the plugin owns. A Core-only worker does not claim them, instead of failing them
  permanently as "unknown job kind" (`jobs/worker.py`), so they resume when the plugin returns. Their privacy
  effect is covered by `expires_column` rules, not by the jobs.

Alembic autogenerate in a Core-only checkout must not propose dropping manifest tables: `alembic/env.py` gains an
`include_object` filter for them.

The plugin's own hooks add only behavior a table rule cannot express. At the baseline that is nothing for
lifecycle: every Pro purge is a database delete, and the only provider-side effect (calendar credential
revocation) happens on explicit disconnect, not on membership end or account deletion.

**Required Core tests:**

- every table of every plugin's `model_modules()` has a manifest row, and every manifest row names an existing
  table with the declared columns;
- every plugin table with a `ProtectedPayloadJSON` column has `protected_payload` in the manifest;
- with the plugin unloaded, partner join, membership end and account deletion remove the same rows as with the
  plugin loaded, and expired rows are purged.

A new Pro table therefore needs a manifest row in Core in the same release. That is part of the two-PR reality
in decision 7.

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

- The 22 existing migrations that touch Pro tables or Pro values stay in the Core chain. Rewriting the chain of
  existing installations is not acceptable.
- **Challenge to "a separate Alembic branch in `version_locations`":** a branch records its head in the same
  `alembic_version` table. A Core-only `migrate` that cannot locate that revision exits non-zero, which is exactly
  the refused-rollback path in `SELF-HOSTING.md`. A Core-only start after Pro would become impossible. New plugin
  tables therefore use a **separate Alembic environment with its own `version_table`** (for example
  `alembic_version_pro`), run by the same `migrate` service after Core reaches head. Core never sees it.
- Plugin migrations may reference Core tables; Core migrations never reference plugin tables. Pro values in shared
  Core vocabularies (`EventType`, `NotificationKind`, `EngagementTarget`, job kinds, attachment parent types) stay
  Core migrations, because they are shared contract.

### 7. API contract

- The contract stays public in Core. Phase 1 and 2 change nothing: `backend/scripts/openapi_contract.py` builds
  `backend/openapi.json` from `eimir.main.app` with the plugin loaded, and the Web client is generated from it.
- After a repository split Core keeps the complete `openapi.json`. Core CI checks that its Core-only contract
  equals the committed one minus the plugin's declared tags and paths; the private repository's CI generates its
  fragment and checks it against the Core copy at the pinned Core revision.
- The two-PR reality: a Pro API change is a Core PR (contract, Web client, manifest rows, shared vocabulary values)
  merged first, then a Pro PR with the implementation pinned to that Core revision.
- Rejected alternative: keeping the Pro routers and DTOs in Core with plugin-provided services. It keeps one
  OpenAPI source but leaves the full HTTP layer, its validation and its error mapping public, and it turns "route
  absent" into "route present, returns an error" on Core-only.

### 8. Phasing

**Phase 1: the seam, code stays in this repository.** The Pro modules move nowhere. One in-tree plugin object
(`eimir.pro_plugin`) registers them through the hooks; Core calls them only through the seam. Behavior is
identical with the plugin loaded.

Acceptance criteria for Phase 1:

1. No Core module imports `garden`, `heart_hunt`, `picture_ping_pong`, `once_messages`, `calendar_sync`,
   `photo_sources`, `date_ideas`, `quotes`, `presence`, `providers/caldav.py` or `games/service.py`; the `ast` test
   enforces it.
2. `db/registry.py` and `alembic/env.py` list no Pro model module; the plugin contributes them.
3. The manifest covers the 22 Pro tables; the manifest tests in decision 4 pass.
4. The backend test suite runs in two configurations in CI: plugin loaded (today's suite, unchanged results) and
   Core-only. Core-only asserts: every Pro path answers `404`; plugin-owned capabilities are absent from the
   effective entitlement even with an active `PREMIUM` grant; partner join, membership end and account deletion
   still purge the Pro rows; expired presence snapshots, once messages and photo selections are still purged; the
   encryption verify command reports the five Pro payload tables; notifications for plugin targets are hidden.
5. A plugin named but missing, a seam mismatch, a revision mismatch and a route collision each refuse to start
   (unit tests on the loader).
6. `backend/openapi.json` is byte-identical before and after.
7. Startup logs name the loaded plugins, their seam version and revision, and the provided capabilities.

Phase 1 can be cut into reviewable PRs: (a) loader, contract, manifest, registry, Alembic and encryption wiring;
(b) jobs, retention, engagement and attachment hooks; (c) routers, capability filter and the Core-only CI
configuration; (d) date ideas, `eimir.games` split and demo hooks.

**Phase 2: relocation.** The modules move into a separate distribution (`eimir-pro`, for example
`backend/pro/`) that is still in this repository and still in the public image, with its own tests. No behavior
change.

**Phase 3: delivery.** A private Pro image built `FROM` the Core image digest, a release identity for it, and
the distribution channel the Product Owner selects (open decisions). Only here does the code stop being public in
new releases.

**Effort estimate (an estimate, not a commitment):** Phase 1 about 8 to 12 working days of agent-assisted work
including review cycles, about 1,500 to 2,500 changed lines across the 19 call sites, the seam and the Core-only
test configuration. Phase 2 about 4 to 6 days. Phase 3 depends on the distribution decision: about 5 to 10 days
for image build, release identity, Self-Hosted documentation and license delivery.

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
- **Interpretation to confirm:** "package absent" is an operating choice, not a commercial downgrade. The matrix
  promises, for example, that pending once messages stay openable and that photo integrations can be disconnected
  after a downgrade. With the package absent the manifest still enforces lifetimes and deletion, but the
  interactive exits (open a pending once message, disconnect an integration, change a location consent) need the
  package. This decision proposes that interpretation; the Product Owner confirms or rejects it.

## Cross-cutting quality

- **Security and supply chain:** the allow-list, the single-distribution check and the revision pin stop an
  unrelated installed package from claiming the plugin name. The plugin runs in-process with full Core privileges;
  the seam is a code-organization boundary, not a sandbox. The Pro image must carry the same digest, attestation
  and immutable-release guarantees as the Core images. Fail-closed startup prevents a half-loaded Pro.
- **Privacy and data lifecycle:** decision 4. Plugin target predicates fail closed. Startup diagnostics contain
  table names and counts only.
- **Concurrency and transactions:** hooks run in the caller's transaction and never commit; existing lock order
  (`relationship.lock_space`, account locks in `project_event`) is unchanged because the hooks are called at the
  same points. Purge order is Core manifest first, then plugin hook.
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

- **Git history keeps today's Pro code public.** Every module listed above, the editorial date-idea catalog and
  its 25 images (`date_ideas/data`) and the quote catalog are in the public history and in cached pull-request
  refs. A split protects only code written after it. Rewriting public history would not remove existing clones.
- **Paying Self-Hosted operators receive the code.** A Python package in an image is readable source or bytecode.
  Protection there is the license and its terms, not secrecy.
- **Gates in shared Core code stay patchable.** `memories.map`, `relationship.passport`,
  `partner.quick_actions.extended`, `theme.bespoke_packs`, `media.video_upload` and `daily.insights` are checks in
  public code. Anyone running a modified Core can remove them, as they can today.
- **Workflow cost.** After a split, every Pro change touching the contract needs two PRs, two CI runs and a
  revision pin. Shared refactorings in Core can break the plugin, and the lock-step pin turns every Core release
  into a Pro release.
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

1. **Repository split yes or no.** The seam is worth having either way (it removes 19 coupling sites and makes
   Core-only testable); the split is a separate decision with the costs above.
2. **Distribution channel for the Pro image:** a credentialed private registry, an image delivered with the
   signed license, or another channel; and how that fits "offline-verifiable without mandatory phone-home".
3. **Contract ownership after a split:** this decision proposes Core owns the full contract (decision 7).
4. **Package absent versus downgrade:** confirm the interpretation in the business review.
5. **Extraction of `media.video_upload` and `daily.insights`:** deferred here; decide whether and when.
6. **License of the private package** for paying Self-Hosted operators (the public code is PolyForm
   Noncommercial 1.0.0).
