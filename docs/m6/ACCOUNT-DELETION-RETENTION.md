# Account deletion and retention lifecycle

> **Note (#1009):** references to an Android/native cache or client in this document describe the retired Kotlin client. Android is now the Capacitor wrapper around the Web client; see [Reading older documents](../CAPACITOR-ANDROID-FOUNDATION.md#reading-older-documents).

**Version:** 1.0  
**Owner:** #520  
**Baseline:** `main` at `e9e175aab3eccb03ef392a21b53bcb89db4dfed2`  
**Status:** Phase-1 contract; runtime must implement this contract without turning Space offboarding into Account deletion.

This document freezes the M6-B-S2 deletion/retention boundary before destructive runtime work starts. It reuses the existing Identity, Membership, privacy, MediaStore, Jobs, Outbox, Transfer Bundle and recovery primitives. It does not create a ServerAdmin deletion shortcut, a second queue, a second export format or a second backup architecture.

## 1. Non-negotiable invariants

Three actions remain distinct commands and user journeys:

1. leaving one Space ends only that Membership;
2. ending a relationship/Space follows #518 and does not delete either Account;
3. deleting an Account is global across every Space and Account-owned datum.

Account deletion may reuse the same low-level Membership transition primitive as #518, but it must not call a "delete Space" shortcut or silently substitute one lifecycle for another.

Additional invariants:

- `OWNER_ONLY` is never transferred to a partner and is never reclassified to `SPACE_SHARED`;
- a surviving partner's legitimate shared history is not destroyed merely because its original author deletes their Account;
- the deleted Account does not remain an active profile solely to satisfy historical foreign keys;
- authentication is fail-closed from the accepted deletion point onward;
- stale jobs, outbox events, reminders and notification deliveries cannot recreate deleted data or act with stale authorization;
- a restore from a backup predating deletion must re-apply the deletion before API/worker traffic resumes;
- ServerAdmin gains no new ability to browse private content and later destructive administration must route through this lifecycle.

## 2. Existing authoritative primitives to reuse

The current baseline already provides the following useful authority boundaries:

- `Account.disabled_at` and `Account.is_active` are checked by session resolution and refresh;
- `auth.sessions.revoke_all(...)` revokes every active DeviceSession/refresh family;
- Identity credentials and tokens are Account/AccountEmail-owned and already use cascading foreign keys where appropriate;
- `relationship.require_membership(...)` is the server-side Space access gate;
- `relationship.end_membership(...)` preserves historical Membership rows while changing `ACTIVE` to `LEFT`/`REMOVED` and setting `ended_at`;
- `PrivateResourceMixin` makes `space_id`, `owner_id` and `privacy_class` explicit; its current `owner_id -> accounts` foreign key uses `ON DELETE CASCADE`;
- Attachment upload rows are `OWNER_ONLY`, while a bound attachment's read authorization follows its parent resource;
- attachment deletion already has retry-safe `DELETING` / `DELETE_FAILED` states and MediaStore purge;
- the PostgreSQL Job queue and Outbox are the only asynchronous infrastructure to use;
- notification projection and PushDelivery already re-check current Membership/readability at delivery time;
- #345 Transfer Bundles already implement `SHARED` and `PERSONAL` portability with active authorization rechecks;
- ServerAdmin audit rows are content-free and use nullable Account references with `SET NULL`;
- Web already has `clearStoredSession()` and `clearProductReadCache()`;
- Android logout already invalidates the session epoch and invokes `ProductReadCache.clearAll()`;
- #190 restores PostgreSQL plus durable media into a fresh target, with API/worker stopped, but currently has no forward-only deletion reconciliation source.

A direct hard delete of `accounts` is therefore not an acceptable implementation. `PrivateResourceMixin.owner_id` currently cascades from Account deletion, which would remove both `OWNER_ONLY` and legitimate `SPACE_SHARED` rows indiscriminately.

## 3. Authoritative Account-deletion state

V1 uses one server-authoritative Account-deletion lifecycle. Runtime may represent this as a dedicated one-to-one lifecycle row or equivalent schema, but it must expose only one source of truth.

Required states:

```text
NONE -> PENDING -> COMPLETED
              \-> FAILED -> PENDING
```

`FAILED` is retryable and fail-closed. Once deletion has been accepted, the Account must not become usable again merely because cleanup retries are pending.

### 3.1 Irreversible acceptance boundary

Deletion is considered accepted only after a minimal pseudonymous recovery tombstone has been durably recorded in the forward-only deletion reconciliation journal described in section 7. The journal write is idempotent by `(instance, account_id)` and contains no email, display name, token, proof, private payload or partner identifier.

After the journal accepts the tombstone, the request is irreversible: failures in subsequent database/media cleanup are retried until the same deletion result is reached.

### 3.2 Immediate fail-closed actions

As part of accepting/scheduling deletion:

- set/retain `Account.disabled_at` so normal session resolution and refresh fail;
- revoke all active DeviceSessions/refresh families via the existing session primitive;
- disable/remove PushEndpoints before any later delivery can be attempted;
- ensure every active Membership for this Account is ended through the existing Membership transition primitive;
- prevent new transfer/import/export work or account-addressed jobs from being authorized.

These are Account-deletion side effects, not user-facing "leave Space" commands.

### 3.3 Completion semantics

`COMPLETED` means all directly readable personal/authentication data is deleted or pseudonymized and every external blob that still requires physical deletion has entered the existing durable retry path. A transient MediaStore delete failure does not make content visible again and does not reactivate the Account.

## 4. Historical Account representation

The Account row is pseudonymized instead of blindly hard-deleted while retained shared/history references exist.

At completion:

- `display_name` becomes a non-personal tombstone value; clients should render a localized "former member" presentation from deletion state rather than persist the old display name;
- birthday and other profile attributes are cleared;
- locale/timezone are reset to non-personal defaults if schema nullability requires values;
- email addresses, identities, credentials, challenges and recovery/login tokens are removed;
- `disabled_at` remains set and a completed-deletion timestamp/state is retained;
- no credential can recreate an authenticated session for that Account.

The remaining UUID is a pseudonymous technical/historical key, not an active user profile. It is retained only while a shared/audit/reference or restore-reconciliation need exists. It becomes eligible for final hard deletion only when no retained references remain **and** no supported backup capable of resurrecting the pre-deletion Account remains in the operator retention window.

No ownership is transferred to the surviving partner merely to make foreign keys convenient.

## 5. Version 1 deletion / retention matrix

"Immediate" means within the logical deletion workflow. External media may complete later through the existing retry-safe purge states while remaining inaccessible.

| Data class | Action | Retention event / period | Who may read after deletion | Export / restore | Cleanup / retry rule |
|---|---|---|---|---|---|
| `Account` core row | Pseudonymize; keep disabled tombstone while referenced | Until no retained references remain and every pre-deletion backup is outside its bounded retention horizon | No active profile read; only normal shared-history presentation may resolve a neutral former-member marker | Not exported as an active Account; restore must re-run deletion | Idempotent by account id; never re-enable |
| `AccountEmail` | Hard delete | Immediate | Nobody | Never restore as usable identity after reconciliation | Idempotent cascade/delete |
| `AuthIdentity` / local password hash / OIDC binding | Hard delete | Immediate | Nobody | Never exported; restore reconciliation deletes again | Idempotent delete |
| WebAuthn credentials/challenges | Hard delete | Immediate | Nobody | Never exported; restore reconciliation deletes again | Idempotent delete |
| magic-link, email-verification, recovery and OIDC request tokens | Hard delete | Immediate | Nobody | Never exported/restored as usable proof | Idempotent delete |
| DeviceSessions / refresh families / consumed refresh material | Revoke immediately, then hard delete with identity cleanup | Immediate after revocation | Nobody | Never exported; restored sessions are revoked/deleted by reconciliation | `revoke_all` first; repeated deletion safe |
| Membership rows | Retain historical row, end any `ACTIVE` Membership | Retained with the Space/history lifecycle owned by #518 | Deleted Account gets no Space access; surviving active members retain normal rights | Shared export only while caller was authorized before deletion; restored Membership is re-ended | Reuse `end_membership`; idempotent terminal access state |
| `PartnerProfile` and deleted user's `SELF_PROFILE` preferences | Hard delete / remove active profile representation | Immediate | Nobody as an active profile | Not retained merely as shared history | Parent/profile cascades plus explicit tests |
| `OWNER_ONLY` domain rows owned by deleted Account | Hard delete | Immediate logical deletion | Nobody, including former partner and ServerAdmin | May be included only in a completed pre-deletion `PERSONAL` export already delivered to the user; restore reconciliation deletes again | Enumerate every privacy-aware table; retries must converge; never reclassify |
| `OWNER_ONLY` data owned by another Account that merely references/describes the deleted Account | Retain for its real owner, but detach/pseudonymize the deleted Account reference where required | Owner's normal lifecycle | Only its existing owner | Never becomes deleted Account data or partner-readable shared data | No cross-owner cascade from Account deletion |
| `SPACE_SHARED` memories, milestones, plans, places, chapters, collections, wishes, shared heart moments, comments and equivalent history | Retain while the Space lifecycle retains the shared object | Space/history retention event from #518 | Surviving authorized active members only | Existing `SHARED`/`PERSONAL` export semantics; restore reconciles author identity, not content ownership | Do not delete by `owner_id`; no ownership transfer |
| Shared rows whose `owner_id`/`created_by` is attribution | Retain row; resolve author through pseudonymized Account or nullable historical attribution | Same as parent shared object | Same as parent | Same as parent | FK/migration changes must not turn Account deletion into content cascade |
| Shared Reminder definitions | Retain with Space | Space/history lifecycle from #518 | Surviving active members | Existing transfer policy if supported | Deleted Account recipient state is removed separately |
| Reminder preferences / account-targeted runtime occurrences | Hard delete/cancel for deleted Account | Immediate | Nobody | Not restored as active delivery state | Worker revalidates Account deletion + Membership before effects |
| Notifications where deleted Account is recipient | Hard delete | Immediate | Nobody | Not exported/restored as active notification | Delete recipient rows; stale push jobs no-op |
| Historical Activity/Notification actor attribution | Retain only content-free/minimal attribution; pseudonymize or nullable actor | Existing history retention, never extended solely for Account profile | Existing authorized readers of the history | Restore reconciliation removes active identity | Existing `SET NULL`/pseudonymous author pattern; no profile PII |
| PushEndpoints / PushDeliveries for deleted Account | Hard delete/cancel | Immediate | Nobody | Never restored as active endpoint/delivery | Disable/remove endpoint before queued delivery; handler must no-op |
| Unbound/private/profile-avatar Attachments owned by deleted Account | Mark for deletion, then physical hard delete | Immediate logical; physical deletion until existing retry succeeds | Nobody once marked `DELETING` | Not retained in post-deletion export/restore | Reuse `mark_for_deletion` and MediaStore purge |
| Attachment bound to retained `SPACE_SHARED` parent | Retain with parent/blob; remove active uploader/profile semantics | Parent shared-object lifecycle | Same readers as parent | Same as parent | **Do not** delete merely because Attachment row itself is `OWNER_ONLY`; binding is authoritative |
| Jobs addressed to deleted Account or private resource | Cancel/no-op or let deletion-specific cleanup job complete | Until terminal job state / normal queue cleanup | No user content surface | Restore workers must reconcile deletion before processing backlog | Every side-effect handler revalidates deletion + current authorization |
| Outbox events | Unprocessed events that would create user/partner effects become no-op/cancelled; already processed safe envelopes may follow existing operational retention | Existing operational retention; deletion creates no new indefinite history | No private-content browsing surface | Restore reconciliation occurs before Outbox/worker restart | Safe identifiers only; no stale authorization |
| Transfer export/import rows and server-side bundle artifacts created by deleted Account | Cancel/fail pending/running work; purge server artifact | Immediate deletion workflow; completed copy already downloaded by user is outside server control | Nobody through deleted Account | Export is optional and never blocks deletion; old restored transfer work remains cancelled | Reuse #345 authorization checks and MediaStore cleanup |
| ServerAdmin audit events / security metadata | Retain content-free technical event under existing operational retention; Account reference may resolve only to pseudonym/null | Existing bounded audit/security retention; deletion does not extend it | Authorized admin metadata surface only | Not user-content export; restore reconciliation must not restore credentials/private fields | No tokens, proofs, free-form reasons, private payloads or content |
| Commercial/entitlement references, where present | Keep only the minimal non-content record needed by the accepted commercial/provider lifecycle; detach active Account profile | Provider/legal retention event, explicitly documented by its owning adapter | Authorized billing/operations boundary only | Never restores Core Account access by itself | Must not block Core deletion or recreate identity |
| Web session state | Hard clear locally | On accepted/completed deletion response | Nobody | N/A | Reuse `clearStoredSession()` |
| Web IndexedDB product read cache | Hard clear locally | On accepted/completed deletion response | Nobody in deleted browser context | N/A | Reuse `clearProductReadCache()` |
| Android in-memory/session epoch + Room/protected caches | Hard clear/invalidate locally | On accepted/completed deletion response | Nobody in deleted app context | N/A | Reuse logout/session-epoch path and `ProductReadCache.clearAll()`; clear drafts/protected cache too |
| Deletion reconciliation tombstone | Retain minimal pseudonymous recovery metadata outside the restorable application DB | Until every backup that predates deletion has expired, plus the operator's documented safety margin | Recovery subsystem only | Authoritative input to post-restore reconciliation | Append/idempotent; data-minimized and content-free, but Account UUID/timestamp remain pseudonymous and account-linkable |

## 6. Jobs, Outbox and stale side effects

Deletion does not add a second queue. The existing PostgreSQL Job queue remains the execution mechanism.

All account-addressed side-effect handlers touched by #520 must fail closed when either condition is true:

- the Account deletion lifecycle is `PENDING`, `FAILED` after irreversible acceptance, or `COMPLETED`; or
- current Membership/resource authorization no longer permits the effect.

At minimum this applies to PushDelivery, reminder delivery/projection, attachment processing that could publish a private object, Transfer export/import, notification projection and any job capable of producing a partner-visible effect.

A stale job may finish deletion cleanup. It may not recreate a deleted private row, send a notification, re-enable a PushEndpoint, mint a credential, import data for the deleted Account or treat stored IDs as durable authorization.

## 7. Restore-safe deletion tombstones

### 7.1 Why the database alone is insufficient

#190 restores a complete PostgreSQL dump and durable media into a fresh target. A backup created before Account deletion necessarily contains the older active Account and does not contain a deletion row created later. Storing the only tombstone in PostgreSQL therefore cannot prevent resurrection after restoring that older dump.

### 7.2 V1 reconciliation journal

V1 requires a **minimal forward-only deletion reconciliation journal** outside the point-in-time application database backup. It is not a user backup, not a Transfer Bundle and not a second Domain database.

Each record contains only:

- journal format version;
- stable instance identifier;
- deleted Account UUID;
- irreversible acceptance timestamp;
- integrity/version metadata required by the selected implementation.

The privacy classification is **minimal pseudonymous recovery metadata**. The
journal is content-free and data-minimized, but not identity-free: a stable Account
UUID plus an acceptance timestamp can still be related to an Account in the
system/recovery context. It is therefore protected, recovery-sensitive authority
state rather than ordinary non-personal operational metadata.

It contains no email, display name, Space id, partner id, token, password/passkey material, recovery proof, ProtectedPayload or `OWNER_ONLY` content. The absence of relationship/private content does not imply an absence of account-linkable or pseudonymous metadata.

The deployment/recovery boundary must protect and recover this journal independently of an older application database recovery point. For Self-Hosted this becomes an explicit protected recovery unit consumed by the canonical recovery procedure; Cloud/Managed must provide the equivalent provider-neutral durability/reconciliation contract through #521 rather than inventing different Domain semantics.

### 7.3 Mandatory restore ordering

Restoring a backup predating deletion is not complete at `pg_restore`.

Required order:

```text
restore database + durable media
-> migrate to supported schema
-> load current deletion reconciliation journal
-> idempotently re-apply every applicable Account deletion
-> verify deleted Accounts cannot authenticate and private/media cleanup is queued or complete
-> only then start API/worker normal traffic
```

The recovery command/runbook must fail closed if a launch/production restore cannot access the required journal. A developer-only synthetic recovery test may use a synthetic journal fixture.

The journal is retained at least until the oldest backup that could contain the pre-deletion Account has expired, plus the operator's documented safety margin. This couples tombstone retention to the **bounded backup-retention horizon**, not to an invented universal number of days.

## 8. Relationship-offboarding boundary (#518)

#520 can freeze and implement the following independently of #518's unresolved product choices:

- an Account deletion ends every active Membership so the deleted Account immediately loses Space access;
- the Membership row remains historical rather than being hard-deleted;
- `OWNER_ONLY` owned by the deleted Account is removed regardless of whether a Space remains active;
- retained `SPACE_SHARED` content is not destroyed by Account deletion;
- no deleted Account is automatically reactivated by `add_member()` or an invitation path;
- a new relationship never inherits an old Space.

#518 remains authoritative for questions that are **about the Space itself**, especially the lifecycle/retention of a Space with no active members, deliberate reconnect of the same former partners, and any explicit whole-Space destruction policy. #520 must not guess those decisions or use Account deletion to force them.

This boundary means #518 does not need to be fully implemented before #520 can build identity revocation, private-data deletion, pseudonymized authorship, queue guards or restore reconciliation. Runtime that would delete/archive an orphaned Space remains blocked on #518.

## 9. Transfer/export behavior

The #345 contract is reused unchanged:

- offer `SHARED`/`PERSONAL` export before deletion as an optional convenience;
- export never blocks deletion;
- no "account deletion ZIP" or weaker authorization path is created;
- once deletion is accepted, pending/running transfer jobs owned by the Account cannot bypass active authorization and are cancelled/failed safely;
- server-side ready bundle artifacts owned by the deleted Account are purged as part of deletion cleanup;
- a file the user already downloaded before deletion is outside server control.

## 10. Client behavior

Web and Android must present Account deletion separately from "Space verlassen" and any future "Beziehung/Space beenden" action.

The confirmation copy must be neutral and explain:

- the Account cannot be used afterward;
- private Account-owned data is deleted;
- legitimate shared history may remain visible to an authorized surviving partner with only a neutral former-member author representation;
- an existing Transfer Bundle export is optional and not a blocker.

After the server accepts deletion, both clients must immediately leave the authenticated product surface and clear local Account/session/cache state through their existing logout/cache primitives. They must not keep an offline product surface for the deleted Account.

## 11. Runtime implementation slices after this contract

To keep #520 reviewable, runtime should be split without changing this authority model:

1. **Backend lifecycle + schema:** deletion state/timestamps, pseudonymization, session/auth revocation, Membership termination, explicit `OWNER_ONLY` cleanup and negative tests.
2. **Side effects + media + reconciliation:** stale Job/Outbox/Push/Reminder/Transfer guards, reference-aware Attachment cleanup, forward-only tombstone store and #190 post-restore reconciliation.
3. **API/OpenAPI + generated clients:** user-facing deletion command/status contract only; no ServerAdmin destructive shortcut.
4. **Web UX + cache cleanup:** settings action, neutral confirmation/export affordance, existing logout/cache primitives.
5. **Android UX + cache cleanup:** parity with Web, existing session-epoch/cache clear path and protected-draft cleanup.

Each runtime slice refreshes `main` and open PRs before implementation, keeps normal Security/Privacy/Tenant/Reuse gates intact, and does not merge without explicit approval.

## 12. Required verification

The completed #520 implementation must prove at minimum:

- repeated deletion requests and worker retries converge to the same result;
- foreign Account/Space IDs cannot affect another tenant;
- deleted owner's `OWNER_ONLY` rows are gone and never exposed to the partner;
- retained `SPACE_SHARED` history survives without retaining the deleted active profile or transferring ownership;
- all sessions/refresh families and login credentials are unusable after acceptance;
- stale Jobs/Outbox cannot recreate content or send notifications;
- PushEndpoints/PushDeliveries and reminder recipient state stop immediately;
- shared-bound media survives when its retained parent survives;
- private/unbound/profile media becomes inaccessible immediately and physical deletion retries safely;
- Web session + IndexedDB cache and Android session/cache/drafts are cleared;
- export-before-delete works and in-flight export never blocks deletion or bypasses post-delete authorization;
- restoring a backup created before deletion and replaying the current reconciliation journal cannot resurrect login, private content, endpoints, sessions or private media;
- OpenAPI and generated Web/Android clients have no drift;
- normal Security/Privacy/Tenant, reuse and CI gates remain green.

## 13. Explicit non-goals

This contract does not implement or authorize:

- direct SQL/ORM `DELETE FROM accounts` as the lifecycle;
- partner access to `OWNER_ONLY`;
- ServerAdmin private-content browsing;
- the destructive #529 ServerAdmin Account-delete UX;
- a new queue, notification system, export format or general backup engine;
- automatic whole-Space deletion when an Account is deleted;
- automatic reconnect/reactivation of a deleted Account.

#529 may later invoke this exact lifecycle only after its own double-confirmation, typed confirmation, self/last-admin protection, recent-auth/step-up and audit requirements are implemented.