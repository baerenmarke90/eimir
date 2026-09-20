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
- released Production consumes published digest-qualified GHCR images and is gated by
  the `release-guard` service inside that same manifest (Arcane Deploy/Redeploy), with
  `scripts/self_hosted_release.py` as the equivalent shell entry point;
- services, volumes, networks, health checks and startup dependencies remain one
  canonical contract.

Normal Self-Hosted ordering is:

```text
postgres -> release-guard -> migrate -> api/worker -> web
```

`release-guard` and `deletion-authority-bootstrap` are described under
[Released Production in Arcane](#released-production-in-arcane). `demo-init` is an
explicit Demo-only lifecycle service and is not part of normal Self-Hosted startup. Run
it on demand with
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

Released Production is managed from Arcane without a host shell. The operator path is:

```text
configure -> bootstrap once -> deploy / update
```

Released Production must **not** use remote Git build contexts as its deployment
identity and must not build backend/Web source on the Docker host. It uses the
canonical `compose.yaml` from the selected immutable GitHub Release and published GHCR
images only. Arcane's plain **Deploy** and **Redeploy** are supported: the release
checks live inside that `compose.yaml`, so they run on every deployment path.

### How the release gate works

`compose.yaml` contains a `release-guard` one-shot that runs from the selected backend
image and that `migrate` waits for. `api`, `worker` and `web` transitively wait for
`migrate`, so nothing starts, migrates or is replaced unless the guard passes. With
`EIMIR_ENVIRONMENT=production` it refuses:

- a missing or non-SemVer `EIMIR_RELEASE_VERSION`;
- a backend or Web image that is not the digest-qualified
  `ghcr.io/baerenmarke90/eimir-{backend,web}:v<version>@sha256:<digest>` reference of
  exactly that release (so no `latest`, branch/local/source tag, bare version tag, other
  namespace or swapped role);
- a `pull_policy` other than `always`;
- a missing or malformed `EIMIR_ACCOUNT_DELETION_INSTANCE_ID`.

The refusal is a failed `release-guard` container: read its log in Arcane. Application
`build:` fallbacks do not exist in the manifest and there is no source-build path.
Development (`EIMIR_ENVIRONMENT=development`) and Demo remain separate operator
identities; the guard does nothing there.

### 1. Configure

1. Verify the release: `gh release verify "vX.Y.Z" --repo baerenmarke90/eimir`.
2. Create an Arcane project (for example `eimir-production`, separate from Development
   and Demo) whose Compose file is `compose.yaml` from the release bundle
   `eimir-self-hosted-vX.Y.Z.tar.gz`. Do not edit it.
3. Start the project environment from `deploy/self-hosted-release.env.example` and set
   the instance values (database password, public origin, allowed hosts, cursor signing
   key, mail, storage).
4. Select the release with three values. Copy both references verbatim from the
   `self-hosted-image-identity.json` asset of the **same immutable release**:

   ```dotenv
   EIMIR_RELEASE_VERSION=X.Y.Z
   EIMIR_SELF_HOSTED_BACKEND_IMAGE=ghcr.io/baerenmarke90/eimir-backend:vX.Y.Z@sha256:<digest>
   EIMIR_SELF_HOSTED_WEB_IMAGE=ghcr.io/baerenmarke90/eimir-web:vX.Y.Z@sha256:<digest>
   ```

   Keep `EIMIR_ENVIRONMENT=production`; leave `EIMIR_SELF_HOSTED_PULL_POLICY` unset.

### 2. Bootstrap once (new installation only)

Only for a project that has **never had an Account-deletion authority**:

1. Leave `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` empty and set `COMPOSE_PROFILES=bootstrap`
   (**only** `bootstrap`, not together with `self-hosted`).
2. **Deploy** the project. This starts the single one-shot
   `deletion-authority-bootstrap` from the verified release backend image: it re-applies
   the release checks above, creates the forward journal in `deletion_journal_data`, and
   prints `EIMIR_ACCOUNT_DELETION_INSTANCE_ID=<uuid>` in its log.
3. Store exactly that value in the Arcane project environment and in the protected
   operator configuration backup. Never generate the UUID yourself.
4. Set `COMPOSE_PROFILES=self-hosted` and continue with **Deploy**.

The bootstrap cannot replace an authority: it refuses when
`EIMIR_ACCOUNT_DELETION_INSTANCE_ID` is set or a journal already exists, so re-running it
is harmless. Without an instance ID the `self-hosted` deployment is refused by the guard
and the API refuses to serve. If the project already had an authority and its journal is
missing/corrupt, this is a recovery failure, not a bootstrap opportunity. Do not clear the
instance ID or initialize a replacement journal; follow
`ACCOUNT-DELETION-SELF-HOSTED.md` and recover the newest protected journal.

### 3. Deploy and update

**Deploy** the project with `COMPOSE_PROFILES=self-hosted`. Arcane pulls the pinned
digests; the guard runs; then the sequence is
`postgres -> release-guard -> migrate -> api/worker -> web`. An unsafe release never
starts: a refused guard or failed migration stops the sequence before `migrate`/`api`/
`worker`/`web` of the new release run.

Plain Compose replaces changed containers **before** it evaluates their dependency
gates. A refused **Redeploy** can therefore leave the previous release's containers
stopped (data volumes untouched) until the configuration is corrected. Correct the
values (or restore the previous release's three values) and Redeploy again. Where the
running release must keep serving while a migration runs or is refused, use the launcher
`deploy` (see below): it runs the identical checks and `migrate` before it replaces
anything.

To move to a newer immutable release, change only the three release values (version and
both digest-qualified references, from the new release's
`self-hosted-image-identity.json`) and **Redeploy**. Changing the version without the
references, or the references without the version, is refused. Rollback is the same
operation with an older release; a release older than the database schema is refused by
`migrate` (see `SELF-HOSTING.md`). Named data volumes are never removed by an ordinary
deploy/update.

| Situation | Result |
|---|---|
| Release image or digest missing, private or not pullable | Arcane's pull fails; there is no source-build fallback |
| Tag-only, `latest`, local or mismatched image reference | `release-guard` fails, `migrate` never starts |
| Version and image references disagree | `release-guard` fails |
| Empty instance ID on `self-hosted` | `release-guard` fails and points to the bootstrap |
| Instance ID set but journal missing/corrupt | API refuses to serve; restore, do not bootstrap |

### Shell-based alternative

The extracted bundle also contains the direct launcher, which stays supported for
operators who prefer a shell and which additionally cross-checks the two references against
the published identity file itself:

```bash
python3 scripts/self_hosted_release.py --env-file .env validate
python3 scripts/self_hosted_release.py --env-file .env deploy
python3 scripts/self_hosted_release.py --env-file .env bootstrap-deletion-authority
```

It uses the same `compose.yaml` and therefore the same in-manifest guard. Do not point
Arcane at a Compose file that has the `release-guard` service removed or edited.

After deployment, run `scripts/deployment_smoke.py` against the public origin with the
exact source SHA from the published release manifest.

## Runtime environment and container recreation

Compose interpolation precedence matters: an explicitly defined process variable,
including an empty value, overrides `.env`. Arcane project variables must therefore not
contain stale/blank duplicates of non-empty runtime settings.

Because Arcane project variables reach Compose as process-level values, a stale
`EIMIR_ENVIRONMENT` or image variable there wins over the project `.env`. The in-manifest
guard judges exactly the values Compose renders, so such drift is refused rather than
silently deployed. The launcher additionally refuses a process `EIMIR_ENVIRONMENT` that
drifts away from the Production dotenv.

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

After changing runtime settings, use Arcane **Redeploy** (or the launcher `deploy`); both
recreate affected runtime containers without deleting named volumes. Do not use an Arcane
option that removes `deletion_journal_data`, `postgres_data`, or `media_data` during an ordinary
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
