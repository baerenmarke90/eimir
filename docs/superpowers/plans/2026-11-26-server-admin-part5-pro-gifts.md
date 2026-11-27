# ServerAdmin part 5: Pro overview and gift codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloud-only ServerAdmin "Pro" area (Pro/Play figures, running gifts, eimir. gift code batches) and web redemption of gift codes on `/more/pro`.

**Architecture:** Gift code batches and codes live in two new tables of the first Pro migration chain (`alembic_version_pro`). Redemption records an `ADMIN_GRANT` with `external_reference="gift-code:<code id>"` under a per-Space lock. A new non-entitlement operator capability `gift_codes.operator`, provided by the Pro plugin, gates everything; Core only reads it for the `proAreaAvailable` flag.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (plugin chain), PostgreSQL, pytest; React 19 + TanStack Query, i18next, Vitest; Playwright (CI only).

**Spec:** `docs/superpowers/specs/2026-11-26-server-admin-part5-pro-gifts-design.md` (approved 2026-11-26), sub-issue #2328 (Mobile Interaction Contract, approved German copy).

## Global Constraints

- Available only when the Pro plugin is loaded **and** `EIMIR_DEPLOYMENT=cloud`; otherwise navigation/redeem entries are absent and every new endpoint answers 404 (after authentication/authorization, so callers learn nothing).
- Core never imports `eimir_pro` (`tests/unit/test_core_imports_no_plugin.py`).
- Code format `EIMIR-XXXX-XXXX`, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (31 chars, no `0 O 1 I L`), generated with `secrets`.
- Durations `1, 3, 6, 12` calendar months; batch size `1..100`; redeemable-until default now + 12 months, allowed range tomorrow .. now + 24 months; note ≤ 120 chars.
- Rate limits: 5 failed redemptions per Account per hour, 20 per Space per day (reserve with `rate_limit.check`, `rate_limit.clear` on success, like sign-in).
- The plain code never appears in logs, grant metadata, audit rows or problem details.
- Engineering language English; German only in i18n resources; copy exactly as approved in #2328.
- Web: no own keyframes/layout transitions outside `src/motion/` (`web/scripts/check-motion-layer.mjs`); no borders on chips; semantic tokens only; never pass `t` with a hand-written type; German literals never in tests (derive from locale resources).
- Redeem entry hidden in the native app by `isCapacitorNative()`, never by viewport.
- Migration bookkeeping on every `main` merge: `alembic heads`, matrix version after the newest on `main` (part 3 takes 1.53).

## Review Focus

1. Two different codes redeemed by the same Space at the same moment — both months must count (per-Space lock; test in Task 5).
2. The same code redeemed twice by the same Space after a lost response — same answer, no second extension (Task 5).
3. Pasted codes with lowercase, spaces, missing prefix or `–` dashes from messengers — accepted (Task 3).
4. A Space that has only expired/revoked grants — treated as "no Pro", starts now (Task 5).
5. A gift extended by a code must not show as "ends soon" on Situation (Task 1).

---

### Task 1: Operator capability, availability flag and per-Space expiring-gift queue (Core)

**Files:**
- Modify: `backend/src/eimir/entitlements/models.py` (new `Capability.GIFT_CODES_OPERATOR = "gift_codes.operator"` with a docstring like `SUPPORT_OPERATOR`)
- Modify: `backend/src/eimir/entitlements/service.py:24` (add it to `NON_ENTITLEMENT_CAPABILITIES`)
- Modify: `backend/src/eimir/plugins/manifest.py` (add it to `PRO_CAPABILITIES`; `_GIFT_CODES = Capability.GIFT_CODES_OPERATOR`)
- Modify: `backend/src/eimir/api/v1/server_admin.py` (overview field `pro_area_available`; expiring-gift query at ~761-779)
- Test: `backend/tests/unit/test_entitlements_service.py`, `backend/tests/unit/test_plugin_manifest.py`, `backend/tests/integration/test_server_admin.py`

**Interfaces:**
- Produces: `Capability.GIFT_CODES_OPERATOR`; `server_admin.pro_area_available(settings: Settings) -> bool` (Cloud and the capability in `loaded_plugins().capabilities()`); overview JSON `proAreaAvailable: bool`.

- [ ] **Step 1: Failing tests**
  - `test_gift_codes_operator_is_never_granted`: a Premium grant with `capabilities=None` does not resolve `gift_codes.operator` (mirror the existing `SUPPORT_OPERATOR` test).
  - `test_pro_capabilities_include_gift_codes_operator` in the manifest test.
  - `test_overview_pro_area_available` parametrized: (cloud, pro loaded) → `True`; (self_hosted, pro) → `False`; (cloud, Core-only via `EIMIR_PLUGINS=`) → `False`.
  - `test_expiring_gifts_ignore_space_extended_by_later_grant`: Space with ADMIN_GRANT ending in 3 days plus another valid PREMIUM grant ending in 90 days → not in the attention list and not counted; a Space with only the 3-day gift → listed.
- [ ] **Step 2: Run, expect FAIL**: `cd backend; uv run pytest tests/unit/test_entitlements_service.py tests/unit/test_plugin_manifest.py tests/integration/test_server_admin.py -k "gift or pro_area or expiring" -q`
- [ ] **Step 3: Implement.** Expiring filter: keep the current four conditions and add `~exists()` of another grant of the same `space_id`, tier PREMIUM, status in (ACTIVE, TRIAL, GRACE_PERIOD, GRANDFATHERED), with `effective_until IS NULL OR effective_until > <outer>.effective_until` (use `aliased(EntitlementGrant)`). Pro plugin `_CAPABILITIES` already equals `PRO_CAPABILITIES`.
- [ ] **Step 4: Run, expect PASS** (same command) plus `uv run pytest tests/unit/test_core_imports_no_plugin.py -q`.
- [ ] **Step 5: Commit** `feat(server-admin): gift code operator capability and per-Space expiring gifts (part 5)`

### Task 2: Pro migration chain and gift code models

**Files:**
- Create: `backend/pro/src/eimir_pro/gift_codes/__init__.py`, `backend/pro/src/eimir_pro/gift_codes/models.py`
- Create: `backend/pro/src/eimir_pro/alembic/versions/0001_gift_codes.py` (copy the shape of `backend/admin/src/eimir_admin/alembic/versions/0001_support_report_tickets.py`)
- Modify: `backend/pro/src/eimir_pro/plugin.py` (`migrations()` → `MigrationSpec(script_location=<eimir_pro>/alembic, version_table="alembic_version_pro")`; add `"eimir_pro.gift_codes.models"` to `_MODEL_MODULES`)
- Modify: `backend/src/eimir/plugins/manifest.py` (two `PluginTable` rows, capability `_GIFT_CODES`, `space_column=None`, `account_columns=()`, `protected_payload_context` for `gift_codes`)
- Modify: `backend/pro/src/eimir_pro/portability/allowlist.py` (both tables in `EXCLUDED_TABLES`: "Operator-side gift code batch/code; not a couple's content.")
- Modify: `backend/tests/support/plugins.py` (`CHAIN_PLUGIN_TABLES` gains both), `backend/tests/unit/test_payload_encryption.py` (`"gift_codes": "GiftCodePayload"`), Pro test conftest drop-table list like `backend/admin/admin_tests/conftest.py:52`
- Test: `backend/pro/pro_tests/unit/test_gift_code_models.py`, `backend/pro/pro_tests/integration/test_gift_code_migration.py`, `backend/pro/pro_tests/unit/test_allowlist_guard.py`

**Interfaces:**
- Produces (`eimir_pro.gift_codes.models`):
  - `class GiftCodePayload(ProtectedPayload): code: str`
  - `class GiftCodeBatch(IdMixin, Base)`: `__tablename__="gift_code_batches"`; `note: str | None` (String(120)); `duration_months: int` (check `IN (1,3,6,12)`); `redeemable_until: datetime`; `created_by: UUID | None` (FK accounts SET NULL); `created_at: datetime` (server default now); `revoked_at: datetime | None`; `revoked_by: UUID | None` (FK accounts SET NULL).
  - `class GiftCode(IdMixin, Base)`: `__tablename__="gift_codes"`; `batch_id` (FK batches CASCADE, index); `payload: GiftCodePayload` (`ProtectedPayloadJSON`); `crypto_version: int` (SmallInteger, default 0); `lookup_hash: str` (String(64), unique); `handed_out_at`, `redeemed_at`, `revoked_at: datetime | None`; `redeemed_space_id: UUID | None` (FK spaces SET NULL, index); `redeemed_grant_id: UUID | None` (FK entitlement_grants SET NULL); check `NOT (redeemed_at IS NOT NULL AND revoked_at IS NOT NULL)`.
  - `privacy_class` as the existing operator tables require (follow the failing registry test's message).

- [ ] **Step 1: Failing tests**: model metadata (table names, unique `lookup_hash`, both check constraints by name), allowlist guard (both in `EXCLUDED_TABLES`, not exported), migration test modelled on `admin_tests/test_ticket_migration.py` (upgrade creates both tables in `alembic_version_pro`, downgrade drops them, Core-only `migrate` never creates them).
- [ ] **Step 2: Run, expect FAIL**: `cd backend; uv run pytest pro/pro_tests/unit/test_gift_code_models.py pro/pro_tests/integration/test_gift_code_migration.py pro/pro_tests/unit/test_allowlist_guard.py -q`
- [ ] **Step 3: Implement models, revision `0001` (down_revision None), plugin wiring and registrations.**
- [ ] **Step 4: Run** the Step 2 command plus `uv run pytest tests/unit/test_plugin_manifest.py tests/unit/test_payload_encryption.py tests/unit/test_plugin_loader.py -q`, then `uv run python scripts/schema_fingerprint.py check` (refresh `tests/fixtures/schema_fingerprint.json` only if it covers plugin chain tables), `uv run alembic heads` (Core head unchanged).
- [ ] **Step 5: Commit** `feat(pro): gift code tables in the first Pro migration chain (part 5)`

### Task 3: Code generation, normalization and lookup hash

**Files:**
- Create: `backend/pro/src/eimir_pro/gift_codes/codes.py`
- Test: `backend/pro/pro_tests/unit/test_gift_code_format.py`

**Interfaces:**
- Produces: `ALPHABET: str`; `generate_code() -> str` (returns `EIMIR-XXXX-XXXX`); `normalize(raw: str) -> str | None` (canonical `EIMIR-XXXX-XXXX` or `None`); `lookup_hash(code: str) -> str` (hex HMAC-SHA256 of the canonical code with key `hmac.new(settings.cursor_signing_secret, b"eimir.gift_code.lookup.v1", sha256).digest()`, pattern of `eimir.core.request_fingerprint._key`).

- [ ] **Step 1: Failing tests**
  - `generate_code()` matches `^EIMIR-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[...]{4}$`; 1,000 calls give 1,000 distinct values.
  - `normalize` maps `"eimir-abcd-efgh"`, `" ABCD EFGH "`, `"abcdefgh"`, `"EIMIR–ABCD–EFGH"` (en dash), `"EIMIR—ABCD—EFGH"` (em dash) to `"EIMIR-ABCD-EFGH"`; returns `None` for `""`, `"ABC"`, `"EIMIR-ABCD-EFG0"` (excluded char), 9 characters, `None`-like whitespace.
  - `lookup_hash` is deterministic, 64 hex chars, differs for two codes and changes when `cursor_signing_secret` changes.
- [ ] **Step 2: Run, expect FAIL**: `uv run pytest pro/pro_tests/unit/test_gift_code_format.py -q`
- [ ] **Step 3: Implement** (normalize: uppercase, drop whitespace and `-–—`, strip leading `EIMIR`, require exactly 8 alphabet chars).
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(pro): gift code format and keyed lookup (part 5)`

### Task 4: Operator service — batches, codes and Pro overview figures

**Files:**
- Create: `backend/pro/src/eimir_pro/gift_codes/service.py`, `backend/pro/src/eimir_pro/gift_codes/overview.py`
- Modify: `backend/pro/src/eimir_pro/plugin.py` (`prune_expired` also calls `gift_codes.service.prune_batches`)
- Test: `backend/pro/pro_tests/integration/test_gift_code_batches.py`, `backend/pro/pro_tests/integration/test_pro_overview.py`

**Interfaces:**
- Consumes: Task 2 models, Task 3 `generate_code`, `lookup_hash`.
- Produces:
  - `create_batch(session, *, actor_id: UUID, count: int, duration_months: int, redeemable_until: datetime | None, note: str | None) -> GiftCodeBatch` (raises `ValidationFailedError`-style 422 for out-of-range values; retries generation on a `lookup_hash` collision).
  - `code_state(code: GiftCode, batch: GiftCodeBatch, at: datetime) -> Literal["open","handed_out","redeemed","revoked","expired"]`.
  - `list_batches(session, at) -> list[BatchSummary]` (counts per state, newest first); `get_batch(session, batch_id) -> GiftCodeBatch` (404 `GIFT_CODE_BATCH_NOT_FOUND`).
  - `set_handed_out(session, code_id: UUID, handed_out: bool) -> GiftCode`; `revoke_code(session, code_id, actor_id)`; `revoke_batch(session, batch_id, actor_id)` (only unredeemed codes; redeemed ones and their grants stay).
  - `prune_batches(session, at)` deletes batches whose codes are all redeemed/revoked/expired and whose last change is older than 24 months.
  - `overview(session, at) -> ProOverview` with `spaces_total`, `spaces_premium`, `premium_by_play`, `premium_by_gift`, `play: PlayStates(active, cancelled_running, payment_problem, ended_30d)`, `cancellations_30d`, `running_gifts: list[RunningGift(space_id, origin: "manual"|"code", batch_note, effective_until)]` (one row per Space with its latest gift end; unlimited last; cap 50) and `running_gifts_total`.

- [ ] **Step 1: Failing tests**
  - batch of 10 × 3 months: 10 distinct codes, `redeemable_until` ≈ now + 12 months, codes decrypt to the format; count 0/101, duration 2, note 121 chars, redeemable_until yesterday or > 24 months → 422.
  - states: handed-out toggle on/off; revoke a code; revoke a batch leaves a redeemed code redeemed; past `redeemable_until` → `expired`.
  - prune keeps a batch with an open code; removes a fully redeemed batch 25 months old.
  - overview: fixture with 5 Spaces — Play active renewing, Play `autoRenewing=false` changed 10 days ago, Play GRACE_PERIOD, Play EXPIRED 5 days ago, manual gift + code gift on one Space → exact counts (`spaces_premium`=4 counts the Space with both once; `cancellations_30d`=1: the cancelled-running grant counts, the EXPIRED one does not — only `autoRenewing=false` or `REVOKED` with `source_event_at` in the last 30 days count; `play.ended_30d`=1); `running_gifts` has one row for the double-gift Space with the later end.
- [ ] **Step 2: Run, expect FAIL**: `uv run pytest pro/pro_tests/integration/test_gift_code_batches.py pro/pro_tests/integration/test_pro_overview.py -q`
- [ ] **Step 3: Implement.** Play figures read the latest `GOOGLE_PLAY` grant per Space (`metadata.autoRenewing`, `status`, `source_event_at`); a Space counts Premium when `get_effective_space_entitlement` would say PREMIUM — implement as one SQL aggregate over valid grants, not a per-Space loop.
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(pro): gift code batches and Pro overview figures (part 5)`

### Task 5: Redemption

**Files:**
- Create: `backend/pro/src/eimir_pro/gift_codes/redemption.py`
- Modify: `backend/src/eimir/auth/rate_limit.py` (`GIFT_CODE_HOURLY = Limit(5, timedelta(hours=1))`, `GIFT_CODE_DAILY = Limit(20, timedelta(days=1))`)
- Test: `backend/pro/pro_tests/integration/test_gift_code_redemption.py`

**Interfaces:**
- Consumes: Tasks 2–4; `eimir.db.locks.lock_subject`; `entitlements.record_grant`; `rate_limit.check/clear`.
- Produces: `redeem(session, *, space_id: UUID, account_id: UUID, raw_code: str, at: datetime) -> Redemption(effective_until: datetime, extended: bool)`; errors (`ConflictError`/`NotFoundError` subclasses with codes) `GIFT_CODE_INVALID` (422), `GIFT_CODE_USED` (409), `GIFT_CODE_SUBSCRIPTION_ACTIVE` (409), `GIFT_CODE_UNLIMITED` (409), plus the existing `RATE_LIMITED` (429).

- [ ] **Step 1: Failing tests** (one per design 5.1 row and the Review Focus)
  - no grant → grant ADMIN_GRANT ACTIVE PREMIUM, `effective_from=at`, `effective_until=at+3 months`, `external_reference="gift-code:<id>"`, `account_id`=redeemer, metadata `{"giftCodeBatchId": ...}` without the code; `extended=False`; code row redeemed with space and grant ids.
  - running gift ending at T → `effective_until = T + 3 months`, `extended=True`.
  - Play ACTIVE `autoRenewing=True` → `GIFT_CODE_SUBSCRIPTION_ACTIVE`, code still open; Play TRIAL renewing and GRACE_PERIOD → same.
  - Play ACTIVE `autoRenewing=False` ending T → `T + 3 months`.
  - Play EXPIRED (covers on hold/paused) → starts at `at`.
  - unlimited ADMIN_GRANT (`effective_until=None`) → `GIFT_CODE_UNLIMITED`.
  - only EXPIRED/REVOKED grants → starts at `at` (Review Focus 4).
  - unknown, revoked, expired-batch, malformed → `GIFT_CODE_INVALID`; used by another Space → `GIFT_CODE_USED`.
  - replay: same code, same Space, after success → same `effective_until`, grant row count unchanged, `updated_at` unchanged (Review Focus 2).
  - concurrency: two codes, same Space, two threads with separate sessions (pattern of existing concurrency tests in `backend/tests/integration`, e.g. search `threading.Barrier`) → final effective end = start + 6 months (Review Focus 1).
  - rate limit: 5 invalid attempts → 6th raises `RATE_LIMITED`; a success clears the Account counter.
- [ ] **Step 2: Run, expect FAIL**: `uv run pytest pro/pro_tests/integration/test_gift_code_redemption.py -q`
- [ ] **Step 3: Implement** in this order: `rate_limit.check` (Account hourly, Space daily) → `normalize` (None → invalid) → `lock_subject(session, "gift-code-space", str(space_id))` → `SELECT … FOR UPDATE` code by `lookup_hash` → replay check (redeemed by this Space → return stored grant end) → state checks → Space evaluation over valid PREMIUM grants (latest end; any `None` end → unlimited; any GOOGLE_PLAY grant in ACTIVE/TRIAL/GRACE_PERIOD with `autoRenewing` true → refuse) → `record_grant` → mark code → `rate_limit.clear` for both keys. Months via a small `add_months(value: datetime, months: int) -> datetime` helper in `codes.py` that clamps the day to the target month's length (no `dateutil` dependency exists; test 31 Jan + 1 → 28/29 Feb).
- [ ] **Step 4: Run, expect PASS**
- [ ] **Step 5: Commit** `feat(pro): redeem gift codes with append and refuse rules (part 5)`

### Task 6: Routers, endpoint contract and generated client

**Files:**
- Create: `backend/pro/src/eimir_pro/api/gift_codes.py` (two routers: `admin_router` prefix `/server-admin/pro`, tag `server-admin-pro`; `router` for `/spaces/{spaceId}/gift-codes/redeem`, tag `gift-codes`), `backend/pro/src/eimir_pro/api/gift_code_models.py`
- Modify: `backend/pro/src/eimir_pro/plugin.py` (`routers()` adds both)
- Modify: `backend/tests/integration/test_endpoint_matrix.py`, `backend/tests/support/plugins.py` (`HIDDEN_PRO_OPERATIONS`) as the failing contract tests require
- Regenerate: `backend/openapi.json` (`uv run python scripts/openapi_contract.py` per `tools/openapi/README.md`), `web/src/api/generated/**` (`tools/openapi/generate.sh`, Docker)
- Test: `backend/pro/pro_tests/integration/test_gift_code_routes.py`

**Interfaces:**
- Produces HTTP (camelCase via `ApiModel`):
  - `GET /api/v1/server-admin/pro/overview` → `ProOverviewView` (Task 4 fields + `batches: list[GiftCodeBatchSummaryView]`).
  - `POST /api/v1/server-admin/pro/gift-code-batches` body `{count, durationMonths, redeemableUntil?, note?}` → 201 `GiftCodeBatchView` (codes included).
  - `GET /api/v1/server-admin/pro/gift-code-batches/{batchId}` → `GiftCodeBatchView` with `codes: [{id, code, state, handedOutAt, redeemedAt, redeemedSpaceId}]`.
  - `PUT /api/v1/server-admin/pro/gift-codes/{codeId}/handed-out` body `{handedOut: bool}`; `POST …/gift-codes/{codeId}/revoke`; `POST …/gift-code-batches/{batchId}/revoke` → updated `GiftCodeBatchView`.
  - `POST /api/v1/spaces/{spaceId}/gift-codes/redeem` body `{code}` → `{effectiveUntil, extended}`.
  - All admin routes `Cache-Control: no-store`; dependency `_require_pro_area(admin: CurrentServerAdmin)` raising 404 unless Cloud; couple route uses `Tenant` and 404 unless Cloud.
- [ ] **Step 1: Failing tests**: 401 anonymous, 403 ordinary Account on admin routes, 404 Self-Hosted (admin and couple), 404 non-member Space, happy paths for each route, problem `code` values from Task 5 surface unchanged, no code string in caplog after a failed redemption.
- [ ] **Step 2: Run, expect FAIL**: `uv run pytest pro/pro_tests/integration/test_gift_code_routes.py -q`
- [ ] **Step 3: Implement routers and wire them.**
- [ ] **Step 4: Run** the Step 2 command, then `uv run pytest tests/integration/test_endpoint_matrix.py tests/integration/test_pro_routes.py -q`, `EIMIR_PLUGINS= uv run pytest tests/integration/test_endpoint_matrix.py -q` (Core-only 404/absent), `uv run ruff check . && uv run ruff format --check . && uv run mypy` on touched packages; regenerate OpenAPI and the TS client; `git diff --stat web/src/api/generated` shows only the new operations/models.
- [ ] **Step 5: Commit** `feat(pro): gift code and Pro overview API (part 5)`

### Task 7: ServerAdmin Pro area (web)

**Files:**
- Create: `web/src/client/serverAdminPro.ts` (query keys `['server-admin','pro']`, hooks `useProOverview`, `useGiftCodeBatch(id)`, mutations create/handed-out/revoke), `web/src/components/ServerAdminProPanel.tsx`, `ServerAdminProPanel.css`, `ServerAdminGiftCodeBatchSheet.tsx`, tests `ServerAdminProPanel.test.tsx`, `ServerAdminGiftCodeBatchSheet.test.tsx`
- Modify: `web/src/components/serverAdminAreas.ts` (section `'pro'`, area `'pro'` between `help` and `system`; `visibleAreas({supportReportsAvailable, proAreaAvailable})`), `serverAdminAreas.test.ts`, `ServerAdminAreaNavigation.tsx` (icon `star`, as board 04), `ServerAdminPage.tsx` (render panel for `section === 'pro'`, refresh invalidates `['server-admin','pro']`)
- Modify: `web/src/i18n/locales/serverAdmin.ts` (German, approved labels from #2328), `web/src/i18n/locales/en.json` (English)
- Reuse: `ServerAdminSheet` from #2326 once merged (else the existing sheet primitive the Space file uses), `AddActionButton` for "Codes erstellen", snackbar for copy feedback.

**Interfaces:**
- Consumes: Task 6 generated `ServerAdminProApi` models; overview `proAreaAvailable` (Task 1).

- [ ] **Step 1: Failing tests** (Vitest + Testing Library, strings via `i18n.t` keys)
  - `visibleAreas` hides `pro` without `proAreaAvailable`; `?section=pro` falls back to overview when unavailable.
  - panel renders tiles (Spaces, of which Pro, cancellations), Play chips, empty Play state when all Play figures are 0, batch list with counts, running gifts sorted by end with a link to the Space file (`sectionHref('spaces', {space: id})` or part 3's Space file href).
  - create form: duration select 1/3/6/12, count 1–100 validation, note ≤ 120; submit calls the API and opens the batch sheet with the new codes.
  - batch sheet: "Kopieren" writes the code to `navigator.clipboard` and shows the snackbar; toggle handed-out calls PUT; "Offene Codes zurückziehen" asks for confirmation; redeemed code shows its date; "Alle offenen kopieren" copies open codes one per line.
- [ ] **Step 2: Run, expect FAIL**: `cd web; npx vitest run src/components/ServerAdminProPanel.test.tsx src/components/ServerAdminGiftCodeBatchSheet.test.tsx src/components/serverAdminAreas.test.ts`
- [ ] **Step 3: Implement** following board 04 (Compact single column; Expanded two columns at the existing ServerAdmin breakpoint), tinted chips without borders, semantic tokens, no new motion.
- [ ] **Step 4: Run, expect PASS**, then `npx tsc --noEmit`, `npx biome lint . --diagnostic-level=error`, `node scripts/check-motion-layer.mjs`, `npx biome format` on touched files only.
- [ ] **Step 5: Commit** `feat(server-admin): Pro area with gift code batches (part 5)`

### Task 8: Redeem sheet on the Pro page (web)

**Files:**
- Create: `web/src/client/giftCodes.ts` (`useRedeemGiftCode(spaceId)` mutation; on success invalidates `spaceEntitlementQueryKey`), `web/src/components/GiftCodeRedeemSheet.tsx`, `GiftCodeRedeemSheet.css`, `GiftCodeRedeemSheet.test.tsx`
- Modify: `web/src/components/ProPaywallPage.tsx` (quiet secondary entry below the plans/unavailable note and below the active state), the Settings › Account eimir. Pro block (same entry), `web/src/i18n/locales/proPaywall.ts` + `en.json` (approved copy from #2328)
- Availability: show the entry only when `!isCapacitorNative()` and the instance is Cloud with the Pro plugin. Use the cheapest existing read; if none exposes it, add `giftCodesAvailable: boolean` to the existing instance status response in Core (`eimir.api.v1` instance status, computed like `pro_area_available`) with a test.

**Interfaces:**
- Consumes: Task 6 `POST /spaces/{spaceId}/gift-codes/redeem`.

- [ ] **Step 1: Failing tests**
  - entry hidden when `isCapacitorNative()` is mocked true and when unavailable; visible on web Cloud in both the inactive and the active state.
  - field upper-cases input; submit sends the raw value (server normalizes); pending label; success shows `proPaywall.giftCode.success.new` with the date formatted by `Intl.DateTimeFormat(resolvedLocale(), {dateStyle:'long'})`, extended variant for `extended=true`; "Fertig" closes and the entitlement query is invalidated.
  - each problem code maps to its message, tied to the field via `aria-describedby`; typed value kept; 429 and network errors show their messages; focus moves to the result.
- [ ] **Step 2: Run, expect FAIL**: `npx vitest run src/components/GiftCodeRedeemSheet.test.tsx src/components/ProPaywallPage.test.tsx`
- [ ] **Step 3: Implement** with the shared task sheet, the shared success feedback, ≥ 44 px targets, `autocomplete="off"`, `autocapitalize="characters"`, `spellcheck=false`.
- [ ] **Step 4: Run, expect PASS** plus the Task 7 Step 4 checks.
- [ ] **Step 5: Commit** `feat(pro): redeem eimir. gift codes on the web Pro page (part 5)`

### Task 9: Browser evidence, docs and matrix

**Files:**
- Create: `web/e2e/tests/server-admin-pro.spec.ts` (mocked `**/api/v1/**` like `server-admin-monitoring.spec.ts`: Pro area Compact 360/390/430 + Expanded 1280, Light/Dark, 200 % text with reduced motion, axe; create batch → sheet → copy; redeem sheet on `/more/pro` happy path and "already used" error), registered in `web/e2e/test-groups.json` and `web/e2e/test-impact.json` with roots `web/src/components/ServerAdminPro*`, `ServerAdminGiftCodeBatchSheet*`, `GiftCodeRedeemSheet*`, `ProPaywallPage*`, `web/src/client/serverAdminPro.ts`, `web/src/client/giftCodes.ts`
- Modify: `docs/SERVER-ADMIN.md` (Pro & vouchers section: availability, figures and their approximation, gift codes, privacy), `docs/FREEMIUM-FEATURE-MATRIX.md` (row "eimir. gift codes (Cloud)" text from design 5.9, version bump with revision line), `docs/superpowers/specs/2026-11-26-server-admin-redesign-design.md` §5.5 (promo codes dropped, link to part 5 design)
- [ ] **Step 1:** Run the browser-selection planning regressions and inventory checks named in `docs/m5/BROWSER-IMPACT-SELECTION.md`; expect the new spec selected for the new roots.
- [ ] **Step 2:** `cd backend; uv run pytest tests/test_engineering_language_audit.py -q` (or its current path) last before push; expect PASS.
- [ ] **Step 3: Commit** `docs(server-admin): Pro area, gift codes and matrix row (part 5)`
- [ ] **Step 4:** Merge `origin/main`, re-run `alembic heads`, matrix version and the targeted suites of Tasks 1–8; push; open the PR (draft → ready once), label `ci:full`, body with Reuse, Product Design, Business/Freemium, Cross-Cutting and validation sections; switch Auto-fix on. Visual evidence comes from the spec's CI artifacts (no Playwright on this Windows host).
