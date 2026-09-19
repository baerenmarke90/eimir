# M6 Deployment and Release Contract

**Workstreams:** M6-A / M6-C  
**Baseline owners:** #194, #304, #375  
**Remaining owners:** #519, #193, #521, #524

This document freezes the boundary between source revision, release artifacts,
environments, promotion and rollback. It does not replace the detailed #375
Development/Production runbook.

## 1. Environment topology

The authoritative environment roles remain:

| Environment | Purpose | Data | Revision policy |
|---|---|---|---|
| Local / PR | developer feedback, CI | disposable/generated | feature branch / PR commit |
| Persistent Development | integration, migration, release-candidate verification | fictional/test | `main` ordinarily; exact candidate commit for release acceptance |
| Demo | public product demonstration/manual QA | canonical fictional | independently selected immutable revision for a demo release |
| Production | supported real service | real user data | exact immutable approved release identity |

Demo is **not** staging. Development, Demo and Production do not share PostgreSQL,
media storage, secrets, sessions, signing keys or provider credentials.

## 2. Existing #375 contract reused unchanged

#375 already provides:

- persistent isolated Development;
- `EIMIR_ENVIRONMENT=development|demo|production` separation;
- exact Web/API revision reporting;
- `scripts/compose_checked.py` for verified complete-checkout deployment;
- Development-before-Production migration gates;
- non-destructive network smoke for health/revision and optional fictional test login;
- immutable commit SHA as Production deployment identity;
- previous-known-good application redeployment with explicit schema compatibility
  review;
- environment-isolation checking;
- the rule that raw Compose from an arbitrary checkout is not a verified release
  identity.

M6 must consume this contract instead of adding a second promotion path.

## 3. Release artifact set

#519 owns the final publication workflow. The G5 release unit contains, at minimum:

1. backend runtime identity covering API, worker and migrate from one intended
   backend revision;
2. Web runtime/artifact identity;
3. Android release AAB/APK as required by the selected distribution channel;
4. release manifest containing product version, immutable source commit and artifact
   identities/digests/checksums without secrets;
5. human-readable release notes;
6. #193 SBOM/attestation/provenance attached to the same release unit.

No release is valid if Web and backend identify different commits or if Android is
published under a version/product identity unrelated to the reviewed release.

## 4. Version and revision identity

The existing #375 distinction remains useful:

- **commit SHA:** immutable technical deployment identity;
- **release version/tag:** human/product release identity pointing to that commit;
- **artifact digest/checksum:** immutable published artifact identity where #519
  publishes artifacts rather than rebuilding immutable source.

Production never follows floating `main`.

#519 decides whether G5 retains #375's immutable-source build model or moves the
launch path to build-once versioned OCI artifacts. Either outcome must preserve an
exact mapping:

```text
product version -> commit SHA -> backend/Web/Android artifacts -> SBOM/attestation
```

## 5. Android release identity/signing

Delivered #194 freezes:

- application ID `de.sidebyside.app`;
- debug application ID separation;
- `versionName` as product version;
- monotonic publisher-supplied `versionCode`;
- release signing material supplied only by the publishing environment;
- no silent debug-key fallback for release.

#519 still must close the operational release decisions:

- Play App Signing yes/no for the launch channel;
- upload-key custody;
- protected CI/publishing secret location;
- recovery/escrow/rotation responsibility where supported;
- least-privilege publishing access.

These are `BEFORE_RELEASE`, not M5 Android feature work.

Delivered #1008 (Slice B) migrates Android release packaging, signing, and publication to the Capacitor Android wrapper (`capacitor-android/`):

- build-time web bundle compilation with validated `android_api_base_url` (`VITE_EIMIR_API_BASE_URL`), native sync via `npm run cap:sync`, and native config drift checks;
- Gradle project properties `eimirVersionCode` (with deprecated `sbs*` compatibility fallback) and `eimirVersionName`;
- release signing credentials reading `eimirRelease*` (with deprecated `sbs*` fallbacks) materialized ephemerally in `$RUNNER_TEMP`;
- strict dependency verification (`gradle/verification-metadata.xml`) and verified Gradle wrapper checksums;
- verification of offline web assets, runtime security (`CapacitorHttp`), and dynamic badging (`de.sidebyside.app` / `de.eimir.app.MainActivity`);
- legacy client under `android/` is decoupled from all release automation and scheduled for retirement in #1009.

## 6. Promotion contract

The required release order is:

```text
feature/PR
  -> repository CI/security/privacy/reuse/supply-chain gates
  -> merge candidate baseline
  -> exact candidate on persistent Development
  -> migration
  -> readiness + Web health + revision equality smoke
  -> affected functional/manual acceptance
  -> fresh recovery point / schema compatibility review
  -> immutable release publication
  -> Production rollout
  -> post-deploy revision/readiness smoke
```

The candidate deployed to Development and the release promoted to Production must be
traceably the same approved source/release identity.

## 7. Self-Hosted production

Self-Hosted keeps #375/#190 as the supported baseline:

- the canonical root `compose.yaml` with `self-hosted` profile for complete
  checkouts and Arcane;
- immutable commit/release identity;
- dedicated secrets/data/media;
- pre-production migration verification;
- operational backup/restore/upgrade;
- no required external telemetry SaaS;
- no dependency on Cloud/Managed commercial infrastructure for Core operation.

If #519 introduces published versioned images, Self-Hosted documentation must state
which artifact/source path is supported. Do not remove the ability to run the real
Self-Hosted product merely to simplify managed hosting.

## 8. Cloud/Managed production

`docs/m6/CLOUD-MANAGED-TOPOLOGY.md` (#521) freezes the supported launch topology.
Its deployment representation is the `cloud` profile in the same root
`compose.yaml` together with `deploy/cloud-managed.env.example`, preserving the
same Domain/API/privacy semantics while deciding operational responsibilities for:

- API/Web/worker/migrate processes;
- PostgreSQL;
- object/media storage;
- ingress/TLS;
- secret/config ownership;
- release rollout;
- observability export;
- backup/restore;
- capacity/restart/replica assumptions.

Cloud convenience does not justify a Cloud-only Domain branch. `#524` performs
the integrated rehearsal (including a real managed restore) against this
topology.

## 9. Configuration and secrets

Development, Demo and Production must have independent values for at least:

- PostgreSQL credentials/URLs;
- MediaStore/object-storage credentials and buckets/prefixes;
- cursor/session/signing keys;
- bootstrap/admin recovery credentials;
- OIDC/auth callback origins;
- mail/push/provider credentials;
- commercial entitlement/billing credentials once selected;
- operator/observability export credentials.

Secrets do not belong in:

- Git;
- images;
- release manifest;
- SBOM;
- logs/metrics;
- ServerAdmin read-only config views.

A Development configuration must not silently point at Production database/media.
Reuse #375 isolation checks and add deployment-layer validation only where the
managed target needs it.

## 10. Migration and rollback boundary

Every production migration first runs in CI and persistent Development.

Before promotion record:

- current known-good release identity;
- candidate identity;
- migrations between them;
- schema backward-compatibility result;
- fresh coordinated recovery point;
- media compatibility considerations.

If the candidate fails:

- compatible schema -> previous application release may be redeployed;
- incompatible schema -> choose tested downgrade, forward fix, or restore the
  pre-change recovery point plus compatible application release.

A release tool must never imply that selecting an old container/tag safely rewinds
data by itself.

## 11. Public Demo boundary

Delivered #304 remains separate:

- Demo DB/media/secrets/origin are isolated;
- Production rejects Demo mode;
- persona entry contains no reusable browser password;
- reset affects only Demo scope;
- Demo may use the same release artifact pipeline but is not evidence that
  Development/Production promotion passed.

After #523, Demo entitlement fixtures must use the same normalized capability path,
not an unconditional premium bypass.

## 12. Release gates before G5

Required evidence owners:

| Gate | Owner |
|---|---|
| immutable coherent artifact/release identity | #519 |
| Android signing/publishing operations | #519 / #194 baseline |
| SBOM/attestation/provenance | #193 |
| persistent Development/promotion/revision smoke | #375 / #524 rehearsal |
| Self-Hosted recovery/upgrade | #190 / #524 rehearsal |
| Cloud/Managed topology/recovery/capacity | #521 / #524 |
| Demo isolation | #304 / #524 regression check |
| final integrated release rehearsal | #524 |
| dated launch decision | #525 |

## 13. Explicit non-goals

This contract does not introduce:

- a second deployment orchestrator;
- Kubernetes/multi-region by default;
- a second migration mechanism;
- a Demo-to-Production promotion path;
- Production tracking `main`;
- Android product-feature changes;
- payment-provider logic;
- automatic destructive database rollback.
