# M6 / G5 Controlled Incident Drill

**Owner:** #522  
**Evidence consumer:** #524 / G5  
**Runbooks:** `docs/m6/INCIDENT-RESPONSE.md`

This document is the execution record/template for the mandatory pre-G5 controlled
incident drill. It is intentionally separate from the runbook policy: a checked-in
template is not evidence that the drill happened.

## 1. Safety boundary

Run the drill only on the dedicated Development/Staging/launch-rehearsal topology with
**fictional/test data** and separate non-production database, media, secrets and
provider credentials.

Do **not** intentionally stop a Production database containing real relationship data
merely to satisfy this drill.

Before starting:

- repository CI for the candidate is green;
- the rehearsal environment is on the intended release topology;
- exact expected revision is known;
- the operator can restore normal service without requiring access to private user
  content;
- a second operator/reviewer is available for the recovery decision if the normal
  release process requires it;
- no real account, Space, media, notification, receipt/license or provider secret is
  needed as test data.

## 2. Recommended drill scenario: database readiness loss

This scenario is preferred because eimir. has a deliberate liveness/readiness
split and the failure can be created/recovered without editing application data.

Expected behavior:

1. API liveness remains reachable;
2. API readiness becomes `503` with sanitized database-unavailable state;
3. normal database-backed product operation is considered unavailable;
4. the operator detects/correlates the event without inspecting relationship content;
5. the recovery decision is to restore the database dependency, not to roll back an
   unchanged application revision;
6. readiness recovers;
7. the exact revision remains the expected candidate;
8. post-recovery smoke passes;
9. collected evidence contains no protected/private/secret material.

## 3. Drill variables

Record these before injecting the failure:

```text
Drill date/time (UTC):
Environment / hostname:
Compose/deployment project:
Candidate version/tag (if assigned):
Expected commit revision:
Operator:
Reviewer:
#334 maintenance mode available in this deployed revision: yes / no
```

Use shell variables only for non-secret technical values:

```bash
export BASE_URL=https://dev.eimir.example
export EXPECTED_REVISION=<exact-40-char-commit-sha>
```

Do not export credentials into a shell transcript used as incident evidence.

## 4. Baseline before failure

### 4.1 Health and revision

```bash
curl --silent --show-error --include "$BASE_URL/api/v1/health"
curl --silent --show-error --include "$BASE_URL/api/v1/health/ready"
curl --silent --show-error --include "$BASE_URL/healthz"

python3 scripts/deployment_smoke.py \
  --base-url "$BASE_URL" \
  --expected-revision "$EXPECTED_REVISION"
```

Record only:

- HTTP status;
- `X-Eimir-Revision`;
- baseline timestamp;
- deployment-smoke pass/fail.

### 4.2 Redaction baseline

Generate one fictional/test authenticated request and, if the rehearsal fixture
supports it, one harmless background job. Confirm the diagnostic sample is usable by
request/correlation ID while not containing:

- authorization/cookie/token values;
- `ProtectedPayload`/`OWNER_ONLY` content;
- request/response bodies;
- private filenames/location;
- signed URLs/storage keys;
- `Job.payload`, raw `last_error`, `locked_by`;
- payment receipt/license/provider secret.

Do not paste the fictional payload into the evidence simply to prove it is absent.
Record **redaction baseline: pass/fail**.

## 5. Inject the controlled failure

Confirm again that the target is the dedicated non-production rehearsal project.
Then stop only PostgreSQL:

```bash
docker compose ps
docker compose stop postgres
```

Record the command time. Do not stop/remove volumes or run `down -v`.

## 6. Detection and diagnosis

Within the normal probe interval, collect the minimal expected signals:

```bash
curl --silent --show-error --include "$BASE_URL/api/v1/health"
curl --silent --show-error --include "$BASE_URL/api/v1/health/ready"
docker compose ps postgres api worker
```

Expected:

- `/api/v1/health` remains `200` if the API process itself is healthy;
- `/api/v1/health/ready` becomes `503`;
- response remains sanitized and retains the expected revision header;
- PostgreSQL shows stopped/unavailable;
- no private content is required to explain the failure.

Take at most a small redacted log sample around the drill timestamp:

```bash
docker compose logs --since 5m api worker postgres
```

If the output contains a forbidden value/category, stop copying/exporting logs and
switch the exercise to Incident Runbook 11 (diagnostic privacy/secret leakage).

### Evidence record

```text
Failure injection timestamp:
Detection timestamp:
Time to detect:
API liveness status:
API readiness status:
Observed revision:
Safe request/correlation ID(s), if applicable:
Safe error category:
Forbidden diagnostic data observed: yes / no
```

## 7. Containment decision

The intended decision for this scenario is:

- release revision is unchanged;
- the known fault is PostgreSQL availability;
- application rollback would not restore a stopped database;
- database restore is not justified because no data-loss/corruption evidence exists;
- therefore **restore the dependency / forward-recover service**, not application
  rollback and not backup restore.

If #334 maintenance mode is available in the deployed candidate, exercise the
authorized maintenance path before recovery and prove ServerAdmin recovery access
remains available. Record the audit/technical transition only.

If #334 is not yet in the deployed candidate, state that explicitly and use the
existing deployment-level containment policy. Do **not** edit a database flag to fake
maintenance mode.

Record:

```text
Containment used:
Maintenance-mode path available: yes / no
ServerAdmin recovery access verified where applicable: pass / fail / not applicable
Rollback vs forward-fix/dependency-recovery decision:
Decision rationale:
Decision timestamp:
```

## 8. Recover service

Restart PostgreSQL through the supported deployment platform:

```bash
docker compose start postgres
docker compose ps postgres api worker
```

Do not recreate or restore the database. This scenario tests dependency recovery, not
backup recovery.

If API/worker do not recover after PostgreSQL is healthy, follow the appropriate
runbook instead of repeatedly restarting all services without diagnosis.

## 9. Post-recovery verification

Wait for the deployment's normal readiness interval, then:

```bash
curl --silent --show-error --include "$BASE_URL/api/v1/health"
curl --silent --show-error --include "$BASE_URL/api/v1/health/ready"

python3 scripts/deployment_smoke.py \
  --base-url "$BASE_URL" \
  --expected-revision "$EXPECTED_REVISION"
```

Verify queue/background progression with the privacy-safe aggregate procedure from
`INCIDENT-RESPONSE.md`; do not query job payloads or raw errors.

If maintenance mode was enabled, disable it through the same authorized #334 path only
after readiness and smoke pass. Confirm stored registration preference returns to its
pre-drill value.

Record:

```text
Database healthy timestamp:
Readiness recovered timestamp:
Time to recover:
Expected revision preserved: pass / fail
Deployment smoke: pass / fail
Queue progression after recovery: pass / fail / not applicable
Maintenance removed: pass / fail / not applicable
Registration preference preserved: pass / fail / not applicable
```

## 10. Redaction and evidence review

Before attaching evidence to #524/G5, review every retained line/file. The evidence set
may contain only:

- timestamps;
- environment/deployment class;
- exact release revision/tag/manifest identity;
- request/correlation/job IDs needed for technical correlation;
- safe error/problem categories;
- aggregate metrics/queue state;
- deployment/maintenance events;
- smoke results;
- decision/rationale;
- pass/fail statement for redaction.

Reject the evidence set if it includes:

- `ProtectedPayload`, `OWNER_ONLY` content or relationship text;
- tokens/cookies/Authorization values;
- signed URLs/storage keys;
- private filenames/media/precise locations;
- job payloads/raw errors/worker identity;
- raw database rows;
- receipts/license material/provider secrets;
- copied `.env`/DSN values.

Record:

```text
Redaction evidence review: pass / fail
Reviewer:
Forbidden content found:
If yes, incident/security follow-up reference:
```

## 11. G5 drill result

The drill is **PASS** only when all of these are true:

- [ ] dedicated non-production launch topology and fictional/test data were used;
- [ ] exact candidate revision was recorded before failure;
- [ ] liveness/readiness failure was detected as designed;
- [ ] diagnosis used safe technical signals only;
- [ ] containment/maintenance behavior was exercised or its #334 unavailability was
      explicitly recorded without a fake DB workaround;
- [ ] rollback versus forward-fix/dependency-recovery decision was explicit;
- [ ] service recovered without restoring/modifying user data;
- [ ] post-recovery readiness and deployment smoke passed;
- [ ] exact revision remained expected or any deliberate revision change was recorded;
- [ ] queue/background progression recovered where applicable;
- [ ] evidence review found no protected/private/secret material.

Final record:

```text
Drill result: PASS / FAIL
Incident/runbook scenario:
Candidate revision:
Detection time:
Recovery time:
Decision summary:
Smoke result:
Redaction result:
Follow-up issues:
G5 evidence location/reference:
Operator approval:
Reviewer approval:
```

## 12. Optional second drill: failed release candidate

A second non-production exercise may intentionally select a candidate that fails a
health/smoke gate **before Production promotion**. This can demonstrate the #375
release block and previous-known-good/forward-fix decision without disrupting a live
service.

It does not replace the mandatory database-readiness drill record unless #524/G5
explicitly accepts it as the launch-topology incident exercise. Never create a failure
by corrupting production data or weakening security checks.
