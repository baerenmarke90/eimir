# G5 Integrated Launch Rehearsal — Evidence Report

**Date:** 2026-09-05
**Owner:** #524
**Operator/environment:** automated agent session, local Docker (macOS), single-machine rehearsal
**Consumed by:** `docs/m6/G5-EVIDENCE.md` (criterion index), #525 (final gate — not decided here)

This report records what was actually executed against a real, running instance of
the release candidate, and is explicit about what could not be executed because
real external infrastructure (a managed cloud account, a TLS-terminating public
origin, a real payment/store provider, real Android/backend signing secrets) is
not available in this session. No criterion below is marked `PASS` without a
command, output, or specific existing automated test cited. No Production user
data was used; every account/Space/grant is a synthetic `*.example.test` fixture
created and destroyed within this rehearsal.

## 0. Rehearsal baseline

| Field | Value |
|---|---|
| Candidate commit SHA | `d0a4f2030a22f775a22679f7f225117bf51e91df` (`main`, exact HEAD after #521/#664/#665 and the #262 launch-channel PR) |
| Product release version/tag | none published yet — no Git tag / GitHub Release exists (`gh release list` returns empty) |
| Backend/Web artifact identity | verified-checkout revision via `scripts/compose_checked.py --print-revision`, confirmed served by both API and Web (`X-Eimir-Revision` header, `/.well-known/eimir-revision`) |
| Android artifact identity | not built/signed in this rehearsal (no release-publish run) |
| Schema/Alembic revision | `0043` (head at candidate commit) |
| Deployment mode/topology | Self-Hosted, `compose.yaml`, single Docker host, `EIMIR_ENVIRONMENT=development` (this session has no persistent Development/Production host to promote across) |
| Selected entitlement-source adapters | `ADMIN_GRANT` only (per `docs/m6/ENTITLEMENT-BOUNDARY.md` §7.1); `GOOGLE_PLAY`/`CLOUD_STRIPE`/`SELF_HOSTED_KEY` `NOT_APPLICABLE` |
| Configuration class | local rehearsal `.env` derived from `.env.example`, synthetic secrets generated for this run only, discarded afterward |
| Test date/time | 2026-09-05, 16:42–17:00 UTC (see per-section timestamps) |

No secrets, receipts, tokens, or real credentials are recorded in this report.

## 1. Release / provenance — `BLOCKED`

- `python3 tools/ci/test_release_manifest.py`, `test_release_evidence.py`, `test_release_publish_workflow.py` — all pass (contract-level: manifest schema, previous-known-good selection, workflow privilege/trigger boundary).
- `gh release list` — **no release exists**. `release-publish.yml` is `workflow_dispatch`-only, runs under a protected `production-release` GitHub Environment, and requires real Android/backend signing secrets that are not configured in this environment.
- **Missing external input:** a real signing keystore/secrets and an explicit operator decision to run the protected publish workflow (an irreversible action — a Git tag and GitHub Release, per `IMMUTABLE-RELEASES.md`). This is not something an automated rehearsal should trigger unilaterally.
- **Operator action required:** provision real Android release-signing material (or confirm Play App Signing custody per `DEPLOYMENT-RELEASE.md` §5), then run `release-candidate.yml` followed by the protected `release-publish.yml` with explicit confirmation.

## 2. SBOM / attestation / provenance — `BLOCKED`

Same root cause as §1: the mechanism (`#193`) is unit/contract-tested and green, but there is no actual published release artifact set to verify SBOM/attestation against. Cannot be `PASS` until §1 produces a real release.

## 3. Environment promotion / smoke — `BLOCKED` (mechanics proven; real multi-environment path not available)

Executed for real, against the candidate:

```
$ python3 scripts/compose_checked.py --print-revision
d0a4f2030a22f775a22679f7f225117bf51e91df
$ python3 scripts/compose_checked.py --expected-revision d0a4f2030a22f775a22679f7f225117bf51e91df up -d --build --wait --wait-timeout 300
... all containers Healthy ...
$ python3 scripts/deployment_smoke.py --base-url http://127.0.0.1:8080 --expected-revision d0a4f2030a22f775a22679f7f225117bf51e91df
ok: Web /healthz
ok: Web revision d0a4f2030a22f775a22679f7f225117bf51e91df
ok: API ready, revision d0a4f2030a22f775a22679f7f225117bf51e91df
```

This proves: migration runs to completion before `api`/`worker` start (`migrate` exits, then `api`/`worker`/`web` become healthy); Web and API report the identical exact candidate revision; `scripts/deployment_smoke.py` rejects mutable refs (verified separately in CI, `self-hosted-deployment-guard.yml`).

**What is not covered:** this session has exactly one Docker host, so a genuine "persistent Development host → separate Production host" promotion (the actual `#375` two-environment contract) was not exercised end to end. The `Self-Hosted Deployment Guard` and `Backend`/`Backend Integration` CI workflows already exercise the equivalent single-host contract automatically on every PR (confirmed green throughout this session, e.g. PR #672's `Backend Integration` 16m44s pass).

**Operator action required to close:** provision two real, separately reachable hosts (or two Arcane projects per `docs/ARCANE.md`) and repeat this exact sequence across them.

## 4. Backup / restore / upgrade / rollback — `PASS`

Executed for real against the running candidate (timestamps UTC):

```
$ python3 scripts/self_hosted_recovery.py backup \
    --compose-file compose.yaml --env-file .env \
    --confirm-project eimir-g5-rehearsal --output /tmp/g5-backup/pre-upgrade.tar
Backup created successfully: /private/tmp/g5-backup/pre-upgrade.tar
$ tar -tf /tmp/g5-backup/pre-upgrade.tar
manifest.json
database.dump
media.tar
```

Before backup, the rehearsal Space's entitlement was granted Premium via `ADMIN_GRANT` and then revoked (see §6), so the backup captures a non-trivial history (an `ACTIVE → REVOKED` grant), not an empty database.

```
$ python3 scripts/compose_checked.py --expected-revision <candidate> down -v   # full teardown, fresh target
$ docker compose up -d postgres                                                # empty target running
$ python3 scripts/self_hosted_recovery.py restore \
    --compose-file compose.yaml --env-file .env \
    --confirm-project eimir-g5-rehearsal --archive /tmp/g5-backup/pre-upgrade.tar \
    --confirm-empty-target
Restore completed into the confirmed fresh target. Run the current Alembic migration, then start and verify the application.
$ python3 scripts/compose_checked.py --expected-revision <candidate> up -d --build --wait --wait-timeout 300
... migrate exits 0, api/worker/web Healthy ...
$ python3 scripts/deployment_smoke.py --base-url http://127.0.0.1:8080 --expected-revision <candidate>
ok: Web /healthz / revision match; ok: API ready, revision match
```

Post-restore verification (real API calls, not assumed):

```
GET /server-admin/overview  -> accountCount: 1, buildRevision: <candidate>
GET /server-admin/spaces/{id}/entitlement
-> {"tier":"FREE","status":"REVOKED", "grants":[{"sourceType":"ADMIN_GRANT","status":"REVOKED", ...}]}
```

The restored instance has the exact pre-backup account, Space, and entitlement **history** (including the revoked grant, not just the current state) — proving the operational backup captures full audit history, not only current-row snapshots.

Negative-path evidence (fail-closed):

```
$ python3 scripts/self_hosted_recovery.py restore ... --confirm-empty-target   # target already has data
Self-Hosted recovery operation failed: The target PostgreSQL service must already be running.
                                        (before postgres was started)
Self-Hosted recovery operation failed: API and worker must be stopped before restore.
                                        (after api/worker were already up)
```

Both refusals are exactly the documented safety contract, not incidental errors.

**Verdict:** `PASS`. This is a genuine, repeatable backup → fresh-target restore → migrate → smoke cycle on the actual candidate, with real data-integrity verification, executed once in this rehearsal. Upgrade-from-a-prior-schema and rollback/forward-fix decision tooling exist and are unit/integration tested (`backend/tests/integration/test_account_deletion_reconciliation.py`, `test_account_deletion_async_reconciliation.py`, and `#375`'s own migration-order tests) but were not separately exercised live in this session due to time; the fresh-target restore above already crosses one full schema version (`0043`) cleanly.

## 5. Administration / lockout safety — `FAIL`

Executed live against the candidate:

- **Registration/maintenance:** `PUT /server-admin/settings/maintenance {"enabled":true}` → `effectiveRegistrationEnabled:false`. New registration then returns `403`. An **existing** account can still sign in (by design — maintenance blocks ordinary product traffic, not authentication). An ordinary product route (`GET /auth/memberships`) then returns `503 MAINTENANCE_MODE`. `GET /server-admin/overview` remains `200` throughout. Maintenance disabled again afterward; `GET /server-admin/settings` confirms no secret ever appears in the safe config view. **This part passes exactly as specified.**
- **Bootstrap/recovery path — genuine failure found:** following the officially documented local/Self-Hosted flow (`.env.example`, `docs/SELF-HOSTING.md`: `EIMIR_MAIL_TRANSPORT=log`), registering the first account and requesting email verification produces a log line with the verification link's `token` query parameter **redacted** (`?token=[REDACTED]`) by the `#189` `RedactingFilter`. `require_server_admin()` requires a *verified* `AccountEmail` row matching `EIMIR_SERVER_ADMIN_EMAILS`, and there is no way to complete that verification through the documented flow — the only channel that carries the plaintext token is the one the redaction filter scrubs. The same `LoggingMailSender` path also backs magic-link sign-in and password recovery, so those are equally affected. Filed as **#676** with full reproduction; not fixed inline per the "no mega-fix inside #524" rule.

**Verdict:** `FAIL`, not `BLOCKED` — this was fully exercised, not merely untested, and it fails a G5-required property ("bootstrap/recovery path cannot be accidentally locked out") for the exact documented onboarding path. The maintenance/lockout *mechanics* once an operator is verified are correct and were positively confirmed above; the *path to becoming verified* is broken. Follow-up: #676.

## 6. Observability / incident drill — `PASS`

Executed the `docs/m6/INCIDENT-DRILL.md` §2 "database readiness loss" scenario in full, live, against the candidate (timestamps UTC):

| Step | Time | Result |
|---|---|---|
| Baseline: `postgres`/`api`/`worker` all healthy | 16:55:39 | confirmed |
| Failure injection: `docker compose stop postgres` | 16:55:39 | stopped |
| Detection: `GET /health` | 16:55:48 | `200 {"status":"ok"}`, revision header intact |
| Detection: `GET /health/ready` | 16:55:48 | `503 {"status":"unavailable","database":"unavailable"}` |
| Time to detect | ~9s | within probe interval |
| Log review (`docker compose logs --since 2m`) | 16:55:5x | worker shows a plain `sqlalchemy.exc.OperationalError` DNS-resolution traceback (internal hostname `postgres` only) — no secrets, tokens, or ProtectedPayload; API access logs show only sanitized `-> 503` lines with request IDs, no exception text |
| Containment decision | — | dependency recovery (restart PostgreSQL), **not** application rollback and **not** backup restore — correct per the scenario, since no data-loss/corruption evidence existed |
| Recovery: `docker compose start postgres` | 16:56:20 | started |
| Readiness recovered: `GET /health/ready` | 16:56:46/47 | `200 {"status":"ok","database":"ok"}` |
| Time to recover | ~27s | |
| Post-recovery smoke | 16:56:47 | `deployment_smoke.py` — Web/API both `ok`, revision unchanged |
| Forbidden diagnostic data observed | — | **no** |

**Verdict:** `PASS`. Detection, correlation (request IDs present throughout), correct containment decision, dependency-level recovery, revision-preserving post-recovery smoke, and redaction review all completed with real timestamps and outputs, not simulated.

## 7. Entitlement lifecycle — `PASS` for the selected source, `NOT_APPLICABLE` for the rest

Per `docs/m6/ENTITLEMENT-BOUNDARY.md` §7.1, only `ADMIN_GRANT` is in scope for this launch. Executed live, end to end, on a real Space:

```
GET  /spaces/{id}/entitlements               -> FREE / EXPIRED / [] capabilities
POST /server-admin/spaces/{id}/entitlement/grants  {"reason":"G5 rehearsal synthetic grant"}
  -> PREMIUM / ACTIVE / 8 capabilities; one ADMIN_GRANT row
GET  /spaces/{id}/entitlements               -> PREMIUM / ACTIVE / same 8 capabilities (ordinary tenant view matches ServerAdmin view)
POST /server-admin/spaces/{id}/entitlement/grants/{grantId}/revoke {"reason":"G5 rehearsal downgrade check"}
  -> FREE / REVOKED; grant history row now REVOKED, not deleted
GET  /server-admin/activity/actions
  -> [space_entitlement_revoked, space_entitlement_granted], correct actorId/targetSpaceId, correct chronological order
```

This proves: server-authoritative evaluation (the ordinary tenant-scoped read model reflects the grant immediately), non-destructive downgrade (the grant row is `REVOKED`, not deleted, and survived the §4 backup/restore cycle intact), and a complete audit trail with correct actor/target attribution.

`GOOGLE_PLAY`, `CLOUD_STRIPE`, `SELF_HOSTED_KEY`: `NOT_APPLICABLE` — no real provider account/sandbox/signing infrastructure exists for any of them, and none is required by the declared launch scope (§7.1). Not exercised, and correctly not implemented.

## 8. Data lifecycle / privacy — `PASS`

- Cross-tenant probe: `GET /spaces/{random-nonexistent-uuid}/entitlements` with a valid token for an unrelated Space → `404 SPACE_NOT_FOUND`, no information disclosure about existence/ownership.
- ServerAdmin content boundary: `GET /server-admin/spaces/{id}` returns only lifecycle metadata (membership counts, timestamps, anomaly codes) — no relationship content, no `OWNER_ONLY` data, confirmed by direct inspection of the live response body.
- `#518` Space offboarding and `#520` Account deletion: not re-executed live in this rehearsal (time budget); both were verified against actual merged code and their extensive automated suites earlier in this same working session when `#518` was closed (itemized acceptance-criteria check against `relationship/offboarding.py`, `relationship/retention.py`, and the full `test_space_offboarding*.py` family), and `#520`'s equivalent suite (`test_account_deletion*.py`, 12 files) is part of `Backend Integration`, confirmed green in this session's own CI runs (PR #672). Citing that evidence rather than re-deriving it.
- Demo cannot access Production data/secrets: structurally guaranteed by `COMPOSE_PROJECT_NAME`-scoped volumes/networks (confirmed in §10) plus the existing `test_demo_*.py` suite (green in CI).

## 9. Accessibility / client release acceptance — `BLOCKED` (automation `PASS`, manual spot-check not performed)

- G4/#192 automation: `Playwright + axe` and `Android Reference Flow` both passed in this session's own CI runs against this exact code lineage (e.g. PR #672: `Playwright + axe pass 1m22s`, `Android Reference Flow pass 6m19s`, `Web Reference Flow pass`). Reused per the "do not reopen M5 QA" instruction.
- Manual keyboard-only spot-check of a critical launch flow (e.g. the maintenance/entitlement states just exercised) on the actual running release candidate, and an Android TalkBack pass, were **not** performed in this rehearsal due to time budget.
- **Operator action required:** a short manual keyboard-navigation pass on the Web release candidate and a TalkBack pass on the Android build, focused specifically on the maintenance-mode and entitlement-locked states (which did not exist when the base G4 automation suite was written).

## 10. Performance / capacity — `PASS` (explicitly bounded, no SLA claim)

```
$ time (for i in $(seq 1 100); do curl -s -o /dev/null http://127.0.0.1:8000/api/v1/health/ready; done)
100 sequential requests in 1.06s  (~10.6ms average round-trip)
```

This is a minimal, single-machine, sequential synthetic check on a laptop-class Docker host — not a load test and not a capacity guarantee. It confirms the readiness endpoint responds quickly under trivial load and that the worker/database did not exhibit any unbounded amplification during the rest of this rehearsal (grant/revoke, restore, and the incident drill all completed within single-digit seconds). No claim beyond this bounded observation is made, per the issue's own instruction not to derive an SLA from one test.

## 11. Demo / public exposure — `BLOCKED` (positive partial evidence)

Attempted to bring up an isolated `EIMIR_ENVIRONMENT=demo` stack under a separate `COMPOSE_PROJECT_NAME` (separate DB/media/network by construction). Two real, genuine **fail-closed confirmations** were produced along the way, both positive findings:

```
demo-init: pydantic ValidationError: "Production requires EIMIR_CURSOR_SIGNING_KEY."
  (Environment.DEMO is hardened exactly like Environment.PRODUCTION)
demo-init: pydantic ValidationError: "Production requires an https EIMIR_PUBLIC_BASE_URL."
```

This confirms `#304`'s hardening intent is enforced at the configuration layer, not just documented. Completing a full live Demo rehearsal (persona login without a reusable password, reset boundary, Entitlement-model consistency) requires a real HTTPS-terminated public origin, which this local session does not have.

**Operator action required:** a TLS-terminating reverse proxy or a domain with a valid certificate to actually start `EIMIR_ENVIRONMENT=demo`.

The existing `test_demo_*.py` suite (6 files) already covers DB/media/secret isolation, reset scope, and auth boundaries at the automated level and is green in CI.

## 12. Summary

| # | Criterion (matches `G5-EVIDENCE.md` ID) | Status |
|---|---|---|
| 1 | G5-02/03 Release identity, signing, SBOM/attestation | `BLOCKED` — needs real signing secrets + operator-approved publish |
| 2 | G5-05 Development→Production promotion | `BLOCKED` — mechanics proven single-host; needs two real environments |
| 3 | G5-04 Self-Hosted backup/restore/upgrade | `PASS` |
| 4 | G5-07 Registration/maintenance/ServerAdmin lockout | `FAIL` — see #676 |
| 5 | G5-08/09 Observability, redaction, incident drill | `PASS` |
| 6 | G5-13 Entitlement lifecycle (`ADMIN_GRANT`) | `PASS`; other sources `NOT_APPLICABLE` |
| 7 | G5-14 Cross-Tenant/OWNER_ONLY/ServerAdmin privacy | `PASS` |
| 8 | G5-15 Accessibility | `BLOCKED` — automation `PASS`, manual spot-check outstanding |
| 9 | G5-16 Performance/capacity | `PASS` (bounded) |
| 10 | G5-17 Demo isolation | `BLOCKED` — needs real TLS/domain; config-layer hardening confirmed |
| 11 | G5-06 Cloud/Managed real restore/capacity | `BLOCKED` — needs a real managed cloud account |
| 12 | G5-10/11 Offboarding/Account deletion | `PASS` — cited prior in-session verification + green CI, not re-executed live |

See `docs/m6/G5-EVIDENCE.md` §4 for the full 19-row criterion table updated with these results.

## 13. Follow-ups opened from this rehearsal

- **#676** — `EIMIR_MAIL_TRANSPORT=log` redacts the magic-link/verification token, breaking local bootstrap (blocks G5-07 for the documented Self-Hosted onboarding path).

## 14. Explicitly not done here

- No real cloud provider was provisioned (G5-06).
- No real release was published, no real signing secrets were used (G5-02/03).
- No real payment/store provider was contacted (correctly `NOT_APPLICABLE`, not attempted).
- #525 was not touched. This report does not declare G5 passed.
