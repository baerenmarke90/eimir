# M6 Administration and Observability

**Workstreams:** M6-D / M6-E  
**Owners:** #334, #335, #189, #522  
**Integrated evidence:** #524

M6 administration and observability exist to operate the application safely. They
do not create a privileged shortcut around Tenant/Privacy rules and do not turn the
Web application into host/container management software.

## 1. Role and responsibility boundary

| Actor | May do | Must not gain |
|---|---|---|
| ordinary Account / Space member | normal authorized product actions | ServerAdmin operations |
| application admin where already defined | explicitly authorized application configuration | arbitrary cross-Space private-content access |
| ServerAdmin | application-wide operational controls/status required by #334/#335 | relationship-content browser, host shell, container/filesystem control |
| host/operator | deploy, restore, rotate secrets, operate infrastructure outside app UI | automatic authorization to browse user content through the product |

Host access is an infrastructure trust boundary, not a reason to add an in-product
content browser.

## 2. Registration and maintenance (#334)

#334 owns persisted application policy for:

- `registration_enabled`;
- `maintenance_mode`;
- effective registration = registered **and** not in maintenance;
- authorized mutation;
- safe public capability/status needed by clients;
- audit of privileged changes;
- bootstrap/lockout safety.

Maintenance mode must preserve a documented authorized ServerAdmin recovery path.
A configuration mistake must not require direct database editing as the ordinary
recovery procedure.

Clients should distinguish policy/maintenance/unavailable states through stable
server contracts rather than guessing from network errors.

These controls are Self-Hosted/Core operations and are not Premium features.

## 3. ServerAdmin dashboard (#335)

The ServerAdmin Web surface may aggregate privacy-safe operational information such
as:

- application/version/revision identity;
- readiness/health state;
- registration/maintenance policy;
- worker/job health and failure counts;
- safe aggregate operational counts where justified;
- sanitized read-only effective configuration;
- recent privileged Audit events;
- recovery/runbook links.

It must not expose:

- Memory/private-note/relationship text;
- `OWNER_ONLY` payloads;
- attachment content or signed URLs merely for inspection;
- bearer/session/recovery/provider tokens;
- secret config values;
- arbitrary SQL;
- host files, processes, containers or shell execution.

If host orchestration is useful, use the existing external host/deployment platform
rather than duplicating it in eimir.

## 4. Safe configuration view

A ServerAdmin configuration surface may show only values safe for operational
inspection, for example:

- environment class;
- deployment/version identity;
- feature/config presence or boolean state;
- public origin;
- storage/provider **type**, not credentials;
- worker/queue configuration class;
- registration/maintenance state.

Secret-bearing values are shown only as absent/present or an approved non-sensitive
fingerprint when operationally necessary. Never render passwords, DSNs with
credentials, signing keys, API tokens, webhook secrets or license/purchase secrets.

## 5. Observability signals (#189)

M6 requires safe structured diagnostics rather than user-content analytics.

### Correlation

At minimum support correlation across:

```text
HTTP request -> Domain/service work -> Outbox/Job -> worker attempt -> safe result
```

Use stable request/correlation/job/event identifiers so an operator can diagnose a
failure without logging request bodies or private records.

### Structured logs

Production logging should be structured enough to filter by:

- timestamp/severity;
- subsystem;
- environment;
- release revision;
- request/correlation ID;
- job/outbox identifier where relevant;
- safe machine-readable error category.

Do not make arbitrary exception/provider payloads a bypass around redaction.

### Minimal metrics

Safe launch metrics include technical aggregates such as:

- readiness/health;
- request count/latency/error classes;
- worker heartbeat;
- job queue depth/age/retry/failure counts;
- dependency availability where safe;
- release revision/deployment events at the deployment layer.

Do not export private content, relationship sentiment, exact private locations or
per-user activity simply because a metrics backend exists.

## 6. Redaction boundary

Logs, traces, metrics, alerts, audit metadata and ServerAdmin views must not expose:

- `ProtectedPayload`;
- partner or current-user `OWNER_ONLY` content;
- bearer/session/recovery/Magic Link tokens;
- cookies or Authorization headers;
- signed media URLs/storage credentials;
- raw provider webhook payloads/receipts/license secrets;
- email verification/recovery secrets;
- private filenames/content where unnecessary;
- precise private location values;
- arbitrary request/response bodies.

Provider errors must be normalized/sanitized before logging. A correlation ID is
preferred to a copied private payload.

Automated redaction/negative tests are required for #189/#524.

## 7. Self-Hosted vs. Cloud observability

The application exposes safe local/standard signals. Self-Hosted requires no
external telemetry SaaS to remain operable.

Cloud/Managed may route the same signals to a managed logging/metrics/alerting
platform as an operations choice. That provider remains outside Domain behavior and
must follow production data-handling/secrets rules.

No Cloud exporter should make Self-Hosted startup/readiness depend on the provider.

## 8. Incident response (#522)

#522 turns #189 signals into an operator process. Required runbooks include:

- API/Web outage;
- database/readiness degradation;
- worker/job queue failure/backlog;
- media-store failure;
- authentication/provider outage;
- failed release/migration;
- elevated errors/latency;
- maintenance activation/recovery;
- rollback vs. forward-fix decision;
- backup/restore using #190;
- suspected diagnostic privacy/secret leakage;
- entitlement-source outage after M6-F is enabled.

Every runbook defines detection, safe diagnostics, containment, recovery decision,
verification and minimized evidence.

## 9. Audit boundary

Privileged operational mutations should use the existing Audit model where the
repository policy requires it, including at least changes to registration,
maintenance and entitlement/operator grants where applicable.

Audit records should answer **who changed which operational control and when**,
without copying private content or secrets into the audit row.

Normal content reads must not become secretly auditable through a ServerAdmin
surveillance feature.

## 10. Lockout invariants

Before G5 prove:

1. maintenance can block normal application operation without blocking the intended
   authorized recovery identity/path;
2. disabling self-registration does not remove existing authorized admin access;
3. bootstrap credentials are not left as a permanent public/default backdoor;
4. ServerAdmin authorization remains server-side;
5. a failed observability provider/exporter does not make Core unavailable;
6. recovery procedures do not require viewing private user content.

## 11. Entitlement interaction

ServerAdmin may show safe commercial-runtime health/state once #523 exists, but:

- it does not accept raw payment card data;
- it does not mutate provider purchases directly outside the accepted adapter/audit
  contract;
- entitlement status does not bypass Account/Space authorization;
- Account deletion and essential data rights remain usable without Premium;
- receipts/license secrets never appear in diagnostics/config views.

## 12. G5 evidence

#524 must capture at least:

- registration enabled/disabled and maintenance transitions;
- successful ServerAdmin recovery access during maintenance;
- denial of ordinary users and unauthorized admin access;
- safe configuration redaction;
- worker/health diagnostics for a controlled failure;
- request/job correlation across an incident;
- alert/log payload redaction tests;
- one controlled incident/rollback-or-forward-fix/recovery drill;
- proof that ServerAdmin cannot browse private relationship/`OWNER_ONLY` content.

## 13. Non-goals

M6 administration/observability does not add:

- host/container/filesystem orchestration;
- arbitrary SQL consoles;
- user-content search for operators;
- mandatory external APM/telemetry SaaS;
- product analytics or relationship scoring;
- a second Audit system;
- custom alerting infrastructure where established operator tooling is sufficient.
