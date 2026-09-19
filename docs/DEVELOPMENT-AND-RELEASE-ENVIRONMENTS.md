# Development and Release Environments

**Status:** authoritative operations contract for persistent Development and Production promotion  
**Scope:** Self-Hosted / Arcane / Docker Compose  
**Related:** #375, #519, #827, #304

This document defines how eimir. remains continuously developable after a real
Production instance exists. `ARCANE.md`, `SELF-HOSTING.md`, and environment templates
must point here rather than defining competing release rules.

## 1. Environment topology

| Environment | Purpose | Data | Runtime identity |
|---|---|---|---|
| Local / PR | developer feedback and automated validation | disposable/generated | feature/PR source, local image tags |
| Development | persistent integration, migration and release-candidate verification | fictional/test only | `main` or exact candidate SHA, source-built local images |
| Demo | public product demonstration and manual QA | canonical fictional demo data | independently deployed approved artifact |
| Production | supported service with real user data | real | exact published release/image identity |

The public Demo from #304 is **not** staging and is not a substitute for Development.
Development, Demo and Production never share PostgreSQL/media stores, secrets, sessions,
signing keys, authentication callbacks, provider credentials, or Compose projects.

## 2. Non-negotiable isolation

Persistent Development has its own:

- Compose/Arcane project name;
- PostgreSQL volume and credentials;
- media volume or S3 bucket/prefix and credentials;
- cursor signing key;
- bootstrap/admin credentials;
- authentication callback configuration;
- provider credentials;
- session state and fictional user accounts.

Production data is not a Development fixture. Routine copying of Production database or
media into Development is prohibited. Any incident-specific use of Production-derived
data requires a separate minimization/anonymization and privacy review.

Before promotion, use `scripts/check_environment_isolation.py` where both environment
files are available. The check compares isolation-sensitive configuration without
printing secret values.

## 3. One canonical Compose manifest

No new orchestrator is introduced for v1. Every Compose runtime uses the single
repository-root `compose.yaml`.

- Local/persistent Development builds local application images first with
  `scripts/build_self_hosted_source.py`, then runs `compose.yaml` profile `self-hosted`.
- Verified source acceptance uses `scripts/compose_checked.py`, which exports exact
  committed source, builds local images and runs that exported canonical manifest.
- Released Self-Hosted Production uses published versioned/digest-qualified OCI images
  and is operated through `scripts/self_hosted_release.py`.
- Development database only uses profile `dev-db`.
- Cloud/Managed uses profile `cloud` with immutable digest-qualified release images.

Both source-build helpers reject Production. There is no supported target-host source
build path for a released Self-Hosted installation.

Normal Self-Hosted ordering is:

```text
postgres -> migrate -> api/worker -> web
```

`demo-init` is profile `demo` and is not part of ordinary Self-Hosted startup; it is run
explicitly for a Demo deployment. `migrate` must succeed before API/worker, and Web waits
for API readiness. The released launcher runs `migrate` before it replaces any running
service, so a refused or failed migration leaves the current release serving. Production
is never the first persistent environment to execute a new migration. The per-service
keep/demo-only decisions and the upgrade/rollback guarantees are recorded in
[`SELF-HOSTING.md`](SELF-HOSTING.md#runtime-topology).

## 4. Local and persistent Development

### 4.1 Source image build boundary

Development may build from the local checkout or remote Git contexts, but Compose itself
remains image-only for application services.

The local template uses:

```dotenv
EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-local
EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-local
EIMIR_SELF_HOSTED_PULL_POLICY=never
EIMIR_BUILD_REVISION=unverified-local-checkout
```

Build then start:

```bash
python3 scripts/build_self_hosted_source.py --env-file .env
docker compose --profile self-hosted --env-file .env \
  up -d --wait --wait-timeout 300
```

The builder creates backend/Web images only. It does not create another Compose manifest,
refuses Production declared by either dotenv or process environment, rejects registry
release identities as source-build output tags, and rejects credential/query-bearing
remote source URLs before they can enter diagnostic output.

### 4.2 Persistent Arcane Development

Create a dedicated Arcane project, for example `eimir-development`, separate from
Production and Demo. Start from `deploy/persistent-development.env.example`.

For ordinary integration it may follow `main`:

```dotenv
EIMIR_BACKEND_BUILD_CONTEXT=https://github.com/baerenmarke90/eimir.git#main:backend
EIMIR_WEB_BUILD_CONTEXT=https://github.com/baerenmarke90/eimir.git#main:web
EIMIR_BUILD_REVISION=main
EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-development
EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-development
EIMIR_SELF_HOSTED_PULL_POLICY=never
```

Run `scripts/build_self_hosted_source.py` in the workspace/build environment, then start
canonical `compose.yaml`. For release-candidate verification, pin both build contexts and
`EIMIR_BUILD_REVISION` to the same exact candidate SHA before rebuilding the Development
images.

### 4.3 Exposure policy

Persistent Development is private/internal by default. Accepted exposure models are:

1. loopback plus SSH/VPN;
2. a controlled private management/test network;
3. a protected TLS reverse proxy that is not an unrestricted public service.

Do not publish unrestricted Development merely for device testing.

## 5. Revision and artifact policy

Revision semantics differ by environment:

- PR/local: branch or PR source; not a published release;
- ordinary Development: `main` may float;
- release-candidate Development: exact candidate commit SHA;
- Production: exact **published release** identity.

Production no longer rebuilds the same Git revision. #519/#827 promote the already-built
backend/Web archives to GHCR and publish `self-hosted-image-identity.json`. Production
selects the published versioned image references or digest-qualified references from that
record.

The release identity chain is:

```text
product version -> Git tag -> source SHA -> release manifest -> artifact hashes -> OCI digests
```

The released Self-Hosted launcher validates the selected OCI image versions against
`EIMIR_RELEASE_VERSION` before pull/bootstrap/start. Matching backend/Web overrides cannot
silently select a different release version.

## 6. Deployed revision observability

Backend and Web carry source build identities so mixed releases cannot pass smoke.

API health responses include:

```text
X-Eimir-Revision: <source-revision>
```

Web exposes:

```text
/.well-known/eimir-revision
```

For Development source images both identities derive from `EIMIR_BUILD_REVISION`. For a
published release they derive from the source revision that produced the #193 archives.
Release smoke requires both identities to equal the selected release/candidate source
SHA. A healthy stale component is still a failed promotion.

## 7. Promotion gates

Production promotion is allowed only when all relevant conditions are true:

1. repository CI/security/privacy/reuse/supply-chain gates are green;
2. migration/schema-drift checks are green;
3. OpenAPI/generated clients are consistent when affected;
4. exact candidate source is deployed to persistent Development;
5. Development migration succeeds;
6. API readiness and Web health succeed;
7. Web/API source identities match the candidate SHA;
8. authenticated sign-in and one authenticated core read succeed;
9. affected manual paths are accepted where automation is insufficient;
10. worker behavior is checked when asynchronous work changed;
11. media read/write is checked when media behavior changed;
12. rollback/forward-fix implications of migrations are known;
13. repository recovery gates are green;
14. a fresh coordinated Production recovery point exists before migration;
15. the candidate is frozen/published through the protected release workflow;
16. Production deploys the **same published artifact identity**, not a rebuild;
17. Production is operated through the released launcher so image/version checks cannot
    be skipped by the documented startup path.

A failing Development deployment or release publication blocks Production promotion.

## 8. Smoke verification

Use:

```bash
python3 scripts/deployment_smoke.py \
  --base-url https://dev.eimir.example \
  --expected-revision <candidate-sha>
```

It verifies Web health/revision, API/database readiness and API revision. With
`EIMIR_SMOKE_EMAIL` and `EIMIR_SMOKE_PASSWORD`, it also performs password sign-in and a
non-destructive authenticated membership read.

Smoke credentials must be fictional/operator test credentials appropriate to that
environment and must not be committed.

After a successful deployment, host-level diagnosis may use raw Compose:

```bash
docker compose --profile self-hosted --env-file .env ps
docker compose --profile self-hosted --env-file .env logs --tail=100 migrate api worker web
```

Raw Compose is diagnostic only for released Production; it is not the supported
pull/bootstrap/start entry point.

## 9. Migration safety

Every new Alembic migration follows this order:

1. CI migration/schema-drift validation;
2. candidate deployment to persistent Development;
3. migration against Development's persistent database;
4. affected read/write acceptance;
5. backup and compatibility review;
6. protected release publication;
7. only then Production migration through the released launcher.

Do not describe application redeployment as a complete database rollback strategy. For
incompatible changes, use an explicitly tested forward fix/downgrade or restore the
verified pre-change recovery point with a compatible application release.

`SELF-HOSTED-RECOVERY.md` defines the PostgreSQL, LocalMediaStore,
configuration/secret and deletion-journal recovery contract.

## 10. Release and Production promotion

### 10.1 Freeze and publish

Do not manually create launch tags as a substitute for #519. Freeze the exact candidate
on `main` and execute `.github/workflows/release-publish.yml` through the protected
`production-release` environment.

The workflow produces the authoritative Git tag/GitHub Release, release manifest,
SBOM/attestation evidence, `self-hosted-image-identity.json`, and the small Self-Hosted
operator bundle containing canonical Compose, the release env template, launcher and
runtime checker.

### 10.2 First Self-Hosted Production installation

Extract the Self-Hosted operator bundle from the selected GitHub Release, copy the env
template, configure instance-specific values and select the product release:

```dotenv
EIMIR_ENVIRONMENT=production
EIMIR_RELEASE_VERSION=X.Y.Z
```

For strict locking, set the two digest-qualified references from the same release:

```dotenv
EIMIR_SELF_HOSTED_BACKEND_IMAGE=ghcr.io/baerenmarke90/eimir-backend:vX.Y.Z@sha256:<digest>
EIMIR_SELF_HOSTED_WEB_IMAGE=ghcr.io/baerenmarke90/eimir-web:vX.Y.Z@sha256:<digest>
```

On a brand-new installation, leave `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` blank initially
and run:

```bash
python3 scripts/self_hosted_release.py --env-file .env pull
python3 scripts/self_hosted_release.py \
  --env-file .env \
  bootstrap-deletion-authority
```

Store the emitted stable deletion-authority UUID in `.env` and protected operator
backup. Then:

```bash
python3 scripts/self_hosted_release.py --env-file .env validate
python3 scripts/self_hosted_release.py --env-file .env deploy
```

Production must not invoke `scripts/build_self_hosted_source.py` or
`scripts/compose_checked.py` and must not replace the launcher with raw Compose startup.

After deployment, confirm migration, readiness, Web health, and both source revision
identities against the published release manifest.

## 11. Rollback and recovery

Before every Production promotion record:

- current published Production release/version/source SHA and OCI identity;
- candidate release/version/source SHA and OCI identity;
- latest verified coordinated database/media recovery point;
- separately protected configuration/secrets/deletion journal;
- migrations introduced between releases;
- whether application rollback is schema-compatible.

If the candidate fails before an incompatible migration is committed, select the
previous-known-good **published** application/image identity, update `.env`, run the
released launcher again and repeat smoke verification.

If an incompatible schema change is already applied, do not blindly start the old image.
Choose a tested forward fix, downgrade migration, or coordinated restore per #190/#375.
Media compatibility is reviewed separately when formats/storage semantics changed.

## 12. Demo relationship

The public Demo remains independent:

```text
Local / PR -> Development -> published release -> Production
                  X
                  |
                Demo
```

Demo can receive an approved artifact for demonstration, but its health is not a
substitute for Development acceptance. Demo data/storage is never promoted to Production.

## 13. CI versus operator responsibility

CI owns deterministic repository checks: tests, migration/schema drift,
OpenAPI/client drift, security/privacy/reuse/supply-chain rules, Compose rendering,
source-build helper boundaries, released-launcher contracts, release-publication
contracts, revision parity, and deployment/recovery guards.

Operators own facts CI cannot prove from source alone: actual secret separation,
persistent Development health, external TLS/ingress, offsite backup/key availability,
real restore timing, provider-specific storage behavior, protected signing environment
configuration, release approval, and final Production promotion.

## 14. Completion evidence

Repository implementation does not prove infrastructure promotion by itself. The final
operational evidence must bind one exact candidate/release through:

```text
candidate source -> persistent Development -> migrate/smoke/accept -> protected release
publication -> exact published OCI identity -> released launcher -> Production ->
post-deploy smoke
```

Record the Development/Production source SHA, published release identity, image identity,
and successful smoke result when the exercise is actually performed.
