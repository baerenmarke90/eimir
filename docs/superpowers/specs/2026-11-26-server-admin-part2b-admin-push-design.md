# ServerAdmin part 2b: push notifications for ServerAdmins

**Status:** draft for Product Owner approval. **Umbrella:** #2314. **Builds on:** part 2
(#2321, monitoring and alert mails). **Product Owner decisions (2026-11-26):** admin
warnings and new support reports also arrive as app push; way A: operator notifications
that belong to no Space, delivered through the existing push pipeline.

## 1. Intent

The operator wants to learn on the phone, not only by mail, when something needs
attention. Today push exists only for couple events; ServerAdmin alerts (part 2) are mail
only, and new support reports notify nobody.

## 2. Goals, non-goals

Goals
- Every alert mail from part 2 also reaches the ServerAdmin's devices as push, with the
  same rules (on activation, at most once per condition and day, backup once only, no
  backlog, nothing on resolution).
- New support reports (only with the operator plugin) notify ServerAdmins: "N new
  reports", at most once per day while unread reports exist, first push when the first
  new one arrives after the last push.
- A tap opens the matching ServerAdmin page.

Non-goals
- No operator entries in the couple Notification Center, unread counts or Wir.
- No new provider, no new settings page: two switches on System › Monitoring.
- No push content beyond the topic (no names, report text, ids).

## 3. Design

- **Data:** `notifications.space_id` becomes nullable, allowed NULL only for the new kind
  `OPERATOR_ALERT` (check constraint). A new nullable column `operator_topic`
  (`failed_jobs`, `space_quota_pressure`, `disk_pressure`, `delivery_failures`,
  `backup_not_configured`, `support_reports`) is set only for that kind. Rows are
  `in_app_visible = false`, expire after 24 hours and are pruned like other notifications.
- **Creation:** the part 2 alert job (`monitoring/alerts.run`) creates one operator
  notification per recipient account whenever it mails a code; a new alert code
  `support_reports` (plugin loaded, unread reports newer than the last push) joins the
  same rules. Two switches (Product Owner, on approval): `monitoring_alerts_enabled`
  for mail and a new `monitoring_push_enabled` for push; the per-code state is shared.
- **Delivery:** the existing push projection and delivery are reused. For
  `OPERATOR_ALERT` the Space-bound checks (membership, Space module, target
  availability) are replaced by one check: the recipient is still a verified allow-listed
  ServerAdmin. Account quiet hours and the account's push preference apply as for every
  push. The wake payload format stays unchanged, because the Android receivers reject
  unknown keys; on tap the existing open call resolves the operator notification for its
  recipient and returns an `operatorRoute` (for example `/server-admin?section=jobs`).
- **Clients:** the notification route helper navigates to `operatorRoute` when present.
- **Text:** in this part the kind is neutral-only (`NEUTRAL_ONLY_KINDS`): every platform
  shows the neutral eimir. notice and the topic appears after the tap and in the mail.
  Topic text on the Android lock screen follows with a later native change and test
  release.
- **Privacy:** topic only; the route contains no ids.

## 4. Constraints and gates

- A new `NotificationKind` needs the push-preview catalog cases, Android `PushPreview`
  strings, `ALLOWED_LOCALIZED_TEXTS` for German push copy, model registration checks and a
  schema fingerprint refresh; migration number after `0180`, re-checked against `main`.
- Couple-facing notification queries must keep filtering by Space so operator rows never
  appear there; tests prove it.
- Business/freemium: Free/Core admin capability; push cost negligible.

## 5. Left to the builder

- Exact copy, expiry, index changes, and how the wake payload field is versioned for
  older clients (older clients ignore unknown fields and open the notification list).
