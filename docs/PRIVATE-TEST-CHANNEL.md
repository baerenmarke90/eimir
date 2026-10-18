# Private Cloud test channel in Arcane

Owner: #1351. This opt-in channel updates the existing `eimir-test` instance.
It is a private prerelease integration service with production runtime hardening,
not a public Demo or a supported product release. Released Production continues
to use [the protected promotion workflow](DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md).
Android APK publication remains the separate #1331/#1332 channel.

## Automatic publication

After a push to `main`, the private-channel jobs in `.github/workflows/release-publish.yml`:

1. Runs the channel contracts. Publication additionally requires the repository
   Actions variable `EIMIR_TEST_CHANNEL_ENABLED=true`, the owning repository and
   its `main` ref. Pull requests never receive publishing permissions.
2. Waits up to one hour for the exact revision's newest push runs of CI, Web
   Browser QA, CodeQL SAST, Self-Hosted Deployment Guard and Self-Hosted Recovery.
   Missing, pending, skipped, failed or cancelled workflows cannot admit a build.
   A newer `main` stops a waiting candidate.
3. Reuses Release Evidence with Android excluded: build-once runtime archives,
   hashes, SPDX SBOMs and verified attestations. Nothing builds on the Docker host.
4. Loads both archives, verifies source/version/platform labels, publishes to the
   existing GHCR backend/Web packages and checks the exact registry manifests and
   pulled-back image identities.
5. Publishes one generated commit on `deploy/eimir-test` after both images exist.
   Current `main` and CI are rechecked before promotion. Ref updates are never
   forced, so a concurrent writer is refused.
6. Arcane Git Sync picks up that commit and redeploys the whole project.

`channel.json` binds the source SHA, root Compose hash, evidence run, archive/SBOM
hashes and both OCI references. Generated `compose.yaml` is JSON (valid YAML and
Compose), exported from the canonical root Cloud profile. Only instance wiring
changes: existing resources, secret expressions, proxy aliases and image digests.
No second maintained topology, bootstrap/reset service, database container or
public host port is added. Canonical migration/readiness dependencies are retained.

## One-time GitHub setup

Merge the implementation PR through ordinary required checks. Then:

1. Under repository **Settings → Secrets and variables → Actions → Variables**,
   add `EIMIR_TEST_CHANNEL_ENABLED` with value `true`. It is not a secret.
2. Set the variable before merging to let the first main push publish the channel.
   For an immediate retry, run **Actions → Publish Immutable Release → Run workflow**,
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

## Connect Arcane once

Follow the upstream [Git Sync documentation](https://getarcane.app/docs/docker/git-sync)
for the installed Arcane version:

1. Add `https://github.com/baerenmarke90/eimir.git` under **Customization → Git
   Repositories**. Use a read-only repository credential if required.
2. Under the target environment's **Git Syncs**, add a **Pull** sync and select
   the **existing eimir-test project**, not a new project.
3. Branch: **deploy/eimir-test**. Compose path: **compose.yaml**.
4. **Sync Files: off**. This runtime needs no adjacent file or lifecycle hook;
   its local `.env` remains editable and is never published by this channel.
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
