# Server Administration

## Purpose

ServerAdmin is an instance-wide operational capability for administering a
eimir. installation. It is separate from partner-facing Space membership
and does not grant access to private product content.

The Web administration surface uses the dedicated `/server-admin` route. The
backend remains authoritative: hiding or showing the route in a client is only
presentation assistance and does not replace endpoint authorization.

## Operator-managed authorization

ServerAdmin identities are configured in the deployment environment:

```dotenv
EIMIR_SERVER_ADMIN_EMAILS=["operator@example.com"]
```

The value is a JSON array. Multiple operators may be configured. Addresses are
normalized to lower case and duplicates are ignored.

An authenticated account receives ServerAdmin only when at least one of its
stored `AccountEmail` rows:

1. is verified; and
2. exactly matches an address in `EIMIR_SERVER_ADMIN_EMAILS`.

The safe default is:

```dotenv
EIMIR_SERVER_ADMIN_EMAILS=[]
```

which grants ServerAdmin to nobody. Space roles, Space ownership, the first
bootstrap registration, and unverified email addresses do not implicitly grant
ServerAdmin.

The API process loads this setting from its environment. After changing the
allowlist, recreate/restart the API process through the normal deployment
workflow so the new configuration is loaded.

## Deployment plumbing

ServerAdmin uses the single repository-root `compose.yaml` deployment contract.
Complete checkouts and Arcane both use the `self-hosted` profile; Arcane changes
only the Backend/Web build contexts through environment configuration.

`.env.example` and `deploy/persistent-development.env.example` both document the
setting. Development, Demo, and Production installations manage their own
allowlists and must not share environment files as a convenience.

## Authorization contract

The authenticated client may read `/api/v1/auth/capabilities` to decide whether
to present the ServerAdmin entry point. This response is not an authorization
source.

Every `/api/v1/server-admin/...` endpoint independently requires the
server-side ServerAdmin guard. An ordinary authenticated account receives a
stable forbidden response even if it manually navigates to the route or calls
the API directly.

## Operational overview

`GET /api/v1/server-admin/overview` exposes a privacy-safe application-level
projection including available signals for:

- API/database state;
- deployment and environment;
- build revision and API process start time;
- safe public/runtime configuration state;
- total, active, and suspended Account counts;
- verified and unverified primary-email counts;
- 24-hour, 7-day, and 30-day Account-registration counts;
- aggregate active-session and authentication-method counts;
- configured vs. currently resolved ServerAdmin allowlist entries;
- aggregate active-Space counts;
- READY media object count and aggregate stored bytes;
- background-job state, oldest pending job, and recent failed-job technical
  metadata;
- the number of unarchived support reports in state `NEW`, and a `support_reports_unread`
  warning when an unarchived `NEW` report older than 14 days exists while support reports
  are enabled (counts only; no report content or identifiers). While
  `EIMIR_SUPPORT_REPORTS_ENABLED` is off the count is always 0 and the warning
  never appears, even when `NEW` reports exist from an earlier period in which
  the switch was on;
- `supportReportsOperatorAvailable`: whether the operator Reports section is
  available, see [Support reports](#support-reports);
- `storagePressure` / `storagePressureCount`: Spaces at or above 85 % of their
  Cloud storage quota, fullest first, at most five listed (Space id, counted
  bytes and quota only; always empty on Self-Hosted, which is unmetered), with
  the `storage_quota_pressure` warning while any exist;
- `expiringAdminGrants` / `expiringAdminGrantCount`: active `ADMIN_GRANT`
  entitlement grants ending within the next seven days, soonest first, at most
  five listed (Space id, grant id and end only), with the
  `admin_grants_expiring` warning while any exist;
- worker liveness: `workerStatus` / `videoWorkerStatus` (`ok`, `silent` or
  `no_heartbeat_signal`) and `workerLastSeenAt`, see [Monitoring](#monitoring);
- `emailFailuresLastHour` / `pushFailuresLastHour` (counts only);
- `backupStatus`: `not_configured` until a backup job reports a signal; on Cloud
  this adds the `backup_not_configured` warning;
- privacy-safe warning codes for actionable configuration/runtime conditions.

Where no authoritative runtime primitive exists yet, the API reports that the
signal is not available instead of fabricating health. In particular, the
media adapters do not expose a generic health probe.

## Monitoring

`GET /api/v1/server-admin/monitoring?range=24h|30d|90d` returns history points
(hourly for 24 h, daily for 30/90 days), a storage summary and service states.
The data comes from four tables that hold counts, bytes, durations and
timestamps only:

- `worker_heartbeats`: each worker process writes its row every 60 seconds from
  a small thread, together with the last time its loop made progress. A process
  is alive when its row is at most 3 minutes old and its loop moved within the
  job lease plus 3 minutes (5 minutes for the worker, 30 for the video worker),
  so a long job does not look dead and a hung loop does. Rows older than seven
  days are pruned.
- `request_metric_minutes`: each API process counts requests, 5xx responses and
  latency buckets per minute (health probes excluded) and adds them from a
  background thread; kept for 48 hours.
- `operational_metric_hours`: the hourly `monitoring_history` job writes one row
  per hour (requests, server errors, p95, new accounts, active Spaces, stored
  bytes, media filesystem usage when the local media store is used, failed jobs,
  failed email and push deliveries); kept for 90 days.
- `monitoring_alert_states`: see the alert job.

The storage summary shows the media filesystem's used and total bytes and a
linear "full in" estimate when the local media store is used and usage rises.
With object storage there is no total; the page shows stored bytes only.

`EIMIR_HEARTBEAT_PUSH_URL` (optional) is the push-monitor URL of the operator's
own Uptime Kuma. The worker pings it after each heartbeat while the process is
alive, so Kuma alerts when the worker or the whole host stops. The URL carries a
token: it is never logged or returned by any API. `EIMIR_WORKER_NAME` gives a
process a stable heartbeat name (default: the host name).

`PUT /api/v1/server-admin/settings/monitoring-alerts` with `{"enabled": bool}`
turns the alert mails on or off, and `PUT /api/v1/server-admin/settings/monitoring-push`
turns the same alerts as app push on or off (#2314); both are on by default and
both changes are recorded in the privileged audit like the other settings.

### Alert mails and push

The `monitoring_alerts` job runs every five minutes and alerts the allow-listed
ServerAdmin accounts with a verified address when a condition becomes active,
and at most once a day while it stays active. Nothing is sent on resolution,
and conditions that become active while both switches are off are not sent
later. Both channels share one state per condition: one activation is one mail
and one push.

- **Mail** goes to each verified allow-listed address, names the condition and
  links to System › Monitoring (new reports link to Help › Reports).
- **Push** goes once to each such account's registered devices, as an operator
  notice of kind `OPERATOR_ALERT`: it belongs to no Space, never appears in a
  couple's Notification Center, unread count or notification settings, and
  names only the condition. Every device shows the neutral eimir. notice; the
  topic appears after the tap, which opens the matching ServerAdmin page
  (failed jobs: System › Jobs; new reports: the new reports; a Space near its
  quota: the Situation; otherwise System › Monitoring). The tap is resolved
  through the account's current Space, so an account in no Space lands on its
  notification list and opens ServerAdmin itself. The account's Quiet Hours
  apply; alerts held overnight arrive as one notice that opens the latest
  topic, while the mails name each one. Delivery and the tap re-check that the
  account is still a verified allow-listed ServerAdmin. Notices expire after 24 hours and are
  deleted a day later. Topic text on the Android lock screen needs a later
  native release.

| Code | Active when |
| --- | --- |
| `failed_jobs` | a job failed after the last mailed failure |
| `space_quota_pressure` | a Cloud Space uses at least 85 % of its quota |
| `disk_pressure` | the local media filesystem is at least 85 % full |
| `delivery_failures` | more than 5 email or push deliveries failed in the last hour |
| `backup_not_configured` | Cloud without a backup signal (sent once only) |
| `support_reports` | a new unarchived report arrived after the last notice, while reports are collected and the operator plugin can triage them |

### Runbook: external watch with Uptime Kuma and Arcane

eimir. cannot report its own outage. The operator therefore runs an Uptime Kuma
instance on a **different host** than eimir. (if it ran on the same host, it
would go down with it):

1. In Uptime Kuma, add an **HTTP(s)** monitor for
   `https://<your eimir host>/api/v1/health/ready` with a 60-second interval. It
   answers 200 only while the API and its database work and returns no content.
2. Add a **Push** monitor (heartbeat interval 120 seconds). Copy its push URL into
   the eimir. configuration as `EIMIR_HEARTBEAT_PUSH_URL` for the worker and
   redeploy. Kuma then alerts when the worker hangs, stops, or the host is gone.
3. Set up a notification (for example email) for both monitors.
4. Use Arcane for the container overview (running, health, restarts). Container
   state alone does not show a hung worker; the push monitor does.

The overview does not expose:

- passwords, tokens, private keys, DSNs, provider credentials, or secrets;
- private Memories, Notes, messages, media content, or other product payloads;
- background-job payloads;
- raw background-job exception text;
- relationship-quality, engagement, Vibe/Energy, intimacy, or OWNER_ONLY
  analytics;
- shell, SQL, filesystem, or container execution capabilities.

## Account administration

The ServerAdmin Web console includes a paginated Account directory and focused
Account detail view. These surfaces expose only identity, authentication, and
coarse lifecycle metadata required for instance operation, for example:

- Account ID, display name, creation and disabled timestamps;
- primary email and verification state;
- configured authentication methods and passkey count;
- active session count and last available session activity;
- active/historical Membership counts without Space content.

Private relationship content is deliberately not queried by these read models.

The directory finds an Account by e-mail address or by its complete Account ID. It
does not search by display name: the name is protected content stored encrypted at
rest (#797, `docs/ENCRYPTION-AT-REST.md`) and is only shown for an Account that was
found. A person can copy their Account ID from the More page of the app, from a
quiet line below sign-out, and pass it to whoever supports them.

The corresponding ServerAdmin API supports:

- `GET /api/v1/server-admin/accounts`;
- `GET /api/v1/server-admin/accounts/{accountId}`;
- `PUT /api/v1/server-admin/accounts/{accountId}/suspension`;
- `POST /api/v1/server-admin/accounts/{accountId}/sessions/revoke`;
- `POST /api/v1/server-admin/accounts/{accountId}/email-verification/request`;
- `POST /api/v1/server-admin/accounts/{accountId}/emails/{accountEmailId}/verify`;
- `POST /api/v1/server-admin/accounts/{accountId}/recovery/email`;
- `POST /api/v1/server-admin/accounts/{accountId}/recovery/operator`;
- `GET /api/v1/server-admin/activity/actions`.

### Suspension and session revocation

Account suspension reuses the authoritative `Account.disabled_at` state. It is
not a parallel ban flag. Suspending an Account:

- disables future authentication;
- revokes all active `DeviceSession` families;
- leaves Account and relationship data intact;
- records a content-free privileged audit event.

The currently authenticated ServerAdmin cannot suspend their own Account.
ServerAdmin rows involved in lockout protection are locked transactionally so
concurrent administrative changes cannot intentionally bypass the safeguard.

Unsuspending an Account restores authentication eligibility only. It does not
recreate deleted credentials or sessions.

The explicit revoke-sessions action invalidates all current session families
without suspending the Account.

### Normal email verification resend

For an active Account whose primary email is still unverified, ServerAdmin may
request the ordinary verification message. This calls the same
`EmailVerificationToken` issuance, supersession, rate-limit, expiry and mail
delivery path used by authenticated self-service. The operator never receives
the token or verification URL.

If the primary address is already verified, the request is an idempotent no-op.
If mail is not configured, the endpoint reports the existing
`MAIL_TRANSPORT_UNAVAILABLE` capability error. This normal resend is deliberately
separate from operator-assisted verification below: sending a proof to the
mailbox does not assert that the operator has verified the person's identity.

### Operator-assisted email verification

When an operator has verified an Account email through an appropriate
out-of-band process, ServerAdmin may mark that existing `AccountEmail` as
verified. The operation requires typing the exact target email address and is
audited. It does not create an email address, create an Account, or grant
ServerAdmin by itself.

This path exists primarily for Self-Hosted installations that intentionally run
with `EIMIR_MAIL_TRANSPORT=none`. It must not be exposed to ordinary clients as a
way to bypass normal verification.

### Password recovery

A ServerAdmin never reads or sets a user's plaintext password.

If mail delivery is configured, the Account detail surface can request the
normal password-recovery email. This reuses the same Account recovery service as
the public recovery flow.

For a Self-Hosted installation without mail delivery, ServerAdmin may issue an
operator-assisted recovery proof for an active local-password Account. This
also reuses the normal `AccountRecoveryToken` lifecycle:

- any previous open recovery proof for the target Account is revoked;
- only a token hash is persisted;
- the returned recovery URL is sent with `Cache-Control: no-store`;
- the plaintext proof is not written to audit history or logs;
- the Account owner chooses their own replacement password through the normal
  recovery-consume endpoint;
- the proof remains single-use and expires according to the normal recovery
  token policy.

The operator is responsible for handing the one-time URL to the Account owner
through an appropriate out-of-band channel.

## Self-Hosted break-glass email verification

A dashboard cannot repair the initial state where no verified allowlisted
ServerAdmin can enter it. For that narrow bootstrap/recovery case, a local
operator may run inside the backend environment:

```bash
python -m scripts.server_admin verify-email operator@example.com
```

The command:

- only matches an already existing `AccountEmail`;
- only sets its `verified_at` assertion;
- never creates an Account;
- never changes `EIMIR_SERVER_ADMIN_EMAILS`;
- never grants ServerAdmin independently of the normal allowlist check;
- does not print authentication secrets;
- records a system-attributed privileged audit event when it changes state.

After verification, the deployment still needs the exact address in
`EIMIR_SERVER_ADMIN_EMAILS` and the normal API restart/recreate semantics apply to
allowlist changes.

## Account deletion boundary

ServerAdmin account deletion is intentionally **not** a direct row/table
deletion. Issue #520 owns the authoritative Account deletion and retention
lifecycle, including credentials, sessions, OWNER_ONLY data, shared history,
media references, jobs, backups, and restore reconciliation.

Account deletion is not an invitation or onboarding reset. It ends the target's
Memberships; an ended Membership history-locks that Space against ordinary
future invitations, even if the same mailbox later registers a new Account.
Preserving the Space does not preserve its ability to accept that replacement
Account. Diagnose mailbox requests, proof binding and authorized Space selection
before proposing deletion as a way to retry onboarding.

The ServerAdmin danger zone invokes that same lifecycle behind impact
confirmation and exact typed target confirmation; like every ServerAdmin
action it needs no step-up re-authentication (Product Owner, 2026-11-26). The
privileged audit records the operator request and projects the authoritative
lifecycle outcomes as `account_deletion_completed` or
`account_deletion_failed`. These outcome entries are an immutable operational
projection only: `AccountDeletion` remains the source of truth, retries cannot
create duplicate logical outcomes, and self-service deletions do not become
ServerAdmin audit events. Failure entries retain no exception prose or private
payload.

## Privileged action audit

Account administration actions use a separate narrow audit projection from the
boolean settings history. `InstanceAdministrationActionEvent` records only:

- actor Account ID, or system attribution for local break-glass work;
- target Account ID where applicable;
- typed action identifier;
- optional technical effect count such as revoked sessions;
- timestamp.

It never stores passwords, recovery proofs, free-form reasons, request bodies,
private relationship payloads, IP-history profiling, or provider secrets.

Part 3 of the redesign (#2324) adds `space_file_viewed` (every Space file load),
`space_storage_quota_set` and `space_storage_quota_cleared` with the target Space.

## Registration and maintenance controls

Registration policy and maintenance mode are persisted as application state,
not deployment-environment feature flags. `registration_enabled` records the
operator's registration policy; the effective registration state additionally
requires maintenance mode to be off. This keeps the stored operator choice
intact when maintenance is entered and left.

Clients can read the minimal unauthenticated `GET /api/v1/instance/status`
projection. It exposes only maintenance state, effective registration
availability, and the non-sensitive reason `administrator` or `maintenance`
when registration is unavailable. Web and Android treat connectivity failure
as a separate state and fail closed for advertising new-account creation.

An authenticated ServerAdmin can use:

- `GET /api/v1/server-admin/settings`;
- `PUT /api/v1/server-admin/settings/registration`;
- `PUT /api/v1/server-admin/settings/maintenance`;
- `GET /api/v1/server-admin/activity`.

Each mutation is authorized server-side and records a narrow audit event with
the actor, setting name, previous/new boolean value, and timestamp. The audit
record contains no product content, credentials, job payloads, or other private
data.

Maintenance mode rejects ordinary product API traffic, while health,
authentication/recovery, public instance status, and ServerAdmin endpoints stay
reachable. Background workers continue to run. This boundary deliberately
lets an operator sign in and leave maintenance mode without requiring shell or
database access.

Disabling registration blocks all supported new invited-account onboarding
paths, including local-password and OIDC onboarding. Existing accounts can
still authenticate and accept invitations. Initial bootstrap remains an
explicit lockout-recovery exception so a fresh Self-Hosted instance cannot be
made permanently inaccessible before its first operator account exists.

## Support reports

The in-app support reports of [#2189](https://github.com/baerenmarke90/eimir/issues/2189)
are read and answered in the **Reports** section of the ServerAdmin area. The
section belongs to the operator plugin `eimir-admin` (entry point `admin`,
capability `support.operator`, [Decision 0017 amendment](decisions/0017-pro-plugin-seam.md#amendment-2026-11-24-more-than-one-plugin)).
The Core ships no reader: without the plugin there is no screen or API to read a
report's note.

### Availability

The overview field `supportReportsOperatorAvailable` is `true` only while
`EIMIR_SUPPORT_REPORTS_ENABLED` is on **and** the loaded plugins declare
`support.operator`. The Web client shows the Reports navigation entry, and the
`support_reports_unread` warning links into the section, only while the field is
`true`. A direct link to `?section=reports` otherwise shows a "not available"
state. Configuration: [Self-Hosted, operator plugin](SELF-HOSTING.md#operator-plugin-for-support-reports).

### Routes

All routes live under `/api/v1/server-admin/support-reports`, require the
ServerAdmin guard, answer `Cache-Control: private, no-store` and answer `404`
while `EIMIR_SUPPORT_REPORTS_ENABLED` is off.

| Route | Purpose |
| --- | --- |
| `GET /` | List, optional `state` (`NEW`, `IN_PROGRESS`, `CLOSED`), `archived` (default `false`: unarchived reports; `true`: the archive), keyset `cursor`, `limit`; items carry kind, state, time, `archivedAt`, app version and build, failure reference and whether a reply and a ticket exist, plus the `newCount` of unarchived `NEW` reports; never the note |
| `GET /{reportId}` | The report: note, technical client context, failure reference, request id, the opaque reporter account id (no name or email), the reply if any, the ticket link if any and `ticketAvailable` |
| `PUT /{reportId}/state` | Set `NEW`, `IN_PROGRESS` or `CLOSED` |
| `PUT /{reportId}/archive` | Archive (`{"archived": true}`) or unarchive a report |
| `DELETE /{reportId}` | Delete the report permanently (`204`), with its reply and ticket link |
| `POST /{reportId}/reply` | The one reply, plain text of at most 500 characters |
| `POST /{reportId}/ticket` | Create the tracker ticket from the operator's title and body |
| `DELETE /{reportId}/ticket` | Clear a ticket link so a new ticket can be created |

Reads and writes need the ServerAdmin role only, without a step-up
re-authentication. Reads are not audited. Each write records one content-free privileged audit
entry: `support_report.state_set`, `support_report.reply_sent`,
`support_report.ticket_created`, `support_report.ticket_cleared`,
`support_report.archived`, `support_report.unarchived` or
`support_report.deleted`. Report text never enters the audit, logs or metrics.

The plugin routers are mounted behind the normal-operation dependency, so in
maintenance mode they answer `503` like other product routes, while the rest of
the ServerAdmin area stays reachable.

### Archive and delete

- **Archive** is a marker (`archived_at`) next to the triage state, not a fourth
  state. An archived report leaves the `NEW`, `IN_PROGRESS`, `CLOSED` and `all`
  lists and no longer counts as new (also not for the `support_reports_unread`
  warning), but keeps its state, so unarchiving restores it exactly. It stays
  readable in the `Archived` view. Archiving does not change retention: the
  90-day and 365-day deletion of the privacy notice applies to archived reports
  unchanged.
- **Delete** removes one report for good, with its reply and, through the
  foreign key, its ticket link. It cannot be undone. The tracker issue of a
  linked ticket is not touched (the tracker API cannot delete issues); the
  confirmation dialog says so. The reporter's reply notice follows the report
  and stops being current, and the reporter's own reply endpoint answers `404`.
  A copy of the reports that a person already received as their personal data
  copy stays in that copy. Deleting earlier than the retention periods is
  within the privacy notice ("at the latest").

### Reply

A report receives exactly one reply. It is sent once and cannot be edited or
withdrawn; a second attempt answers `409 SUPPORT_REPORT_ALREADY_REPLIED`. The
reporter reads it as plain text in their notifications.

### Tickets

- Only technical data leaves the server. The ticket body is the title and body
  the operator types plus a fixed footer the server composes from the report id,
  kind, app version, build, platform, failure reference and request id. The
  stored note and the reply are never read into the tracker request. The
  operator is responsible for not typing private text; the dialog says so.
- The only tracker is GitHub Issues (`EIMIR_ADMIN_TRACKER=github`), using the
  repository `EIMIR_ADMIN_GITHUB_REPOSITORY` and the token
  `EIMIR_ADMIN_GITHUB_TOKEN`. Issues get the label `support-report`. The token
  never reaches a client and never appears in logs. Without a configured tracker
  the detail reports `ticketAvailable: false`, the UI hides the button and the
  route answers `409 SUPPORT_TICKET_NOT_CONFIGURED`.
- One ticket per report. Creation first reserves a `PENDING` link and commits
  it, then calls the tracker, then stores the link as `CREATED`. A second request
  answers `409 SUPPORT_TICKET_EXISTS` with the existing link. The title takes 1 to
  256 characters (`422` validation otherwise); a body that exceeds 65,536
  characters together with the footer answers `422 SUPPORT_TICKET_TOO_LONG`.
- A tracker failure answers `502 SUPPORT_TICKET_FAILED` with a `retryable` flag
  and leaves the link `PENDING`; nothing retries automatically. A `PENDING` link
  older than five minutes, or one whose attempt failed in this session, is shown
  as "uncertain, check the tracker". The operator checks the tracker and may then
  clear the link (`DELETE`, after a confirmation that warns about a duplicate
  ticket) and create it again. Clearing removes only the link; an issue that was
  created stays in the tracker.
- The link row is deleted with its report (retention, account deletion).

### Runbook: downgrades

- The plugin's migration chain creates `support_report_tickets` with a foreign
  key to the Core table `support_reports` from Core migration `0175`. Before a
  Core downgrade below `0175`, downgrade the admin plugin chain to its base
  first.
- The downgrade of Core migration `0177` drops `support_reports.archived_at`
  (archive markers are lost) and deletes the audit rows of the three actions it
  added (`archived`, `unarchived`, `deleted`).
- The downgrade of Core migration `0176` deletes the privileged audit rows of
  the four `support_report.*` actions, because the narrower action constraint
  cannot hold them. Export them first if they must be kept.

## People search and Space file

ServerAdmin part 3 (#2324) adds one search and a Space file under People.

- `GET /api/v1/server-admin/search?q=` matches the query against email
  addresses (as a substring, with `%` and `_` taken literally) and against a
  complete Account or Space id. It needs at least two characters other than
  `%` and `_` unless it is a complete id, returns at most 20 Accounts and at
  most 40 Spaces (those Accounts' Spaces and a Space matched by id). Names are
  protected content and are never matched.
- `GET /api/v1/server-admin/spaces/{spaceId}/file` returns the Space
  lifecycle projection, its members (primary email, verification, sign-in
  methods, membership status and dates), storage used against the Cloud quota
  with bytes per media type, the entitlement summary and grant history, and
  the newest 20 events (grants and privileged actions on this Space; views
  are left out). It never returns display names, Space names or profile,
  relationship dates or content. Every call records `space_file_viewed`.
- `GET /api/v1/server-admin/accounts/{accountId}` lists the Account's Spaces
  (id, membership status, since).

This narrows the earlier rule that the lifecycle directory carries no
Account correlation: the link between an Account and its Spaces is shown one
Space or Account at a time to an allow-listed ServerAdmin, every Space file
view is audited, and no endpoint lists the link in bulk. The privacy policy
already says that administration tools show account data and never content.
Support reports stay anonymous and never link to a Space.

Each member in the Space file links to its Account detail, which shows the
display name as before. The pairing of a Space with its members' names is
therefore reachable in two steps; the Product Owner accepted this on
2026-11-26, since the privacy policy names account data, including names,
as visible in administration tools.

### Individual storage quota

On eimir. Cloud a ServerAdmin can give one Space an individual storage quota:

```text
PUT /api/v1/server-admin/spaces/{spaceId}/storage-quota
{"quotaGb": 80, "effectiveUntil": "2026-12-31T23:59:59+01:00"}
DELETE /api/v1/server-admin/spaces/{spaceId}/storage-quota
```

- It replaces the Free or Premium value while it is active and may be higher
  or lower. Whole GB from 1 to 1024; an end date must lie in the future and is
  optional. After it, or after `DELETE`, the tier value applies again at once;
  no job is involved.
- Over any quota nothing is deleted; only new bytes are refused. The Space
  file warns before a value below the current usage is saved.
- Self-Hosted is unmetered: both calls answer 404 and the action is absent.
- It is stored in `space_storage_quota_overrides` (Space, bytes, until, set
  by, set at) and removed with the Space. It is not copied by the operator
  transfer. Uploads, the Situation pressure list and the storage alert read
  it through `attachments.quota.space_quota`.
- Set and clear are recorded as `space_storage_quota_set` and
  `space_storage_quota_cleared`.

## Business model

Core ServerAdmin operations required to run a Self-Hosted eimir.
installation are operational administration and are not Premium-paywalled.
Hosted-service-specific capabilities must continue to use the authoritative
deployment and entitlement model rather than hardcoded client branching.

## Space lifecycle directory

`GET /api/v1/server-admin/spaces` and `GET /api/v1/server-admin/spaces/{spaceId}`
expose a deliberately narrow, read-only lifecycle projection derived from `Space` and
`Membership` state. The projection contains IDs, creation/lifecycle timestamps,
Membership status counts and coarse anomaly codes only.

It does **not** expose Account identity correlation, Space profile/relationship dates,
Memories, Notes, messages, media, OWNER_ONLY state or behavioral/engagement analytics.
Space termination, partner removal and reactivation remain outside this operator surface
until the authoritative lifecycle decisions in #518 are complete.

### Legacy configuration-manager reconciliation

Spaces created before the M7 configuration-authority contract can legitimately
have no `configuration_manager_account_id` when retained Membership history does
not prove one unique founder. This state is intentionally fail-closed and must
not be repaired from Membership order, join timestamps, invitation history,
Account creation time, or client ordering.

After the partners have been verified through an appropriate out-of-band
process, a ServerAdmin may perform the one-time recovery operation:

```text
POST /api/v1/server-admin/spaces/{spaceId}/configuration-manager/reconcile
{"accountId":"<active-member-account-id>"}
```

The selected Account must currently have an `ACTIVE` Membership in that Space.
The operation only assigns a missing manager; it never replaces an existing
manager and is not a general owner-transfer mechanism. Concurrent attempts are
serialized by the authoritative relationship locks, and a successful assignment
records a content-free privileged audit event with actor, target Account, and
target Space identifiers. Until reconciliation succeeds, ordinary configuration
writes remain unavailable for that legacy Space.
