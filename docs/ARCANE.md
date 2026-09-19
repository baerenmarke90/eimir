# Arcane Deployment

These notes supplement `SELF-HOSTING.md` for installations where Arcane manages the
eimir. stack and a separate TLS reverse proxy sits in front of it.

For persistent Development, release-candidate verification, Production promotion and
rollback, the authoritative workflow is
[`DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md`](DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md).
This document defines Arcane mechanics; it does not create a competing release policy.

## One Compose file

eimir. supports exactly one tracked Docker Compose manifest: repository-root
`compose.yaml`.

Arcane uses that same manifest and the `self-hosted` profile. The distinction between
Development and released Production is **image origin and entry point**, not a second
topology:

- Development may build local images from Git with
  `scripts/build_self_hosted_source.py` and use local tags with pull disabled;
- released Production consumes published versioned/digest-qualified GHCR images and is
  validated/operated through `scripts/self_hosted_release.py`;
- services, volumes, networks, health checks and startup dependencies remain one
  canonical contract.

Normal Self-Hosted ordering is:

```text
postgres -> migrate -> api/worker -> web
```

`demo-init` is an explicit Demo-only lifecycle service and is not part of normal
Self-Hosted startup. Run it on demand with
`docker compose --profile self-hosted --profile demo run --rm demo-init`; do not add
`demo` to the project's default profiles (see [`DEMO-SPACE.md`](DEMO-SPACE.md)).

## Persistent Development in Arcane

Create a dedicated Arcane project, for example `eimir-development`, separate from
any Production or Demo project. Start from:

```text
deploy/persistent-development.env.example
```

For ordinary integration on `main`:

```dotenv
COMPOSE_PROFILES=self-hosted
EIMIR_ENVIRONMENT=development
EIMIR_SELF_HOSTED_BACKEND_IMAGE=eimir-backend:source-development
EIMIR_SELF_HOSTED_WEB_IMAGE=eimir-web:source-development
EIMIR_SELF_HOSTED_PULL_POLICY=never
EIMIR_BACKEND_BUILD_CONTEXT=https://github.com/baerenmarke90/eimir.git#main:backend
EIMIR_WEB_BUILD_CONTEXT=https://github.com/baerenmarke90/eimir.git#main:web
EIMIR_BUILD_REVISION=main
```

The build workspace/runner executes:

```bash
python3 scripts/build_self_hosted_source.py \
  --env-file deploy/persistent-development.env.example
```

Then Arcane starts/recreates canonical `compose.yaml`. The helper builds backend/Web
images only; it does not create another Compose manifest and refuses Production.

Before release acceptance, replace `main` in both source contexts and
`EIMIR_BUILD_REVISION` with the exact candidate commit SHA, rebuild Development images and
recreate the stack. API/Web source revision endpoints must both equal that SHA.

Development remains a separate project with unique database credentials, volumes/media,
cursor signing key, bootstrap/admin state, callbacks and provider credentials. Do not
import the Production environment wholesale.

## Released Production in Arcane

Released Production must **not** use remote Git build contexts as its deployment
identity and must not build backend/Web source on the Docker host.

Use the Self-Hosted operator bundle attached to the selected GitHub Release. It contains:

- `compose.yaml`;
- `deploy/self-hosted-release.env.example`;
- `scripts/self_hosted_release.py`;
- `scripts/check_runtime_environment.py`.

Copy the release env template to `.env` and select the published product version:

```dotenv
COMPOSE_PROFILES=self-hosted
EIMIR_ENVIRONMENT=production
EIMIR_RELEASE_VERSION=X.Y.Z
```

The canonical manifest resolves the matching versioned images. For exact transport
locking, use the digest-qualified references from the same release asset
`self-hosted-image-identity.json`:

```dotenv
EIMIR_SELF_HOSTED_BACKEND_IMAGE=ghcr.io/baerenmarke90/eimir-backend:vX.Y.Z@sha256:<digest>
EIMIR_SELF_HOSTED_WEB_IMAGE=ghcr.io/baerenmarke90/eimir-web:vX.Y.Z@sha256:<digest>
```

Both overrides must still match `EIMIR_RELEASE_VERSION`. Production keeps pull enabled. A
missing registry image is a deployment failure, not permission to compile local source.

### Production entry point

Do not configure Arcane to replace the release validation with a raw Compose startup.
The supported Production sequence is executed from the extracted release bundle:

```bash
python3 scripts/self_hosted_release.py --env-file .env validate
python3 scripts/self_hosted_release.py --env-file .env deploy
```

For a brand-new installation, the deletion authority must first be created through the
same launcher; see the next section.

Arcane may use its task/command facility to run the launcher on the Docker host before
or as the deployment action, but that facility must preserve the exact `.env`, project
name, Docker context and release-bundle files. The launcher's image/version guard is a
required part of Production promotion, not an optional diagnostic.

After deployment, run `scripts/deployment_smoke.py` against the public origin with the
exact source SHA from the published release manifest.

## Account-deletion authority bootstrap

For an Arcane Production project that has **never had an Account-deletion authority**,
leave `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` unset and run:

```bash
python3 scripts/self_hosted_release.py --env-file .env pull
python3 scripts/self_hosted_release.py \
  --env-file .env \
  bootstrap-deletion-authority
```

The launcher first validates the selected release-image identity and pulls the released
API image. The bootstrap command then creates the forward journal and prints the stable
`EIMIR_ACCOUNT_DELETION_INSTANCE_ID`.

Store exactly that emitted value in the Arcane project environment and protected
operator configuration backup. Never generate the UUID independently. After updating
`.env`, run:

```bash
python3 scripts/self_hosted_release.py --env-file .env deploy
```

If the project already had an authority and its journal is missing/corrupt, this is a
recovery failure, not a bootstrap opportunity. Do not clear the instance ID or initialize
a replacement journal; follow `ACCOUNT-DELETION-SELF-HOSTED.md` and recover the newest
protected journal.

## Runtime environment and container recreation

Compose interpolation precedence matters: an explicitly defined process variable,
including an empty value, overrides `.env`. Arcane project variables must therefore not
contain stale/blank duplicates of non-empty runtime settings.

The released launcher refuses a process `EIMIR_ENVIRONMENT` that drifts away from the
Production dotenv and validates application image identity before pull/start.

The shared runtime guard can additionally inspect rendered/running configuration from a
checkout or extracted release bundle:

```bash
ARCANE_PROJECT_DIR=/path/to/arcane-project
ARCANE_COMPOSE_PROJECT=eimir-production

python3 scripts/check_runtime_environment.py \
  --env-file "$ARCANE_PROJECT_DIR/.env" \
  --compose-file "$ARCANE_PROJECT_DIR/compose.yaml" \
  --profile self-hosted \
  --project-name "$ARCANE_COMPOSE_PROJECT"
```

For Production it rejects unsafe application image identity such as `latest`,
branch/local source tags, missing/mismatched `EIMIR_RELEASE_VERSION`, backend-role
divergence, application `build:` fallback or disabled pulling.

After changing runtime settings, use the released launcher `deploy`; it force-recreates
affected runtime containers without deleting named volumes. Do not use an Arcane option
that removes `deletion_journal_data`, `postgres_data`, or `media_data` during an ordinary
configuration/application update.

After recreation, runtime inspection remains available:

```bash
python3 scripts/check_runtime_environment.py \
  --env-file "$ARCANE_PROJECT_DIR/.env" \
  --compose-file "$ARCANE_PROJECT_DIR/compose.yaml" \
  --profile self-hosted \
  --project-name "$ARCANE_COMPOSE_PROJECT" \
  --check-running
```

The guard reports variable/service names, never compared secret values.

## Public and private repositories

Remote Git contexts used for **Development source builds** may require BuildKit/Arcane Git
authentication for private repositories. Do not embed credentials/tokens in Git URLs,
`compose.yaml`, or checked-in env templates. The source builder rejects credential- and
query-bearing source URLs before they can enter plan/log output.

Production pulls the released package identity instead of Git contexts. If registry
authentication is required, configure it in Docker/Arcane registry credentials; do not
add registry tokens to Compose, `.env`, release evidence, or support bundles.

Do not create another Compose manifest as an authentication or deployment workaround.

## Reverse proxy architecture

The reverse proxy is the only public TLS endpoint. On one public origin it routes:

| Path | Internal target |
|---|---|
| `/api/` | eimir. API on `API_PORT` |
| all other paths | eimir. Web on `WEB_PORT` |

The `/api/` route goes directly to the API. In Production it must not first pass through
Web Nginx because that would lose the trusted TLS proxy hop for `X-Forwarded-Proto`.

Same-host secure default:

```dotenv
EIMIR_BIND_IP=127.0.0.1
API_PORT=8000
WEB_PORT=8080
```

For a reverse proxy on another private host, bind only the intended private address and
set `TRUSTED_PROXY_IPS` to the exact proxy source IP/CIDR. Never use `*`.

## Post-deployment verification

From the reverse-proxy host/private network:

```bash
curl --fail http://<docker-host>:<WEB_PORT>/healthz
curl --fail http://<docker-host>:<WEB_PORT>/.well-known/eimir-revision
curl --fail --include https://eimir.example/api/v1/health/ready
```

For release acceptance prefer:

```bash
python3 scripts/deployment_smoke.py \
  --base-url https://eimir.example \
  --expected-revision <release-source-sha>
```

Both Web and API must report the exact published source SHA.
