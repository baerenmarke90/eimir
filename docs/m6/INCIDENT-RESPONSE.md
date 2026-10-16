# M6 Incident Response and Operator Runbooks

**Owner:** #522  
**Consumes:** #189, #190, #334, #375, #523  
**G5 evidence owner:** #524

This is the authoritative eimir. launch incident-response contract. It turns the
existing health, structured-log, correlation, recovery and release primitives into an
operator procedure. It does **not** create a monitoring backend, paging service,
status-page provider, queue implementation or deployment platform.

The runbooks are intentionally provider-neutral. Self-Hosted can execute them with
local Docker/Compose, logs and database access. Cloud/Managed may route the same safe
signals to an established observability provider, but provider availability must not
become a Core runtime dependency.

## 1. Operating principles

1. **Protect people and data before availability.** Never weaken authorization,
   tenant isolation, `OWNER_ONLY`, `ProtectedPayload`, signing or secret handling to
   recover faster.
2. **Correlate; do not copy content.** Prefer release revision, request/correlation
   ID, job ID, timestamp and safe error category to request bodies, database rows or
   private filenames.
3. **Use existing recovery paths.** Deployment recovery follows #375; database/media
   recovery follows #190. A runbook must not invent a second rollback mechanism.
4. **Forward-fix is the default after a schema change.** An older application is not
   automatically compatible with a newer schema merely because its artifact exists.
5. **Contain first, mutate second.** Stop a retry loop, block a bad candidate or
   quiesce writes before performing invasive recovery.
6. **Production evidence is minimized.** Preserve only what is necessary to explain
   the technical incident and the recovery decision.
7. **No mandatory telemetry SaaS.** Local logs, health endpoints and database-backed
   queue state remain sufficient to operate Self-Hosted.

## 2. Current signal inventory and limitations

### Health and revision

The API exposes two intentionally different checks:

- `GET /api/v1/health` answers process liveness without touching PostgreSQL;
- `GET /api/v1/health/ready` checks PostgreSQL readiness and returns `503` with a
  sanitized body when the database is unavailable;
- both responses expose `X-Eimir-Revision` so the operator can verify the exact
  deployed revision.

The Web container exposes `/healthz` for its own HTTP health check.

Suggested non-authenticated checks:

```bash
BASE_URL=https://eimir.example
curl --silent --show-error --include "$BASE_URL/api/v1/health"
curl --silent --show-error --include "$BASE_URL/api/v1/health/ready"
curl --silent --show-error --include "$BASE_URL/healthz"
```

Do not replace readiness with liveness in an orchestrator: a running API process and a
usable API are different states.

### Request and job correlation

#189 provides structured logging, server-generated/validated request IDs and
correlation propagation into background jobs. `X-Request-ID` is returned to callers.
Production JSON logs may contain technical context such as request/correlation IDs and,
where the application already records them, account/Space identifiers. Account/Space
identifiers are not content, but they are still operationally sensitive and should be
copied into incident evidence only when necessary.

### Queue health

The queue is PostgreSQL-backed. As of this runbook there is **no authoritative worker
heartbeat endpoint** in the current mainline ServerAdmin contract. Therefore:

- do not alert on a fictional heartbeat metric;
- use worker process/container liveness plus queue progression, oldest runnable job,
  retry/exhaustion counts and repeated safe error categories;
- #551 adds a privacy-safe Jobs drill-down when merged, but this runbook does not
  require #551 to exist.

A safe aggregate queue query must never select `payload`, `last_error` or `locked_by`.
For a canonical Compose deployment the following only returns technical aggregates:

```bash
docker compose exec -T postgres sh -lc '
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc --tuples-only --command "
    SELECT status,
           kind,
           count(*) AS jobs,
           max(attempts) AS max_attempts_seen,
           max(max_attempts) AS configured_max_attempts,
           extract(epoch FROM (now() - min(created_at)))::bigint AS oldest_age_seconds
      FROM jobs
     WHERE status IN (''PENDING'', ''RUNNING'', ''FAILED'')
     GROUP BY status, kind
     ORDER BY status, kind;
  "
'
```

If the deployment cannot grant an operator SQL session, use the privacy-safe
ServerAdmin Jobs endpoint once #551 is merged or derive the same aggregate from
structured operational logs. Do not work around access restrictions by exposing a raw
SQL console in the product.

### Media health

There is no reason to inspect real relationship media to decide whether storage works.
Use a fictional/synthetic canary or the existing release/recovery acceptance fixtures.
For LocalMediaStore, container/volume availability is an infrastructure signal. For S3
or another provider, provider reachability and sanitized error category belong at the
deployment adapter boundary.

### Maintenance mode

#334 owns the persisted application `maintenance_mode` control and the invariant that
ServerAdmin recovery access remains possible. Until #334 is actually merged and
available in the target release, **do not edit the database directly to imitate
maintenance mode**. Use deployment-level traffic containment/write quiescence described
in #375/#190 instead. Once #334 is available, its authorized API/UI is the preferred
application-level containment mechanism.

## 3. Severity, ownership and escalation

eimir. uses a compact operational severity model. Severity is based on technical
impact, not on whose account is affected.

| Severity | Launch interpretation | Initial response | Ownership |
|---|---|---|---|
| **SEV1** | complete service outage, widespread inability to authenticate/use Core, confirmed active secret/privacy exposure, or recovery path itself failing | immediate containment; stop risky changes; establish one incident owner | release/operations owner; security owner also required for privacy/secret events |
| **SEV2** | major subsystem unavailable/degraded, sustained DB/readiness failure, queue/media/auth failure with meaningful user impact, unsafe release candidate | contain within the current operational window; no further promotion | operations/release owner plus subsystem owner |
| **SEV3** | bounded degradation with workaround/grace, rising error/latency, provider/source problem not yet breaking Core | investigate and track; prepare mitigation before it escalates | subsystem/operator owner |
| **SEV4** | informational anomaly or test/drill finding with no current user impact | normal engineering follow-up | owning engineering workstream |

Escalate one level when:

- impact expands from one subsystem to most normal product paths;
- the root cause is unknown and the condition persists beyond two alert windows;
- rollback/restore is being considered;
- diagnostic evidence suggests token/secret/private-content exposure;
- a recovery action creates a second failure.

For a confirmed privacy/secret incident, severity may be SEV1 even while the product is
otherwise available.

## 4. Launch alert boundary

These are **initial launch defaults**, not hard-coded application semantics. A
deployment may tune them from an observed baseline while preserving the same safe
signal contract.

| Signal | Initial condition | Severity / action |
|---|---|---|
| API or Web availability | 3 consecutive failed probes or continuous failure >= 2 minutes | SEV2; if both are unavailable or recovery fails for >= 5 minutes, SEV1 |
| DB/readiness | `/api/v1/health` works but `/api/v1/health/ready` fails continuously >= 2 minutes | SEV2; >= 5 minutes with broad request failure -> SEV1 |
| HTTP server errors | 5xx >= 5% over 5 minutes with >= 50 requests | SEV2; >= 20% or effective outage -> SEV1 |
| Latency | non-streaming API p95 > 2 s for 10 minutes | SEV2 after excluding known dependency/maintenance windows; tune after baseline |
| Queue age/backlog | oldest runnable `PENDING` job > 5 minutes, or depth > 100 for 10 minutes without progress | SEV2; tune for actual launch load |
| Exhausted/repeated jobs | exhausted failures increase in two consecutive windows, or the same `(kind, safe_error_category)` repeats without progress | SEV2; contain the poison/retry loop before retrying |
| Media | synthetic canary read/write or provider-health check fails 3 times in 5 minutes | SEV2; never use private user media as the canary |
| Auth | server/provider auth failure >= 10% for 5 minutes with meaningful request volume | SEV2; all sign-in/session refresh blocked -> SEV1 |
| Entitlement source | provider/source refresh unavailable >= 15 minutes | SEV3 while bounded normalized cache/grace is healthy; SEV2 before commercial state can no longer be evaluated safely |
| Backup/recovery verification | scheduled verification or controlled restore test fails | SEV2 for launch readiness; stop risky schema promotion |
| Privacy/secret leakage | credible evidence of protected content/token/secret in diagnostics | SEV1 containment regardless of request volume |

If the application does not currently export a metric directly, derive the condition
from structured logs, reverse-proxy/local health probes, the database-backed queue, or
the deployment layer. Do not add an ad-hoc metrics store merely to satisfy this table.

## 5. Safe diagnostic and evidence contract

### Allowed by default

- incident start/end timestamps and timezone;
- environment/deployment class;
- exact release revision/tag/manifest identity;
- component/subsystem name;
- HTTP status class and safe machine-readable problem/error category;
- request ID/correlation ID;
- job ID, job kind, status, attempt/max-attempt counts and queue age;
- aggregate queue/error/latency/count metrics;
- database/media/provider **availability state**, not credentials;
- deployment/migration event and Alembic revision;
- sanitized configuration presence/boolean state;
- recovery command name/result and post-recovery smoke result.

### Forbidden in alerts, tickets, copied logs or incident notes

- `ProtectedPayload` or any `OWNER_ONLY` body;
- Memory/private-note/relationship text;
- `Job.payload`;
- raw `Job.last_error`;
- `Job.locked_by` unless a separately reviewed operator-only need proves it safe;
- Authorization headers, bearer/session/recovery/Magic-Link tokens, cookies;
- passkey/OIDC credential material;
- signed media URLs, storage keys or provider credentials;
- raw payment receipts, signed license material or commercial-source secrets;
- raw provider webhook/error response bodies;
- arbitrary request/response bodies;
- private attachment filenames or media content;
- precise private locations;
- database rows copied wholesale for convenience.

If a currently emitted diagnostic appears to violate this boundary, treat the
diagnostic channel itself as part of the incident and follow Runbook 11.

---

# Runbook 1: API/Web unavailable

## Detection

- Web `/healthz` fails or returns a non-success response;
- API `/api/v1/health` fails;
- reverse proxy/host reports connection refusal or repeated 5xx;
- use `X-Eimir-Revision` on successful API responses to rule out an unintended
  revision.

## Immediate containment

- stop further release promotion;
- if the outage began immediately after deployment, freeze the candidate and preserve
  its exact revision;
- do not change database state merely to make the HTTP check green;
- if #334 maintenance mode is available and normal writes are unsafe, enable it via
  the authorized admin path; otherwise use deployment-level traffic/write containment.

## Safe diagnostics

```bash
docker compose ps
docker compose logs --since 15m api web
curl --silent --show-error --include "$BASE_URL/api/v1/health"
curl --silent --show-error --include "$BASE_URL/api/v1/health/ready"
curl --silent --show-error --include "$BASE_URL/healthz"
```

Filter/correlate by timestamp, revision, request/correlation ID and safe error
category. Do not paste broad raw logs into an external ticket; extract the minimal
redacted lines.

## User impact

- Web failure with healthy API may block browser clients while background work still
  runs;
- API failure generally affects Web/Android and may leave worker processing active;
- distinguish these states before stopping unrelated components.

## Recovery boundary

If the outage is release-related, follow #375. An application rollback is safe only if
the current database schema remains compatible. Otherwise forward-fix or coordinated
restore applies.

## Recovery actions

1. correct reverse-proxy/container/network failure without changing release identity,
   if possible;
2. if the candidate itself is broken and schema compatibility permits, redeploy the
   previous known-good immutable revision;
3. if a schema change is involved, use Runbook 9 before selecting rollback;
4. never rebuild a different source revision under the same release identity.

## Recovery verification

```bash
python3 scripts/deployment_smoke.py \
  --base-url "$BASE_URL" \
  --expected-revision "$EXPECTED_REVISION"
```

Also confirm Web health and that the deployed revision matches the intended recovery
revision.

## Evidence to preserve

Revision before/after, timestamps, failing/healthy component, request/correlation IDs,
safe error category, containment action and smoke result.

---

# Runbook 2: Database/readiness degraded

## Detection

- `/api/v1/health` is healthy but `/api/v1/health/ready` returns `503`;
- PostgreSQL container/managed database health is degraded;
- sanitized application logs show database availability/connection-category failures.

## Immediate containment

- block further migrations/releases;
- do not restart the API repeatedly when liveness is healthy but PostgreSQL is not;
- if writes could become partially available/unavailable, contain normal application
  traffic via #334 maintenance when available or deployment-level controls.

## Safe diagnostics

```bash
docker compose ps postgres api worker
docker compose logs --since 15m postgres api worker
curl --silent --show-error --include "$BASE_URL/api/v1/health"
curl --silent --show-error --include "$BASE_URL/api/v1/health/ready"
```

Inspect connection saturation, disk/volume health, process state, current migration
revision and safe database error category. Never print the database DSN/password.

## User impact

Readiness failure means the API cannot safely serve normal database-backed requests;
background jobs sharing PostgreSQL are also affected even if worker processes are
running.

## Recovery boundary

A transient PostgreSQL outage is not a reason to restore. Restore is for a validated
loss/corruption/recovery scenario and follows #190. If the incident began during a
migration, use Runbook 5 and Runbook 9.

## Recovery actions

1. restore database service/connectivity/capacity using the deployment provider;
2. confirm the expected schema revision before reopening writes;
3. if data recovery is genuinely required, use Runbook 10 rather than hand-copying
   rows between databases.

## Recovery verification

- `/api/v1/health/ready` is `200` and database `ok`;
- expected release revision is unchanged or deliberately changed;
- `deployment_smoke.py` passes;
- queue progression resumes without a surge of exhausted failures.

## Evidence to preserve

Readiness status/timeline, DB availability category, schema revision, release revision,
capacity/host event, recovery action and smoke result.

---

# Runbook 3: Worker/job queue stalled or poison/repeated failure

## Detection

- worker container/process is absent or restarting;
- oldest runnable `PENDING` age exceeds the launch threshold;
- queue depth does not decrease across consecutive windows;
- exhausted failures increase;
- the same job kind + **sanitized** error category repeats without progress.

There is currently no mainline worker-heartbeat endpoint; do not claim heartbeat loss
unless a later release actually exports one.

## Immediate containment

- identify whether the failure is one poison job kind or all job processing;
- if retries are amplifying a provider outage, stop/scale down the worker through the
  existing deployment platform rather than repeatedly resetting attempts;
- do not edit `payload` to force a job through;
- do not delete jobs until their idempotency/business effect is understood.

## Safe diagnostics

Use the aggregate query in Section 2, `docker compose ps worker`, and minimized worker
logs. Safe fields are job ID/kind/status/attempts/max attempts/run-after/created/finished
and correlation ID. Never query/copy `payload`, raw `last_error` or `locked_by`.

If #551 is present in the deployed release, its privacy-safe Jobs drill-down is the
preferred application view.

## User impact

API reads may remain healthy while mail, media validation, reminders or other
asynchronous effects are delayed. State the affected job **kind/subsystem**, not the
private content the job would process.

## Recovery boundary

- a process crash may be recovered by restarting the same immutable worker revision;
- a poison job/code defect generally needs a forward fix;
- a provider outage should be contained until the provider recovers;
- database restore is not justified solely by queue delay.

## Recovery actions

1. restore worker process if it is simply absent;
2. contain a repeated-failure loop;
3. deploy a tested forward fix for deterministic code failure;
4. allow normal lease/backoff/idempotency semantics to resume processing;
5. avoid mass manual attempt/status rewrites without a reviewed recovery script.

## Recovery verification

- runnable queue age/depth decreases over two windows;
- no new exhausted failures for the affected kind;
- worker remains healthy on the intended revision;
- one fictional/test job of the affected kind completes when safe to create.

## Evidence to preserve

Queue aggregates, job kind, safe IDs/correlation IDs, safe error category, revision,
containment duration and post-recovery progression. Do not preserve job bodies.

---

# Runbook 4: MediaStore degraded

## Detection

- synthetic media canary/fixture read or write/finalize fails repeatedly;
- LocalMediaStore volume is unavailable/read-only/full;
- S3/provider adapter reports sanitized dependency-unavailable category;
- attachment processing jobs accumulate without normal progression.

## Immediate containment

- stop destructive cleanup/migration operations involving media;
- if uploads could become inconsistent, contain normal writes while preserving
  ServerAdmin/recovery access;
- never open/download a real user's private media merely as a diagnostic canary.

## Safe diagnostics

- deployment/volume/provider availability;
- aggregate attachment lifecycle status and authoritative byte counts where available;
- synthetic fixture IDs only;
- safe provider error category and request/correlation ID.

Do not collect filenames, previews, object keys, signed URLs, owner/Space associations
or `ProtectedPayload`. Once #551 is merged, its aggregate Storage view is appropriate.

## User impact

Media upload/read/thumbnail/validation paths may fail while non-media relationship data
remains available. Avoid declaring a full outage unless Core paths are also affected.

## Recovery boundary

- LocalMediaStore loss/corruption recovery follows #190's coordinated DB + media
  archive; do not restore only one side of a consistency point without the documented
  procedure;
- S3/object-storage snapshot/version/export recovery remains operator/provider
  responsibility behind the MediaStore contract.

## Recovery actions

1. restore storage connectivity/capacity/permissions without changing content;
2. resume affected worker processing only after storage is stable;
3. if durable media must be restored, use Runbook 10 and the validated recovery
   archive/provider procedure.

## Recovery verification

Use fictional/test media through the normal authorized API path, confirm worker queue
progression, and run the relevant deployment/recovery acceptance smoke. Do not use a
private attachment as proof.

## Evidence to preserve

Provider/store type, availability category, aggregate lifecycle counts, release
revision, synthetic canary ID/result and recovery action.

---

# Runbook 5: Failed migration or failed release candidate

## Detection

- migrate service exits non-zero;
- candidate never reaches readiness;
- development/staging smoke fails;
- release candidate produces the wrong revision or mixed/unverifiable artifact set.

## Immediate containment

- do not promote the candidate to Production;
- if failure occurs during Production change, stop further application rollout and
  preserve the pre-change known-good identity/backup reference;
- never rerun a failing migration in a blind loop when it may have performed
  non-transactional external/data effects.

## Safe diagnostics

```bash
docker compose ps migrate api worker postgres
docker compose logs --since 30m migrate
```

Record migration/Alembic revision, candidate source revision, migration exit state and
sanitized exception category. Do not copy row values or DSNs into the incident.

## User impact

A failure in Development/Staging is a release block with no Production impact. A
Production migration failure may require maintenance/traffic containment until schema
state is understood.

## Recovery boundary

#375 is the promotion authority; #190 is the recovery authority. Determine whether the
schema is unchanged, transactionally rolled back, partially advanced or fully advanced
before deciding on application rollback.

## Recovery actions

1. fail the release candidate and keep the current known-good release active when the
   failure occurs before Production;
2. in Production, inspect schema revision/state without modifying user rows;
3. choose forward fix when the schema has advanced and older code is not proven
   compatible;
4. use a coordinated restore only when the explicit #190 criteria are met;
5. rerun the full candidate gates after a fix rather than editing a published artifact.

## Recovery verification

- migration completes exactly once on the target schema path;
- API readiness and worker startup pass;
- `deployment_smoke.py` passes with the exact expected revision;
- affected functional path is exercised with fictional/test data.

## Evidence to preserve

Candidate/release revision, prior known-good identity, Alembic revision before/after,
migration exit category, decision rationale and smoke result.

---

# Runbook 6: Authentication/OIDC/provider outage

## Detection

- elevated failure rate in sign-in/session creation/refresh paths;
- OIDC/provider dependency reports unavailable/timeout category;
- existing sessions work but new external-provider authentication consistently fails.

## Immediate containment

- do not weaken authentication, disable signature/state/PKCE checks or create an
  emergency bypass;
- stop release promotion if the outage is caused by a candidate configuration change;
- preserve existing valid sessions according to normal server policy; do not extend
  expiry manually in the database.

## Safe diagnostics

Use request/correlation IDs, HTTP status/problem code, provider **name/type only if it
is not secret**, redirect-origin/config presence, and sanitized dependency category.
Never log/copy authorization codes, access/refresh tokens, cookies, passkey credential
material, client secrets, PKCE verifier or raw provider bodies.

## User impact

State whether new sign-in, one provider, token refresh, or all authenticated operation
is affected. Do not identify users externally.

## Recovery boundary

- provider outage -> wait/fail safely and restore provider/config connectivity;
- invalid application configuration -> deploy corrected immutable revision/config;
- suspected credential exposure -> Runbook 11 and rotate the affected secret.

## Recovery actions

1. verify eimir.'s own health/readiness independently of the provider;
2. validate provider reachability/config without printing secrets;
3. restore provider/configuration or deploy tested fix;
4. never switch to a weaker auth mode merely for availability.

## Recovery verification

With a dedicated fictional/test account, verify sign-in/session creation and one
authorized core read. Confirm no auth secret appeared in logs during the test.

## Evidence to preserve

Provider class, safe error/problem category, request/correlation IDs, revision,
configuration change reference and fictional smoke result.

---

# Runbook 7: High error rate or latency

## Detection

- 5xx or p95 thresholds in Section 4 persist for the configured window;
- reverse proxy or structured log aggregation shows a new error/latency class;
- dependency saturation correlates with request latency.

## Immediate containment

- stop current promotion/canary expansion;
- if a single expensive async path is amplifying load, contain its worker/provider
  path without disabling unrelated authorization/privacy controls;
- enable maintenance only when ordinary operation itself risks consistency.

## Safe diagnostics

Group by endpoint template/subsystem, status class, release revision, safe error
category and time window. Use request/correlation IDs for samples. Avoid raw URL query
strings when they can contain sensitive values and never aggregate by private content,
account activity or relationship state.

## User impact

Describe impacted route class/subsystem and percentage/latency class, not individual
users or content.

## Recovery boundary

- release regression -> #375 previous known-good/forward-fix decision;
- dependency/capacity issue -> deployment-level remediation;
- DB issue -> Runbook 2;
- provider issue -> relevant provider runbook.

## Recovery actions

1. identify whether the condition aligns with one revision/deployment event;
2. remove the causal load/dependency failure or deploy tested fix;
3. do not hide errors with uncontrolled retries that increase load.

## Recovery verification

Observe two healthy alert windows, run deployment smoke, and confirm error/latency
returns to baseline on the intended revision.

## Evidence to preserve

Aggregate rate/latency, endpoint template/subsystem, revision, safe categories,
deployment event and post-recovery window.

---

# Runbook 8: Maintenance-mode activation and recovery

## Detection

Use this runbook when normal application writes/access must be deliberately contained
for a controlled recovery, not merely because one health probe is noisy.

## Immediate containment

If the deployed release includes #334, an authorized ServerAdmin may enable persisted
`maintenance_mode`. Confirm ServerAdmin recovery access remains possible and that
registration policy is not overwritten.

If #334 is **not** in the deployed release, use deployment/reverse-proxy/write
quiescence from #190/#375. Do not update an undocumented database flag manually.

## Safe diagnostics

Record only maintenance enabled/disabled state, acting authorized operator/audit ID,
timestamp, release revision and reason category. A configurable maintenance message,
if present, is untrusted text and should not be copied into diagnostics.

## User impact

Ordinary application access is intentionally unavailable while operational health and
authorized recovery access remain available according to #334.

## Recovery boundary

Maintenance mode is containment, not recovery. The underlying DB/media/release/auth
problem still follows its own runbook.

## Recovery actions

1. enable containment through the supported path;
2. perform the relevant recovery;
3. verify readiness and exact revision before reopening;
4. disable maintenance through the same authorized path;
5. confirm the stored registration preference resumes unchanged.

## Recovery verification

- normal health/readiness passes;
- ServerAdmin recovery access worked throughout;
- ordinary access behavior changes back as intended;
- post-deploy smoke passes;
- audit contains technical setting transition without private content.

## Evidence to preserve

Setting transition timestamps, operator/audit identity, release revision, containment
reason category and recovery smoke. Do not preserve user requests encountered during
maintenance.

---

# Runbook 9: Rollback versus forward-fix decision

## Detection

Use when the current release is unhealthy and reverting application code is under
consideration.

## Immediate containment

- stop further promotion;
- identify current and previous-known-good immutable release identities;
- identify database schema revision and whether the failed change wrote/migrated data;
- preserve the applicable pre-change backup reference for high-risk schema changes.

## Safe diagnostics

Use release manifest/tag/SHA, schema/Alembic revision, readiness, migration result and
safe error category. Do not decide rollback from `git status` or a floating branch.

## User impact

Depends on the incident; communicate service/subsystem degradation only, not private
content.

## Recovery boundary

Choose application rollback only when:

- the previous-known-good artifact/revision is known exactly; and
- the current persistent schema/data is proven compatible with that older
  application; and
- media/provider contract remains compatible.

Otherwise choose a tested forward fix. If persistent state itself must be reverted,
that is a coordinated #190 restore, not an application rollback.

## Recovery actions

1. compare current release/schema with previous-known-good release requirements;
2. select **rollback**, **forward fix**, or **restore + compatible application**;
3. record the decision before executing it;
4. deploy only immutable known artifacts/source identities;
5. never apply an automatic database downgrade simply because app rollback was
   selected.

## Recovery verification

`deployment_smoke.py` must pass for the selected revision. Verify schema compatibility,
worker progression and any media path affected by the incident.

## Evidence to preserve

Current/prior immutable identity, schema revisions, compatibility evidence, chosen
path/rationale, operator approval and smoke result.

---

# Runbook 10: Backup/restore recovery

## Detection

Use only for validated database/media loss/corruption or a recovery drill. A transient
readiness problem is not enough.

## Immediate containment

- stop API/worker writes as required by #190;
- protect the backup archive and operator configuration/secret backup as sensitive
  material;
- select a **fresh empty restore target** rather than restoring over a partially
  running deployment.

## Safe diagnostics

Use backup manifest metadata/checksums, source schema revision and counts. The archive
contains all tenant/private database data and therefore must not be attached to an
incident ticket, CI artifact or chat.

## User impact

Recovery may require extended maintenance and may restore to the coordinated backup
point. Do not promise provider-specific S3 recovery guarantees beyond the operator's
actual provider backup.

## Recovery boundary

#190 is authoritative. For `EIMIR_MEDIA_STORE=local`, use the repository recovery tool.
For S3/object storage, coordinate the provider's consistent snapshot/export with the
eimir. database recovery point.

## Recovery actions

Create a coordinated LocalMediaStore backup when the current target is healthy enough:

```bash
python3 scripts/self_hosted_recovery.py backup \
  --compose-file compose.yaml \
  --env-file "$ENV_FILE" \
  --confirm-project "$COMPOSE_PROJECT_NAME" \
  --output "$BACKUP_ARCHIVE"
```

Restore only into a confirmed fresh target:

```bash
python3 scripts/self_hosted_recovery.py restore \
  --compose-file compose.yaml \
  --env-file "$ENV_FILE" \
  --confirm-project "$COMPOSE_PROJECT_NAME" \
  --archive "$BACKUP_ARCHIVE" \
  --confirm-empty-target
```

Then run the documented migration/start procedure for the selected application
revision. The tool validates archive members/checksums, requires stopped API/worker
writers and rejects non-empty restore targets.

## Recovery verification

- archive validation succeeded;
- database schema revision matches the expected recovery/migration state;
- LocalMediaStore object set matches the validated archive where applicable;
- readiness and `deployment_smoke.py` pass;
- synthetic tenant/privacy/recovery acceptance remains green.

## Evidence to preserve

Backup manifest checksum/identifier, source/target schema revisions, recovery target
identity, command result and post-recovery smoke. Do **not** preserve the backup archive
in ordinary incident evidence.

---

# Runbook 11: Suspected privacy/secret leakage in logs or telemetry

## Detection

Any credible report or automated test showing a token, cookie, signed URL,
`ProtectedPayload`, `OWNER_ONLY` content, private filename/location, raw provider body,
receipt/license secret or other forbidden field in a diagnostic channel.

## Immediate containment

1. treat the diagnostic sink/export path as part of the incident;
2. stop/disable the affected optional exporter or log shipping route when doing so does
   not make Core unavailable;
3. restrict access/retention to the affected diagnostic store;
4. if credentials/tokens may have been exposed, revoke/rotate them according to the
   owning subsystem;
5. do not copy the leaked value into another ticket/chat while investigating.

## Safe diagnostics

Use timestamp, log event hash/ID, logger/subsystem, release revision, request/correlation
ID and field/category that violated policy. Determine scope by metadata/indexes where
possible. Do not repeatedly open or export the private value to count it.

## User impact

Availability may be unaffected while confidentiality risk is severe. Communications
must describe affected service/data category and confirmed scope without disclosing the
actual private content.

## Recovery boundary

- fix/redaction change is a normal reviewed release;
- credential exposure additionally requires revocation/rotation;
- diagnostic data deletion/retention follows the operator/provider's applicable
  security/privacy obligations;
- do not alter product records merely because a log copied them.

## Recovery actions

1. contain diagnostic propagation;
2. rotate/revoke potentially exposed secrets;
3. deploy a redaction/logging fix using the normal immutable release path;
4. purge/expire affected diagnostic copies according to the operator's incident/data
   handling policy;
5. rerun automated redaction tests plus a controlled fictional request/job flow.

## Recovery verification

- the forbidden category no longer appears in new logs/alerts/exported diagnostics;
- correlation still works using safe IDs;
- replacement credentials function and old credentials are invalid where applicable;
- normal application readiness/smoke remains healthy.

## Evidence to preserve

Incident timeline, diagnostic event IDs/hashes, affected field **category**, revision,
rotation references, remediation commit/release and redaction test result. Never
preserve the leaked secret/private value in the incident report.

---

# Runbook 12: Entitlement/commercial-source outage

## Detection

- provider/source refresh/reconciliation reports a sanitized unavailable/timeout
  category;
- normalized entitlement evidence becomes stale according to the accepted #523/#262
  contract;
- commercial capabilities approach the end of any bounded server-evaluated grace/cache
  period.

## Immediate containment

- do not grant Premium/Core access by bypassing the normalized entitlement service;
- do not disable normal Account/Space authorization;
- keep non-paywallable Core/security/privacy/data-rights functionality working as the
  authoritative entitlement contract requires;
- stop noisy source retries if they are amplifying the provider outage.

## Safe diagnostics

Use normalized lifecycle/state, source/provider class, last successful refresh time,
safe reason code, aggregate number of affected entitlement evaluations where allowed,
release revision and correlation IDs. Never collect receipts, purchase tokens, signed
license material, payment data, provider credentials or raw webhook bodies.

## User impact

Describe unavailable commercial source/capability evaluation. Core application
operation must not be declared down merely because a commercial provider is down.

## Recovery boundary

The provider-neutral #523 entitlement core remains authoritative. Provider/store/SKU
specifics stay at the adapter/deployment boundary. Do not manually edit entitlement
grants as an outage workaround unless an explicit audited administrative contract
exists for that purpose.

## Recovery actions

1. verify eimir. Core health independently of the commercial source;
2. confirm bounded cached/grace semantics are behaving as designed;
3. restore provider connectivity or deploy tested adapter fix;
4. resume idempotent reconciliation from authoritative source evidence;
5. ensure no duplicate grant/revocation was created by retries.

## Recovery verification

- source reconciliation succeeds using fictional/test commercial evidence where
  possible;
- normalized entitlement state returns to expected lifecycle state;
- Core operations remain healthy;
- logs contain no receipt/license/token material.

## Evidence to preserve

Source class, safe state/reason, timestamps, aggregate impact, revision, reconciliation
result and redaction check.

---

## 6. Communication boundary

External/operator communications may state:

- affected environment/service/subsystem;
- incident start/resolution time;
- broad technical category such as database, media, auth or provider availability;
- whether normal service is unavailable/degraded/restored;
- remediation/release status when appropriate.

Do not state account/Space names, relationship details, private content, exact private
locations, filenames, receipts, tokens or raw provider details. A public status-page
provider is optional deployment tooling, not a eimir. Core dependency.

## 7. Post-incident closeout

An incident is not closed until:

1. recovery verification in the applicable runbook is complete;
2. exact active release revision is recorded;
3. maintenance/containment is removed deliberately;
4. queue/background progression is normal where relevant;
5. redaction/privacy boundary is rechecked;
6. a minimal incident record captures timeline, root/safe category, decision and
   follow-up without copying private content;
7. any threshold/runbook change is reviewed as operational policy rather than silently
   hard-coded into Domain behavior.

## 8. G5 controlled drill requirement

Documentation and CI can prove the runbook contract, but they do not substitute for
the #522/#524 requirement to execute one controlled incident drill against the
**intended launch topology** using fictional/test data.

Use `docs/m6/INCIDENT-DRILL.md` for that exercise. The G5 evidence must demonstrate:

- detection from a real launch signal;
- request/correlation or equivalent safe diagnosis;
- containment/maintenance when relevant;
- explicit rollback-vs-forward-fix decision;
- service recovery;
- post-recovery revision/readiness smoke;
- no `ProtectedPayload`, `OWNER_ONLY`, token, signed-URL, receipt/license-secret or
  other forbidden diagnostic leakage.

Until that launch-environment drill is executed and attached to G5 evidence, #522 is
**implementation-complete as policy/runbooks but not fully accepted for G5**.
