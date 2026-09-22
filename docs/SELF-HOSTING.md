# Secure Self-Hosted Operation

Persistent Development, release-candidate verification, Production promotion and
rollback are governed by
[`DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md`](DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md).
This document is the operator runbook for Self-Hosted instances.

> Upgrading an installation created before the eimir. identity change requires
> the [project-identity migration guide](PROJECT-IDENTITY-MIGRATION.md). Record
> and preserve the existing Compose project name and volume identity before
> moving or renaming the checkout.

## Operating modes

The repository has one tracked runtime topology: `compose.yaml`.

| | local source test | released Production |
|---|---|---|
| `EIMIR_ENVIRONMENT` | `development` | `production` |
| application images | local images built before Compose | public digest-qualified GHCR release images |
| application `build:` in Compose | none | none |
| pull policy | `never` for intentional local tags | `always` |
| supported start entry point | raw Compose after local prebuild | `scripts/self_hosted_release.py` |
| release identity | non-release local tag | immutable GitHub Release + source SHA + OCI digest |
| mail | `log`, `smtp`, or `none` | `smtp` or `none`; never `log` |
| public origin | HTTP localhost allowed | HTTPS required |

The default development experience remains usable without SMTP or a public HTTPS domain.
Released Production is deliberately stricter.

## Local source test

Local source testing builds application images first, then runs the same canonical
Compose topology:

```bash
cp .env.example .env
# Replace POSTGRES_PASSWORD and optionally set a bootstrap token.
python3 scripts/build_self_hosted_source.py --env-file .env
docker compose --profile self-hosted --env-file .env config --quiet
docker compose --profile self-hosted --env-file .env \
  up -d --wait --wait-timeout 300
```

`.env.example` points application services at local tags and sets
`EIMIR_SELF_HOSTED_PULL_POLICY=never`. The source builder refuses Production and refuses
registry/digest targets. It is not a Production fallback.

For verified source acceptance, `scripts/compose_checked.py` may export one exact clean
Git snapshot, build local backend/Web images and run canonical Compose against those
local tags. That wrapper also refuses Production. It proves source; it does not create a
published release.

## Released Production files and trust boundary

A released Self-Hosted installation requires **both** matching GitHub Release assets:

- `eimir-self-hosted-v<release-version>.tar.gz` — the deterministic source-free operator bundle;
- `self-hosted-image-identity.json` — the digest-qualified image identity for that same release.

The GitHub Release itself must be marked **Immutable**. Verify it before treating the
release assets as trusted:

```bash
gh release verify "v${RELEASE_VERSION}" --repo baerenmarke90/eimir
```

Do not trust an image-identity asset copied from a draft or mutable Release: a mutable
asset can be replaced after its initial publication. The protected publication workflow
refuses to complete unless GitHub reports `isImmutable=true` for the published Release
and the Release attestation verifies.

The backend and Web GHCR images referenced by the identity file are official public
Self-Hosted distribution artifacts. They must be anonymously pullable by digest. Normal
Self-Hosted installation does **not** require a GHCR PAT, package-admin token or the
publication workflow credential.

GHCR `v<version>` and `sha-<source>` tags are discovery aliases only. GHCR does not offer
server-side immutable tags. The authoritative image identity is the digest after
`@sha256:` in `self-hosted-image-identity.json`; Production never relies on re-resolving a
tag to decide which bytes to run.

Download the operator bundle (and, optionally, the standalone identity asset for
comparison) from the same immutable release and extract it:

```bash
RELEASE_VERSION=0.1.0

gh release verify "v${RELEASE_VERSION}" --repo baerenmarke90/eimir

gh release download "v${RELEASE_VERSION}" \
  --repo baerenmarke90/eimir \
  --pattern "eimir-self-hosted-v${RELEASE_VERSION}.tar.gz"

tar -xzf "eimir-self-hosted-v${RELEASE_VERSION}.tar.gz"
cd "eimir-self-hosted-v${RELEASE_VERSION}"
test -s self-hosted-image-identity.json
```

Mixing files from different releases is invalid. The bundle already contains the
matching `self-hosted-image-identity.json`; a source checkout only contains an unreleased
placeholder of the same name that the launcher and the release guard refuse.

The resulting installation directory contains:

- `compose.yaml`;
- `deploy/self-hosted-release.env.example`;
- `scripts/self_hosted_release.py`;
- `scripts/check_runtime_environment.py`;
- `scripts/_identity_environment.py`, the shared helper both scripts import;
- `self-hosted-image-identity.json`, the digest-qualified identity of that immutable
  release, read-only trust root of the launcher and of the in-manifest `release-guard`.

The protected release workflow publishes these operator artifacts together. The target
host does **not** need backend/Web source and never builds application images.

Start from the release template:

```bash
cp deploy/self-hosted-release.env.example .env
```

Set instance-specific values and select the published product version:

```dotenv
EIMIR_ENVIRONMENT=production
EIMIR_RELEASE_VERSION=0.1.0
POSTGRES_PASSWORD=<strong-production-only-value>
EIMIR_PUBLIC_BASE_URL=https://eimir.example
EIMIR_ALLOWED_HOSTS=["eimir.example"]
EIMIR_CURSOR_SIGNING_KEY=<stable-random-value-at-least-32-characters>
```

Do not independently select Production image bytes from a mutable version tag. The
mandatory `self-hosted-image-identity.json` supplies the exact digest-qualified backend
and Web references published for `EIMIR_RELEASE_VERSION`, for example:

```text
ghcr.io/baerenmarke90/eimir-backend:v0.1.0@sha256:<digest>
ghcr.io/baerenmarke90/eimir-web:v0.1.0@sha256:<digest>
```

The `v0.1.0` portion is operator-readable metadata; Docker's digest-qualified pull is
bound by `<digest>`. The launcher verifies that both references carry the exact
`EIMIR_RELEASE_VERSION`, that the stored digests match the references, and that backend
`migrate`, `api`, and `worker` share one exact backend image. Production requires
`pull_policy=always` and permits no application `build:` fallback.

## First publication note for package visibility

GitHub Container Registry may create a newly published package as Private. The protected
release workflow therefore performs an anonymous digest inspection after GHCR promotion
and **before** GitHub Release publication. If either `eimir-backend` or `eimir-web` is not
public, the workflow stops intentionally.

For the first publication only, a package administrator may need to open the two newly
created GHCR packages, change their visibility to **Public**, and rerun the same protected
release workflow. The already pushed content-addressed digest is then reused and
verified. Do not work around this gate by documenting a user PAT or embedding registry
credentials in `.env`.

Repository release immutability must also be enabled before the first final publication:

```text
GitHub repository -> Settings -> Releases -> Enable release immutability
```

If that setting is missing, the workflow publishes through a draft, detects that the
final Release is not immutable, attempts cleanup of the just-created mutable Release/tag,
reports any cleanup failure explicitly, and fails closed regardless.

## Arcane-first Production

Production can be operated from Arcane alone: **configure -> bootstrap once -> deploy /
update**. The release checks are part of the canonical `compose.yaml` (`release-guard`),
so Arcane's plain Deploy/Redeploy is supported and refuses a Production release whose
backend/Web images are not exactly the references recorded in the release's
`self-hosted-image-identity.json`, whose pull policy is not `always`, that has no
Account-deletion instance ID, or whose `EIMIR_ENVIRONMENT` is unset or unknown. The new-installation
authority is created once through the `bootstrap` profile. The full operator flow,
including upgrades and failure behavior, is in [`ARCANE.md`](ARCANE.md).

The guard and the launcher read the same published identity file and apply the same
checks. The launcher fills in the references itself and is the only path that validates
before pulling and runs `migrate` before it replaces the running release; a refused plain
Compose/Arcane Redeploy may already have stopped the previous containers.

## Mandatory released launcher

Without Arcane, operate released Production with the launcher rather than a raw
`docker compose pull/up` sequence (raw `up` is gated by `release-guard`, but validates only
after Compose has pulled and replaced containers). The launcher explicitly binds the env file and the matching
published image identity:

```bash
python3 scripts/self_hosted_release.py \
  --env-file .env \
  --image-identity self-hosted-image-identity.json \
  <operation>
```

The launcher always uses repository-root `compose.yaml` and profile `self-hosted`. Before
it can pull, bootstrap or start anything, it renders the actual Compose configuration
and validates the published image identity. It rejects:

- a missing, malformed, or release-mismatched image identity;
- a non-Production release env;
- process-level environment drift away from Production;
- missing `EIMIR_RELEASE_VERSION`;
- local, branch or `latest` application images;
- backend/Web versions that differ from `EIMIR_RELEASE_VERSION`;
- backend-role image divergence;
- application `build:` fallback;
- disabled Production pulling.

`deploy` additionally runs the full runtime-environment guard, including deletion
authority and other Production-critical configuration, before pull/start.

Available operations are:

```text
validate
pull
bootstrap-deletion-authority
deploy
```

A registry outage, non-public released package, missing identity asset, or missing
release image is a deployment failure. The launcher never falls back to a source build.

## First Production installation

### 1. Configure and pull the selected release

With `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` still blank on a brand-new installation:

```bash
python3 scripts/self_hosted_release.py \
  --env-file .env \
  --image-identity self-hosted-image-identity.json \
  pull
```

This performs the image-identity gate without requiring an already-created deletion
authority.

### 2. Create the deletion authority exactly once

Only for an installation that has **never** had an Account-deletion authority:

```bash
python3 scripts/self_hosted_release.py \
  --env-file .env \
  --image-identity self-hosted-image-identity.json \
  bootstrap-deletion-authority
```

The command runs the released backend image and creates the UUID plus forward journal as
one operation. It prints:

```dotenv
EIMIR_ACCOUNT_DELETION_INSTANCE_ID=<stable-instance-uuid>
```

Store exactly that value in `.env` and in the protected operator configuration backup.
Do not pre-generate or replace the UUID independently of the journal.

If the installation previously had an authority and its journal is missing or damaged,
**do not bootstrap again**. Restore the newest protected journal and matching stable
instance ID according to
[`ACCOUNT-DELETION-SELF-HOSTED.md`](ACCOUNT-DELETION-SELF-HOSTED.md).

### 3. Validate and deploy

After recording `EIMIR_ACCOUNT_DELETION_INSTANCE_ID`:

```bash
python3 scripts/self_hosted_release.py \
  --env-file .env \
  --image-identity self-hosted-image-identity.json \
  validate
python3 scripts/self_hosted_release.py \
  --env-file .env \
  --image-identity self-hosted-image-identity.json \
  deploy
```

`deploy` validates, pulls the selected release images, applies the migrations once, and
only then force-recreates the runtime containers and waits for health. See
[Upgrade and rollback semantics](#upgrade-and-rollback-semantics) for the exact sequence
and what it does and does not guarantee.

## Runtime topology

Normal Self-Hosted ordering is:

```text
postgres -> release-guard -> migrate -> api/worker -> web
```

`release-guard` is a one-shot that `migrate` waits for; it is described under
[Arcane-first Production](#arcane-first-production).

The topology was reviewed service by service (#827). The goal is not the smallest
container count: a service is removed or integrated only when a safer and simpler
mechanism exists. A shared image is not a shared process; `api`, `worker` and `migrate`
use one backend image but stay separate processes with their own lifecycle.

| Service | Decision | Reason |
|---|---|---|
| `postgres` | KEEP | Stateful upstream database with its own volume, health check and restart policy; it is not application code, and Cloud/Managed replaces it with an external database. |
| `release-guard` | KEEP | Compose-resident Production release gate that `migrate` waits for, so plain Compose and Arcane Deploy/Redeploy cannot start a release that differs from the published identity or lacks a deletion authority; it needs no network or data volume, reads only the identity file, and refuses an unset environment. |
| `migrate` | KEEP | One-shot schema owner: exactly one migration runs per deploy before any runtime is replaced, so several API instances cannot race, a failed or refused migration blocks startup, and it reuses the backend image. |
| `demo-init` | DEMO-ONLY | Profile `demo` only and run explicitly as a one-shot; normal startup neither depends on it nor creates it, and outside an enabled Demo deployment it exits without creating data. |
| `deletion-authority-bootstrap` | BOOTSTRAP-ONLY | Profile `bootstrap` only and run explicitly once per new installation to create the Account-deletion journal and print its stable instance ID; it refuses whenever an instance ID or journal already exists, so it can never replace an authority. |
| `api` | KEEP | Request-serving HTTP process with its own health check, published port and restart behavior; it shares the backend image but is a separate process from the worker. |
| `worker` | KEEP | Background job runner with an independent failure domain, restart and scaling behavior and no published port; merging it into the API would let a stuck job take down request serving. |
| `web` | KEEP | Unprivileged static Nginx runtime that owns caching, CSP and security headers; it needs no Python, upgrades and fails independently, and folding it into the backend would weaken that isolation. |

No service is removed or integrated into another one: none passed the "safer and
simpler" test. `demo-init` is not part of the normal startup chain, and `release-guard`
is the only addition to it: it moves the release checks into the manifest.

- `migrate` is not folded into API startup. With several API instances (or an API
  restart during a rollout) every instance would race to migrate, a failed migration
  would crash-loop the API, and a refused rollback could not be stopped before the
  running release is replaced.
- `migrate` has `restart: "no"` and receives only the database connection; the
  restart policy of the long-running services never re-runs migrations.
- `api` and `worker` restart independently (`unless-stopped`). Only `api` and `web`
  publish host ports; `worker` has none.
- `web` waits for API readiness. The `/api/` route of the TLS reverse proxy goes
  directly to the API, not through the Web Nginx (see below).

All services use the project-specific bridge network. The application reaches PostgreSQL
through Docker DNS at `postgres:5432`; do not depend on container IDs or fixed Docker IPs.

### Demo initialization

`demo-init` runs only for an intentional Demo deployment and only when requested; it is
never part of `deploy`. After the normal deployment, run the idempotent one-shot
explicitly (`self-hosted` provides its `migrate` dependency, `demo` provides the service):

```bash
docker compose --profile self-hosted --profile demo --env-file .env run --rm demo-init
```

Do not add `demo` to `COMPOSE_PROFILES` and use `up --wait`: Compose (observed with
2.26) treats an exited standalone one-shot as a failed wait. API and worker do not wait for `demo-init`, so
Demo entry answers `404 DEMO_IDENTITY_MISSING` until the command has completed. See
[`DEMO-SPACE.md`](DEMO-SPACE.md).

## Production configuration requirements

Production rejects insecure runtime settings. At minimum:

- `EIMIR_CURSOR_SIGNING_KEY` is stable and at least 32 characters;
- `EIMIR_PUBLIC_BASE_URL` uses HTTPS;
- `EIMIR_ALLOWED_HOSTS` names concrete hosts and never `*`;
- `TRUSTED_PROXY_IPS` is the smallest real proxy IP/CIDR set;
- `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` matches the protected forward journal;
- `EIMIR_ENCRYPTION_AT_REST` is set explicitly (`required`, `migrating`, or `disabled`), and
  with an encrypting mode `EIMIR_ENCRYPTION_KEYS`/`EIMIR_ENCRYPTION_ACTIVE_KEY_ID` are valid;
- `EIMIR_MAIL_TRANSPORT` is `smtp` or `none`, never `log`.

SMTP is optional. With:

```dotenv
EIMIR_MAIL_TRANSPORT=none
```

password, Passkey/WebAuthn and OIDC remain available while mail-dependent Magic Link,
password recovery and email verification report that mail delivery is unavailable.

## Account deletion authority

Self-service Account deletion has a stronger recovery requirement than ordinary
point-in-time application data. Canonical Compose mounts a separate private
`deletion_journal_data` volume at:

```text
/var/lib/eimir/deletion-journal
```

Keep the stable instance UUID and newest validated forward journal outside ordinary
PostgreSQL/media rollback. Retain journal tombstones until all backups that could predate
those deletions have expired. API startup reconciles configured tombstones before normal
traffic so an older database restore cannot resurrect a deleted Account.

Treat `docker compose down -v` as destructive to this safety state. A normal application
recreate is safe because named volumes persist; deleting/changing the project or journal
volume requires an explicit recovery/migration decision.

## Media storage

`EIMIR_MEDIA_STORE=local` uses the private Compose `media_data` volume shared by API and
worker. For S3-compatible private object storage:

```dotenv
EIMIR_MEDIA_STORE=s3
EIMIR_S3_ENDPOINT=https://s3.example.com
EIMIR_S3_REGION=eu-central-1
EIMIR_S3_BUCKET=eimir-private
EIMIR_S3_ACCESS_KEY_ID=...
EIMIR_S3_SECRET_ACCESS_KEY=...
```

The bucket stays private. Production/Demo require HTTPS S3 endpoints. Provider
credentials should permit only the object operations needed by the media lifecycle.
Presigned URLs, signatures, storage keys and credentials must not enter logs, analytics,
support bundles or persistent client caches.

Development and Production must never share an S3 bucket or credential set.

With application-controlled encryption enabled (below) the provider only ever stores
ciphertext, and uploads and reads go through the application instead of presigned
URLs.

## Encryption at rest

Set `EIMIR_ENCRYPTION_AT_REST` explicitly in Production; an unset value is refused by
the release guard and by the application:

- `required` for new installations, with `EIMIR_ENCRYPTION_KEYS` and
  `EIMIR_ENCRYPTION_ACTIVE_KEY_ID`;
- `migrating` while upgrading an installation that already holds plaintext, until
  `python -m eimir.security migrate-payloads` and `migrate-media` finished, then `required`;
- `disabled` as an explicit opt-out for operators who rely on their own disk/volume
  encryption (leave the key variables empty).

This is encryption at rest under keys you hold, not end-to-end encryption. Keep the keys
apart from database and media backups; losing every copy of a key makes the content it
protects permanently unreadable. Key generation, rotation, recovery, and verification:
[ENCRYPTION-AT-REST.md](ENCRYPTION-AT-REST.md).

## Backup, restore, upgrade and rollback

The binding recovery procedure is
[`SELF-HOSTED-RECOVERY.md`](SELF-HOSTED-RECOVERY.md). For LocalMediaStore,
`scripts/self_hosted_recovery.py` coordinates PostgreSQL and durable media while
configuration/secrets and the forward deletion journal remain separate protected
recovery units.

Before every Production upgrade:

1. create/verify a fresh coordinated recovery point;
2. protect the current deletion journal and operator configuration;
3. select one exact published release/image identity;
4. run the released launcher against the new `.env` selection;
5. verify migration, health and revision identity.

Application rollback selects a previous published release/image identity. It does not
imply database rollback. For incompatible schema changes use the tested forward-fix,
downgrade or coordinated restore path defined by #190/#375 and the recovery runbook.

### Upgrade and rollback semantics

Upgrade and rollback are the same operation: set `EIMIR_RELEASE_VERSION` and the matching
`self-hosted-image-identity.json` to the wanted published release and run `deploy`. The
launcher executes, and stops at the first failing step:

1. validate the selected release identity and Production environment;
2. pull the selected digest-qualified images (never a source build);
3. start PostgreSQL if it is not running;
4. run the one-shot `migrate` service once against the selected backend image, **before**
   any runtime container is touched;
5. force-recreate the runtime containers and wait for health (the canonical dependency
   graph runs `migrate` once more; at the head revision it is a no-op).

What this guarantees:

- The exact selected release bytes run; the target host never builds application images.
- If step 4 fails or refuses, the currently running API, worker and Web keep serving
  the previous release. Migrations run in one PostgreSQL transaction, so a failing
  migration rolls back unless that migration explicitly leaves the transaction; if in
  doubt, restore the recovery point taken before the upgrade.
- Rolling back to an earlier release **that knows the database's current schema
  revision** (no migration was added in between) works and changes no data.
- Rolling back to a release **older than the database schema** is refused: its
  `migrate` cannot locate the database revision and exits non-zero. Nothing is
  downgraded, no data is lost, and the newer release keeps running. Re-select the newer
  release, or fix forward.

What it does **not** guarantee:

- Rollback across a schema migration. The application rollback never downgrades the
  schema. To return to a release older than the schema, restore the coordinated recovery
  point taken before the upgrade
  ([`SELF-HOSTED-RECOVERY.md`](SELF-HOSTED-RECOVERY.md)); that also discards data written
  after that point.
- Zero downtime. Runtime containers are force-recreated, so API/worker/Web restart
  during step 5.

`scripts/self_hosted_upgrade_rehearsal.py` proves the above against the canonical
`compose.yaml` with local images (fresh install, upgrade with and without schema change,
compatible rollback, refused rollback, recovery, Demo lifecycle). It runs in the
*Self-Hosted Deployment Guard* workflow. It cannot prove registry pulls or the digest
identity of a real release; those are covered by the launcher checks and the protected
publication workflow.

## Initial Account registration

An empty instance accepts its first Account only with `EIMIR_BOOTSTRAP_TOKEN` from the
untracked environment.

1. Generate a random value of at least 32 characters.
2. Put it only in the target `.env`.
3. Deploy and complete the first registration.
4. Remove the bootstrap token and run the released launcher `deploy` again to recreate
   the affected runtime with the token absent.
5. Add further Accounts through the normal invitation flow.

The bootstrap token must not enter repository files, screenshots, support requests or
shell history.

Self-Hosted has no invitation-free self-service registration. The Cloud/Managed signup
endpoints (`/api/v1/auth/signup/*`) reject every request on a Self-Hosted instance with
`403 AUTH_METHOD_DISABLED`, also when mail delivery is configured, and
`/api/v1/instance/status` reports `accountCreation: invitation`.

## Reverse proxy and public exposure

The TLS reverse proxy is the only public endpoint and routes one public origin:

| Path | Internal target |
|---|---|
| `/api/` | API on `API_PORT` |
| all other paths | Web on `WEB_PORT` |

Same-host secure default:

```dotenv
EIMIR_BIND_IP=127.0.0.1
API_PORT=8000
WEB_PORT=8080
```

For a proxy on another private host, bind only the intended private address and set the
exact proxy source in `TRUSTED_PROXY_IPS`. Never use `*` for trusted proxies or Production
allowed hosts.

The `/api/` route must go directly to the API rather than through Web Nginx, otherwise
the trusted TLS proxy hop is lost for `X-Forwarded-*` handling.

## Post-deploy verification

The release smoke helper verifies Web health/revision, API/database readiness and API
revision:

```bash
python3 scripts/deployment_smoke.py \
  --base-url https://eimir.example \
  --expected-revision <release-source-sha>
```

With `EIMIR_SMOKE_EMAIL` and `EIMIR_SMOKE_PASSWORD`, it also performs a non-destructive
password sign-in and membership read using an operator/fictional smoke Account.

After a successful released deployment, raw Compose is acceptable for diagnosis only,
for example:

```bash
docker compose --profile self-hosted --env-file .env ps
docker compose --profile self-hosted --env-file .env logs --tail=100 migrate api worker web
```

Do not replace the released launcher with raw Compose for Production pull, bootstrap or
startup. A healthy component serving a different revision than the release manifest is a
failed promotion.
