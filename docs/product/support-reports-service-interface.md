# Support reports: API and service interface

**Owning issue:** #2189. **Design:** [Support reports in the Core](support-reports-core-design.md).
**Operator switch:** [`EIMIR_SUPPORT_REPORTS_ENABLED`](../SELF-HOSTING.md#in-app-support-reports).

This is the reference for the two public endpoints and the Python service interface
of `eimir.support_reports`. The later operator plugin reads, triages and answers reports
through exactly this service interface. No Core module imports a plugin (pinned by
`tests/unit/test_core_imports_no_plugin.py`). The OpenAPI contract in
`backend/openapi.json` stays the executable source for the wire format.

## Endpoints

Both endpoints require an authenticated session and answer `Cache-Control: private, no-store`.
Report content is protected at rest ([Encryption at rest](../ENCRYPTION-AT-REST.md)).

### `POST /api/v1/support-reports` (`createSupportReport`)

Stores one report of the signed-in account.

| Field | Rule |
| --- | --- |
| `clientRequestId` | UUID chosen by the client; unique per account. |
| `kind` | `PROBLEM` or `FEEDBACK`. |
| `note` | At most 2,000 characters, trimmed; a blank note is treated as absent. Required for `FEEDBACK`, optional for `PROBLEM`. |
| `failure` | Optional, `PROBLEM` only. `reference` (1 to 200 characters of `A-Za-z0-9_./{}:-`, never a URL) and an optional `requestId` (the failing response's `x-request-id`, at most 128 characters of `A-Za-z0-9._-`). |
| `client` | Required: `appVersion`, `build`, `platform` (`app` or `web`), `os`, `engine`, `locale`, `theme`, `online`, `localTime`, `timeZone`, each with a short length cap. |

The payload is an allow-list. Every model forbids unknown fields, so a future client
cannot store tokens, URLs with ids, file names, memory or message text, location, contact
data or other people's data by accident. A body with an unknown field is rejected with
`422`.

Responses:

- `201` with `id`, `state` and `createdAt` for a new report.
- `200` with the same body when the request was already received (replay).
- `404` while `EIMIR_SUPPORT_REPORTS_ENABLED` is off, indistinguishable from an unknown
  resource. An anonymous caller sees `401` first.
- `409` (`IDEMPOTENCY_KEY_REUSED`) when `clientRequestId` was already used for a different
  `kind`, note or failure reference.
- `422` for validation errors, including feedback without a note or feedback with a failure
  reference.
- `429` when the rate limit is used up.

**Idempotency.** A report is identified by `(account, clientRequestId)`. A retry with the
same identity and the same content returns the original report and creates no second
row. The content is the `kind`, the note and the failure reference; the `client` context
is not compared, because a retry collects it again (local time, theme and online state
change between a lost response and its retry). The stored report keeps the first
attempt's client context. This also holds when two such requests race (the unique
index decides, the loser re-reads the winner). The replay check runs before the rate limit, so a retry after a lost
response never spends budget and never fails because the budget is used up.

**Rate limit.** Per account: 5 reports per hour and 20 per day
(`SUPPORT_REPORT_HOURLY`, `SUPPORT_REPORT_DAILY` in `eimir.auth.rate_limit`). The hourly
limit is checked first.

### `GET /api/v1/support-reports/{reportId}/reply` (`getSupportReportReply`)

Returns `text`, `repliedAt` and `reportedAt` (the answered report's creation time) of the
reply to the caller's own report. The text is plain text of at most 500 characters,
returned exactly as stored; clients must render it as text, never as markup. A report of
another account, a report without a reply, a malformed id and an unknown id are the same
`404`. This endpoint is not gated by the operator switch: a reply that was already sent
stays readable when reports are switched off.

## Service interface

`eimir.support_reports.service`. Every function takes the caller's SQLAlchemy `Session`
and flushes but never commits; the caller owns the transaction. Return values carry the
opaque `account_id` only, never an email address or display name. The operator finds the
person through the ServerAdmin account directory.

| Function | Semantics |
| --- | --- |
| `create_report(session, *, account_id, client_request_id, kind, payload)` | Returns `(report, created)`. `created` is `False` for a replay. Raises `ConflictError` (`IDEMPOTENCY_KEY_REUSED`) for the same identity with different content. |
| `find_replay(session, *, account_id, client_request_id, kind, payload)` | The report an earlier request with the same content (kind, note, failure; the client context is ignored) created, or `None` when the identity is unused. Same conflict as above for different content. |
| `list_reports(session, *, state, limit, cursor)` | Newest first, optionally one `state`. Keyset pagination over `(created_at, id)`; the cursor is bound to the state filter. Returns `Page(items, next_cursor, has_more)`. `limit` below 1 raises `ValueError`. |
| `get_report(session, report_id)` | The report or `None`. |
| `set_state(session, report_id, state)` | Sets the operator's triage marker (`NEW`, `IN_PROGRESS`, `CLOSED`); unknown id raises `NotFoundError`. `closed_at` is set when a report becomes `CLOSED` and cleared when it leaves that state. `set_state(CLOSED)` on an already closed report keeps the original `closed_at`, so a repeated call does not extend retention. Leaving and re-entering `CLOSED` sets a fresh time. |
| `send_reply(session, *, report_id, text, operator_id)` | Stores the single reply and announces it; see below. |
| `get_reply(session, *, report_id, account_id)` | The reply to that account's own report as `ReporterReply(text, replied_at, reported_at)`, or `None` (other account, no reply, unknown id). |
| `count_new(session)` | Number of reports in state `NEW`. |
| `oldest_new_at(session)` | Creation time of the oldest `NEW` report, or `None`. |
| `prune_expired(session)` | Deletes expired reports and returns how many were removed; see retention below. |

### Reply semantics

- A report receives at most one reply. A second `send_reply` raises `ConflictError` with
  code `SUPPORT_REPORT_ALREADY_REPLIED`; the unique `report_id` serializes concurrent
  replies, so the loser is refused and never overwrites the winner.
- The text is trimmed, must not be empty and is at most 500 characters (`ValidationError`,
  `VALIDATION_FAILED`). An unknown report raises `NotFoundError`.
- Replying never changes `state`. A closed report can still be replied to, once.
- `send_reply` stores the reply and records the `SUPPORT_REPLY` outbox event in the same
  transaction, in the Space of the reporter's most recent active Membership. A reporter
  without an active Membership keeps the stored reply and gets no notice. The event carries
  references only, never report or reply text. See the
  [notification workflow](notification-workflow.md).
- `operator_id` is accepted but unused. The notice is attributed to the team, so no
  operator identity reaches the reporter.
- The reply lives in `support_report_replies`, which has an `id` primary key plus a unique
  `report_id` (foreign key, `ON DELETE CASCADE`). The `id` primary key is what the
  encryption-at-rest tooling reads protected rows by; the unique `report_id` keeps it to one
  reply per report.

### Retention and deletion

- A closed report is deleted 90 days after `closed_at`, and any report at most 365 days
  after `created_at` (`CLOSED_RETENTION`, `MAX_RETENTION`). A report exactly at a cutoff is
  kept. The security retention maintenance job calls `prune_expired`; the reply leaves with
  its report through the foreign key cascade.
- Account deletion removes the person's reports and replies immediately: `SupportReport` is
  part of `PERSONAL_ACCOUNT_ROWS` in `identity.deletion`.
- `UNREAD_WARNING_AGE` (14 days) is the age after which a `NEW` report raises the
  `support_reports_unread` warning in the [ServerAdmin overview](../SERVER-ADMIN.md#operational-overview),
  only while the feature is enabled.
