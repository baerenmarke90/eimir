# ServerAdmin part 2: monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ServerAdmin an honest worker liveness signal, 24 h / 30 d / 90 d history, mail alerts for what an external uptime check cannot see, and a visible "no backup" warning, paired with the operator's own Uptime Kuma.

**Architecture:** Worker processes write a heartbeat row from a small thread guarded by loop progress and optionally ping a Kuma push URL. The API middleware counts requests per minute per process and flushes them to Postgres; a self-scheduling hourly job turns minute rows and existing tables into hour rows (90 days). A self-scheduling 5-minute job evaluates alert conditions and mails allow-listed ServerAdmins with per-condition state. A new monitoring endpoint feeds a System › Monitoring page.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Postgres job queue (`eimir.jobs.queue`), ASGI middleware, existing `service_mail`, React + TanStack Query, inline SVG, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-server-admin-part2-monitoring-design.md` (and the umbrella design section 5.2).

## Global Constraints

- Branch `feat/server-admin-part2-monitoring` from current `main`; after every `main` merge run `alembic heads` and renumber if needed; migrations must refresh `backend/tests/fixtures/schema_fingerprint.json` (`python -m scripts.schema_fingerprint write`).
- Values: heartbeat every 60 s; alive = heartbeat within 3 min **and** `last_progress_at` within job lease (5 min, `eimir.jobs.queue.DEFAULT_LEASE`) + 3 min; heartbeat rows pruned after 7 days; minute rows kept 48 h; hour rows kept 90 days; alert job every 5 min; storage alerts at 85 %; delivery-failure burst = more than 5 failed email or push deliveries in the last hour; alert mail at activation, then at most once a day while active; `backup_not_configured` mails once only; no mail on resolution.
- Privacy: metric rows hold counts, bytes, durations and timestamps only (no route, user, Space, request ids). `EIMIR_HEARTBEAT_PUSH_URL` is never logged or returned by any API. Alert mails name the condition and link to ServerAdmin; no names, emails, content.
- `backup_status` is always `not_configured` in this part; Cloud adds the warning code `backup_not_configured`; Self-Hosted shows "unknown" without a queue item.
- Left out on purpose: Kuma uptime percentage, Firebase probe, job retry button.
- English for code/docs/tests; product copy only in `web/src/i18n/locales/serverAdmin.ts`, `en.json`, and backend mail catalogs `backend/src/eimir/i18n/locales/{de,en}.json`.
- Windows local recipe: eimir-dev venv + shims on PYTHONPATH, scratch DB; vitest via eimir-dev `node_modules` junction (i18next there is 26 while the project pins 27: write `t()` calls with literal option objects or guarded optional options); no Playwright locally.
- PR: `ci:full` label, Product Design / Reuse ("relevant": Uptime Kuma operated by the PO, no new dependency) / Business ("reviewed": Free/Core, both deployments) sections; Auto-fix on.

## Review Focus

1. A long job (> 3 min) on a healthy worker must not turn the worker `silent` or stop the Kuma ping; a hung loop must, within lease + 3 min.
2. Two API processes and two workers must not double-count or lose minute rows (additive upsert), and two workers must not run the hourly or alert job twice (advisory lock + open-job check like `daily_checkins/retention.py`).
3. A fresh installation (no history yet) must render calm empty charts, not errors or zero-lines claiming "0 % errors".
4. Object storage (no filesystem total) must show stored bytes and trend only and never a disk alert.
5. Alerts switched off must stop all mails immediately, and switching on must not send a backlog of stale mails.

---

### Task 0: Sub-issue and visual preflight (no code)

- [ ] Create sub-issue "ServerAdmin part 2: monitoring" under #2314 with: baseline `main` SHA, reviewed screens (Situation, System › Jobs/Storage), the reference `docs/product/design/references/server-admin-redesign/02-monitoring-compact.png` with the list of deliberate omissions, and the Mobile Interaction Contract: focal point = summary of the chosen range; primary action = range switch; Compact single column, Expanded two columns; states loading/empty-history/error/offline; reduced motion = static lines; touch targets ≥ 44 px; alert switch is a native checkbox with label. Record business and reuse results.

### Task 1: Schema

**Files:** Create `backend/alembic/versions/0180_server_monitoring.py`, `backend/src/eimir/monitoring/__init__.py`, `backend/src/eimir/monitoring/models.py`; modify `backend/src/eimir/administration/models.py`; update `backend/tests/fixtures/schema_fingerprint.json`; test `backend/tests/integration/test_monitoring_schema.py`.

**Interfaces (Produces):**
- `WorkerHeartbeat`: `worker_name: str` (PK, ≤128), `role: str` (`worker` | `video-worker`, check constraint), `build_revision: str`, `last_seen_at: datetime`, `last_progress_at: datetime`.
- `RequestMetricMinute`: PK (`minute: datetime`), `requests: int`, `server_errors: int`, `latency_buckets: list[int]` (JSONB, one count per bucket of `LATENCY_BUCKETS_MS = (50, 100, 250, 500, 1000, 2500, 5000)` plus overflow).
- `OperationalMetricHour`: PK (`hour: datetime`), `requests`, `server_errors`, `p95_ms: int | None`, `new_accounts`, `active_spaces`, `stored_bytes`, `disk_used_bytes: int | None`, `disk_total_bytes: int | None`, `failed_jobs`, `failed_emails`, `failed_pushes`.
- `MonitoringAlertState`: PK `code: str`, `active_since: datetime | None`, `last_sent_at: datetime | None`, `high_water_mark: datetime | None`.
- `InstanceAdministrationSettings.monitoring_alerts_enabled: bool` (default true) and `AdministrationSetting.MONITORING_ALERTS_ENABLED = "monitoring_alerts_enabled"`.

- [ ] **Step 1:** Test `test_monitoring_tables_round_trip` (insert/read each model; `monitoring_alerts_enabled` defaults to true) → RED.
- [ ] **Step 2:** Models + migration (upgrade/downgrade), `alembic heads` single, `python -m scripts.schema_fingerprint write` → GREEN; `... check` OK.
- [ ] **Step 3:** Commit `feat(monitoring): tables for heartbeats, request metrics, hourly history and alert state`.

### Task 2: Worker heartbeat

**Files:** Create `backend/src/eimir/monitoring/heartbeat.py`; modify `backend/src/eimir/jobs/runner.py`, `backend/src/eimir/jobs/video_worker.py`, `backend/src/eimir/config.py` (`heartbeat_push_url: SecretStr | None`, env `EIMIR_HEARTBEAT_PUSH_URL`; `worker_name: str | None`, env `EIMIR_WORKER_NAME`); test `backend/tests/integration/test_worker_heartbeat.py`.

**Interfaces (Produces):**
- `class Heartbeat`: `__init__(self, *, role: str, name: str, revision: str, push_url: str | None, clock=now)`, `progress(self) -> None` (thread-safe timestamp), `beat(self) -> None` (one upsert + optional push, used by the thread and tests), `start(self) -> None` / `stop(self) -> None` (daemon thread, 60 s interval).
- `def is_alive(row: WorkerHeartbeat, at: datetime) -> bool` (rule from Global Constraints).
- `def worker_state(session, role: str, at: datetime) -> tuple[str, datetime | None]` → (`ok` | `silent` | `no_heartbeat_signal`, newest `last_seen_at`).

- [ ] **Step 1:** Tests: `test_beat_upserts_one_row_per_worker`, `test_alive_needs_fresh_beat_and_recent_progress` (fresh beat + progress 9 min old → not alive; progress 4 min old → alive), `test_push_only_while_alive_and_never_raises` (fake transport records calls; URL absent from caplog), `test_worker_state_reports_silent_and_none` → RED.
- [ ] **Step 2:** Implement; runner/video worker create a `Heartbeat`, call `progress()` each loop iteration and around `run_once`, `start()` before the loop, `stop()` after → GREEN.
- [ ] **Step 3:** Commit `feat(monitoring): worker heartbeat with progress guard and optional push ping`.

### Task 3: Request metrics

**Files:** Create `backend/src/eimir/monitoring/requests.py`; modify `backend/src/eimir/observability/middleware.py` (or the app factory where middlewares are added); test `backend/tests/unit/test_request_metrics.py`, `backend/tests/integration/test_request_metric_flush.py`.

**Interfaces (Produces):**
- `class RequestMetrics`: `record(self, *, status: int, duration_ms: float, at: datetime) -> list[MinuteBucket]` (returns finished minutes to flush), `drain(self) -> list[MinuteBucket]`.
- `def flush(session, buckets: list[MinuteBucket]) -> None` (additive `INSERT … ON CONFLICT (minute) DO UPDATE SET requests = requests + EXCLUDED.requests …`).
- Middleware: skips paths starting with `/api/v1/health`; hands finished buckets to `asyncio.to_thread(flush_in_unit_of_work, buckets)`; never raises into the request.

- [ ] **Step 1:** Tests: bucket math (`record` 3 requests in minute A, one 503, durations 40/120/6000 → buckets `[1,0,1,0,0,0,0,1]`, `server_errors == 1`); minute rollover returns A; `flush` twice adds up; health paths are not counted → RED.
- [ ] **Step 2:** Implement → GREEN. **Step 3:** Commit `feat(monitoring): per-minute request counters`.

### Task 4: Hourly history job

**Files:** Create `backend/src/eimir/monitoring/history.py`; modify `backend/src/eimir/jobs/runner.py` (`register_handlers`, `ensure_scheduled` in `_ensure_maintenance`); test `backend/tests/integration/test_monitoring_history.py`.

**Interfaces (Produces):**
- `JOB_KIND = "monitoring_history"`, `ensure_scheduled(session, *, delay=None)`, `schedule_next(...)`, `handle(session, payload)` — pattern of `daily_checkins/retention.py` (advisory lock `_LOCK_KEY`, open-job check).
- `def snapshot_hour(session, hour: datetime, settings: Settings) -> OperationalMetricHour` (idempotent upsert for `hour`); p95 = upper bound of the bucket containing the 95th percentile, `None` without requests; disk via `shutil.disk_usage(settings.media_root)` only when `settings.media_store` is local; failed email/push from `EmailDelivery`/`PushDelivery` status `FAILED` created in that hour; failed jobs finished in that hour.
- `def prune(session, at: datetime) -> None` (minutes > 48 h, hours > 90 d, heartbeats > 7 d).

- [ ] **Step 1:** Tests: `test_snapshot_aggregates_minutes_into_hour` (two minute rows → requests sum, p95 bucket), `test_snapshot_counts_failures_in_hour`, `test_disk_only_for_local_store`, `test_prune_keeps_recent_rows`, `test_ensure_scheduled_is_single` → RED.
- [ ] **Step 2:** Implement → GREEN. **Step 3:** Commit `feat(monitoring): hourly operational history`.

### Task 5: Monitoring API and overview additions

**Files:** Create `backend/src/eimir/api/v1/server_admin_monitoring.py` (router included like `server_admin_observability`); modify `backend/src/eimir/api/v1/server_admin.py` (overview fields, warning code, settings route); regenerate `backend/openapi.json`, `web/src/api/generated/**`; update `docs/SERVER-ADMIN.md`; tests `backend/tests/integration/test_server_admin_monitoring.py`, additions in `test_server_admin.py`, `test_endpoint_matrix.py` entry.

**Interfaces (Produces):**
- `GET /api/v1/server-admin/monitoring?range=24h|30d|90d` → `ServerAdminMonitoring { range, points: ServerAdminMonitoringPoint[] (at, requests, serverErrors, p95Ms|null, newAccounts, activeSpaces, storedBytes, diskUsedBytes|null, diskTotalBytes|null, failedJobs, failedEmails, failedPushes), storage { usedBytes, totalBytes|null, fullInDays|null }, services: ServerAdminServiceState[] (key: worker|video_worker|email|push, status, lastSeenAt|null), alertsEnabled }`. 24 h = hourly points; 30/90 d = daily sums (p95 = max of the day). `fullInDays` = linear fit over the range when rising and `totalBytes` known, else null.
- Overview additions: `worker_status` from `worker_state(..., "worker")` (values `ok` | `silent` | `no_heartbeat_signal`), `worker_last_seen_at`, `video_worker_status`, `email_failures_last_hour`, `push_failures_last_hour`, `backup_status` (`not_configured`), warning `backup_not_configured` on Cloud only.
- `PUT /api/v1/server-admin/settings/monitoring-alerts` body `{enabled}` → `ServerAdminSettings` (+ `monitoring_alerts_enabled`), audited via `update_setting`.

- [ ] **Step 1:** Tests: range shapes (24 points max for 24 h; daily aggregation), empty history → `points: []`, `fullInDays` null for object storage, worker states in overview, `backup_not_configured` only on Cloud, settings toggle audited, non-admin 403 → RED.
- [ ] **Step 2:** Implement, regenerate contract/client (`MSYS_NO_PATHCONV=1 bash tools/openapi/generate.sh`), docs → GREEN. **Step 3:** Commit `feat(server-admin): monitoring endpoint and liveness in the overview`.

### Task 6: Alerts

**Files:** Create `backend/src/eimir/monitoring/alerts.py`; modify `backend/src/eimir/jobs/runner.py`; mail copy keys `mail.monitoringAlert.<code>.{subject,preheader,heading,intro,reason,ignore,button}` in `backend/src/eimir/i18n/locales/de.json` and `en.json`; test `backend/tests/integration/test_monitoring_alerts.py`.

**Interfaces (Produces):**
- `JOB_KIND = "monitoring_alerts"` (5-minute chain, same pattern as Task 4).
- `def evaluate(session, at: datetime, settings: Settings) -> dict[str, bool]` for codes `failed_jobs`, `space_quota_pressure`, `disk_pressure`, `delivery_failures`, `backup_not_configured`.
- `def dispatch(session, at, states, *, send: Callable[[MailMessage], None]) -> list[str]` (codes mailed). Recipients: verified primary emails of accounts matching the ServerAdmin allow-list, each in its account `locale`. `failed_jobs` uses `high_water_mark` = newest failed `finished_at` already mailed. Nothing is sent while `monitoring_alerts_enabled` is false; on re-enable, states activated while off are marked sent without mailing.

- [ ] **Step 1:** Tests: activation mails once; same condition 2 h later → no mail; 25 h later → reminder; `backup_not_configured` never reminds; resolved then reactivated → mails again; new failed job after high-water mark → mails; switch off → nothing; re-enable → no backlog; mail body contains no account email or Space id → RED.
- [ ] **Step 2:** Implement → GREEN. **Step 3:** Commit `feat(monitoring): mail alerts for ServerAdmins`.

### Task 7: Web

**Files:** Modify `web/src/components/serverAdminAreas.ts` (`'monitoring'` first in System), `ServerAdminPage.tsx` (render), `ServerAdminSettingsPanel` (alert switch), `ServerAdminSituation.tsx` + `serverAdminNeedsYou.ts` (Worker real state, Push and Backup tiles, `backup_not_configured` → `sectionHref('monitoring')`, registrations sparkline from the monitoring query when available), `ServerAdminPage.css`, i18n files; create `web/src/components/ServerAdminMonitoringPanel.tsx`, `web/src/components/Sparkline.tsx`; tests `ServerAdminMonitoringPanel.test.tsx`, `Sparkline.test.tsx`, updates to `serverAdminAreas.test.ts`, `serverAdminNeedsYou.test.ts`, `ServerAdminSituation.test.tsx`.

**Interfaces (Produces):**
- `Sparkline({ values, label, tone }: { values: Array<number | null>; label: string; tone?: 'brand' | 'danger' })` → `<svg role="img" aria-label={label}>`; gaps for `null`; nothing drawn with fewer than 2 values.
- `ServerAdminMonitoringPanel({ api }: { api: ServerAdminApi })`.

- [ ] **Step 1:** Tests: sparkline path for `[1,2,null,3]` has a gap; panel shows empty-history copy for `points: []`; range switch requests `range=30d`; storage "x of y" only with total; worker `silent` tile reads silent; `backup_not_configured` item links to `?section=monitoring`; alert switch calls the settings route → RED.
- [ ] **Step 2:** Implement (literal option objects in `t()` calls) → GREEN; tsc, Biome on touched files. **Step 3:** Commit `feat(web): ServerAdmin monitoring page and live service tiles`.

### Task 8: Browser journey, runbook, gates and PR

**Files:** Create `web/e2e/tests/server-admin-monitoring.spec.ts`; modify `web/e2e/test-groups.json`, `web/e2e/test-impact.json`, both existing ServerAdmin specs' overview mocks (new fields), `docs/SERVER-ADMIN.md` (Uptime Kuma + Arcane runbook: Kuma on another host, HTTP monitor on `https://app.eimir.de/api/v1/health/ready` every 60 s, push monitor URL into `EIMIR_HEARTBEAT_PUSH_URL`, mail notification; what each alert means).

- [ ] **Step 1:** Spec: open System › Monitoring at 390 px, switch 24 h → 30 d, empty-history state, toggle alerts (one PUT), Situation backup item leads to Monitoring; layout 360/390/430 + 1280, Light/Dark, axe, reduced motion, 200 % text with `expectReflow`. Register (PR_CRITICAL, reason, roots incl. new components).
- [ ] **Step 2:** `node --test web/e2e/scripts/*.test.mjs`, `node web/e2e/scripts/test-group.mjs check`, Biome whole-tree errors, tsc, vitest ServerAdmin, backend ruff (touched + `ruff format --check` whole tree), `scripts.openapi_contract check`, `scripts.schema_fingerprint check`, both language audits; merge `main`, `alembic heads`.
- [ ] **Step 3:** Push, PR closing only the part 2 sub-issue, `ci:full`, Auto-fix on.
