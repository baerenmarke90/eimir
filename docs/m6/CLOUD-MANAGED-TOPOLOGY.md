# Cloud/Managed v1 launch topology

**Owner:** #521
**Depends on:** #189, #190, #375, #519, #520
**Consumed by:** #524, #525
**Status:** frozen v1 contract

This document freezes the supported Cloud/Managed v1 production topology. It is
operationally distinct from Self-Hosted (`docs/SELF-HOSTING.md`, `docs/m6/
OPERATIONS-RECOVERY.md`) but reuses the same Domain, Privacy, authorization,
portability and entitlement contracts. It introduces no Cloud-only Domain branch,
no second migration mechanism and no mandatory Kubernetes/Redis/Celery/Kafka
dependency.

Repository-root `compose.yaml` with profile `cloud`, together with
`deploy/cloud-managed.env.example`, is the versioned deployment representation
this document points to. eimir. does not maintain a second Cloud-specific
Compose manifest.

## 1. Reuse baseline

Cloud/Managed reuses, unchanged:

- the modular-monolith process boundary (API, Web, worker, one-shot `migrate`);
- PostgreSQL as the authoritative database and the existing PostgreSQL Job
  Queue/Outbox (`FOR UPDATE SKIP LOCKED`) for worker concurrency;
- the `MediaStore` abstraction as-is, including both existing backends
  (`EIMIR_MEDIA_STORE=local` and the S3-compatible adapter) — the choice between
  them is an operator/topology decision (§3.3), not fixed by this document;
- `/api/v1/health` and `/api/v1/health/ready`, and the `X-Eimir-Revision`
  response header;
- `#375`'s environment/promotion/revision contract and `scripts/deployment_smoke.py`
  (already base-URL/target-agnostic — no Cloud-specific smoke tool is added);
- `#519`'s immutable release identity and build-once image archives;
- `#189` structured JSON logs, request/correlation IDs and redaction;
- `#304` Demo isolation (Demo stays outside this topology's promotion chain).

No new queue, cache, orchestration platform, second backup engine or Cloud-only
Domain service is introduced. Where this document requires infrastructure beyond
what Self-Hosted uses, the reuse justification is stated inline (see §3.5).

## 2. Runtime topology

The canonical `cloud` profile uses service names `cloud-migrate`, `cloud-api`,
`cloud-worker`, and `cloud-web`. The table below uses their functional role names
for readability.

| Process | Image | Replicas | State |
|---|---|---|---|
| `migrate` | backend runtime image, `alembic upgrade head` | exactly one execution per release, run to completion before `api`/`worker` start | none (must not run concurrently against the same database) |
| `api` | backend runtime image, ASGI server | N, horizontally replicated behind the ingress | stateless, except the deletion-journal file (§3.5) and, if `local` MediaStore is selected, the media directory (§3.3) |
| `worker` | backend runtime image, `python -m eimir.jobs.runner` | N, horizontally replicated | stateless; job/outbox concurrency is already `SKIP LOCKED`-safe |
| `web` | Web runtime image (static assets + Nginx) | N, horizontally replicated | fully stateless |
| PostgreSQL | managed provider service | provider-managed (primary + standby/read-replica per provider offering) | authoritative persistent state |
| Media storage | `local` (persistent/shared volume) or a provider S3-compatible service — operator choice, see §3.3 | provider-managed (S3) or operator-provisioned durable volume (`local`) | durable media |

This is the same application-process shape the canonical Compose contract uses
for Self-Hosted. The `cloud` profile removes the bundled `postgres` container in
favor of a managed database, keeps the existing `MediaStore` choice between
`local` and `s3` (§3.3) rather than mandating one, and does not activate the
Self-Hosted `demo-init` service (§5).

## 3. Required launch-topology decisions

### 3.1 Scaling

- `api` and `web` are safe to run with an arbitrary number of replicas behind the
  ingress; they hold no process-local state that another replica needs, other than
  the shared deletion-journal volume in §3.5.
- `worker` is safe to run with multiple replicas. The existing PostgreSQL Job
  Queue claims work with `FOR UPDATE SKIP LOCKED`; concurrent workers do not
  double-process a job.
- `migrate` is **not** safe to run concurrently. Alembic does not provide its own
  cross-process advisory lock; the deployment must serialize `cloud-migrate` as a
  single run-to-completion step before `cloud-api`/`cloud-worker` replicas using an
  incompatible schema start.
- Restart/rollout behavior: replace replicas only after the new revision's
  `/api/v1/health/ready` reports `200`; do not route traffic to a replica before
  its readiness check passes. This is the same gate `#375`'s promotion smoke
  already exercises against a single instance; Cloud/Managed applies it per
  replica during rollout.

### 3.2 Database

- Managed PostgreSQL (a provider's managed PostgreSQL offering) is the supported
  v1 database, not a self-operated PostgreSQL container. This mirrors the existing
  `EIMIR_DATABASE_URL` connection contract; no application code change is required.
- Connection pooling is the deploying operator's responsibility (provider-side
  pooler, e.g. a managed pooling endpoint, or an application-tier pooler placed in
  front of `EIMIR_DATABASE_URL`). Core does not bundle a pooler.
- The database must live inside a private network boundary reachable only from
  `api`, `worker` and `migrate`; it must not be publicly reachable.
- Backup/snapshot creation is the managed-provider's responsibility. Per §6, a
  provider snapshot is not recovery evidence until a restore has actually been
  exercised against this topology.

### 3.3 MediaStore

Cloud/Managed v1 keeps the existing `MediaStore` abstraction's two backends as
an **operator/topology choice**, not a fixed requirement. Nothing in the
accepted product/architecture decisions (`#262`, `#521`, `docs/m6/
OPERATIONS-RECOVERY.md`) mandates a specific object-storage provider, and this
document does not invent that requirement. Both options remain fully
Core-supported (`backend/src/eimir/config.py`'s `MediaStoreBackend`
already models exactly this):

- **`EIMIR_MEDIA_STORE=s3`** against a provider S3-compatible bucket —
  recommended once the deployment runs multiple `api`/`worker` replicas or the
  operator's platform already offers managed object storage as the simpler
  durable-storage primitive. One bucket (or one clearly separated prefix per
  environment inside a single bucket, consistent with `#375`/`#304` isolation)
  per environment (Development/Demo/Production); Production must not share a
  bucket or prefix with Development or Demo. Credentials are scoped to that
  bucket/prefix only (least privilege); the application never exposes a public
  bucket URL — all media access continues to go through the existing
  signed/read-descriptor path already used by `OkHttpReferenceApi`/Web
  transfer code. Object lifecycle, versioning and backup/export strategy are
  the provider's responsibility, consistent with `docs/m6/
  OPERATIONS-RECOVERY.md` §6; Core does not implement a second
  application-level object backup engine.
- **`EIMIR_MEDIA_STORE=local`** against a persistent volume — a fully supported
  Cloud/Managed v1 option, for example a smaller single-`api`-replica launch,
  or a platform where the operator provisions a persistent (optionally
  shared/network) volume rather than adopting an object-storage service. This
  is the same backend, the same durable-key layout and the same signed/read
  path Self-Hosted already uses; Cloud/Managed does not fork it. If more than
  one `api`/`worker` replica is deployed with `local` selected, the mounted
  media directory must be the same shared/network volume across every
  replica — the identical constraint §3.5 already states for the
  Account-deletion journal, for the same reason (a request can land on any
  replica). A single-replica `api`/`worker` deployment has no such
  requirement: an ordinary per-instance persistent volume is sufficient,
  exactly as in Self-Hosted.

Whichever backend is selected, backup/recovery-point coordination between
PostgreSQL and media storage is the operator's responsibility: a media backup
and a database backup used together for restore must be reconciled to the same
point in time or later reconciled through the existing consistency checks used
by Self-Hosted recovery (§6 maps both backends' recovery unit explicitly).

### 3.4 Ingress / TLS

- A managed load balancer or reverse proxy is the only public origin, terminating
  TLS in front of `web` and `api`, exactly as `docs/SELF-HOSTING.md`'s "Reverse
  proxy and public exposure" section already defines for Self-Hosted:

  | Path | Internal target |
  |---|---|
  | `/api/` | `api` service, direct (not proxied through `web`) |
  | all other paths | `web` service |

- `EIMIR_PUBLIC_BASE_URL`, `EIMIR_ALLOWED_HOSTS` and `TRUSTED_PROXY_IPS` (or the
  platform-native trusted-proxy-range equivalent) must be set to the exact managed
  ingress's public origin and source ranges; `*` is rejected in Production
  (existing `Settings` validation already fails closed here).
- OIDC/WebAuthn callback origins (`EIMIR_OIDC_CONNECTIONS`, `EIMIR_WEBAUTHN_ORIGINS`,
  `EIMIR_WEBAUTHN_RP_ID`) must be configured against the managed public origin, not
  a per-replica internal address.
- PostgreSQL and object storage are never exposed on the public ingress.

### 3.5 Account-deletion journal durability (reuse of #520's contract)

`docs/m6/ACCOUNT-DELETION-RETENTION.md` §7.2 requires the forward-only deletion
reconciliation journal (`EIMIR_ACCOUNT_DELETION_JOURNAL_PATH`,
`backend/src/eimir/identity/deletion_journal.py`) to durably record every
accepted self-service deletion, independent of the point-in-time database backup,
and explicitly assigns Cloud/Managed the obligation to provide an equivalent
provider-neutral durability contract rather than inventing different Domain
semantics.

Privacy classification is the same as Self-Hosted: the journal is **minimal
pseudonymous recovery metadata**. It is content-free and data-minimized, but its
stable Account UUID and irreversible acceptance timestamp remain account-linkable
in the system/recovery context. The shared volume is therefore protected,
recovery-sensitive authority state rather than ordinary non-personal operational
metadata.

The journal implementation is a single hash-chained append-only file per
`EIMIR_ACCOUNT_DELETION_INSTANCE_ID`, guarded by `fcntl` advisory locking. A
self-service deletion request can land on any `api` replica. Therefore:

- **the journal path must resolve to one shared durable volume mounted by every
  `api` replica** (the same file, not a per-replica copy) — for example a managed
  network file service (AWS EFS, GCP Filestore, Azure Files, or an equivalent
  ReadWriteMany-capable volume) that supports POSIX advisory locking (`fcntl`)
  correctly across clients (NFSv4 with proper lock-manager support; a network
  filesystem that only emulates locking, or lacks cross-client `fcntl` semantics,
  is not supported);
- if the deploying operator's platform genuinely cannot provide a shared
  POSIX-lockable volume, the only supported fallback for v1 is dedicating exactly
  one `api` replica (or a separate single-replica internal service) as the sole
  writer of self-service deletion acceptance, with the remaining replicas routing
  that one endpoint to it; this document does not choose that fallback for a
  specific provider and it must be justified against the actual selected
  platform's constraints before use;
- the same volume/writer requirement applies if `worker` ever reads the journal
  for reconciliation (`deletion_reconcile.py`) — it must see the same file `api`
  wrote;
- the volume is a protected recovery unit exactly like the Self-Hosted
  `/var/lib/eimir/deletion-journal` volume and must be included in the
  Cloud/Managed backup/recovery scope in §6, independent of the PostgreSQL backup
  window, per `ACCOUNT-DELETION-RETENTION.md` §7.2's retention-horizon coupling.

This is the one piece of the v1 topology that is not "purely stateless
replicas behind a load balancer," and it exists because #520 already defined the
journal's Domain contract; #521 is not permitted to weaken that contract to make
horizontal scaling simpler.

### 3.6 Secrets and configuration

Cloud/Managed keeps the same three-environment separation `#375`/`#304` already
require (Development, Demo, Production), with independent values for at least:

- `EIMIR_DATABASE_URL` (managed PostgreSQL credentials/endpoint);
- if `EIMIR_MEDIA_STORE=s3` is selected (§3.3): `EIMIR_S3_ACCESS_KEY_ID` /
  `EIMIR_S3_SECRET_ACCESS_KEY` / `EIMIR_S3_SESSION_TOKEN` / `EIMIR_S3_BUCKET` /
  `EIMIR_S3_ENDPOINT`;
- `EIMIR_CURSOR_SIGNING_KEY`;
- `EIMIR_ENCRYPTION_AT_REST=required`, `EIMIR_ENCRYPTION_KEYS`, and
  `EIMIR_ENCRYPTION_ACTIVE_KEY_ID` (application-controlled encryption at rest, mandatory in
  Cloud Production; keys held apart from database and object-storage backups; see
  [ENCRYPTION-AT-REST.md](../ENCRYPTION-AT-REST.md));
- `EIMIR_BOOTSTRAP_TOKEN` (removed after first ServerAdmin bootstrap, as today);
- `EIMIR_SMTP_*` mail credentials;
- push credentials (existing engagement/push provider configuration);
- `EIMIR_OIDC_CONNECTIONS` client secrets;
- entitlement/billing provider credentials (Phase 2 of this launch effort;
  none exist yet in Core beyond the `TEST_FIXTURE` source already rejected in
  Production by `entitlements/service.py::_ensure_source_allowed`);
- operator/platform credentials (deploy/rotate access to the managed platform
  itself).

Secrets are supplied by the managed platform's own secret store (for example a
platform secret-manager binding injected as container environment variables at
deploy time) and must never be committed to the repository, baked into an image,
or written into the `#519` release manifest/SBOM. `deploy/cloud-managed.env.example`
documents the required keys with placeholder values only, exactly like
`deploy/persistent-development.env.example`.

`scripts/check_environment_isolation.py` already generalizes to any two `.env`
files: it compares `EIMIR_DATABASE_URL` directly (not a `POSTGRES_*` triple) and
only flags a sensitive key when both files actually set it to the same
non-empty value. `deploy/cloud-managed.env.example` therefore needs no
Self-Hosted `POSTGRES_*` fields at all, and the existing tool already accepts it
paired with `deploy/persistent-development.env.example` without modification;
§7 wires this pairing into a repeatable contract test rather than a one-off
manual check.

### 3.7 Environment isolation

Development, Demo and Production Cloud/Managed deployments must not share:
database, bucket/prefix, signing keys, bootstrap token, mail/push/OIDC/entitlement
credentials, or public origin. Demo (#304) remains outside this topology and its
own promotion chain entirely — it is not "Cloud staging."

### 3.8 Availability / restart behavior

- `api`/`web`/`worker` use the same `restart: unless-stopped`-equivalent policy
  Self-Hosted uses; the managed platform's own health-checked replacement
  (readiness-gated rolling replacement) supersedes a local restart policy where
  the platform provides one.
- `migrate` never restarts automatically; a failed migration must stop the
  rollout rather than retry blindly against a partially-migrated schema.
- Health checks reuse `/api/v1/health` (liveness) and `/api/v1/health/ready`
  (readiness, checks the database) exactly as the canonical `compose.yaml`
  configures.

### 3.9 Operator / break-glass access

Reuses `docs/m6/ADMIN-OBSERVABILITY.md` §1's role boundary unchanged:

- the managed platform's infrastructure access (deploy, restart, rotate secrets,
  read infrastructure logs/metrics) is a separate trust boundary from
  application ServerAdmin, and does not by itself grant Tenant/`OWNER_ONLY`
  content access;
- ServerAdmin's application-level operations (`#334`/`#335`) are unchanged by the
  operating model;
- emergency/break-glass infrastructure access (for example a platform's
  "emergency operator" role) must be least-privilege, time-bounded where the
  platform supports it, and does not imply a content browser — it is
  infrastructure access, not a Domain permission.

### 3.10 Region / residency

v1 launch assumption: a single managed region, selected to match the initial
target user base's expected primary residency, with PostgreSQL, object storage
and compute co-located in that region to avoid unnecessary cross-region latency
and egress cost. No multi-region active/active architecture is introduced for v1;
this is a documented limitation, not a silent gap — a region/provider outage is a
recovery scenario (§6.5), not a mitigated failure mode in v1.

The exact provider/region is an operator/deployment-time choice, not hard-coded in
the repository; this document fixes the *decision to run single-region* and the
*co-location requirement*, not a specific vendor region name.

### 3.11 Capacity

Documented v1 assumption (revisited by `#524`'s measured evidence, not asserted as
an SLA):

- initial expected load: a small-to-moderate number of concurrent couples
  (two-person Spaces), consistent with the product's relationship-scoped model;
- `api`: minimum 2 replicas for rollout availability (no single point of failure
  during a rolling deploy), scaled by observed CPU/request-latency;
- `worker`: minimum 1 replica, scaled by observed job-queue backlog age;
- database: the smallest managed PostgreSQL class that keeps `/api/v1/health/ready`
  latency and job-processing latency within the `#524` measured baseline; upgraded
  by observed connection/CPU pressure, not by a priori sizing;
- object storage: no fixed capacity limit assumed beyond the provider's own
  service limits; per-account storage quota, if any, is a `#262` product decision,
  not a topology decision.

No SLA/RPO/RTO number is asserted here; `#524` records measured values against
this topology.

## 4. Deployment representation

The `cloud` profile in repository-root `compose.yaml` is the versioned, reviewable
deployment representation for this topology. It reuses the same Compose contract
as Self-Hosted rather than introducing Terraform/Kubernetes/a custom orchestrator
or a second Compose file. Its profile-specific services intentionally differ from
the `self-hosted` profile only where this topology requires it:

- no bundled `postgres` service — `EIMIR_DATABASE_URL` points at the managed
  database;
- `EIMIR_MEDIA_STORE` defaults to `local` with the same LocalMediaStore contract as
  Self-Hosted, backed by its own `cloud_media_data` volume (kept separate from
  Self-Hosted's `media_data` so the two profiles can never write to the same
  local storage if both were accidentally activated in one project); setting
  `EIMIR_MEDIA_STORE=s3` plus the `EIMIR_S3_*` variables switches to the
  S3-compatible backend instead (§3.3);
- no `demo-init` service (§5);
- `cloud-api`/`cloud-worker`/`cloud-web`/`cloud-migrate` use `image:` references
  derived from the exact `#519` released image archives instead of `build:`;
  Production references are digest-qualified and Cloud/Managed never builds from
  source at deploy time;
- explicit named volumes for the deletion-journal path (§3.5) and, when `local`
  MediaStore is selected, the media directory (§3.3), documented as requiring a
  shared/network-backed implementation whenever more than one API/worker replica
  is deployed.

`deploy/cloud-managed.env.example` selects `COMPOSE_PROFILES=cloud` and supplies
the environment-specific contract. The operator's actual managed-platform
deployment descriptor (whichever container platform is selected) is derived from
this canonical Compose profile; there is no hand-maintained alternate manifest.

### 4.1 Image provenance and deployment identity

Per `docs/m6/IMMUTABLE-RELEASES.md`, `#519` publishes `backend-runtime.image.tar`
and `web-runtime.image.tar` (`docker save` archives) attached to an immutable
GitHub Release, not a registry push. For Cloud/Managed:

1. the operator downloads the exact release's image archives and the exact
   `eimir-release-manifest.json` asset;
2. verifies the manifest/attestation/SBOM per `#519`/`#193`;
3. `docker load`s the archives and pushes those loaded images, without rebuild,
   to the registry the managed platform pulls from. A `v<product-version>` tag may
   be added as a human locator, but it is not trusted as immutable identity;
4. resolve the registry-reported digest for each promoted image and set
   `EIMIR_BACKEND_IMAGE` and `EIMIR_WEB_IMAGE` to digest-qualified references such as
   `registry.example/eimir-backend@sha256:<digest>` and
   `registry.example/eimir-web@sha256:<digest>`;
5. render the canonical Cloud profile and run the existing #519 manifest tool's
   `cloud-deployment` binding before rollout. The binding validates the **resolved**
   Compose image values, requires `cloud-api`, `cloud-worker` and `cloud-migrate`
   to resolve to the exact same backend reference, requires the Web digest
   reference, rejects every `build:` fallback, and emits only the selected image
   identity plus the #519 release/artifact binding;
6. for a non-initial release, provide the previous Cloud deployment identity that
   matches the #519 manifest's `previousKnownGood` release. That keeps rollback
   selection on exact backend/Web registry digests instead of reconstructing it
   later from a mutable tag.

A representative preflight is:

```bash
docker compose --profile cloud --env-file <production-env> config --format json \
  > /tmp/eimir-cloud-compose.json

python3 scripts/release_manifest.py cloud-deployment \
  --manifest eimir-release-manifest.json \
  --compose-config /tmp/eimir-cloud-compose.json \
  --output cloud-deployment-identity.json

rm -f /tmp/eimir-cloud-compose.json
```

The full resolved Compose JSON is transient because it can contain environment
configuration/secrets; it is **not** deployment evidence and must not be archived.
`cloud-deployment-identity.json` intentionally contains only non-secret release,
artifact and image identity. For a non-initial release, add
`--previous-deployment-identity <previous-cloud-deployment-identity.json>`.

No image is rebuilt from source for Cloud/Managed promotion; this is the "build
once, publish immutable artifacts" decision `#519` already made, applied at the
deployment boundary. A Docker/OCI tag is never immutable by definition: `latest`,
`main`, branch names, `v1.0.0`, `1.2.3`, and arbitrary custom tags are all rejected
when they are the entire Production image identity. A tag may coexist with an
`@sha256:<digest>` suffix, because the digest — not the tag — is what pins the
artifact.

The #519 chain remains the product release source of truth:

`product version -> Git tag -> immutable source SHA -> release manifest -> artifact digests`

The registry digest is an additional transport/deployment identity for the exact
promoted OCI object. It is not a second product release identity and is not expected
to equal the SHA-256 of the `docker save` archive byte-for-byte; those digests identify
different representations and are recorded side by side.

## 5. Demo exclusion

The `self-hosted` profile's `demo-init` service (`python -m scripts.demo_space
ensure`) is intentionally **not** part of the `cloud` profile. The canonical
public Demo (`#304`) is its own isolated deployment, not a step inside the
Cloud/Managed Production topology; Cloud/Managed Production must never
auto-provision demo content.

## 6. Recovery and rollback

Maps `docs/m6/OPERATIONS-RECOVERY.md` §4's "Cloud/Managed" recovery units to this
topology:

1. **Managed PostgreSQL** — provider automated backup/point-in-time-recovery
   configured at the smallest interval the provider offers; restore path is the
   provider's own restore-to-new-instance mechanism, followed by repointing
   `EIMIR_DATABASE_URL`.
2. **Media storage** — depends on the §3.3 backend choice: provider bucket
   versioning (or equivalent backup/replication feature) enabled on the
   Production bucket for `s3`, or the operator's own volume-level
   backup/snapshot mechanism for the Production media volume for `local`
   (the same recovery unit Self-Hosted already treats as protected data).
3. **Deletion-journal volume (§3.5)** — a separately protected forward-only
   recovery authority containing minimal pseudonymous recovery metadata. Recover
   the newest validated journal for the configured instance UUID; never roll it
   back to the database/media recovery timestamp. A restored database must replay
   that journal before application writers resume, and a missing, corrupt, or
   older substituted journal fails closed as defined by
   `ACCOUNT-DELETION-RETENTION.md` §7.2-§7.3.
4. **Managed secrets/config** — recovered through the platform's own
   secret-store backup/versioning, or re-provisioned from the operator's protected
   secret-management process; secrets are never recovered from application
   backups.
5. **Application release identity** — `#519`'s previous-known-good release
   selection plus the matching previous Cloud deployment identity. Rollback must
   reuse the exact previously recorded backend/Web `@sha256:` references; it must
   not resolve a SemVer or other tag again. Redeploying an old application never
   implies a database rollback (same rule as `OPERATIONS-RECOVERY.md` §5).

**Provider-managed backup is not recovery evidence until a real restore has been
exercised against this exact topology.** `#524` is responsible for performing (or
explicitly marking `BLOCKED` with the missing external prerequisite for) that
restore; this document only fixes which units must be restorable and how they
must be reconciled.

### 6.1 Failure/outage assumption

A full managed-region outage in the v1 single-region topology (§3.10) is a
documented unmitigated scenario: recovery is "redeploy in another region from the
last coordinated recovery point," not automatic failover. This is stated
explicitly rather than silently assumed away.

## 7. Contract tests

`tools/ci/test_cloud_managed_topology.py` and `tools/ci/test_release_manifest.py`
enforce the mechanical parts of this contract so they cannot silently regress:

- the canonical `cloud` profile resolves to exactly `cloud-api`, `cloud-worker`,
  `cloud-web`, and `cloud-migrate` and does not activate bundled PostgreSQL or
  `demo-init`;
- all Cloud process services use `image:` rather than source `build:`;
- missing image configuration resolves only to a deliberately non-runnable
  sentinel and fails the Production identity validator;
- tag-only image references are rejected, including `:latest`, `:main`,
  `:v1.0.0`, and arbitrary tags such as `:some-tag`;
- `@sha256:<64-hex-digest>` references pass the image-identity contract;
- `cloud-api`, `cloud-worker`, and `cloud-migrate` must resolve to exactly the
  same backend image reference, while `cloud-web` carries the selected Web image;
- the Cloud deployment identity is bound to the final signed #519 release
  manifest, its backend/Web artifact digests, and the exact previous-known-good
  deployment identity for non-initial releases;
- `cloud-migrate` has no automatic restart policy;
- the deletion-journal path is mounted from a dedicated named volume for both
  `local`-media and `s3`-media resolved configurations;
- the media directory is mounted from a dedicated named volume when `local`
  MediaStore is selected (the default), while S3 variables apply when
  `EIMIR_MEDIA_STORE=s3` is explicitly selected;
- `deploy/cloud-managed.env.example` requires `COMPOSE_PROFILES=cloud`,
  `EIMIR_ENVIRONMENT=production`, and `EIMIR_DEPLOYMENT=cloud`;
- `scripts/check_environment_isolation.py` accepts the Cloud template paired with
  the Development template and rejects reused sensitive values.

These are configuration-contract tests, not a new deployment platform or a second
CI environment. They run inside the existing deployment/release guards; the
canonical single-Compose contract remains unchanged.

## 8. Security / privacy

- no ServerAdmin content-browsing shortcut is introduced by this topology (§3.9);
- least-privilege service credentials: `api`/`worker` receive only the database
  and bucket/prefix credentials they need; platform/infrastructure credentials
  are never handed to the application process;
- database and object storage are never publicly reachable (§3.2, §3.4);
- secrets stay outside images/source/release manifests/SBOM (§3.6);
- resolved Compose output used for the image-identity preflight is transient and
  must not be retained as evidence because it can contain injected secrets; only
  the scrubbed Cloud deployment identity output is retained;
- the deletion journal remains protected, recovery-sensitive pseudonymous metadata
  even though it contains no relationship/private content (§3.5);
- backup, log and metrics data receive the same sensitivity treatment as
  Production data — `#189` redaction already strips ProtectedPayload/`OWNER_ONLY`/
  tokens/signed URLs from logs, and that same log stream is what any managed
  observability export consumes (§9); no Cloud-specific logging path bypasses
  that redaction;
- Tenant/Privacy semantics are identical to Self-Hosted — no code in
  `backend/src/eimir` branches Domain authorization on `Deployment.CLOUD`
  vs. `Deployment.SELF_HOSTED` (the only existing `Deployment` branch,
  `entitlements/service.py::_grant_capabilities`, gates commercial *capability*
  availability, not privacy/authorization).

## 9. Observability

Cloud/Managed consumes `#189`'s existing structured JSON stdout logs and
request/correlation IDs unchanged. The managed platform may forward that stdout
stream to a managed logging/metrics stack (log shipping is an infrastructure
concern outside the application); Core itself gains no mandatory SaaS telemetry
dependency, so Self-Hosted is unaffected.

Minimum operational signals for G5, all already available without new Cloud-only
code:

- `/api/v1/health` and `/api/v1/health/ready` (liveness/readiness, consumed by
  the platform's own health-gated rollout);
- `X-Eimir-Revision` header (deployed-revision verification, `#375`'s
  existing smoke check);
- `#189` structured request logs (status, latency, redacted correlation) for
  error-rate/latency SLO-style indicators;
- worker job-queue backlog age, derived from the existing Outbox/Job Queue tables
  (no new metrics pipeline; a read-only query against existing tables, exposed
  operationally exactly as any other operational check).

## 10. Business / freemium

Self-Hosted vs. Cloud/Managed remains the `Deployment` operating-model axis;
Free/Premium remains the `#262`/`#523` product-tier axis. This document adds no
new capability gate. The one existing `Deployment`-conditioned behavior
(`CLOUD_ONLY_CAPABILITIES` in `entitlements/service.py`) predates this issue and
is a `#262`/`#523` product decision, not a topology decision; this document does
not change it.

## 11. Out of scope (unchanged from the issue)

- replacing Self-Hosted `#375`;
- using the public Demo as staging;
- application feature work;
- entitlement provider selection (Phase 2 of this launch effort, tracked
  separately);
- Kubernetes or multi-region architecture without a demonstrated launch need;
- copying real Production data into Development/Demo.
