# Cloud/Managed Account-deletion authority bootstrap

**Status:** binding operational supplement to `CLOUD-MANAGED-TOPOLOGY.md` §3.5

**Related:** #520, #521, #524, #646, #647, #652, #666

Cloud/Managed reuses the same forward-only Account-deletion authority as
Self-Hosted. The journal contains minimal pseudonymous recovery metadata and is
independent of PostgreSQL point-in-time backups so a restore that predates an
accepted deletion cannot make that Account usable again. This supplement fixes
the bootstrap/startup boundary required by that recovery contract; it introduces
no Cloud-only deletion semantics and no second authority.

## 1. Provisioning is an explicit one-shot control-plane action

For a Production environment that has **never had an Account-deletion authority**,
provision the final shared, POSIX-lockable deletion-journal volume **before any
normal API replica is routed traffic**. This may be a new environment or an
existing environment crossing the explicit authority-provisioning boundary for
the first time. Run the immutable backend release image as a one-shot job with:

- the final shared deletion-journal volume mounted at
  `/var/lib/eimir/deletion-journal`;
- `EIMIR_ACCOUNT_DELETION_JOURNAL_PATH` set to
  `/var/lib/eimir/deletion-journal/account-deletions.journal`;
- no `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` configured;
- command:

```text
python -m eimir.identity.deletion_bootstrap --confirm-new-installation
```

The job creates the empty journal exactly once and prints the generated
`EIMIR_ACCOUNT_DELETION_INSTANCE_ID`. Store that UUID in the managed platform's
protected configuration and backup it independently with the rest of the
operator configuration before deploying normal `api`/`worker` replicas.

The bootstrap refuses to run if an instance ID is already configured or if a
journal is already present. The operator must not bypass those guards by clearing
an established environment's configuration.

## 2. Normal rollout/startup never provisions authority state

After bootstrap, every normal Production API startup has only two allowed
outcomes:

1. the configured journal exists, validates completely, belongs to the exact
   configured instance UUID, and its tombstones are replayed before traffic; or
2. startup fails closed.

Normal runtime does not create the journal directory, does not synthesize a new
empty journal, and does not derive deletion history from PostgreSQL. Missing,
corrupt, truncated, unreadable, or foreign-instance journals are rollout
blockers. Production without an explicitly bootstrapped instance ID is also a
startup failure.

This applies per API replica. Readiness/load-balancer routing must therefore stay
closed until that replica has completed startup reconciliation successfully.

## 3. Missing journal on an established environment is recovery, not bootstrap

If `EIMIR_ACCOUNT_DELETION_INSTANCE_ID` is already part of the environment but the
journal file or shared volume is missing, the environment is established and its
authority artifact has disappeared. Do **not** run the bootstrap command, rotate
the UUID, create an empty volume as a replacement history, or infer safety from
current PostgreSQL rows.

Keep normal writers and ingress stopped. Recover the newest independently
protected journal that belongs to the configured instance UUID, validate it, then
perform the documented restore reconciliation before resuming traffic. If that
authoritative artifact cannot be recovered, the recovery contract cannot prove
that an older database backup is safe to serve, so startup remains failed.

## 4. Restore ordering

A Cloud/Managed restore that can predate accepted deletions follows this order:

1. stop normal API/worker writers and ingress;
2. restore PostgreSQL/media to the selected recovery point;
3. attach/recover the newest protected deletion journal and stable instance UUID;
4. migrate the database to the current schema;
5. validate and replay the forward journal against the restored database;
6. verify readiness/revision/recovery evidence;
7. only then resume writers and route traffic.

A pre-deletion database restore plus a **missing** journal must fail at step 3 and
must never reach step 7. The same restore plus the **valid newer** journal must
reapply its tombstones before writers resume.

## 5. Durability and privacy classification remain unchanged

The §3.5 topology requirement still applies: all API replicas that can accept a
self-service deletion must see the same durable file with correct cross-client
`fcntl` locking.

The journal is **minimal pseudonymous recovery metadata**: it contains only the
stable instance UUID, stable Account UUID, irreversible acceptance timestamp, and
hash-chain integrity/version metadata required by the recovery purpose. It is
content-free and data-minimized, but not identity-free: the stable Account UUID and
timestamp can still be linked to an Account in the system/recovery context. Treat
the artifact as protected, recovery-sensitive authority state rather than as
ordinary non-personal operational metadata.

No email address, display name, Space ID/content, partner ID, token, credential,
attachment metadata, `ProtectedPayload`, `OWNER_ONLY` payload, or other
relationship/private content is added by bootstrap or reconciliation. This absence
of private content must not be restated as an assertion that the journal contains
zero account-linkable or pseudonymous metadata.
