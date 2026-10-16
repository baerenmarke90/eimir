# M6 Operations and Recovery

**Workstream:** M6-B  
**Primary baseline:** delivered #190  
**Remaining launch owners:** #518, #520, #521, #522, #524

M6 does not create a new operational backup architecture. #190 already delivered the
repository-side Self-Hosted backup/restore/upgrade contract. This document records
what is reused and what still needs launch evidence.

## 1. Reused #190 contract

The authoritative Self-Hosted recovery baseline already covers:

- PostgreSQL 17 backup with `pg_dump` custom format and restore with `pg_restore`;
- coordinated quiescing of writes for database + `LocalMediaStore` consistency;
- exact durable LocalMediaStore keys/objects rather than temporary/unbound upload
  material;
- checksums and recovery evidence;
- protected operator configuration/secrets as a separate recovery requirement;
- restore into a fresh supported target;
- upgrade from the supported prior schema/release path;
- Alembic roll-forward as the default migration policy;
- explicit recognition that application rollback is not equivalent to schema
  rollback;
- S3 as a provider/operator recovery boundary rather than a hidden second Core
  backup implementation.

`docs/SELF-HOSTED-RECOVERY.md` remains the operational runbook source. M6 links to
it; it does not fork it.

## 2. Operational backup vs. Transfer Bundle

| Property | Operational backup (#190) | User Transfer Bundle (#345) |
|---|---|---|
| Purpose | restore a supported service instance | user portability/import |
| Scope | database, durable media, protected operator config/secrets as required | authorized portable Domain data/media only |
| Authorization | operator/recovery boundary | authenticated user + Space/privacy rules |
| `OWNER_ONLY` | may exist inside protected instance backup | only requesting owner's data in `PERSONAL`; never partner private data |
| Secrets | protected separately as operational recovery material | never exported |
| Restore target | complete service instance | authorized application import |
| Commercial status | operational trust; non-paywallable | essential portability; non-paywallable |

Neither artifact can substitute for the other.

## 3. Remaining G5 recovery gaps

### 3.1 Real launch-topology restore

Repository tests prove the recovery mechanics, but G5 requires target-relevant
operator evidence. #524 must execute restore/upgrade on the supported launch
topology.

For Cloud/Managed, #521 must state which managed database/object-storage snapshot or
backup mechanism is supported. A provider checkbox saying “backups enabled” is not
evidence until a restore has been exercised.

### 3.2 Recovery objectives

Before G5, record measured timings for:

- detection/decision start;
- backup/recovery-point availability;
- database restore;
- media restore/verification;
- application deployment/migration;
- readiness/smoke recovery.

These measurements describe the tested environment. They are not automatically a
contractual SLA/RPO/RTO promise.

### 3.3 Incident integration

#522 owns executable incident runbooks and one controlled recovery/rollback-or-
forward-fix drill. The drill must reuse #190/#375 rather than inventing emergency
SQL/host actions as the normal path.

### 3.4 Retention and complete deletion

Backup/restore is not a reason to leave live application data indefinitely.

- #518 owns Space/relationship offboarding and the lifecycle of Spaces without
  active Memberships.
- #520 owns complete Account deletion/retention, including what is hard-deleted,
  anonymized or narrowly retained.
- #520 must also define how restoring a backup created before an Account-deletion
  request re-applies deletion/tombstone/reconciliation so a restore does not silently
  resurrect active personal data.

The forward Account-deletion journal used for that reconciliation is **minimal
pseudonymous recovery metadata**: content-free and data-minimized, but not
identity-free because its stable Account UUID and acceptance timestamp remain
account-linkable in the system/recovery context. It is recovery-sensitive authority
state and must be protected independently of point-in-time database/media backups.

Historical backup retention remains an operator policy and must be bounded and
protected. Do not expose old backups as a user-accessible archive. Journal
retention remains bounded by the supported pre-deletion backup horizon plus the
operator's documented safety margin; a newer journal must never be rolled back to
match an older application snapshot.

## 4. Recovery units by operating model

### Self-Hosted

Required recovery units remain:

1. PostgreSQL;
2. `LocalMediaStore` durable data or the configured S3 provider recovery unit;
3. the newest validated forward Account-deletion journal as a separately
   protected, recovery-sensitive authority unit; it is not part of the coordinated
   point-in-time PostgreSQL/media archive;
4. protected configuration/secrets required to decrypt/validate/operate the
   instance, including the stable deletion-authority instance UUID;
5. exact known-good application release identity.

Operators may use established tools such as restic/rclone outside Core, but Core
does not depend on one backup vendor/tool merely to be restorable.

### Cloud/Managed

`docs/m6/CLOUD-MANAGED-TOPOLOGY.md` §6 (#521) maps the same logical units to the
selected managed platform:

1. managed PostgreSQL backup/restore;
2. media storage backup strategy, depending on the operator's `MediaStore`
   choice (`docs/m6/CLOUD-MANAGED-TOPOLOGY.md` §3.3): object-storage
   versioning/snapshot/export for `s3`, or volume-level backup/snapshot for a
   `local` persistent volume;
3. the #520 self-service Account-deletion journal as a separately protected
   forward-only recovery authority: preserve the newest validated journal, do not
   roll it back to the database/media recovery point, and replay it before writers
   resume;
4. managed secret/config recovery, including the stable deletion-authority
   instance UUID;
5. #519 immutable release identity;
6. coordination expectations between database and media recovery points.

Provider-specific mechanics stay at the deployment boundary. A provider snapshot
is not recovery evidence until `#524` has exercised an actual restore against
this topology.

## 5. Upgrade and rollback rules

The existing order remains binding:

```text
CI migration checks
  -> candidate on persistent Development
  -> migration + health + affected-path acceptance
  -> fresh Production recovery point
  -> immutable release promotion
  -> post-deploy smoke
```

For a failed release:

- if schema remains compatible, redeploy the previous known-good application
  release and smoke it;
- if schema is not backward compatible, do not blindly start old code;
- choose an explicitly tested downgrade, a forward fix, or restore the pre-change
  coordinated recovery point plus compatible application version.

Media format/key changes require the same compatibility review as schema changes.

## 6. S3/provider responsibility boundary

When S3-compatible storage is used:

- eimir. owns correct MediaStore keys, authorization and database/media
  consistency expectations;
- the operator/provider owns bucket durability/versioning/backup/export according
  to the supported deployment contract;
- credentials and signed URLs are not backup metadata exposed to users;
- G5 evidence must prove that the selected Cloud/Managed recovery method restores
  usable media together with the matching database state.

Do not implement a second application-level S3 backup engine unless later evidence
shows that provider/operator mechanisms cannot satisfy the supported contract and a
new Reuse-before-build decision approves it.

## 7. Failure classes that must be rehearsed

At minimum #522/#524 must cover or explicitly map:

- bad application release with compatible schema;
- failed/incompatible migration;
- PostgreSQL loss/corruption scenario in a controlled test environment;
- media-store unavailable or inconsistent recovery point;
- worker/job backlog after recovery;
- secret/config loss boundary;
- provider/entitlement dependency outage without corrupting Core data;
- restore of a state predating Account deletion.

Use fictional/synthetic data only.

## 8. G5 evidence outputs

Expected evidence links from this workstream:

- #190 automated repository recovery workflow/result;
- `SELF-HOSTED-RECOVERY.md` version/revision;
- #521 managed backup/restore contract;
- #522 incident drill record;
- #524 measured restore/upgrade/rollback evidence;
- #518/#520 versioned retention/deletion decisions;
- post-recovery API/Web revision/readiness smoke.

A closed #190 alone is not sufficient to mark the integrated G5 recovery criterion
`PASS`; #524 must show the supported launch topology was actually exercised.
