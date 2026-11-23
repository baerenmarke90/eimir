# Support Reports in the Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in person can send a problem report or feedback from the app; the Core stores it protected at rest and can notify the reporter of one operator reply.

**Architecture:** A new Core package `eimir.support_reports` owns model, service and API. Idempotent create, DB-backed rate limit, one reply per report delivered as a new `SUPPORT_REPLY` notification through the existing outbox and engagement pipeline. The Web client gets a payload builder and a sheet on the existing `ShortTaskSheet`, opened from `ProblemState` and the More page. Nothing here depends on a plugin.

**Tech Stack:** Python/FastAPI/SQLAlchemy/Alembic (`backend/`, `uv run pytest`), React/TypeScript/Vitest/Playwright (`web/`), generated TypeScript client (`tools/openapi/generate.sh`).

**Spec:** `docs/product/support-reports-core-design.md` (approved 2026-11-23). Mock-up: `docs/product/design/references/support-reports/mockup.html`.

## Global Constraints

- Engineering language is English (identifiers, comments, tests, docs). User-facing texts only through the localization layer, `de` and `en`.
- Note text at most 2,000 characters; reply text at most 500 characters; one reply per report; strict payload schema (`extra="forbid"`).
- Rate limit per account: 5 per hour and 20 per day (confirm against `eimir.auth.rate_limit` conventions; record the final numbers in the PR).
- Retention: closed report deleted 90 days after `closed_at`; any report deleted 365 days after `created_at`; account deletion removes reports and replies immediately.
- `EIMIR_SUPPORT_REPORTS_ENABLED` defaults to `false`; with it off the endpoint refuses and `/instance/status` reports `supportReportsAvailable: false`.
- Service return types expose the opaque `account_id` only, never email or display name.
- Core never imports a plugin (`tests/unit/test_core_imports_no_plugin.py` stays green).
- Smartphone/Compact first, semantic design tokens only, one filled primary action, no "X" icon in the sheet (the drag-handle header button stays as the labeled close target), reduced motion respected.
- One PR for the issue (#2189), draft until complete, `ci:full` label because of a migration (`AGENTS.md` CI tiers). Local commits per task; push once, completed and checked.

## Review Focus

- **Offline retry:** the same `client_request_id` sent twice yields one row and one 200/201 pair, never a duplicate (Task 3).
- **Reporter without an active Space or deleted mid-way:** `send_reply` stores nothing for a deleted account and creates no notification when no Space exists; no crash (Task 5).
- **Operator replies to their own report:** the notification still appears (self-recipient) (Task 5).
- **Hostile text:** a reply containing `<script>`/HTML renders as plain text; an emoji-heavy note counts characters, not bytes; whitespace-only feedback is rejected (Tasks 3, 9, 10).
- **429 and offline send:** the sheet shows an honest message and does not loop; the draft survives (Task 9).

---

### Task 0: Record the design

**Files:** `docs/product/support-reports-core-design.md`, `docs/product/design/references/support-reports/mockup.html`, this plan.

- [ ] **Step 1:** Commit (the design already carries the reply-read endpoint and the `showCloseIcon` decision): `git add docs && git commit -m "docs(support): design, mock-up and plan for support reports (#2189)"`.

### Task 1: Settings flag and instance availability

**Files:** Modify `backend/src/eimir/config.py` (`Settings`), `backend/src/eimir/api/v1/instance.py` (`InstanceAccessStatus`, `instance_status`), `.env.example`. Test `backend/tests/unit/test_support_reports_availability.py`.

**Produces:** `Settings.support_reports_enabled: bool` (default `False`); `InstanceAccessStatus.support_reports_available: bool`.

- [ ] **Step 1:** Write `test_flag_defaults_to_false`, `test_flag_reads_env_var` (`EIMIR_SUPPORT_REPORTS_ENABLED=true`), `test_instance_status_reports_availability` (status JSON has `supportReportsAvailable` equal to the flag).
- [ ] **Step 2:** Run `cd backend && uv run pytest tests/unit/test_support_reports_availability.py -v`; expect FAIL.
- [ ] **Step 3:** Add the field and the response field; document the variable in `.env.example` with "enable only if you read the reports".
- [ ] **Step 4:** Run the test; expect PASS.
- [ ] **Step 5:** Commit `feat(support): operator switch and availability flag (#2189)`.

### Task 2: Model, payload schemas and migration

**Files:** Create `backend/src/eimir/support_reports/{__init__,models,payload}.py`, `backend/alembic/versions/0172_support_reports.py`. Modify `backend/src/eimir/db/registry.py` if models need registering (mirror `create_receipts`). Test `backend/tests/unit/test_support_reports_payload.py`, `backend/tests/integration/test_support_reports_migration.py` (use the existing migration/schema fingerprint tests as the template; refresh the schema fingerprint per `backend/scripts/schema_fingerprint.py`).

**Produces:**
- `class SupportReportKind(StrEnum)`: `PROBLEM`, `FEEDBACK`; `class SupportReportState(StrEnum)`: `NEW`, `IN_PROGRESS`, `CLOSED`.
- `class SupportReportPayload(BaseModel)` (frozen, `extra="forbid"`): `note: str | None` (max 2000), `failure: FailureReference | None`, `client: ClientContext`. `FailureReference`: `reference: str`, `request_id: str | None`. `ClientContext`: `app_version`, `build`, `platform: Literal["app","web"]`, `os`, `engine`, `locale`, `theme`, `online: bool`, `local_time`, `time_zone`.
- `class SupportReportReply(BaseModel)`: `text: str` (max 500), `replied_at: datetime`.
- `class SupportReport(IdMixin, Base)`, table `support_reports`: columns from the design (`account_id` FK `accounts.id` ON DELETE CASCADE, `client_request_id` unique with `account_id`, `kind`, `state`, `created_at`, `closed_at`, `payload` and `reply` as `ProtectedPayloadJSON`, context bound to the report id like `private_notes/models.py`).
- Migration `0172`: create the table; add `SUPPORT_REPLY` to `notifications.notification_kind_allowed` and `notification_preferences.notif_pref_kind_allowed`; add `SUPPORT_REPORT` to `notification_target_type_allowed` and `activity_target_type_allowed`; add the new event type to the outbox event-type constraint if one exists. Mirror `0159_recap_notices.py`; build the kind and target lists from the **current** enums, not the old list in 0159.

- [ ] **Step 1:** Write `test_payload_rejects_unknown_field`, `test_note_limit_2000_characters_not_bytes` (2,000 emoji accepted, 2,001 rejected), `test_reply_limit_500`, `test_failure_reference_has_no_url_fields`.
- [ ] **Step 2:** Run; expect FAIL (module missing).
- [ ] **Step 3:** Implement payload models and ORM model.
- [ ] **Step 4:** Write the migration and its integration test: upgrade creates the table, `SUPPORT_REPLY` is insertable into `notifications`, downgrade removes both (downgrade deletes `SUPPORT_REPLY` notifications first, as 0159 does for its kinds).
- [ ] **Step 5:** Run unit tests, the migration test and the schema fingerprint test; expect PASS.
- [ ] **Step 6:** Commit `feat(support): support_reports table, payload schemas, migration 0172 (#2189)`.

### Task 3: Service (create, list, get, set_state) and create API

**Files:** Create `backend/src/eimir/support_reports/service.py`, `backend/src/eimir/api/v1/support_reports.py`. Modify `backend/src/eimir/api/v1/__init__.py` (`normal_router.include_router(support_reports.router)`), `backend/openapi.json` (regenerated in Task 8). Test `backend/tests/unit/test_support_reports_service.py`, `backend/tests/integration/test_support_reports_api.py`.

**Produces:**
- `create_report(session, *, account_id: UUID, client_request_id: UUID, kind: SupportReportKind, payload: SupportReportPayload) -> tuple[SupportReport, bool]` (second value `True` when newly created; a replay returns the existing row and `False`; same id with a different kind or payload raises `ConflictError`).
- `list_reports(session, *, state: SupportReportState | None, limit: int, cursor: str | None) -> Page[SupportReport]`, `get_report(session, report_id: UUID) -> SupportReport | None`, `set_state(session, report_id: UUID, state: SupportReportState) -> SupportReport` (sets `closed_at` when `CLOSED`, clears it otherwise).
- `POST /api/v1/support-reports` body `SupportReportCreate` (`clientRequestId`, `kind`, payload fields); 201 on create, 200 on replay; refuses with the endpoint-disabled problem when the flag is off; rate limit per account via `eimir.auth.rate_limit` mirroring how `auth/local.py` applies `SIGN_IN`.

- [ ] **Step 1:** Write service tests: `test_create_is_idempotent_by_client_request_id`, `test_replay_with_different_payload_conflicts`, `test_set_state_closed_sets_closed_at`, `test_list_filters_by_state`.
- [ ] **Step 2:** Write API tests: `test_create_returns_201_then_200_on_replay`, `test_unauthenticated_is_401`, `test_disabled_flag_refuses`, `test_unknown_field_is_422`, `test_whitespace_only_feedback_is_422`, `test_sixth_report_within_an_hour_is_429`, `test_feedback_with_failure_reference_is_422` (feedback never carries a failure).
- [ ] **Step 3:** Run both files; expect FAIL.
- [ ] **Step 4:** Implement service and router; validation that `FEEDBACK` requires a non-blank `note` and forbids `failure` lives in the request model.
- [ ] **Step 5:** Run both files; expect PASS. Run `uv run pytest tests/unit/test_core_imports_no_plugin.py tests/unit/test_endpoint_matrix_contract.py` and update the endpoint matrix if it enumerates routes.
- [ ] **Step 6:** Commit `feat(support): idempotent create endpoint with rate limit (#2189)`.

### Task 4: Reply storage, reply read endpoint

**Files:** Modify `service.py`, `api/v1/support_reports.py`. Test additions in the Task 3 files.

**Produces:**
- `send_reply(session, *, report_id: UUID, text: str, operator_id: UUID | None) -> SupportReport`: stores the reply (`ConflictError` if one exists; `NotFoundError` if the report is missing); does not touch `state`. Notification is Task 5.
- `GET /api/v1/support-reports/{report_id}/reply` returns `{text, repliedAt}` only when the caller is the reporter; 404 otherwise (also when no reply yet).

- [ ] **Step 1:** Write `test_reply_is_stored_once`, `test_second_reply_conflicts`, `test_reply_does_not_change_state`, `test_reply_over_500_is_rejected`, `test_reply_read_is_reporter_only` (another account gets 404), `test_reply_read_html_is_returned_verbatim` (stored as text, no sanitising or rendering).
- [ ] **Step 2:** Run; expect FAIL. Implement; run; expect PASS.
- [ ] **Step 3:** Commit `feat(support): one reply per report and reporter-only read (#2189)`.

### Task 5: Reply notification

**Files:** Modify `backend/src/eimir/domain/events.py` (`EventType.SUPPORT_REPLY`), `backend/src/eimir/engagement/models.py` (`NotificationKind.SUPPORT_REPLY`, `EngagementTarget.SUPPORT_REPORT`), `engagement/service.py` (projection branch next to `RECAP_READY`, and add `SUPPORT_REPLY` to `self_outcome` in `_project_target_notification` so an operator who reports can receive their own reply), `engagement/notification_policy.py` (`NotificationPolicy(DeliveryClass.IMMEDIATE, GENERIC_PREVIEW)`), `engagement/notification_preferences.py` (`INHERITED_KINDS[SUPPORT_REPLY] = REMINDER_DUE`), `engagement/quiet_hours_preferences.py`, `support_reports/service.py`. Test `backend/tests/integration/test_support_reply_notification.py` plus the existing parametrized notification-kind tests.

**Produces:** `send_reply` additionally enqueues an outbox event of type `SUPPORT_REPLY` (subject = report id, `recipient_id` = reporter, `space_id` = the reporter's most recent active Membership Space) and returns without notification when the reporter has no active Space or the account is deleted. First read `_target_is_projectable` and extend it for `EngagementTarget.SUPPORT_REPORT` (authorized when the viewer is the report's `account_id`).

- [ ] **Step 1:** Write `test_reply_creates_one_notification_for_reporter`, `test_replay_does_not_duplicate_notification` (source event key = report id), `test_reporter_without_active_space_gets_stored_reply_but_no_notification`, `test_deleted_reporter_is_rejected`, `test_operator_who_reported_gets_own_notification`, `test_other_account_never_sees_notification`.
- [ ] **Step 2:** Run; expect FAIL. Implement; run the new file and the existing engagement/notification test modules (`uv run pytest tests -k "notification or engagement" -q`); expect PASS.
- [ ] **Step 3:** Commit `feat(support): SUPPORT_REPLY notification through the outbox (#2189)`.

### Task 6: Lifecycle (account deletion, retention)

**Files:** Modify `backend/src/eimir/identity/deletion.py` (`apply_core_cleanup`: call `support_reports.service.purge_account(session, account_id=account_id)` beside the other `purge_account` calls), `backend/src/eimir/jobs/maintenance.py` (`run_security_retention`: call `support_reports.service.prune_expired(session) -> int` and add `"support_reports_removed"` to the logged counts), `service.py`. Tests: `backend/tests/unit/test_support_reports_retention.py`, extend `tests/unit/test_account_table_lifecycle.py` (it lists account-owning tables).

**Produces:** `purge_account(session, *, account_id: UUID) -> int`; `prune_expired(session) -> int` (closed older than 90 days after `closed_at`, any older than 365 days after `created_at`; uses `core.clock`).

- [ ] **Step 1:** Write `test_account_deletion_removes_reports_and_replies`, `test_prune_removes_closed_after_90_days`, `test_prune_keeps_open_before_365_days`, `test_prune_removes_open_after_365_days`.
- [ ] **Step 2:** Run; expect FAIL. Implement; run; expect PASS.
- [ ] **Step 3:** Commit `feat(support): account deletion and retention for reports (#2189)`.

### Task 7: ServerAdmin overview signal

**Files:** Modify `backend/src/eimir/api/v1/server_admin.py` (`ServerAdminOverview.support_reports_new: int`; warning code `support_reports_unread` when the flag is on and a `NEW` report is older than 14 days), `support_reports/service.py` (`count_new(session) -> int`, `oldest_new_at(session) -> datetime | None`), `web/src/components/ServerAdminPage.tsx` and `web/src/i18n/locales/serverAdmin.ts` (warning text, count line). Tests: `backend/tests/integration/test_server_admin_support_reports.py`, `web/src/components/ServerAdminPage.test.tsx`.

- [ ] **Step 1:** Write `test_overview_counts_new_reports`, `test_warning_only_when_enabled_and_older_than_14_days`, `test_overview_exposes_no_report_content`; web test renders the warning text for the new code.
- [ ] **Step 2:** Run; expect FAIL. Implement; run; expect PASS.
- [ ] **Step 3:** Commit `feat(support): ServerAdmin overview count and warning (#2189)`.

### Task 8: Contract and generated client

**Files:** `backend/openapi.json`, `web/src/api/generated/**`.

- [ ] **Step 1:** `cd backend && uv run python scripts/openapi_contract.py write`.
- [ ] **Step 2:** `tools/openapi/generate.sh` (needs Docker); verify with `tools/openapi/generate.sh --check`, expect no drift.
- [ ] **Step 3:** `cd backend && uv run pytest tests/test_m2_api_contract_manifest.py tests/unit/test_endpoint_matrix_contract.py -q`; expect PASS (update the manifest if it lists operations).
- [ ] **Step 4:** Commit `chore(api): regenerate contract and client for support reports (#2189)`.

### Task 9: Web payload builder, failure reference, draft and send

**Files:** Create `web/src/client/supportReport.ts`, `web/src/client/supportReport.test.ts`, `web/src/client/useSupportReportDraft.ts` (+ test). Modify `web/src/client/uploadFailure.ts` neighbours only to export what is reusable; add `web/src/client/failureReference.ts` for the generalized token.

**Produces:**
- `buildSupportReport(input: { kind: 'PROBLEM' | 'FEEDBACK'; note: string; failure?: FailureReference; clientContext: ClientContext }): SupportReportCreate` — exactly the allowed fields; drops `failure` for `FEEDBACK`.
- `ALLOWED_PAYLOAD_FIELDS: readonly string[]` (the pinned list, shared by the test and a backend contract test).
- `recordRequestFailure(info: { method: string; routeTemplate: string; status: number; code?: string; requestId?: string }): void` and `lastFailureReference(): FailureReference | undefined` — in-memory, last failure only, route template without ids or query.
- `useSupportReportDraft()` — keeps note, kind and `clientRequestId` in local storage per account, retries when online, exposes `status: 'idle' | 'sending' | 'queued' | 'sent' | 'failed' | 'rateLimited'`; no retry loop after `failed`.

- [ ] **Step 1:** Write tests: `payload_has_only_allowed_fields`, `feedback_never_carries_failure`, `failure_reference_has_no_ids_or_query` (`/memories/123?x=1` becomes `/memories/{id}`), `no_url_token_or_filename_in_payload`, `offline_send_is_queued_and_retried_once_online_with_same_request_id`, `429_sets_rateLimited_and_keeps_draft`, `5xx_sets_failed_without_loop`.
- [ ] **Step 2:** Run `cd web && npx vitest run src/client/supportReport.test.ts`; expect FAIL. Implement; run; expect PASS.
- [ ] **Step 3:** Commit `feat(web): support report payload builder and offline draft (#2189)`.

### Task 10: Sheet, entry points, notification item

**Files:** Create `web/src/components/SupportReportSheet.tsx`, `.css`, `.test.tsx`. Modify `web/src/components/ShortTaskSheet.tsx` (+ `.css`, test): new optional prop `showCloseIcon?: boolean` (default `true`); when `false` the X svg is not rendered and the header button keeps `aria-label`/`title` as the close target. Modify `web/src/components/ProblemState.tsx` (optional `reportable?: boolean` prop adds a tertiary "Report a problem" action, hidden for `unauthorized` and for `offline` without a session), `web/src/components/MoreOverviewPage.tsx` (row "Help & feedback" in the utility group, shown only when `supportReportsAvailable`), `web/src/client/notificationTitle.ts` and `web/src/components/NotificationMotion.tsx`/the notification list item (kind `SUPPORT_REPLY`: neutral context line plus the reply text fetched from `GET /support-reports/{id}/reply`, rendered as plain text), `web/src/i18n/locales/*.ts` and `en.json` (all strings, de and en; run `npm run i18n:generate`). Reuse the existing instance-status hook for `supportReportsAvailable`.

**Interfaces:** consumes `buildSupportReport`, `useSupportReportDraft`, `lastFailureReference` (Task 9). Layout and copy follow the mock-up frames 1 to 7; Compact is a bottom sheet, Expanded the existing dialog form; one filled primary button; feedback needs a non-blank note.

- [ ] **Step 1:** Write tests: `sheet_lists_exactly_what_is_sent`, `problem_from_problem_state_attaches_failure_reference`, `problem_from_settings_attaches_no_failure`, `feedback_requires_text_and_hides_failure_line`, `send_disabled_while_sending_no_double_submit`, `offline_shows_queued_message_and_keeps_note`, `rate_limited_shows_honest_message`, `no_close_x_but_handle_button_has_accessible_close_name`, `problem_state_hides_report_action_when_unauthorized`, `more_row_hidden_when_not_available`, `reply_notification_renders_html_as_text` (reply `<img src=x onerror=...>` appears as literal text), `reduced_motion_has_no_animation_class`.
- [ ] **Step 2:** Run `cd web && npx vitest run src/components/SupportReportSheet.test.tsx src/components/ProblemState.test.tsx src/components/ShortTaskSheet.test.tsx src/components/MoreOverviewPage.test.tsx`; expect FAIL.
- [ ] **Step 3:** Implement, using semantic tokens only (no literals; add a token only if no existing semantic one fits), `--color-action-primary` for the primary button, and the shared button classes.
- [ ] **Step 4:** Run the same tests plus `npm run i18n:check`, `npm run tokens:check`, `npm run typecheck`, `npm run lint`, `npm run format:check`; expect PASS.
- [ ] **Step 5:** Commit `feat(web): support report sheet, entry points and reply notice (#2189)`.

### Task 11: Browser journey and visual evidence

**Files:** Create `web/e2e/support-report.spec.ts`; register it in `web/e2e/test-groups.json` and `web/e2e/test-impact.json` with the production entry roots (`ProblemState`, `MoreOverviewPage`, the sheet, notification list) per `docs/m5/BROWSER-IMPACT-SELECTION.md`. Evidence under `docs/product/design/evidence/2189/`.

- [ ] **Step 1:** Write the journey `report_a_problem_from_error_state_and_receive_reply`: open a failing screen, tap "Report a problem", send, see the success state, return to the originating screen; then simulate a reply and see the notification text. Add `feedback_from_more_requires_text`.
- [ ] **Step 2:** Run the planner checks and the spec (`cd web && npm run e2e:serve` per the contributor procedure, then the Playwright command in `CONTRIBUTING.md`); expect PASS. Capture Compact (360/390/430) and Expanded, Light and Dark, reduced motion screenshots into the evidence folder.
- [ ] **Step 3:** Commit `test(web): support report browser journey and visual evidence (#2189)`.

### Task 12: Documentation and classification

**Files:** `docs/FREEMIUM-FEATURE-MATRIX.md` (new row "Support reports", non-paywallable in Cloud and Self-Hosted; bump the matrix version note), `docs/SELF-HOSTING.md` (`EIMIR_SUPPORT_REPORTS_ENABLED`: enable only if you read the reports), `docs/product/notification-workflow.md` (new `SUPPORT_REPLY` kind, preference inheritance, no inbox), `docs/SERVER-ADMIN.md` (overview count and warning), `docs/IMPLEMENTATION-STATUS.md` if the repo's status rules require it (see `docs/STATUS-SOURCES.md`).

- [ ] **Step 1:** Edit the four documents; run `python tools/ci/engineering_language_audit.py` and `python tools/ci/documentation_language_audit.py`; expect no findings for the new text.
- [ ] **Step 2:** Commit `docs(support): matrix row, self-hosting, notification workflow (#2189)`.

### Task 13: Verification before PR

- [ ] **Step 1:** Backend: `cd backend && uv run pytest tests/unit -q` and the new integration files (Postgres per `CONTRIBUTING.md`); `uv run ruff check . && uv run mypy src` if the repo uses them (check `pyproject.toml`); expect clean.
- [ ] **Step 2:** Web: `cd web && npm test && npm run typecheck && npm run lint && npm run format:check`; expect clean.
- [ ] **Step 3:** Fill the PR template: reuse review, business/freemium (support path, non-paywallable), cross-cutting, Product Design / UX review with the Mobile Interaction Contract and evidence links, the named sheet exception (no X), CI notes; add the `ci:full` label; keep the PR draft until complete, then mark ready once.
