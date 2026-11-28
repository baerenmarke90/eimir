# Support reports operator plugin (`eimir-admin`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the single operator read, triage, reply once to, and ticket support reports from the existing ServerAdmin area, through a new private plugin `eimir-admin` that loads next to `eimir-pro`.

**Architecture:** First a small Core change lets the loader accept more than one plugin (part 2, its own PR). Then `backend/admin/` (uv workspace member, same layout and boundary rules as `backend/pro/`) adds thin operator routes over `eimir.support_reports.service`, a plugin-owned ticket link table in its own migration chain, and an `IssueTracker` adapter with a GitHub implementation. The web client gets a "Reports" section in the existing ServerAdmin page, shown when the overview says the operator plugin is loaded.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, pytest, `httpx` (already a Core dependency), React/TypeScript, Playwright, generated TS client (hand-maintained here, checked by `tools/openapi/generate.sh --check` in CI).

**Spec:** [docs/superpowers/specs/2026-11-24-support-reports-admin-plugin-design.md](../specs/2026-11-24-support-reports-admin-plugin-design.md). Service interface: [docs/product/support-reports-service-interface.md](../../product/support-reports-service-interface.md).

## Delivery slices (one PR each, in this order)

- **PR A:** Task 1 (part 2, loader and Decision 0017 amendment).
- **PR B:** Tasks 2 to 6 (plugin backend). Depends on A.
- **PR C:** Tasks 7 to 9 (Core overview flag is in Task 7, web section, browser ownership, docs). Depends on B.

Each PR follows AGENTS.md: reuse review, business/freemium result, cross-cutting result and (PR C) the Product Design review recorded in the PR body, draft until complete, `ci:full` label for PR A and B (loader, CI definitions, Supply Chain).

## Global Constraints

- Core never imports plugin code (`backend/tests/unit/test_core_imports_no_plugin.py`); the plugin uses only `eimir.support_reports.service` for report data. Service functions flush and never commit; plugin route code may commit its own short transactions (Task 6 only).
- Engineering language is English; all UI text through the localization layer, no hardcoded strings.
- Report `note` and reply `text` are the only free-text fields. They never appear in a tracker request, a log line, a metric label or an audit entry.
- Reply text is at most 500 characters; a second reply is `409 SUPPORT_REPORT_ALREADY_REPLIED`.
- All operator routes require `CurrentServerAdmin` plus `recent_auth.require_grant(..., purpose=RecentAuthenticationPurpose.SERVER_ADMIN_ACTION)`, answer `Cache-Control: private, no-store`, and answer `404` while `EIMIR_SUPPORT_REPORTS_ENABLED` is off.
- Plugin capability name: `support.operator`. Plugin name `admin`, distribution `eimir-admin`, import root `eimir_admin`, entry point group `eimir.plugins`.
- Audit actions (success only): `support_report.state_set`, `support_report.reply_sent`, `support_report.ticket_created`, `support_report.ticket_cleared`. Reads are not audited.
- Not Premium, no entitlement row: `support.operator` must never be granted through plans or appear in `ALL_PREMIUM_CAPABILITIES`.
- Web: no new always-run Playwright core; new journeys get reviewed ownership in both `web/e2e/test-groups.json` and `web/e2e/test-impact.json`. Web entry budget is 800,000 gzip bytes with about 800 bytes of headroom: the new section must be lazy-loaded (it lives behind the already lazy ServerAdmin page; verify with `node web/scripts/check-entry-size.mjs`).
- All user-visible changes keep tokens/semantic design values; no literal visual constants.

## Review Focus

- Tracker down, slow or answering 4xx/5xx: the report stays unchanged, the ticket row is `PENDING` or absent, the operator sees a clear error, and no second ticket is created on retry.
- Two operators or two tabs press "Create ticket" at once: exactly one tracker call, one row; the loser gets the existing link or a conflict.
- Operator types a long title or body: reject over GitHub limits (title 256, body 65,536 characters) before calling the tracker.
- The report is deleted (retention, account deletion) while a ticket row is `PENDING`: the cascade removes the row and the route answers `404`, not `500`.
- Plugin loaded but `EIMIR_ADMIN_TRACKER` unset: sections still work, `ticketAvailable` is `false`, the ticket route answers `409 SUPPORT_TICKET_NOT_CONFIGURED`.
- Plugin absent (Core only, or only `pro` loaded): admin routes do not exist (`404`), the overview flag is `false`, the web section is hidden.
- Reply to a `CLOSED` report works once; reply to a reporter without an active Membership stores the reply and sends no notice (existing Core behavior, assert it through the operator route).

---

## Task 1: Allow more than one plugin (part 2)

**Files:**
- Modify: `backend/src/eimir/plugins/loader.py` (`EXPECTED_DISTRIBUTIONS`, `resolve_plugins`, `LoadedPlugins`)
- Modify: `backend/src/eimir/plugins/manifest.py` (`PLUGIN_CAPABILITIES` split)
- Modify: `backend/src/eimir/entitlements/models.py` (`Capability.SUPPORT_OPERATOR = "support.operator"`) and `backend/src/eimir/entitlements/service.py` if needed so the new value is never premium
- Modify: `docs/decisions/0017-pro-plugin-seam.md` (amendment, "at most one trusted plugin" becomes a small fixed set from one build), `docs/decisions/` index if one exists
- Test: `backend/tests/unit/test_plugin_loader.py`, `backend/tests/unit/test_plugin_manifest.py`, `backend/tests/unit/test_entitlements_service.py`

**Interfaces:**
- Produces: `EXPECTED_DISTRIBUTIONS = {"pro": "eimir-pro", "admin": "eimir-admin"}`; `manifest.PRO_CAPABILITIES: frozenset[str]` (today's `PLUGIN_CAPABILITIES` content), `manifest.ADMIN_CAPABILITIES = frozenset({"support.operator"})`, `manifest.PLUGIN_CAPABILITIES = PRO_CAPABILITIES | ADMIN_CAPABILITIES`; `resolve_plugins` raises `PluginLoadError` when two loaded plugins declare the same capability.
- Consumes: existing `ProPlugin` protocol, `LoadedPlugins`.

- [ ] **Step 1: Write failing tests** in `test_plugin_loader.py`: `test_two_plugins_load_in_named_order` (fake candidates `pro` and `admin` with their expected distributions; `loaded.names == ("pro", "admin")`), `test_overlapping_capabilities_refuse_to_start` (two fakes declaring `games.couple`; `PluginLoadError` message names both plugins and the capability), `test_admin_name_only_from_eimir_admin_distribution`.
- [ ] **Step 2: Write failing tests** in `test_plugin_manifest.py`/`test_entitlements_service.py`: `test_support_operator_is_plugin_owned_and_not_premium` (value in `ADMIN_CAPABILITIES`, not in `entitlements.ALL_PREMIUM_CAPABILITIES`, removed from effective capabilities when the plugin is not loaded).
- [ ] **Step 3: Run** `cd backend && uv run pytest tests/unit/test_plugin_loader.py tests/unit/test_plugin_manifest.py tests/unit/test_entitlements_service.py -v`; expected FAIL.
- [ ] **Step 4: Implement** the allow-list entry, the capability split and enum value, and the overlap check in `resolve_plugins` (after loading all plugins, compare each plugin's `capabilities()` pairwise). Pro's `_CAPABILITIES` in `backend/pro/src/eimir_pro/plugin.py` becomes `PRO_CAPABILITIES`.
- [ ] **Step 5: Write the Decision 0017 amendment** (short section "Amendment 2026-11-24: more than one plugin"): fixed small set from one build, order by `EIMIR_PLUGINS`, no capability overlap (checked at startup), "first plugin wins" hooks (date ideas, push preview) stay single-provider by documentation, route collisions already fail startup.
- [ ] **Step 6: Run** the three test files plus `tests/integration/test_pro_routes.py tests/integration/test_entitlements_api.py` and `backend/pro/pro_tests`; expected PASS (Pro behavior unchanged for `EIMIR_PLUGINS=pro` and empty).
- [ ] **Step 7: Commit** `feat(plugins): allow more than one plugin (#2189)`.

---

## Task 2: Plugin skeleton `backend/admin`

**Files:**
- Create: `backend/admin/pyproject.toml`, `backend/admin/README.md`, `backend/admin/src/eimir_admin/__init__.py`, `backend/admin/src/eimir_admin/plugin.py`, `backend/admin/admin_tests/{__init__,conftest}.py`, `backend/admin/admin_tests/test_distribution.py`
- Modify: `backend/pyproject.toml:65` (`members = ["pro", "admin"]`), `backend/uv.lock` (regenerate with `uv lock`), `backend/tests/unit/test_core_imports_no_plugin.py` (second plugin root `eimir_admin`), and the Supply Chain / Core-wheel checks that assert "no Pro file in the Core wheel and image" so they also cover `eimir_admin` (search `.github/workflows` and `tools/` for `eimir_pro`)
- Test: `backend/admin/admin_tests/test_distribution.py`

**Interfaces:**
- Produces: `eimir_admin.plugin.plugin` implementing `eimir.plugins.contract.ProPlugin` with `name == "admin"`, `capabilities() == manifest.ADMIN_CAPABILITIES`, `routers() == []` (filled in Task 5), `migrations() -> MigrationSpec | None` (set in Task 3), `validate(settings) -> None` (Task 4), all other hooks returning empty values like the no-op defaults used by Pro for unused hooks.

- [ ] **Step 1: Write failing tests** mirroring `backend/pro/pro_tests/test_distribution.py`: entry point `admin` in group `eimir.plugins` resolves to this plugin, distribution name is `eimir-admin`; `test_core_imports_no_plugin` fails when a Core file imports `eimir_admin` (extend the existing parametrization).
- [ ] **Step 2: Run** `cd backend && uv run pytest admin/admin_tests tests/unit/test_core_imports_no_plugin.py -v`; expected FAIL.
- [ ] **Step 3: Create the distribution** (copy the `pro` layout: `pyproject.toml` with `dependencies = ["eimir"]`, `[tool.uv.sources] eimir = { workspace = true }`, entry point `admin = "eimir_admin.plugin:plugin"`, setuptools build backend with the same pinned version) and the plugin object importing `PLUGIN_SEAM_VERSION`, `build_revision` as in `eimir_pro/plugin.py`.
- [ ] **Step 4: Wire the builds:** `uv lock`; extend Supply Chain and wheel/image checks so the Core wheel and Core-only image contain no `eimir_admin` file; confirm `Dockerfile` already uses `--all-packages`.
- [ ] **Step 5: Add `test_both_real_plugins_load`** to `backend/admin/admin_tests/test_distribution.py` (resolve names `("pro", "admin")` against the real installed entry points; no capability overlap), then run `uv sync --frozen --all-packages` and `uv run pytest admin/admin_tests -v`. Expected PASS.
- [ ] **Step 6: Commit** `feat(admin): plugin skeleton eimir-admin (#2189)`.

---

## Task 3: Ticket link table and migration chain

**Files:**
- Create: `backend/admin/src/eimir_admin/support_tickets/{__init__,models}.py`, `backend/admin/src/eimir_admin/alembic/{env.py,script.py.mako,versions/0001_support_report_tickets.py}` (follow how `eimir.plugins.migrations` locates a plugin chain; read `backend/src/eimir/plugins/migrations.py` and `tests/unit/test_plugin_migrations.py` first)
- Modify: `backend/src/eimir/plugins/manifest.py` (row in `PLUGIN_TABLES`), `backend/admin/src/eimir_admin/plugin.py` (`model_modules`, `migrations`)
- Test: `backend/admin/admin_tests/test_ticket_model.py`, `backend/tests/unit/test_plugin_manifest.py`

**Interfaces:**
- Produces: `SupportReportTicket` ORM model, table `support_report_tickets`: `id` (IdMixin), `report_id` (FK `support_reports.id` ON DELETE CASCADE, unique), `tracker: str`, `url: str | None`, `number: int | None`, `state: TicketState` (`PENDING` / `CREATED`, check constraint), `created_at`. `MigrationSpec(script_location=<abs path>, version_table="alembic_version_admin")`. Manifest row: `PluginTable("support_report_tickets", Capability.SUPPORT_OPERATOR, None, ())`; cascade handles all lifecycle (retention, account deletion).

- [ ] **Step 1: Write failing tests:** `test_report_id_is_unique`, `test_row_is_deleted_with_its_report` (delete the report, ticket gone), `test_state_check_constraint`, and a manifest test that every plugin table (including the new one) has a manifest row and the existing "plugin tables are known to Core" invariant still holds.
- [ ] **Step 2: Run** the tests; expected FAIL (no model).
- [ ] **Step 3: Implement** model, revision and hooks; the revision's `down_revision` is `None` and it references Core tables only (Decision 0017, decision 6).
- [ ] **Step 4: Run** `uv run pytest admin/admin_tests tests/unit/test_plugin_manifest.py tests/unit/test_plugin_migrations.py -v` and the Core-only migration test (`migrate` without plugins creates no admin table); expected PASS.
- [ ] **Step 5: Commit** `feat(admin): ticket link table and migration chain (#2189)`.

---

## Task 4: Tracker adapter and configuration

**Files:**
- Create: `backend/admin/src/eimir_admin/tracker/{__init__,base,github,settings}.py`
- Modify: `backend/admin/src/eimir_admin/plugin.py` (`validate`)
- Test: `backend/admin/admin_tests/test_github_tracker.py`, `backend/admin/admin_tests/test_tracker_settings.py`

**Interfaces:**
- Produces in `base.py`: `class TicketRef(NamedTuple): url: str; number: int`; `class IssueTracker(Protocol): def create_issue(self, *, title: str, body: str, labels: Sequence[str]) -> TicketRef`; `class TrackerError(Exception)` with `retryable: bool`.
- Produces in `settings.py`: `AdminTrackerSettings` (pydantic-settings, `env_prefix="EIMIR_ADMIN_"`): `tracker: Literal["github"] | None`, `github_repository: str | None` (`owner/name`), `github_token: SecretStr | None`; `def tracker_from_settings(settings) -> IssueTracker | None` (`None` when `tracker` unset).
- Produces in `github.py`: `GitHubIssueTracker(repository: str, token: str, client: httpx.Client | None = None)` implementing the protocol via `POST https://api.github.com/repos/{repository}/issues`.

- [ ] **Step 1: Write failing tests** with `httpx.MockTransport`: `test_creates_issue_and_returns_ref` (assert request path, `Authorization: Bearer`, JSON `title`/`body`/`labels`, 201 response parsed to `TicketRef`), `test_server_error_is_retryable`, `test_validation_error_is_not_retryable`, `test_timeout_raises_tracker_error`, `test_token_never_in_error_text` (error message and `repr` contain no token), `test_validate_rejects_tracker_without_repository_or_token`, `test_validate_accepts_unset_tracker`, `test_malformed_repository_rejected`.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** adapter (timeout 10 seconds, no redirects followed, user agent `eimir-admin`) and settings; `plugin.validate` builds the settings once and raises on malformed values only.
- [ ] **Step 4: Run** `uv run pytest admin/admin_tests/test_github_tracker.py admin/admin_tests/test_tracker_settings.py -v`; expected PASS.
- [ ] **Step 5: Commit** `feat(admin): issue tracker adapter with GitHub (#2189)`.

---

## Task 5: Operator routes (list, detail, state, reply)

**Files:**
- Create: `backend/admin/src/eimir_admin/api/{__init__,support_reports}.py`, `backend/admin/src/eimir_admin/api/models.py`
- Modify: `backend/admin/src/eimir_admin/plugin.py` (`routers`), `backend/src/eimir/administration/*` (four new `AdministrationAction` values; check whether the action column has a check constraint or enum migration and add the Core migration if so), `backend/openapi.json` (regenerate as `tools/openapi/generate.sh` does; Docker/Java are unavailable here, so edit by hand and let CI `--check` confirm), `web/src/api/generated/**` (hand-maintained generated client files and docs)
- Test: `backend/admin/admin_tests/integration/test_support_report_routes.py` (reuse the Core test support package `tests`, as `backend/pro/pro_tests` does)

**Interfaces:**
- Produces (prefix `/api/v1/server-admin/support-reports`, tag `server-admin`): `GET ""` returns `SupportReportListView(items: list[SupportReportListItem], next_cursor: str | None, has_more: bool, new_count: int)` where an item has `id, kind, state, created_at, failure_reference, app_version, build, has_reply, ticket: TicketSummary | None`, **no note**; `GET "/{id}"` returns `SupportReportDetailView` (list item fields plus `note`, `request_id`, `client` context, `account_id`, `reply: {text, replied_at} | None`, `ticket_available: bool`); `PUT "/{id}/state"` body `{state}` returns the detail; `POST "/{id}/reply"` body `{text}` returns the detail.
- Consumes: `service.list_reports(session, *, state, limit, cursor) -> Page`, `get_report`, `set_state`, `send_reply(session, *, report_id, text, operator_id)`, `count_new`, `get_reply`, and `administration.record_action(session, actor_id, action, target_account_id, target_space_id)` (use the report's account id as target account).

- [ ] **Step 1: Write failing tests** (one function each, assertions on status codes and bodies): `test_non_admin_is_403`, `test_anonymous_is_401`, `test_stale_authentication_is_refused_on_writes` (state, reply), `test_feature_off_is_404`, `test_list_filters_by_state_and_never_returns_note_text`, `test_list_pagination_cursor_is_bound_to_state`, `test_detail_returns_note_and_account_id_but_no_email`, `test_set_state_records_audit_and_sets_closed_at`, `test_reply_stores_once_and_second_is_409`, `test_reply_on_closed_report_works_once`, `test_reply_over_500_chars_is_422`, `test_unknown_report_is_404`, `test_audit_entry_contains_no_text`, `test_responses_are_no_store`, `test_routes_absent_without_the_plugin` (app with only `pro` loaded answers 404).
- [ ] **Step 2: Run** `uv run pytest admin/admin_tests -v`; expected FAIL.
- [ ] **Step 3: Implement** the router and models (response models forbid unknown fields like Core's `ApiModel`; add `Cache-Control: private, no-store`), the audit action values, and register the router in `plugin.routers()`.
- [ ] **Step 4: Run** the new tests plus `uv run pytest tests/unit/test_openapi_contract.py` (or the project's OpenAPI drift test; find it with `grep -rl openapi tests/unit`) and the Core suite subset touching `administration`; expected PASS.
- [ ] **Step 5: Commit** `feat(admin): operator routes for support reports (#2189)`.

---

## Task 6: Ticket routes (create and clear)

**Files:**
- Modify: `backend/admin/src/eimir_admin/api/support_reports.py`, `backend/admin/src/eimir_admin/api/models.py`
- Create: `backend/admin/src/eimir_admin/support_tickets/service.py`
- Test: `backend/admin/admin_tests/integration/test_ticket_routes.py`, `backend/admin/admin_tests/unit/test_ticket_service.py`

**Interfaces:**
- Produces: `POST "/{id}/ticket"` body `TicketCreateRequest(title: str, body: str)` (title 1 to 256, body 0 to 65,536 characters) returns `TicketSummary(url, number, state, created_at)`; `DELETE "/{id}/ticket"` returns `204` and removes a `PENDING` or `CREATED` link row after the client confirmed (no body); `ticket_available` on the detail view is `tracker_from_settings(...) is not None`.
- `support_tickets.service.create_ticket(session, tracker: IssueTracker, *, report_id: UUID, title: str, body: str, operator_id: UUID) -> SupportReportTicket`: reserves a `PENDING` row and commits it, calls `tracker.create_issue(title=..., body=composed_body, labels=("support-report",))`, then sets `CREATED` with url and number and commits. Composed body = operator body + a fixed footer with `kind`, `app version`, `build`, `platform`, `failure reference`, `request id` and `report id`; it is built from those fields only and never reads `note` or reply text.
- Errors: existing link row for the report returns it as `409 SUPPORT_TICKET_EXISTS` including the link; no tracker configured is `409 SUPPORT_TICKET_NOT_CONFIGURED`; `TrackerError` leaves the `PENDING` row and answers `502 SUPPORT_TICKET_FAILED` (retryable flag in the problem body).

- [ ] **Step 1: Write failing tests** with a fake `IssueTracker`: `test_create_ticket_happy_path_records_audit` (row `CREATED`, audit `support_report.ticket_created`), `test_second_create_returns_conflict_with_existing_link_and_no_second_call`, `test_two_concurrent_creates_call_the_tracker_once` (threads or two sessions against the unique index), `test_tracker_failure_leaves_pending_row_and_502`, `test_retry_after_failure_is_refused_until_cleared` (the `PENDING` row blocks a blind second create), `test_clear_deletes_row_and_records_audit`, `test_not_configured_is_409_and_hides_button_flag`, `test_body_never_contains_stored_note_or_reply` (seed a report with a unique note and a reply, capture the outgoing request, assert neither string appears unless typed in `body`), `test_title_and_body_limits`, `test_report_deleted_while_pending_is_404`, `test_stale_authentication_is_refused`, `test_non_admin_is_403`.
- [ ] **Step 2: Run**; expected FAIL.
- [ ] **Step 3: Implement** service and routes as specified; use two committed transactions around the tracker call (plugin route code owns these commits; document it in the module docstring).
- [ ] **Step 4: Run** `uv run pytest admin/admin_tests -v` and, once, the full `uv run pytest tests/unit -q` plus the OpenAPI drift test; expected PASS. Add the generated-client and `backend/openapi.json` changes for the two routes.
- [ ] **Step 5: Commit** `feat(admin): create and clear tracker tickets (#2189)`; then push PR B, mark ready once complete with the `ci:full` label.

---

## Task 7: Overview flag in Core and web client plumbing

**Files:**
- Modify: `backend/src/eimir/api/v1/server_admin.py` (`ServerAdminOverview` gains `support_reports_operator_available: bool`, true when `Capability.SUPPORT_OPERATOR` is in `loaded_plugins().capabilities()` and `EIMIR_SUPPORT_REPORTS_ENABLED` is on), `backend/openapi.json`, `web/src/api/generated/**` (overview model and the new `ServerAdminSupportReportsApi` methods for the Task 5/6 routes), `web/src/client/serverAdmin.ts` (add `supportReports` API to `ServerAdminApis`)
- Test: `backend/tests/integration/test_server_admin_overview.py` (extend; find the existing overview test with `grep -rl "support_reports_unread" backend/tests`), `web/src/components/ServerAdminSupportReportsSignal.test.tsx` (existing signal test stays green)

**Interfaces:**
- Produces: overview field `supportReportsOperatorAvailable` (camelCase on the wire); `ServerAdminApis.supportReports` exposing `listSupportReports`, `getSupportReport`, `setSupportReportState`, `replyToSupportReport`, `createSupportReportTicket`, `clearSupportReportTicket` with the generated names matching the OpenAPI operation ids chosen in Task 5/6.

- [ ] **Step 1: Write failing tests:** overview reports `false` with Core only, `false` with only `pro`, `true` with `admin` loaded and the feature on, `false` with `admin` loaded and the feature off.
- [ ] **Step 2: Run** `uv run pytest tests/integration/test_server_admin_overview.py -v`; expected FAIL, then implement and re-run; expected PASS.
- [ ] **Step 3: Commit** `feat(support): advertise the operator plugin in the ServerAdmin overview (#2189)`.

---

## Task 8: Web "Reports" section

**Files:**
- Create: `web/src/components/ServerAdminSupportReportsPanel.tsx` (+ `.css`, + `.test.tsx`), `web/src/components/ServerAdminSupportReportDetail.tsx` (+ test), `web/src/client/supportReportsAdmin.ts` (query and mutation helpers), i18n keys in the existing resource files (German and English, like the other ServerAdmin panels)
- Modify: `web/src/components/ServerAdminPage.tsx` (navigation entry and panel, shown only when `supportReportsOperatorAvailable`), `web/src/components/ServerAdminNavigation.test.tsx`

**Interfaces:**
- Consumes: `ServerAdminApis.supportReports` from Task 7, the existing recent-authentication modal flow (`ServerAdminRecentAuthModal`, `web/src/client/recentAuthentication.ts`) for state, reply, ticket and clear.
- Produces: list with state filter (`NEW`, `IN_PROGRESS`, `CLOSED`, all) and the `new_count`, detail view with state switcher, one-time reply form (500 character counter, text explains it is sent once and cannot be edited), "Create ticket" dialog prefilled with a neutral template (title from kind and app version, body empty with the technical footer shown read-only) and a note that the operator types the text and the couple's note is never copied; button hidden when `ticketAvailable` is false; ticket link shown when present; "Clear ticket" with confirmation about a possible duplicate.

- [ ] **Step 1: Write failing component tests** (Vitest, existing admin panel tests as pattern): `renders list without note text`, `filters by state`, `hides the ticket button when ticketAvailable is false`, `reply form disables after one reply and shows the sent text`, `stale authentication opens the recent-authentication modal and retries`, `ticket dialog sends only the typed title and body`, `clear ticket asks for confirmation`, `renders loading, empty, error and offline states`, `section hidden when the overview flag is false`.
- [ ] **Step 2: Run** `cd web && npm test -- ServerAdminSupportReports`; expected FAIL.
- [ ] **Step 3: Implement** the panels with existing admin components and design tokens, lazy-loaded inside the ServerAdmin page chunk; Compact (about 360 to 430 px) is the reference layout, Expanded may be denser; plain-text rendering only (never `dangerouslySetInnerHTML`).
- [ ] **Step 4: Run** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build:bundle` (this runs `check-entry-size.mjs`); expected PASS and the entry stays at or under 800,000 gzip bytes.
- [ ] **Step 5: Commit** `feat(web): support reports section in the ServerAdmin area (#2189)`.

---

## Task 9: Browser test ownership, design evidence and docs

**Files:**
- Create: `web/e2e/tests/server-admin-support-reports.spec.ts`, evidence under `docs/product/design/evidence/2189-admin/` (README plus Compact and Expanded, Light and Dark captures, large-text check)
- Modify: `web/e2e/test-groups.json`, `web/e2e/test-impact.json` (reviewed ownership with all production entry roots: `ServerAdminPage`, the new panels, `serverAdmin.ts`, `supportReportsAdmin.ts`), `docs/SERVER-ADMIN.md` (new "Support reports" section: overview flag, routes, reply is once, ticket rules, no text in tickets), `docs/SELF-HOSTING.md` (how to name `admin` in `EIMIR_PLUGINS` and the tracker variables `EIMIR_ADMIN_TRACKER`, `EIMIR_ADMIN_GITHUB_REPOSITORY`, `EIMIR_ADMIN_GITHUB_TOKEN`), `docs/FREEMIUM-FEATURE-MATRIX.md` (row: operator capability, non-paywallable), `legal/de/privacy-policy.md` + `legal/privacy-policy-review.md` + generated resources (one sentence: the operator may create a technical ticket without the text; keep the review log entry, legal wording stays pending the already tracked legal review)
- Test: the Playwright spec itself, plus the browser-impact planning regressions from `docs/m5/BROWSER-IMPACT-SELECTION.md`

- [ ] **Step 1: Write the Playwright spec** (route mocks like `support-report.spec.ts`): open Reports from the ServerAdmin page, open one report, change state, send the one reply, create a ticket (mocked tracker response), see the link, and the stale-authentication retry; plus an axe check of the section.
- [ ] **Step 2: Add ownership** entries and run the planning regressions and inventory checks from the contract; record real collection counts.
- [ ] **Step 3: Run** `cd web && npx playwright test e2e/tests/server-admin-support-reports.spec.ts`; expected PASS.
- [ ] **Step 4: Capture evidence** (Compact about 390 px and Expanded, Light and Dark, reduced motion, 200 % text) and write the evidence README; update docs and the privacy notice sentence.
- [ ] **Step 5: Fill the PR body** (reuse review: reuses ServerAdmin area, recent-authentication, httpx, existing plugin seam; business/freemium: operator tooling, non-paywallable; cross-cutting table; Product Design review with all items) and mark PR C ready once.
- [ ] **Step 6: Commit** `docs(support): operator section docs, browser ownership and design evidence (#2189)`.

---

## Self-review notes

- Spec coverage: section 5.1 is Task 1; 5.2 is Task 2; 5.3 is Tasks 5 and 6; 5.4 is Tasks 3, 4 and 6; 5.5 is Tasks 7 to 9; 5.6 and section 8 clarifications are in Global Constraints, Review Focus, Task 6 and Task 9. The spec's phrase "capability view advertises it to ServerAdmins" is implemented as the ServerAdmin overview flag (Task 7), because that endpoint is already ServerAdmin-only and carries the sibling `support_reports_unread` signal.
- Open for the executor: the exact OpenAPI operation ids (Task 5/6 fix them, Task 7 and 8 consume them), whether `AdministrationAction` needs a Core migration (Task 5 Step 3 checks), and how `eimir.plugins.migrations` discovers the admin chain (Task 3 reads it first).
