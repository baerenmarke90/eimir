# Arcane Deployment

These notes supplement `SELF-HOSTING.md` for installations where Arcane manages the
eimir. stack and a separate TLS reverse proxy sits in front of it.

For persistent Development, release-candidate verification, Production promotion and
rollback, the authoritative workflow is
[`DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md`](DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md).
This document defines Arcane mechanics; it does not create a competing release policy.

For the opt-in private prerelease Cloud test instance, see
[Private Test Channel](PRIVATE-TEST-CHANNEL.md). It exports the canonical Cloud
profile into a generated digest-pinned Git Sync channel and does not replace
released Production promotion.

## One Compose file

Repository-root `compose.yaml` owns the one supported process topology. The
optional `deploy/push-fcm.compose.yaml` fragment adds only an explicitly enabled
sender file mount/settings to the existing API/worker roles; it adds no service,
network or store and is never required for default-off deployments.

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

## Optional push sender configuration

Push infrastructure belongs to the operator. Normal couples do not configure
Firebase, VAPID keys, credential files or distributor origins. Both transports use
the existing notification policy, digest, Quiet Hours and account-owned delivery
pipeline. Missing transport configuration leaves that transport unavailable;
partial requested configuration refuses API/worker startup.

UnifiedPush requires these values in the existing operator environment for either
Cloud or Self-Hosted:

```text
EIMIR_PUSH_VAPID_PRIVATE_KEY
EIMIR_PUSH_VAPID_SUBJECT
EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS
```

The subject is an operator `mailto:` or HTTPS contact. Allowed origins are a JSON
list of the actual HTTPS distributor origins, not a wildcard or a device-supplied
origin. Never paste the private VAPID key into Git, issue comments or diagnostics.

FCM is also default-off. To enable it, install the dedicated sender credential as
an existing **private regular file on the Docker host**, outside the checkout and
Git Sync directory. Set these operator inputs:

```dotenv
EIMIR_PUSH_FCM_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID
EIMIR_PUSH_FCM_ANDROID_PACKAGE=YOUR_ANDROID_APPLICATION_ID
EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE=/ABSOLUTE/PRIVATE/HOST/PATH/sender.json
```

The host-file variable is an operator mount input; it is not passed into the app.
The opt-in fragment fixes the application setting
`EIMIR_PUSH_FCM_CREDENTIALS_FILE=/run/secrets/eimir-fcm-sender.json`. The dedicated
service account must belong to the configured project and have the project-scoped
FCM sender role. The backend uses official Google OAuth credentials, never an
API key or a home-made JWT implementation. This path does not assume a configured
Workload Identity Federation source exists on the Docker host.

For a source-based operator project, combine the canonical file and the small
fragment explicitly. A configuration-only check (does not read the credential):

```bash
docker compose --env-file /ABSOLUTE/PATH/operator.env \
  --file compose.yaml --file deploy/push-fcm.compose.yaml \
  --profile self-hosted config --quiet
```

Use the `cloud` profile for the Cloud topology. In Arcane, apply the same fragment
to the existing project before Deploy/Redeploy; preserve all other environment,
volume, network, image and release-identity settings. Do not enable a profile that
creates another project. The fragment affects only `api`/`worker` and
`cloud-api`/`cloud-worker`; Web, migrations and release/bootstrap roles receive no
sender credential. Default canonical deployments require no host file. An explicit
opt-in with a missing host source refuses instead of creating a directory.

Released Production still uses the verified release's canonical Compose and
identity file and the existing `release-guard`. Do not replace those with a source
checkout or disable the gate to enable push. The immutable operator bundle ships
the matching optional fragment; do not mix it with another release. The supported
shell launcher includes it explicitly for validation and every deployment step:

```bash
python3 scripts/self_hosted_release.py --env-file .env --with-fcm validate
python3 scripts/self_hosted_release.py --env-file .env --with-fcm deploy
```

Use the same switch for `pull` or first-install `bootstrap-deletion-authority`
when FCM inputs are already configured. Configured FCM without the explicit switch
is refused before any operation. Validation sees the same file composition as
pull/migration/start; the published image identity and bootstrap rules are unchanged.

The backend runs as UID **10001**. Make the file readable by that runtime UID or
an appropriate restricted group while keeping host directory/file access private;
do not use world-readable permissions. Both API and worker can read the same
read-only file. Verify effective owner/mode/readability without printing contents.
`create_host_path: false` and the read-only bind are defined once in the fragment;
the private-channel exporter compiles that same contract inline.

Never put credential JSON in an environment value, Compose text, an image/build
context, a Git URL, a command argument, a screenshot or a test artifact. Rotation
requires installing the replacement, recreating API/worker to discard cached
credentials, validating delivery, and only then revoking old sender authority.
Provider authorization failure must remain visible as a sanitized technical error;
it does not prove a device subscription is dead.

The private `eimir-test` Git Sync channel already inlines this opt-in mount; do
**not** add a second fragment or enable Sync Files there. Follow its exact setup,
verification and recovery steps in [Private Test Channel](PRIVATE-TEST-CHANNEL.md).

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
`migrate`, so no application container of a refused release starts and no migration runs
unless the guard passes.

**Trust root.** The guard mounts the release's published `self-hosted-image-identity.json`
read-only (`./self-hosted-image-identity.json` next to `compose.yaml`; the operator bundle
ships it, a source checkout only ships an unreleased placeholder that is refused). It is
the same file, with the same checks, that the launcher reads. The expected images are read
from that record, never from the values being checked. With `EIMIR_ENVIRONMENT=production`
the guard refuses:

- a missing or non-SemVer `EIMIR_RELEASE_VERSION`, or one that differs from the identity's
  product version;
- an identity that is missing, unreadable, malformed, not a published Self-Hosted
  identity, or internally inconsistent (tag/version, digest/reference, roles);
- a backend or Web image reference that is not **exactly** the reference recorded in the
  identity: a tag-only, `latest`, local or source tag, another namespace, a swapped role
  and a well-formed, digest-pinned reference with a different digest are all refused;
- a `pull_policy` other than `always`;
- a missing or malformed `EIMIR_ACCOUNT_DELETION_INSTANCE_ID`;
- an active `bootstrap` profile next to the runtime (see the bootstrap section).

**Explicit environment.** The guard only accepts an explicit `EIMIR_ENVIRONMENT`.
`production` runs every check. `development`, `test` and `demo` are separate operator
identities and are not gated. An **unset or unknown** value (including `Production`) is
refused, so a Production project that lost its `EIMIR_ENVIRONMENT` cannot degrade to
Development. Development projects therefore set `EIMIR_ENVIRONMENT=development`
explicitly, as `.env.example` and `deploy/persistent-development.env.example` do.

The refusal is a failed `release-guard` container: read its log in Arcane. There are no
application `build:` fallbacks in the manifest and no source-build path.

### 1. Configure

1. Verify the release: `gh release verify "vX.Y.Z" --repo baerenmarke90/eimir`.
2. Create an Arcane project (for example `eimir-production`, separate from Development
   and Demo) from the release bundle `eimir-self-hosted-vX.Y.Z.tar.gz`. This does not
   require a shell on the Docker host: extract/download the bundle on the operator
   workstation, paste `compose.yaml` into Arcane's **Create Project** Compose editor,
   open **Workspace** before the first deploy, and upload
   `self-hosted-image-identity.json` beside it. Arcane stores both as project files.
   Do not edit either release file. Compose refuses to create the guard when the identity
   file is missing.
3. Start the project environment from `deploy/self-hosted-release.env.example` and set
   the instance values (database password, public origin, allowed hosts, cursor signing
   key, mail, storage).
4. Select the release with three values. Copy both references verbatim from the
   `self-hosted-image-identity.json` of the same release (the guard compares them with
   it):

   ```dotenv
   EIMIR_RELEASE_VERSION=X.Y.Z
   EIMIR_SELF_HOSTED_BACKEND_IMAGE=ghcr.io/baerenmarke90/eimir-backend:vX.Y.Z@sha256:<digest>
   EIMIR_SELF_HOSTED_WEB_IMAGE=ghcr.io/baerenmarke90/eimir-web:vX.Y.Z@sha256:<digest>
   ```

   Keep `EIMIR_ENVIRONMENT=production`; leave `EIMIR_SELF_HOSTED_PULL_POLICY` unset.

### 2. Bootstrap once (new installation only)

Only for a project that has **never had an Account-deletion authority**:

1. Leave `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` empty and set `COMPOSE_PROFILES=bootstrap`
   (**only** `bootstrap`).
2. **Deploy** the project. This starts the single one-shot
   `deletion-authority-bootstrap` from the release backend image: it applies the same
   release checks as the guard, creates the forward journal in `deletion_journal_data`,
   and prints `EIMIR_ACCOUNT_DELETION_INSTANCE_ID=<uuid>` in its log.
3. Store exactly that value in the Arcane project environment and in the protected
   operator configuration backup. Never generate the UUID yourself.
4. Set `COMPOSE_PROFILES=self-hosted` and continue with **Deploy**.

Behavior, all fail-closed and covered by tests:

| State | Result |
|---|---|
| Normal `self-hosted` Deploy/Redeploy | The bootstrap service is not part of the project and nothing depends on it; it never runs |
| `bootstrap` alone, no instance ID, no journal | Journal and ID are created once |
| `bootstrap` with an instance ID set | Refused: an established authority is never replaced |
| `bootstrap` with a journal present (also when the ID was lost) | Refused; recovery, not bootstrap: follow `ACCOUNT-DELETION-SELF-HOSTED.md` |
| `bootstrap` together with `self-hosted` in `COMPOSE_PROFILES` | Both halves refuse (the bootstrap must run alone; the guard refuses the runtime) |
| `self-hosted` without an instance ID | `release-guard` refuses and points to the bootstrap |
| Instance ID set but journal missing/corrupt | The API refuses to serve; restore the protected journal |

The mixed-profile refusal reads `COMPOSE_PROFILES`, which is how Arcane selects profiles.
Compose `--profile` command-line flags are not visible inside a container, so a shell
operator who combines both flags is not caught by that check; the bootstrap still refuses
whenever an instance ID or journal exists, so no second authority can be created.

### 3. Deploy and update

**Deploy** the project with `COMPOSE_PROFILES=self-hosted`. Arcane pulls the pinned
digests; the guard runs; then the sequence is
`postgres -> release-guard -> migrate -> api/worker -> web`.

What is guaranteed: no unsafe **new** application release starts successfully, migrations
run only after the guard passed, and data volumes are never removed by an ordinary
deploy/update.

What is not guaranteed: plain Compose replaces changed containers **before** it
evaluates their dependency gates. A refused or failed **Redeploy** can therefore leave
the previous release's `api`/`worker`/`web` stopped or replaced by a container that never
started, so availability is lost until the configuration is corrected (data untouched).
Correct the values, or restore the previous release's three values, and Redeploy again.
When the running release must keep serving while a refused migration or release is
rejected, use the launcher `deploy` (see below): it validates and runs `migrate` before
it replaces anything.

To move to a newer immutable release, replace the project's `compose.yaml` with the new
release's copy in Arcane's Compose editor and replace
`self-hosted-image-identity.json` through **Workspace → Upload File**. Then change the
three release values and **Redeploy**. No Docker-host shell is required. Any mismatch
between the version, the two references and the identity file is refused. Rollback is the
same operation with an older release; a release older than the database schema is refused
by `migrate` (see `SELF-HOSTING.md`).

| Situation | Result |
|---|---|
| Release image or digest missing, private or not pullable | Arcane's pull fails; there is no source-build fallback |
| Identity file missing | Compose refuses to create `release-guard`; nothing of the release starts |
| Tag-only, `latest`, local, different-digest or mismatched image reference | `release-guard` fails, `migrate` never starts |
| Version, references and identity file disagree | `release-guard` fails |
| `EIMIR_ENVIRONMENT` unset or unknown | `release-guard` fails |

### Shell-based alternative

The extracted bundle also contains the direct launcher, which stays supported for
operators who prefer a shell. It reads the same `self-hosted-image-identity.json`, fills
in the two references itself, validates before it pulls, and is the only path that runs
`migrate` before replacing running containers:

```bash
python3 scripts/self_hosted_release.py --env-file .env validate
python3 scripts/self_hosted_release.py --env-file .env deploy
python3 scripts/self_hosted_release.py --env-file .env bootstrap-deletion-authority
```

It uses the same `compose.yaml`, mounts the identity file it validated into the same
in-manifest guard, and so both paths judge one set of bytes. Do not point Arcane at a
Compose file that has the `release-guard` service removed or edited.

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
