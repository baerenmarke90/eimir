# Private Cloud test channel in Arcane

Owner: #1351. This opt-in channel updates the existing `eimir-test` instance.
It is a private prerelease integration service with production runtime hardening,
not a public Demo or a supported product release. Released Production continues
to use [the protected promotion workflow](DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md).
Android APK publication remains the separate #1331/#1332 channel.

## Automatic publication

After a push to `main`, the private-channel jobs in `.github/workflows/release-publish.yml`
are triggered by successful completions of the required main workflows:

1. Publication requires the repository
   Actions variable `EIMIR_TEST_CHANNEL_ENABLED=true`, the owning repository and
   its `main` ref. Pull requests never receive publishing permissions.
2. Checks once for the exact revision's newest push runs of CI, Web
   Browser QA, CodeQL SAST, Self-Hosted Deployment Guard and Self-Hosted Recovery.
   Missing, pending, skipped, failed or cancelled workflows cannot admit a build.
   An unfinished candidate exits without building; the next required workflow
   completion retries it. No runner waits for other workflows. Completion events
   must originate from an owning-repository main push and match the exact checkout;
   PRs, forks, other branches and superseded revisions cannot admit publication.
   A revision already selected on the channel is not rebuilt on duplicate events.
   Completion queues are separated by source revision and event origin, so a late
   older or fork completion cannot evict the current candidate. Final publication
   retains pending candidates, remains globally serialized, and rechecks current
   main and all required checks before it can advance the channel.
   Browser QA therefore runs for every main push, including backend-only and
   operator changes; pull-request browser path filters remain unchanged.
3. Runs the channel contracts, then reuses Release Evidence with Android excluded:
   build-once runtime archives, hashes, SPDX SBOMs and verified attestations.
   Nothing builds on the Docker host.
4. Loads both archives, verifies source/version/platform labels, publishes to the
   existing GHCR backend/Web packages and checks the exact registry manifests and
   pulled-back image identities. Docker pushes only `linux/amd64`, so containerd
   provenance indexes are not deployment references. The single registry
   manifest's config digest must match the exact config bytes in the verified
   build archive and a fresh pull-back save archive. Docker image IDs are not
   used as config digests because their meaning depends on the image store.
   Original evidence archives, SBOMs and GitHub attestations remain intact.
5. Publishes one generated commit on `deploy/eimir-test` after both images exist.
   Current `main` and CI are rechecked before promotion. Ref updates are never
   forced, so a concurrent writer is refused.
6. Arcane Git Sync picks up that commit and redeploys the whole project.

`channel.json` binds the source SHA, root Compose hash, evidence run, archive/SBOM
hashes and both OCI references. Generated `compose.yaml` is JSON (valid YAML and
Compose), exported from the canonical root Cloud profile. Only instance wiring
changes: existing resources, secret expressions, proxy aliases and image digests.
The FCM opt-in mount comes from the small canonical operator fragment and is
compiled inline; the generated channel still consists of the same three files.
No second maintained topology, bootstrap/reset service, database container or
public host port is added. Canonical migration/readiness dependencies are retained.

## One-time GitHub setup

Merge the implementation PR through ordinary required checks. Then:

1. Under repository **Settings → Secrets and variables → Actions → Variables**,
   add `EIMIR_TEST_CHANNEL_ENABLED` with value `true`. It is not a secret.
2. Set the variable before merging to let the first main push publish the channel.
   To retry after checks finish, run **Actions → Publish Immutable Release → Run workflow**,
   branch **main**, with **private_test_channel=true**, release version `0.0.0`,
   and **confirm_publish=false**. The private selector excludes all product-release
   jobs; the placeholder version is unused. Subsequent main pushes are automatic.
3. If package access is not inherited, grant this repository **Write** under the
   existing `eimir-backend` and `eimir-web` packages' Actions access settings.
   Only the publisher job requests package and channel-branch write permissions.
4. If a ruleset protects `deploy/eimir-test`, allow the channel publisher under
   that branch's policy. Do not relax `main` protections. A rejected branch write
   keeps the previous channel selected.
5. Confirm a successful publisher and the three files `compose.yaml`,
   `channel.json`, `README.md` on `deploy/eimir-test`; there must be no `.env`.

The workflow does not change package visibility. For private packages, configure
a read-only package credential in Arcane's Container Registries, never in Compose,
a Git URL or the application environment.

## Preserve the existing instance

Before linking Git Sync, retain the current Compose/environment and a coordinated
recovery point for PostgreSQL, media and the forward deletion journal. See
[Self-Hosted Recovery](SELF-HOSTED-RECOVERY.md). Redeploy is not database rollback.

Use the **existing** `eimir-test` project. Expected resources:

| Resource | Existing identity |
| --- | --- |
| Separate database project | `eimir-test-db` |
| Database network/alias | `eimir-test-data` / `eimir-test-postgres` |
| PostgreSQL role/database | `sidebyside` / `sidebyside` |
| Proxy network | `mailcow-proxy` |
| Media volume | `eimir-test_cloud_media_data` |
| Forward journal volume | `eimir-test_cloud_deletion_journal_data` |

Both application volumes are external: missing stores refuse deployment instead
of creating empty replacements. Keep the project, passwords, cursor key,
encryption keyring/active key ID and journal instance ID. Never bootstrap again.

The old operator Compose held some non-secret settings inline. Move those existing
values into Arcane's environment once using
[`private-test-channel.env.example`](../deploy/private-test-channel.env.example).
**Append missing values; do not replace the current environment with the example.**
Keep these existing values unchanged:

```text
POSTGRES_PASSWORD
EIMIR_SMTP_PASSWORD
EIMIR_MAIL_FROM
EIMIR_CURSOR_SIGNING_KEY
EIMIR_ENCRYPTION_KEYS
```

Add the current instance values for:

```text
EIMIR_PUBLIC_BASE_URL
EIMIR_ALLOWED_HOSTS
EIMIR_ENCRYPTION_ACTIVE_KEY_ID
EIMIR_ACCOUNT_DELETION_INSTANCE_ID
EIMIR_SERVER_ADMIN_EMAILS
EIMIR_WEBAUTHN_RP_ID
EIMIR_WEBAUTHN_ORIGINS
EIMIR_SMTP_HOST
TRUSTED_PROXY_IPS
```

Allowed hosts JSON includes the public hostname, `localhost` and `127.0.0.1` for
loopback readiness. WebAuthn origins use the exact public HTTPS origin. Values
are required rather than regenerated. Filled values, account emails, SMTP
credentials, keys and the journal UUID never enter the generated Git branch.

## Optional personal photo sources

The generated API/worker environment retains instance-local expressions for
`EIMIR_PHOTO_SOURCES_ENABLED` (default true), `EIMIR_GOOGLE_PHOTOS_CLIENT_ID`
and `EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET` (both empty by default). Publishing never
reads or freezes these operator values into Git. Existing local picking and
source disconnect remain available when new source tasks are disabled.

Append the existing approved Google Web OAuth app values to the existing Arcane
environment, without replacing any current key or setting. Register the exact
`${EIMIR_PUBLIC_BASE_URL}/api/v1/photo-sources/google/callback` redirect (one slash).
This is the product callback; the older standalone probe callback is separate.
Google stays hidden until configured and still requires the operator's appropriate
testing audience/verification. Personal Immich requires no shared operator key.
See [the source contract](product/integrations/1444-photo-source-delivery.md).
## Configure the selected live push transports

The `eimir-test` channel explicitly requires both UnifiedPush and FCM configuration
for #565. Generic canonical Cloud/Self-Hosted remains default-off; this selected
instance must not appear push-ready merely because an APK contains Firebase.
Append these operator inputs to its existing local environment:

```text
EIMIR_PUSH_VAPID_PRIVATE_KEY
EIMIR_PUSH_VAPID_SUBJECT
EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS
EIMIR_PUSH_FCM_PROJECT_ID=eimir-production
EIMIR_PUSH_FCM_ANDROID_PACKAGE=de.eimir.app
EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE=/ABSOLUTE/PRIVATE/HOST/PATH/sender.json
```

Use the actual private VAPID key/contact and an explicit JSON list of real HTTPS
distributor origins. A blank key or empty origins is not a live UP configuration.
The operator-owned Firebase project is `eimir-production`, configured under the
business account on 2026-11-01. Its public project number/sender ID is
`742745449123`; the approved new
Android package is `de.eimir.app`. This new installation does not imply deleting
an old app or its data.

Install the dedicated Google sender credential through the authorized private
operator channel. It must be a regular private host file outside the checkout/Git
Sync directory. The generated Compose maps that host source read-only to
`/run/secrets/eimir-fcm-sender.json` in **cloud-api and cloud-worker only**, fixes the
application `EIMIR_PUSH_FCM_CREDENTIALS_FILE` to that container path, and refuses to
create a missing host source. Web and migrate receive neither the file nor FCM
settings. The host-path input is not an application environment variable.

UID **10001** must be able to read the file; verify effective ownership and a
restricted file/group mode without printing bytes. Do not make it world-readable.
Never paste credential JSON into `.env`, Compose, Git, terminal arguments,
screenshots, issues, container images, CI logs or artifacts. The same sender file
is accessible to API and worker as an explicit operating boundary, although only
the worker sends. API registration and configuration reads perform no Google call.

The current adapter accepts a validated service-account credential file and does
not discover ambient ADC. The repository contains no evidenced ready-to-use WIF
setup for this host. A renewable host identity would require an explicitly reviewed
external-account configuration/loader path; GitHub workflow OIDC does not supply a
continuous Arcane runtime credential. The service account must belong to the
configured project; do not use a general Owner/Editor identity or a user's local ADC.

Keep **Sync Files off**. The publisher exports only unresolved operator expressions
and the compiled safe mount; it never reads a sender file or requires an adjacent
credential/helper file on `deploy/eimir-test`. Do not append the optional source
fragment again to this generated channel. If installation or authorization is not
complete, retain the last known running instance and leave rollout pending;
publication is not evidence that push is configured or delivered.

## Connect Arcane once

Follow the upstream [Git Sync documentation](https://getarcane.app/docs/docker/git-sync)
for the installed Arcane version:

1. Add `https://github.com/baerenmarke90/eimir.git` under **Customization → Git
   Repositories**. Use a read-only repository credential if required.
2. Under the target environment's **Git Syncs**, add a **Pull** sync and select
   the **existing eimir-test project**, not a new project.
3. Branch: **deploy/eimir-test**. Compose path: **compose.yaml**.
4. **Sync Files: off**. This runtime needs no adjacent file or lifecycle hook;
   its local `.env` and separately installed private host credential remain outside
   the sync and are never published by this channel.
5. **Auto Sync: on**, interval **5 minutes**. **Redeploy After Sync: on**.
6. Save and inspect the first deployment. Connect only after the preserved
   environment and exact trusted proxy setting are ready.

The first pull replaces the local Compose. Service names and existing stores
remain the same. The separate database project and NPM are outside the sync.
Keep NPM routing to `eimir-test-web:8080` and `eimir-test-api:8000`.

**Sync from Git** updates immediately. For manual control, leave Auto Sync off
and sync when convenient. Redeploy the whole project; do not independently
update the three backend roles. Generic image auto updates do not advance pinned
digests; this Git channel selects the complete version pair.

## HTTPS_REQUIRED

The API trusts forwarded HTTPS headers only from its configured proxy hop. If
public HTTPS returns `HTTPS_REQUIRED`, inspect NPM's current source IP on
`mailcow-proxy` in Arcane and put that exact address into `TRUSTED_PROXY_IPS`.
Confirm NPM sends `X-Forwarded-Proto $scheme` directly to the API. Do not trust `*`
or the whole shared Mailcow subnet. Keep API calls out of the Web proxy hop.

NPM's IP may change after recreation unless its address is deliberately stable.
Check the hop when recreating NPM. New application images cannot repair a wrong
proxy address.

## Verify and recover

After migration and API health succeed in Arcane:

```bash
python3 scripts/deployment_smoke.py \
  --base-url https://YOUR-TEST-HOST \
  --expected-revision SOURCE-SHA-FROM-CHANNEL-JSON
```

This checks Web/API revisions and database readiness. Cloud sign-in and native
email-link acceptance still require the real user journey; the password smoke
option is not supported in Cloud mode.

A successful publisher means the image pair and Git configuration exist. It does
**not** attest that a private Arcane instance pulled/deployed it. Arcane events,
container logs and public smoke establish that boundary. Partial/stale builds or
branch races cannot advance a partial pair. Registry outage may prevent pulls;
the server never rebuilds source.

Push acceptance additionally requires the selected signed `de.eimir.app` APK and
real FCM/UP end-to-end evidence through an existing notification-producing action.
Distinguish configured transport, accepted provider request, received wake and
displayed/tapped notification. Record exact source/image/APK/signing identity,
transport/distributor, Android version and scenario; never include raw FIDs,
subscriptions, activation IDs or credentials. Cover background/process restore,
target refresh, Account/API/provider change, permission denial/re-enable,
disable/signout, stale/duplicate wake, Quiet Hours/digest, privacy/membership
rechecks, provider failure and recovery. No force-stop or 100% delivery promise.

For sender rotation, install replacement authority, recreate API/worker to replace
cached credentials, verify auth and actual delivery, then revoke the old authority.
Keep the encryption keyring and existing stores untouched. Urgent revocation may
cause sanitized send failures while in-app notifications remain accessible;
restoring authority does not require a database reset. FCM and UP reuse the same
queue/policy and do not imply new events, analytics or a public Cloud launch.

Plain Compose redeploy may stop the old app before a failed migration is reported.
No zero-downtime or automatic database rollback/restore is promised. Pause Auto
Sync before recovery. Previous channel commits retain exact image references;
select one only if compatible with the current schema, otherwise use a tested
forward fix or coordinated restore. Retain referenced GHCR digests for recovery.

## Reuse and business review

Reuse: OCI/GHCR, existing Release Evidence/attestation, Compose's resolver, GitHub
Actions/Git Data and Arcane Git Sync. Only eimir-specific trust checks, instance
wiring and atomic promotion require code; no new runtime service/dependency.
GitHub build minutes, artifact retention and registry storage are operator costs
under GitHub service terms. Arcane and Compose remain the existing replaceable
tools under their upstream licenses. Only source/image/build metadata flow to
GitHub; runtime data and secrets stay local to the operator.

No business/freemium impact: no Free/Core or Premium classification, entitlement,
quota, ownership, export or downgrade behavior changes. No end-user provider
setup is added. Released Self-Hosted/Production contracts remain unchanged.


## Optional automatic recap wording

The application channel forwards the optional `EIMIR_RECAP_AI_URL`,
`EIMIR_RECAP_AI_MODEL` and `EIMIR_RECAP_AI_TIMEOUT_SECONDS` expressions to API and
worker. Keep local inference in a separate Arcane project on `eimir-test-data`,
so an application Git Sync update does not remove an operator-added service.
The complete CPU-only setup, model download commands, fallback and disable path
are in [Local recap AI](LOCAL-RECAP-AI.md). No public model port or paid API is
required; existing application image/digest admission remains unchanged.
