# Self-Hosted Account-deletion authority

**Status:** binding operational supplement to `SELF-HOSTED-RECOVERY.md`

**Related:** #520, #644, #190, #666

eimir. Account deletion uses a forward-only deletion journal containing
minimal pseudonymous recovery metadata outside the point-in-time PostgreSQL
backup. That separation is intentional: restoring a database backup created
before an accepted deletion must never resurrect the Account, its credentials,
sessions, or `OWNER_ONLY` data.

## 1. Bootstrap the authority exactly once

A normal Self-Hosted installation needs one stable deletion-authority UUID and
one matching forward journal. They are created together by an explicit one-time
provisioning step whenever the installation has **never had a deletion authority
before**. This includes a new installation and an existing installation upgrading
from a release that did not yet require explicit deletion-authority provisioning.
Production normal traffic must remain stopped until that provisioning step is
complete.

Do not pre-generate `EIMIR_ACCOUNT_DELETION_INSTANCE_ID`. Leave it unset and run:

```bash
docker compose --profile self-hosted --env-file .env run --rm --no-deps api \
  python -m eimir.identity.deletion_bootstrap \
  --confirm-new-installation
```

The `--confirm-new-installation` flag confirms that **no prior Account-deletion
authority exists for this installation**. It does not require the PostgreSQL
installation itself to be empty or newly created.

Arcane uses the same repository-root `compose.yaml` and `self-hosted` profile; it
does not have a separate Arcane Compose manifest. Run the same `api` one-off
against the actual Arcane project environment so it uses that project's
`COMPOSE_PROJECT_NAME`, remote build contexts, and `deletion_journal_data` volume.
If those values are managed by Arcane rather than the project's `.env`, use
Arcane's one-off/exec environment instead of running a host-side Compose command
that would silently fall back to different defaults.

The command creates the empty journal in the mounted `deletion_journal_data`
volume and prints exactly one new value:

```dotenv
EIMIR_ACCOUNT_DELETION_INSTANCE_ID=<stable-instance-uuid>
```

Store that value in `.env` and in the protected operator configuration backup
before normal startup. Keep it stable across application upgrades, container
recreation, and database/media restores. Development and Production must use
different values. Do not derive it from an Account ID, Space ID, database
credential, hostname, or another secret.

The bootstrap command refuses to run when an instance ID is already configured or
when a journal already exists. This is the control-plane distinction between a
never-provisioned deletion authority and an established deletion authority. If an
established instance loses its journal, **do not unset the instance ID and do not
bootstrap a replacement**. Recover the newest independently protected journal
instead.

The UUID is not a credential, but it is part of the recovery identity and belongs
in the protected operator configuration backup. A journal from another instance
must not be accepted merely because its format is valid.

## 2. The forward-only journal is a separate recovery unit

Canonical Compose mounts the private named volume:

```text
deletion_journal_data -> /var/lib/eimir/deletion-journal
```

The journal file is:

```text
/var/lib/eimir/deletion-journal/account-deletions.journal
```

Privacy classification is explicit: the journal is **minimal pseudonymous
recovery metadata**. It is content-free, but it is not identity-free or ordinary
non-personal operational metadata. Each tombstone contains a stable Account UUID
and irreversible acceptance timestamp that can still be related to an Account in
the system/recovery context. The journal is therefore recovery-sensitive and must
remain protected even though it contains no relationship content, email address,
display name, Space ID, partner ID, token, credential, `ProtectedPayload`, or
`OWNER_ONLY` payload. Its schema remains data-minimized to the fields required for
restore-safe deletion and integrity validation.

This unit is deliberately separate from:

- PostgreSQL;
- `LocalMediaStore` / S3 objects;
- ordinary application configuration and secrets.

It must never be treated as a point-in-time data snapshot that may be rolled back
together with PostgreSQL. Once a tombstone has been accepted, every recovery
point that can still restore older application data must remain paired with a
journal state at least as new as that tombstone.

Use operator-controlled backup/versioning that preserves the newest validated
journal. Do not replace a newer journal with an older backup. Retain the forward
journal until every database/media backup from before the represented deletions
has expired and can no longer be restored.

## 3. Normal startup only validates and replays

The public self-service API follows one fixed order:

1. reject Demo mode and validate the authenticated caller;
2. append/fsync or idempotently read the forward tombstone;
3. commit fail-closed Account/session state plus one PostgreSQL convergence job;
4. attempt one best-effort confirmation mail;
5. let the normal worker converge Core -> Media -> Async -> `COMPLETED`.

The client may disconnect after step 3. Deletion no longer depends on Web or
Android remaining open.

There is an unavoidable process-crash boundary between the filesystem fsync and
the PostgreSQL commit. API startup therefore validates/replays the configured
journal before normal traffic is served. Normal runtime **never** creates the
journal or its parent directory.

Fail-closed cases include:

- `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` is configured but the expected journal is
  missing;
- the journal is corrupt, truncated, unreadable, or belongs to another instance;
- a journal exists but the matching instance UUID is unavailable;
- Production starts without an explicitly bootstrapped deletion authority.

Development/test may omit the authority while Account deletion is not being used.
Production may not. Demo Accounts cannot use self-service deletion and remain the
separate exception described in §7.

## 4. Backup rules

The ordinary `scripts/self_hosted_recovery.py backup` archive intentionally
contains PostgreSQL plus durable local media only. It does **not** absorb the
forward journal, because doing so would make a later restore capable of rolling
accepted deletions backwards.

Protect these recovery units independently:

1. PostgreSQL + durable local media through the coordinated eimir. recovery
   archive;
2. the newest forward deletion journal through an operator-controlled protected
   copy/versioned store;
3. configuration/secrets, including the stable
   `EIMIR_ACCOUNT_DELETION_INSTANCE_ID`, through the operator secret/config backup.

For S3 media, follow the provider-specific consistency boundary in
`SELF-HOSTED-RECOVERY.md`; the forward deletion journal remains independent of the
object-store snapshot.

## 5. Restoring an older application backup

Normal API/worker traffic must remain stopped while an old backup is restored.
After PostgreSQL/media restoration, replay the newest protected journal before
starting writers:

```bash
EIMIR_RECOVERY_PROJECT=$(
  docker compose --profile self-hosted --env-file .env config --format json |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["name"])'
)

python3 scripts/self_hosted_deletion_reconcile.py \
  --compose-file compose.yaml \
  --env-file .env \
  --confirm-project "$EIMIR_RECOVERY_PROJECT" \
  --journal /secure/path/account-deletions.journal \
  --confirm-instance-id "$EIMIR_ACCOUNT_DELETION_INSTANCE_ID"
```

Arcane uses the same root `compose.yaml` and `self-hosted` profile; only its
Backend/Web source contexts differ through environment configuration.

The command:

- refuses to run while API, worker, migration, or Demo initialization writers are
  active;
- migrates the restored database to the current schema;
- validates the complete forward journal and exact instance UUID;
- replays deletion convergence before normal traffic may resume;
- leaves writers stopped so the rest of the recovery verification can finish.

A missing journal after restore is a recovery failure, not a bootstrap condition.
Never run `deletion_bootstrap` to make that failure disappear. The restored API
must remain stopped until the newest protected journal and its matching stable
instance ID have been recovered and validated.

Only after successful reconciliation, readiness/revision checks, and the remaining
`SELF-HOSTED-RECOVERY.md` acceptance steps may API and worker resume.

## 6. Destructive operator actions

Treat the deletion journal volume as recovery-sensitive deletion-safety state, not
disposable cache. In particular:

- `docker compose down -v` destroys the named journal volume along with other
  volumes and is unsafe while any pre-deletion backup remains restorable;
- recreating only the API container is safe because the named volume persists;
- changing `COMPOSE_PROJECT_NAME` creates a different named volume and therefore
  requires an explicit migration/recovery decision;
- moving to a new host requires transferring the newest journal and the matching
  instance UUID before the target may accept or reconcile deletions;
- never edit, truncate, compact, or hand-rewrite journal records to repair a
  recovery. Validation failures are fail-closed and require investigation.

## 7. Demo deployments

Demo Accounts cannot invoke self-service Account deletion. The server rejects Demo
mode before journal access or any irreversible side effect. A public Demo therefore
does not need a deletion-authority UUID solely for Demo Account deletion.

Do not weaken this by assigning Demo-user email/name heuristics or by sharing the
normal Production deletion journal with the Demo deployment.
