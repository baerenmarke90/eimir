# ServerAdmin part 2b: admin push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver ServerAdmin alerts and new support reports as app push to ServerAdmin accounts, through the existing push pipeline, with a push switch separate from the mail switch.

**Architecture:** A new `NotificationKind.OPERATOR_ALERT` whose rows have `space_id = NULL`, `in_app_visible = false` and an `operator_topic`. The part 2 alert job creates them per recipient and calls `push.ensure_deliveries_for_source_event`. Delivery skips the Space-bound checks for this kind and instead requires the recipient to still be a verified allow-listed ServerAdmin. The wake payload format is unchanged (Android receivers reject unknown keys); on tap the client's existing open call resolves the operator notification server-side and receives its ServerAdmin route.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, existing push pipeline (`engagement/push.py`, `push_preview.py`, FCM/UnifiedPush/APNs/WebPush), React client (`devicePush.ts`, `browserPush.ts`), Android (`PushPreview.java`).

**Spec:** `docs/superpowers/specs/2026-11-26-server-admin-part2b-admin-push-design.md`, amended by the Product Owner on approval: **two switches** (alert mails, alert push).

## Global Constraints

- Build only after #2321 is merged; branch from current `main`; migration after `0180`, `alembic heads` after every `main` merge; refresh `schema_fingerprint.json`.
- `OPERATOR_ALERT` rows: `space_id IS NULL` exactly when `kind = 'OPERATOR_ALERT'` (check constraint), `operator_topic` NOT NULL exactly for that kind, values `failed_jobs | space_quota_pressure | disk_pressure | delivery_failures | backup_not_configured | support_reports`, `in_app_visible = false`, `expires_at = created + 24 h`, `target_type = NULL`.
- Wake payloads stay unchanged (no new keys): FCM `type, activationId, locale, preview`; UnifiedPush `type, notificationId, locale[, wishDatePreview]`.
- Push text: topic only, same wording as the mail headings; `OPERATOR_ALERT` is listed in `push_preview.NEUTRAL_ONLY_KINDS` in this PR (existing app builds show the neutral notice; a later Android change may add topic text — out of scope here, noted in the PR).
- Two instance settings: existing `monitoring_alerts_enabled` (mail) and new `monitoring_push_enabled` (push, default on); both audited, both on System › Monitoring.
- Couple-facing queries must never return operator rows (they filter by Space; add tests). Any `Notification.space_id == notification.space_id` comparison in `push.py`/`plan_push.py` must not group operator rows together (`IS NULL` matching).
- English engineering text; German copy only in i18n; mypy on touched backend files before every push; `ci:full`; Auto-fix on.

## Review Focus

1. A non-admin (or an admin removed from the allow-list) never receives or can open an operator notification.
2. Operator rows never appear in a couple's Notification Center, unread count, Wir or notification preferences UI.
3. FCM delivery does not fail at the preview step for a row without a Space.
4. Existing app builds still accept the push (no new wake keys) and a tap without the new client code lands on the notification list, not an error.
5. Account deletion removes operator rows; nothing else leaves orphans.

---

### Task 1: Schema and kind

**Files:** `backend/alembic/versions/0181_operator_notifications.py`; `backend/src/eimir/engagement/models.py` (kind, `operator_topic`, nullable `space_id`, constraints); `backend/src/eimir/administration/models.py` (`monitoring_push_enabled`, `AdministrationSetting.MONITORING_PUSH_ENABLED`, events constraint); `backend/src/eimir/engagement/notification_policy.py` (`POLICIES[OPERATOR_ALERT]`, excluded from email choice); `backend/src/eimir/engagement/push_preview.py` (`NEUTRAL_ONLY_KINDS`); `backend/src/eimir/engagement/notification_preferences.py` / `api/v1/notification_preferences.py` (kind hidden from the couple preference list); schema fingerprint; tests `test_operator_notification_schema.py`, updates to `test_notification_policy.py`, `test_notification_preferences_api.py`.

- [ ] RED: `test_operator_row_requires_no_space_and_a_topic` (insert ok; a couple kind with NULL space rejected; operator kind without topic rejected), `test_preferences_api_hides_operator_alert` → GREEN with migration (drop/recreate kind constraints on `notifications` and `notification_preferences` like `0175_support_reports.py`), upgrade/downgrade/upgrade on a fresh DB.

### Task 2: Creation from the alert job

**Files:** `backend/src/eimir/monitoring/alerts.py`, `backend/src/eimir/monitoring/operator_push.py` (new: `notify(session, *, topic: str, at: datetime, recipients: list[UUID]) -> int`), `support_reports` condition; tests `test_monitoring_alerts.py`, `test_operator_push.py`.

- `alerts.run` resolves recipients as accounts (id, email, locale); mail when `monitoring_alerts_enabled`, push when `monitoring_push_enabled`; the per-code state is shared (one activation, one daily cap). New code `support_reports`: plugin available and unread `NEW` reports created after the code's `high_water_mark`.
- RED: push created once per recipient per mailing; push-only when mail is off; nothing when both are off; `support_reports` fires once for new reports and not again for the same ones; recipients are verified, enabled, allow-listed → GREEN.

### Task 3: Delivery

**Files:** `backend/src/eimir/engagement/push.py` (`_handle_delivery`: for `OPERATOR_ALERT` skip membership/module/target/coalescing/digest; require `operator_push.is_operator(session, account_id)`; space comparisons guarded against NULL), `push_preview.py` (`for_notification` returns the neutral envelope for operator rows without Space lookups), `ensure_deliveries_for_source_event` (no `_target_available` Space lookup for operator rows); tests `test_operator_push_delivery.py`.

- RED: delivery succeeds via a fake provider for an admin; ends `ACCOUNT_UNAVAILABLE` after the account leaves the allow-list; FCM preview path does not return None; quiet hours of the account apply → GREEN.

### Task 4: Opening a tapped operator push

**Files:** `backend/src/eimir/engagement/service.py` (`mark_notification_read` / open: an `OPERATOR_ALERT` of the current account opens regardless of the Space in the path, re-checks operator status), notification item model gains `operatorRoute` (server-built from the topic: `failed_jobs → /server-admin?section=jobs`, `support_reports → /server-admin?section=reports&state=NEW`, others → `/server-admin?section=monitoring` or the Situation); `web/src/client/m4Product.ts` `notificationPath` returns `operatorRoute` when set; OpenAPI + client regenerated; tests backend open API, `devicePush.test.tsx`.

- RED: admin opens own operator notification through any of their Space paths → route; another account → 404; non-admin → 404; web `notificationPath` uses `operatorRoute` → GREEN.

### Task 5: Push switch and copy

**Files:** `backend/src/eimir/api/v1/server_admin.py` (`PUT /settings/monitoring-push`, settings view field), `server_admin_monitoring.py` (`pushEnabled`), web `ServerAdminMonitoringPanel.tsx` (second switch, same optimistic pattern), i18n (German + English), backend mail/push copy not needed (neutral); tests backend settings + vitest panel.

### Task 6: Gates and PR

- Browser spec `server-admin-monitoring.spec.ts`: second switch writes once. Registry roots updated.
- Planner regressions, inventory, Biome errors, tsc, vitest, ruff, mypy on touched files, openapi/schema checks, language audits; merge `main`; PR closing nothing (part of #2314; note the later Android topic text); `ci:full`; Auto-fix on.
