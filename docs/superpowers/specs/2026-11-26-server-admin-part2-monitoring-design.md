# ServerAdmin part 2: monitoring

**Status:** draft for Product Owner approval. **Umbrella:** #2314. **Builds on:** part 1
(#2316, merged as `14f6fe5b9`) and the [redesign design](2026-11-26-server-admin-redesign-design.md)
section 5.2. **Visual reference:** `docs/product/design/references/server-admin-redesign/02-monitoring-compact.png`.

## 1. Intent and why

The Product Owner runs app.eimir.de alone and needs to learn about problems before
couples do. Part 1 shows a snapshot; it cannot say whether the worker is alive, how
things developed, or warn anyone. Part 2 adds an honest liveness signal, history, and
mail alerts, and pairs them with the Product Owner's own external watch.

## 2. Decisions taken (Product Owner, 2026-11-26)

- Monitoring way C: history and alerts inside eimir., plus one external check.
- The external check is the Product Owner's **own Uptime Kuma**, not a third-party
  service. Containers are watched in **Arcane**. No Healthchecks.io / UptimeRobot.
- app.eimir.de has **no backup today**. Setting one up is a separate task (outside this
  part); part 2 must make the gap visible instead of hiding it.

## 3. Goals, non-goals, anti-goals

Goals

- Worker liveness that a hung worker cannot fake (a running container is not proof).
- 24 h / 30 d / 90 d history for the numbers in the mockup.
- Mail alerts for what Uptime Kuma cannot see: failed jobs, storage near limits, mail/push
  failure bursts, missing or stale backup.
- A runbook so the Product Owner can set up Uptime Kuma in small exact steps.

Non-goals

- Running or bundling Uptime Kuma, Prometheus or any other service.
- Backups themselves (separate task); restore tooling.
- Per-route or per-user request analytics.

Anti-goals

- Metrics or alerts that carry couple content, names, emails, paths with ids, or secrets.
- An alert mail storm, or alerts that cannot be turned off.
- Fake health: a missing signal must read as missing.

## 4. Approach

| Part | Choice | Why |
| --- | --- | --- |
| Outside view (server down, TLS, proxy) | Uptime Kuma (PO-operated, on a different host than app.eimir.de) checks `https://app.eimir.de/api/v1/health/ready` | Existing, content-free endpoint that also checks the database; no new public surface. |
| Worker liveness | Heartbeat row written by the worker loop every 60 s; optional HTTP ping to a Kuma **push monitor** URL after each heartbeat | Only the loop itself can prove it is not hung; Kuma alerts when pings stop, even if the whole host is gone. |
| History | In-process request counters flushed per minute + an hourly snapshot job, kept 90 days in Postgres | Nothing new to operate; Self-Hosted gets the same. |
| Charts | Inline SVG sparklines in React | No chart library needed for a handful of lines (reuse review: no dependency). |
| Alerts | Worker job every 5 minutes, mail through the existing mail sender to verified allow-listed ServerAdmin addresses | Reuses mail and the allow-list; no new provider. |

## 5. Design

### 5.1 Worker heartbeat

- New table `worker_heartbeats` (`worker_name` primary key, `role` = `worker` or
  `video-worker`, `build_revision`, `last_seen_at`, `last_progress_at`). Rows not seen for
  7 days are pruned by the hourly job. `worker_name` is `EIMIR_WORKER_NAME` when set, else
  the hostname (agent's call: container recreation creates a new row; pruning removes the
  old one).
- Long jobs (agent's call): a small heartbeat thread in each worker process upserts its row
  every 60 s. The loop records `last_progress_at` at every iteration and at every job start
  and finish. A process counts as **alive** when its row is fresh (within 3 minutes) **and**
  its progress is younger than the job lease (5 minutes) plus 3 minutes. A long but healthy
  job keeps renewing its lease and stays alive; a hung loop stops making progress and turns
  `silent` even though the thread still writes.
- The overview's `worker_status` becomes `ok` (at least one `worker` process alive), `silent`
  (rows exist, none alive), or stays `no_heartbeat_signal` (no row ever). New fields
  `worker_last_seen_at` and `video_worker_status` (same rule, `video-worker` role).
- Optional setting `EIMIR_HEARTBEAT_PUSH_URL` (operator configuration, never shown in
  ServerAdmin or logs): the heartbeat thread sends a GET with a 5 s timeout only while the
  process is alive by the rule above; failures are logged without the URL and never block.

### 5.2 Request metrics and hourly history

- The API middleware counts, per process and minute: requests, 5xx responses, and latency
  buckets. Health endpoints are excluded. Each process flushes the finished minute into
  `request_metric_minutes` (additive upsert) off the request path.
- An hourly job (scheduled like the existing maintenance chain) writes one row to
  `operational_metric_hours`: requests, server errors, p95 latency (from the buckets),
  new accounts, active Spaces, stored bytes, failed jobs, failed email deliveries, failed
  push deliveries. Minute rows are kept 48 hours, hour rows 90 days.
- `GET /api/v1/server-admin/monitoring?range=24h|30d|90d` returns the series (hourly for
  24 h, daily aggregates for 30/90 d), the storage forecast and the service list.
- Server storage (agent's call): with the local media store, the hourly job also records
  used and total bytes of the filesystem holding `media_root`; the page shows "x of y" and
  a linear forecast when the trend rises, and an alert fires at 85 % of that filesystem.
  With object storage there is no total: the page shows stored bytes and their trend only,
  and no disk alert.

### 5.3 Backup state

- New overview field `backup_status`: `not_configured` until a later backup task adds a
  signal (for example a status the backup job reports). Part 2 defines the field and its
  presentation only.
- On Cloud, `not_configured` adds the warning code `backup_not_configured`, shown in the
  Situation's "Needs you" queue and as a Backup tile. On Self-Hosted the tile reads
  "unknown" without a queue item, because operators may back up outside eimir.

### 5.4 Alerts

- A worker job every 5 minutes evaluates (agent's calls on each):
  - **new failed jobs**: jobs that failed after the high-water mark stored with the alert
    state (failed rows otherwise stay forever and would never resolve);
  - a Cloud Space at or above 85 % of its quota (new Spaces since the last mail);
  - local media filesystem at or above 85 % (local store only);
  - more than 5 failed email or push deliveries in the last hour;
  - `backup_not_configured` (Cloud only): **one** mail when it first applies, no daily
    repeat; the Situation keeps showing it. A stale-backup rule follows with the backup
    signal in the separate backup task.
- Each condition has a state row (`monitoring_alert_states`: code, active since, last
  sent, high-water mark). A mail goes out when a condition becomes active and at most once
  a day while it stays active (except the one-time backup mail); no mail on resolution.
  Mails contain the condition and counts only, plus a link to ServerAdmin.
- Recipients: verified primary emails of allow-listed ServerAdmin accounts. One switch in
  System › Settings (`monitoring_alerts_enabled`, default on), recorded in the privileged
  audit like the other settings.

### 5.5 Web

- System gets a **Monitoring** page (first in System) following the mockup: range switch,
  error rate, response time, storage with forecast, services with "last seen", alert switch.
- Left out of the mockup (agent's calls): "reachable from outside · 99.98 %" (that history
  lives in the operator's Uptime Kuma; fetching it would store a Kuma credential in eimir),
  an active Firebase probe (replaced by the push failure count from deliveries), and a
  "retry" button on failed jobs (no retry endpoint exists; the Jobs page stays as is).
- The Situation's service tiles gain Worker (real), Push and Backup; the registrations card
  gains a 30-day sparkline.
- All states: loading, empty history ("history starts collecting now"), error, reduced
  motion (no animated lines).

### 5.6 Operations

- New runbook section in `docs/SERVER-ADMIN.md`: Uptime Kuma on a different host, an HTTP
  monitor on `/api/v1/health/ready` (interval 60 s), a push monitor whose URL goes into
  `EIMIR_HEARTBEAT_PUSH_URL`, mail notifications; Arcane for container overview.

## 6. Constraints

- Privacy contract of `docs/SERVER-ADMIN.md` holds; metric rows store no route, user, Space
  or request identifiers.
- Self-Hosted and Cloud behave the same except the backup queue item (Cloud only).
- Business/freemium: Free/Core admin capability; mail volume is a handful per day at most.
- New migration(s); `alembic heads` after every `main` merge.

## 7. Left to the builder

- Exact latency buckets, flush mechanism inside the API process, job names and intervals
  beyond the values above, table indexes, and chart details.
