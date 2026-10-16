# Self-Hosted Backup, Restore, and Upgrade

**Status:** authoritative operator contract for the canonical Compose deployment  
**Scope:** PostgreSQL 17 plus `LocalMediaStore`; S3 boundary documented separately  
**Related:** #190, #375, #520, `SELF-HOSTING.md`, `ACCOUNT-DELETION-SELF-HOSTED.md`, `DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md`

This runbook covers operational recovery of a complete eimir. Self-Hosted instance.
It is separate from the user-facing Transfer Bundle: an operational backup contains the
whole instance and preserves authentication, tenant, ownership, privacy and internal
state.

## 1. Recovery contract

A recoverable instance consists of four independently protected units:

| Unit | Backup mechanism | In coordinated data archive |
|---|---|---|
| PostgreSQL | PostgreSQL 17 `pg_dump --format=custom`; restore with `pg_restore --single-transaction` | yes |
| `LocalMediaStore` | exact durable object set from private `media_data` | yes |
| forward Account-deletion journal | newest validated forward-only state from `deletion_journal_data`; never rolled back with database/media | no |
| configuration and secrets | operator backup including stable deletion-authority UUID and selected release identity | no |

The coordinated archive contains every PostgreSQL row. Media contains only `READY`
attachments with a durable product binding, including required originals/thumbnails.
Temporary or unbound upload objects are deliberately excluded.

The forward Account-deletion journal is deliberately **not** part of the point-in-time
archive. It prevents an older database/media restore from resurrecting an Account whose
deletion was accepted later. Protect the newest validated journal independently and keep
its `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` with operator configuration.

The journal is content-free and data-minimized but still recovery-sensitive pseudonymous
metadata: Account UUID and acceptance time remain linkable in system/recovery context.
Treat it as protected authority state.

The backup helper quiesces normal writers by stopping API/worker, takes the database
dump, resolves durable media from that stable database, archives exactly that media and
restarts only writer services that were running before the operation. It rejects a
running migration/Demo initializer, missing media, non-local media adapter, unexpected
Compose project or existing output path.

The outer tar contains exactly:

- `manifest.json` with format version, source Alembic revision, object count and hashes;
- `database.dump` in PostgreSQL custom format;
- `media.tar` with validated generated storage paths.

It is created atomically with mode `0600`, but remains a complete copy of highly
sensitive relationship data. Encrypt before off-host transfer, restrict access, define
retention and test deletion.

## 2. Configuration and release-identity backup

Protect separately from the data archive:

- untracked `.env` / secret-manager entries;
- PostgreSQL credentials and stable cursor signing key;
- stable `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` and newest deletion journal;
- mail, OIDC, WebAuthn, S3 and other provider credentials/configuration;
- Compose project name and public origin;
- reverse-proxy, TLS, DNS, firewall and scheduler configuration;
- exact published product version, release source SHA and
  `self-hosted-image-identity.json`;
- the Self-Hosted operator bundle from that release;
- external backup encryption keys and restore instructions;
- the application encryption keys (`EIMIR_ENCRYPTION_KEYS`, `EIMIR_ENCRYPTION_ACTIVE_KEY_ID`),
  including every older key id the stored data is still wrapped under. The data archive
  contains ciphertext as stored and no keys; restoring it without these keys yields content
  that fails closed. See [ENCRYPTION-AT-REST.md](ENCRYPTION-AT-REST.md).

Do not store the archive next to an unencrypted decryption key. The one-time bootstrap
token is normally absent after initial registration and must not be restored as a
permanent credential.

## 3. Create a coordinated LocalMediaStore backup

Run from the operator bundle / operations checkout containing canonical `compose.yaml`
and the recovery helper. The environment must identify the actual project through
`COMPOSE_PROJECT_NAME`.

```bash
install -d -m 0700 /srv/eimir-backups

EIMIR_RECOVERY_PROJECT=$(
  docker compose --profile self-hosted --env-file .env config --format json |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["name"])'
)
EIMIR_RECOVERY_ARCHIVE="/srv/eimir-backups/eimir-$(date -u +%Y%m%dT%H%M%SZ).tar"

python3 scripts/self_hosted_recovery.py backup \
  --compose-file compose.yaml \
  --env-file .env \
  --confirm-project "$EIMIR_RECOVERY_PROJECT" \
  --output "$EIMIR_RECOVERY_ARCHIVE"
```

Keep the maintenance interval free of direct/operator database writers. API and worker
are unavailable while the stable snapshot is created.

A successful command proves archive structure, source revision capture and component
hashes at creation time. It does not prove offsite durability, encryption-key recovery,
retention or a later restore. Independently protect the newest deletion journal; never
roll that journal back when rotating coordinated archives.

## 4. Restore into a fresh target

Restore only into a new Compose project with empty PostgreSQL and `media_data`. Recover:

1. the selected **published** application release and its Self-Hosted operator bundle;
2. the matching operator `.env` / secrets;
3. the newest validated forward deletion journal and stable instance UUID;
4. the coordinated PostgreSQL/media archive.

Do not use `scripts/compose_checked.py` or another source-build path for released
Production recovery.

### 4.1 Prepare the released target

Select the exact published release in `.env`, including digest-qualified image refs from
its `self-hosted-image-identity.json` where strict locking is required.

Before starting application writers, the release-image identity can be validated/pulled
through:

```bash
python3 scripts/self_hosted_release.py --env-file .env pull
```

Start only PostgreSQL for the fresh restore target:

```bash
docker compose --profile self-hosted --env-file .env \
  up -d --wait --wait-timeout 120 postgres

EIMIR_RECOVERY_PROJECT=$(
  docker compose --profile self-hosted --env-file .env config --format json |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["name"])'
)
EIMIR_RECOVERY_ARCHIVE=/srv/eimir-backups/eimir-YYYYmmddTHHMMSSZ.tar
```

Then restore:

```bash
python3 scripts/self_hosted_recovery.py restore \
  --compose-file compose.yaml \
  --env-file .env \
  --confirm-project "$EIMIR_RECOVERY_PROJECT" \
  --archive "$EIMIR_RECOVERY_ARCHIVE" \
  --confirm-empty-target
```

The explicit project and empty-target confirmations are safety barriers. Restore verifies
member set, hashes, media count, regular-file-only storage paths, empty target state,
restored file set and Alembic revision. API and worker must remain stopped.

### 4.2 Mandatory Account-deletion reconciliation

Before API/worker startup, replay the newest protected forward journal into the restored
database. The helper migrates the restored schema and keeps normal writers stopped:

```bash
python3 scripts/self_hosted_deletion_reconcile.py \
  --compose-file compose.yaml \
  --env-file .env \
  --confirm-project "$EIMIR_RECOVERY_PROJECT" \
  --journal /secure/path/account-deletions.journal \
  --confirm-instance-id "$EIMIR_ACCOUNT_DELETION_INSTANCE_ID"
```

A missing, corrupt, foreign-instance or older substituted journal is not a condition to
bypass. Keep writers stopped and repair recovery inputs.

### 4.3 Start the restored published release

After successful deletion reconciliation, start the exact selected published release
through the mandatory Production launcher:

```bash
python3 scripts/self_hosted_release.py --env-file .env validate
python3 scripts/self_hosted_release.py --env-file .env deploy

python3 scripts/deployment_smoke.py \
  --base-url https://eimir.example \
  --expected-revision <published-release-source-sha>
```

The launcher validates that the selected backend/Web image identities match
`EIMIR_RELEASE_VERSION` before pull/start. It never rebuilds local source.

Also verify an authenticated shared-content read and owner-only path with fictional
operator accounts. A restore is accepted only when database readiness, deletion
reconciliation, tenant/owner assignments, privacy behavior, media bytes and both
application revision identities are correct.

If restore/reconciliation fails after writing target state, keep API/worker stopped.
Discard only the explicitly confirmed fresh target project's database/media volumes, fix
the cause and repeat from verified inputs. Never roll back the newer deletion journal to
make an old backup start.

## 5. Upgrade and rollforward

Before every Production upgrade:

1. record current published release/version/source SHA/OCI identity;
2. record candidate published release/version/source SHA/OCI identity;
3. create a coordinated PostgreSQL/media backup and protect configuration/secrets;
4. verify the newest forward deletion journal is independently protected;
5. know migrations between both releases and schema rollback compatibility;
6. verify candidate source and migrations in persistent Development;
7. publish the immutable release through the protected release workflow;
8. select that published release in Production `.env`;
9. run `scripts/self_hosted_release.py ... deploy`;
10. require readiness, revision parity, authenticated reads and affected media/job
    acceptance before declaring success.

The repository recovery gate exercises a reproducible prior schema, seeds tenant,
owner-only/shared/authentication/local-media state, migrates to current head and verifies
the application. It separately creates a current-schema backup, destroys source volumes,
restores fresh volumes and repeats integrity/authorization checks. Account-deletion
recovery acceptance proves a backup taken before deletion cannot resurrect the deleted
Account when the newer forward journal is replayed.

Run the base disposable exercise locally with:

```bash
python3 scripts/self_hosted_recovery_acceptance.py
```

CI proves the maintained migration chain, not every real database size, filesystem,
proxy/provider or maintenance duration. Measure real restore time on representative
infrastructure.

Alembic rollforward is the default recovery strategy. If an upgrade fails after a
compatible migration, prefer a forward fix. For an incompatible failed upgrade, use only
one reviewed path:

- tested corrective forward migration and compatible application;
- separately tested downgrade migration; or
- restore the verified pre-upgrade archive, replay the newest forward deletion journal,
  select the previous compatible **published** release identity and deploy it through the
  released launcher.

## 6. S3/object-storage boundary

`scripts/self_hosted_recovery.py` intentionally rejects `EIMIR_MEDIA_STORE=s3`. No
provider-neutral mechanism can promise an atomic snapshot across PostgreSQL and every
S3-compatible provider.

An S3-backed operator establishes a provider-specific coordinated procedure:

1. quiesce API, worker, migrations and other writers;
2. create the PostgreSQL custom dump;
3. create/identify an immutable object-store snapshot for the same quiesced point;
4. preserve bucket/prefix, object versions, region/endpoint, credentials, encryption keys
   and retention separately;
5. preserve the newest deletion journal independently;
6. restore database/objects into an isolated target and replay the forward journal;
7. deploy the selected published release through the launcher;
8. verify media availability, tenant/privacy behavior, readiness and release source SHA.

Bucket replication alone is not database consistency. A database-only backup is not
media recovery. Object versioning alone is not a tested restore. Provider snapshots,
managed backups, replication, retention, cost and support remain operator/provider
responsibilities until separately implemented and reviewed.

## 7. CI and release evidence

`.github/workflows/self-hosted-recovery.yml` is the repository recovery gate. It proves:

- archive format and tamper/path-traversal rejection;
- PostgreSQL + durable LocalMediaStore consistency;
- destruction followed by fresh restore;
- exact durable media and exclusion of temporary/unbound objects;
- Account/tenant/membership/owner/shared/owner-only invariants;
- authorization behavior through the current HTTP API;
- API/database/Web readiness and revision parity;
- rollforward from the reproducible prior schema;
- replay of a newer deletion journal against an older restored database before writers
  resume.

CI uses generated fictional data and a disposable project. It does not prove the
operator's real offsite archive, newest protected journal, secrets, S3/provider snapshot,
encryption-key custody, retention, hardware capacity, actual restore time or live
Production promotion. Those require recorded infrastructure evidence.
