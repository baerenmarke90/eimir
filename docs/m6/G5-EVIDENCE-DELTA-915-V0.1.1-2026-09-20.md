# G5 Promotion and Rollback Identity Evidence Delta — v0.1.1 (#915)

**Owner:** #915  
**Consumed by:** `docs/m6/G5-EVIDENCE.md` (G5-05), #525  
**Release under test:** `v0.1.1`, source `33939ad42f94ea81256ef858a0f7ccbe5fe0966f`  
**Predecessor:** `v0.1.0`, source `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`  
**Historical evidence retained unchanged:** `docs/m6/G5-EVIDENCE-DELTA-915-2026-09-20.md` (first run on
`v0.1.0`, launcher workaround), the #914/#916/#917 deltas and all earlier records. This document
is additive. It does not decide G5; #525 does.

## 1. Result

`v0.1.1` was created as the successor of `v0.1.0` through the existing candidate and protected
publication workflows, and the published operator bundle was tested from the GitHub Release alone.
The `v0.1.0` defect (bundle without `scripts/_identity_environment.py`) is closed: both shipped
scripts start standalone. The exact published `v0.1.1` digests were accepted on a Development target,
promoted to an isolated Production-mode target through the published launcher with no workaround, and
API and Web reported the `v0.1.1` source revision. Application rollback to `v0.1.0` and roll-forward
were exercised on that target without any database rollback.

Launch scope covered: Self-Hosted release set. Android and Cloud/Managed are `NOT_APPLICABLE`
(§9, §10). Of the two conditions left open by the `v0.1.0` run, the bundle defect (C1) is resolved;
the single-host boundary (C2) remains and is the boundary specified for this run (§11).

## 2. Release creation

| Item | Value |
|---|---|
| Source | `33939ad42f94ea81256ef858a0f7ccbe5fe0966f` = `main` at the time, contains #1117 (release notes fix) and #1121 (bundle helper fix) |
| Source checks | all 21 check runs on the source commit completed `success` before dispatch |
| Release branch | `release/0.1.1-rc1`, created at exactly the source commit; candidate and publication ran on it |
| `v0.1.1` before | tag and GitHub Release absent |
| Candidate run | `35518425837`, `release-candidate.yml`, inputs `release_version=0.1.1`, `include_android=false`, `initial_release=false`, `previous_known_good_version=0.1.0`, no Android inputs; 15:04:24Z – 15:07:10Z, attempt 1, `success` (all 5 jobs) |
| Publish run | `35519359638`, `release-publish.yml`, same inputs plus `confirm_publish=true`; 15:22:14Z – 15:26:57Z, attempt 1, `success` (all 5 jobs) |
| Publication | 2026-09-20T15:26:43Z, `isImmutable=true`, not draft, not prerelease |

`main` advanced after the release branch was cut (docs only, #917); the release source is unaffected.

### Candidate manifest

Source revision `33939ad4…`, `android = {"included": false, "signing": "not-applicable"}`,
`previousKnownGood = {version 0.1.0, tag v0.1.0, sourceRevision 8bb0c1ea…, manifestSha256
ae2f104d1d49b8a5eb4de1cbce372022b813d37534f490ce0c934f2085a7277a}` (equals the SHA-256 of the
published `v0.1.0` manifest), `rollback = {applicationReleaseSelectable: true,
databaseRollbackImplied: false, schemaCompatibilityReviewRequired: true, authority: [#190, #375]}`.
All entries of the candidate `SHA256SUMS` verified; candidate release notes intact.

## 3. Published identity

| Item | Value |
|---|---|
| Release | https://github.com/baerenmarke90/eimir/releases/tag/v0.1.1; `gh release verify v0.1.1` passes |
| Tag | `refs/tags/v0.1.1` is a commit, `33939ad42f94ea81256ef858a0f7ccbe5fe0966f`; release target the same |
| Backend | `ghcr.io/baerenmarke90/eimir-backend:v0.1.1@sha256:22e5069d62b9ae69cf53055257b317af32252196aa545a6beb2038f45ea8ec28` |
| Web | `ghcr.io/baerenmarke90/eimir-web:v0.1.1@sha256:44f2ed5cab65fe943c6135a5a77b4fc2a5b34d72812f89e0f0f12f2655be63b0` |
| OCI labels (both images) | `revision` = `33939ad4…`, `version` = `0.1.1` |
| Archive SHA-256 (bound via `releaseArtifactSha256`) | backend `105e8eae90650bcdfcfdbf478c22bd6b8d66e5d5806e3ebb3b75d237c6f44e6e`, Web `84cd1642f3aeb83c8f8d135695698774ee52e67c5921459b7314fab64e44ce79` |
| Manifest | `98c504f96d88007680e52dccea1b9fc4dd5cf0ec41e46012d9095307f3bab9f4`, `previousKnownGood` = `v0.1.0` as above |
| `self-hosted-image-identity.json` | `08c6fd28a09b9272a1adda42a1414ed984b7910749943f2b50cdafb1fe5ba516`, byte-identical to the copy in the bundle |
| Operator bundle `eimir-self-hosted-v0.1.1.tar.gz` | `484a7985f8893b2f379cfe6f970824e112f87c8ee55b44bbeff32056ba90e1a8` |
| `SHA256SUMS` | `23234fa4e6f33193ecffd59e4fd7e8ec9c0249c1c551c89ee201f13352b2a18a` |

### Assets, checksums and attestations

The release has 15 assets: manifest, evidence index, image identity, operator bundle, two image
archives, two SPDX SBOMs, two SBOM/provenance attestation bundle pairs, `trusted_root.jsonl`,
`RELEASE-NOTES.md` and `SHA256SUMS`, and no Android artifact. All 14 entries of `SHA256SUMS` match the
downloaded assets (the two image archives were downloaded in full). `gh attestation verify`
succeeds for both archives: source digest `33939ad4…`, SLSA provenance v1, signer workflow
`.github/workflows/release-evidence.yml@refs/heads/release/0.1.1-rc1`.

### Release notes

`RELEASE-NOTES.md` renders `Source revision: 33939ad4…` and `Previous known-good application release:
v0.1.0` with backticks intact and names `eimir-release-manifest.json`,
`self-hosted-image-identity.json` and `eimir-self-hosted-v0.1.1.tar.gz`. The #1117 defect of
`v0.1.0` did not recur.

### Candidate versus publication

Both runs used the same source revision, but the archives are not byte-identical:

| Archive | Candidate SHA-256 | Published SHA-256 |
|---|---|---|
| backend | `70314f9c723be0df430e5e515a5f754db4145d67f972f01bce10166b575c3e03` | `105e8eae…6f44e6e` |
| Web | `dd8da9593b3488be16d87e34964ace97fc52c8e9c6ab94703c159660255e002e` | `84cd1642…4ce79` |

Layer inspection: image `created` time differs (candidate 15:05 vs. publication 15:22), 6 of 17 backend
and 8 of 11 Web layers are bit-identical (base layers), the rest are application layers rebuilt in
the second run, and the runtime image configuration (labels, entrypoint, environment) is identical
apart from `created`, `history` and `rootfs`. The documented contract
(`docs/m6/IMMUTABLE-RELEASES.md`) binds a release to the source revision and to the archives loaded
and pushed inside the publish run; it does not promise that publication reuses the candidate's
bytes or that builds are reproducible. This is therefore not a contract violation, and it is the
same behaviour recorded for `v0.1.0`. It means acceptance on candidate bytes would not prove the
shipped bytes; this exercise used the published digests only.

## 4. Standalone operator bundle (the `v0.1.0` regression)

The published `eimir-self-hosted-v0.1.1.tar.gz` was downloaded from the release and extracted into an
empty directory (no repository, no copied helper, no `PYTHONPATH`, cleaned environment).

- Files: `compose.yaml`, `deploy/self-hosted-release.env.example`, `scripts/self_hosted_release.py`,
  `scripts/check_runtime_environment.py`, **`scripts/_identity_environment.py`**,
  `self-hosted-image-identity.json`.
- `compose.yaml`, both scripts, the helper and the env template are byte-identical to the files at
  the release source; the helper's SHA-256 is `d1e147b9b55dd87c87107915da17a8b360ae08f94d5aa3d254fe2710ee883f9a`,
  identical to the file used as workaround for `v0.1.0`.
- `python3 scripts/self_hosted_release.py --help` and `python3 scripts/check_runtime_environment.py
  --help` print their usage; neither raises `ModuleNotFoundError`.
- The real launcher actions `pull`, `bootstrap-deletion-authority`, `validate` and `deploy` ran
  from this bundle in §7 and §8 without any helper or path workaround.

## 5. Contract-relevant boundary between v0.1.0 and v0.1.1

`git diff 8bb0c1ea 33939ad4` touches only `.github/workflows/release-candidate.yml`,
`.github/workflows/release-publish.yml`, `tools/ci/test_release_publish_workflow.py`, docs and the
bundle documentation. There is no change under `backend/`, `web/`, `android/`, `design/`, `deploy/`
or to `compose.yaml`. The image bytes and digests still differ (§3), and the database schema head is
`0061` in both releases.

## 6. Development acceptance

Isolated project `eimir-dev-915b`, `EIMIR_ENVIRONMENT=development`, own ports, PostgreSQL, media and
deletion-journal volumes and generated secrets; `docker compose` on the bundle manifest with the two
digest-qualified references read from the published identity file, `pull_policy` default.
Deploy 15:28:32Z – 15:29:41Z.

| Check | Result |
|---|---|
| Image ID of every container | equals the published backend/Web digests |
| `release-guard` | `Production release guard not applicable: EIMIR_ENVIRONMENT=development`, exit 0 |
| `migrate` | exit 0, Alembic head `0061` (the newest revision at the release source) |
| Services | `postgres`, `api`, `web` healthy, `worker` running |
| API `EIMIR_BUILD_REVISION`, Web `/.well-known/eimir-revision` | `33939ad42f94ea81256ef858a0f7ccbe5fe0966f` |
| `deployment_smoke.py` at the release source | Web health, Web revision, API ready + revision, password sign-in, authenticated memberships read, sign-out: all ok (exit 0) |
| Persistence | `down` without `-v` (15:30:20Z), `up -d --wait`, same smoke again incl. sign-in of the pre-restart account: ok (exit 0, 15:31:01Z) |

## 7. Promotion to the Production-mode target

Isolated project `eimir-staging-915b`, `EIMIR_ENVIRONMENT=production`, own ports, volumes and
secrets, `EIMIR_PUBLIC_BASE_URL` an `https://` origin as the Production contract requires. Everything
through `scripts/self_hosted_release.py` from the published bundle.

| Step | Result |
|---|---|
| `pull` | image identity check passed, pulled by digest (exit 0) |
| `bootstrap-deletion-authority` | created journal and instance ID, stored in the target's env file (exit 0) |
| `validate` | rendered configuration check passed |
| `deploy` (15:31:26Z – 15:32:13Z, first attempt, exit 0) | see below |

Order from container timestamps: `release-guard` 15:31:47Z – 15:31:48Z (`Production release guard
passed`), `migrate` 15:31:58Z – 15:32:00Z (exit 0), `api`/`worker` started 15:32:00Z, `web` 15:32:07Z. The
guard completed before migration, migration before API/worker.

| Check | Result |
|---|---|
| Image and image ID of `release-guard`, `migrate`, `api`, `worker` | backend `sha256:22e5069d…ec28`, same as Development |
| Image and image ID of `web` | Web `sha256:44f2ed5c…63b0`, same as Development |
| `build:` keys in rendered Compose / local non-registry application tags | 0 / 0 |
| API `EIMIR_BUILD_REVISION` / `EIMIR_ENVIRONMENT` | `33939ad4…` / `production` |
| Web `/healthz`, `/.well-known/eimir-revision` | 200, `33939ad4…` |
| API readiness, loopback inside the API container | 200 `{"status":"ok","database":"ok"}`, `X-Eimir-Revision: 33939ad4…` |
| Authenticated flow, loopback inside the API container (fictional account) | register 201, sign-in 200, memberships 200, sign-out 204 |
| API from the host over cleartext | `HTTPS_REQUIRED` (Production transport contract) |
| Alembic head | `0061` |

The Production API serves cleartext HTTP only to a loopback peer, so `deployment_smoke.py` cannot
target it; the equivalent calls were made from inside the API container. This closes the
authenticated-flow gap of the `v0.1.0` run on the Production-mode target.

No image was built: both targets use the same two published digests, the rendered configuration has
no `build:` key, and no source-build helper was run. The launcher took the references from the
identity file and refused every override that differs from it (§8).

## 8. previous-known-good and rollback boundary

Contract (manifest, workflows, `docs/DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md` §9 and §11):

- `v0.1.1` references `v0.1.0` as `previousKnownGood` by version, tag, source revision and manifest
  SHA-256; the OCI digests of that release come from its own immutable
  `self-hosted-image-identity.json` (SHA-256 verified against `v0.1.0`'s `SHA256SUMS`).
- **Application release selection** is choosing a published release identity. **Database migration**
  is Alembic `upgrade head` by the `migrate` service before traffic. **Forward fix** is a new
  release. **Recovery** is a coordinated restore of database, media and journal per #190.
  **Database rollback** is none: the manifest sets `databaseRollbackImplied: false` and no step below
  downgrades the schema.

Fail-closed selection (launcher `validate` on the running target, all refused with exit 2, running
services unchanged): release version `0.1.0` with the `v0.1.1` identity; the `v0.1.0` identity with the
`v0.1.1` environment; a tag-only, movable backend reference as override.

Real application rollback, `v0.1.1` → `v0.1.0`, on the Production-mode target with a live database
(15:34:01Z – 15:34:44Z): env selected `EIMIR_RELEASE_VERSION=0.1.0` and the two references from the
`v0.1.0` identity, launcher `--image-identity <v0.1.0 identity> deploy`, exit 0. Guard passed,
`migrate` was a no-op (both releases have head `0061`, so the rollback is schema-compatible), every
application container ran the `v0.1.0` digests (`sha256:f3b5f7ea…ddd1`, `sha256:edd2f5f8…e12f1`), API and Web
reported `8bb0c1ea…`, readiness 200, the Alembic head stayed `0061` and the account row survived.

Roll-forward to `v0.1.1` (15:35:00Z – 15:35:53Z), exit 0: `v0.1.1` digests again, API/Web `33939ad4…`,
head `0061`, account row present.

Incompatible schema (rollback while the database is ahead): a real case needs a release with a newer
migration, which does not exist. The existing rehearsal
`scripts/self_hosted_upgrade_rehearsal.py --scenario release` was run at the release source against
local aliases of the published `v0.1.1` images (15:33:06Z – 15:36:51Z, exit 0): fresh install,
compatible upgrade and rollback, new migration applied once, **rollback with an incompatible schema
fails closed** with services, schema and data untouched, and re-selecting the newer release recovers.
Its releases A/B/C are throw-away fixtures inside the rehearsal project, not product versions; the
aliases were removed afterwards.

## 9. Android

`NOT_APPLICABLE`. Manifest and evidence index carry `android: {"included": false, "signing":
"not-applicable"}`; the release has no APK/AAB or Android attestation.

## 10. Cloud/Managed

`NOT_APPLICABLE` for this evidence. The repository does not declare Cloud/Managed part of the launch
scope (2026-09-12 gate review, #914 Self-Hosted release set, no `cloud-deployment-identity.json`
in `v0.1.1`). No managed evidence was produced. #525 owns the scope decision; this does not certify
Cloud/Managed.

## 11. Acceptance criteria of #915

| Criterion | Status | Basis |
|---|---|---|
| Exact published release version/commit is used | `PASS` | §3; `v0.1.1` digests, tag and source equal everywhere; `v0.1.0` exercised as rollback target and in the first run |
| Persistent Development acceptance is recorded | `PASS` | §6 |
| Same immutable candidate is promoted to the launch/staging-equivalent target | `PASS` | §7; same digests, published launcher, no workaround, no rebuild |
| Deployed API/Web revision identity matches the selected release | `PASS` | §6, §7 |
| Previous-known-good application identity is retained | `PASS` | §2, §8; `v0.1.1` names `v0.1.0`, whose digests were selected and run |
| Rollback/forward-fix boundary is exercised or demonstrated | `PASS` | §8; real app rollback and roll-forward, fail-closed selection and rehearsal, no database rollback |
| Cloud/Managed digest evidence only if in scope | `NOT_APPLICABLE` | §10 |
| G5-05 has traceable evidence consumable by #525 | `PASS` | this document and the first-run delta |

Boundary of the evidence, unchanged from the first run and specified for this run as an isolated
Production-mode target: both targets are disposable Compose projects on one workstation Docker host,
without a long-lived Arcane instance, a second host, real TLS ingress or external secret custody.
Rollback was exercised on a schema-compatible pair only.

## 12. Findings

1. **Candidate and publication bytes differ** (§3). Consistent with the documented contract and with
   `v0.1.0`, but the candidate release notes call the candidate a "build-once immutable artifact
   set", which suggests otherwise. Candidate-stage tests do not carry over to the published digests.
2. **Evidence spans two releases.** #914, #916 and #917 evidence is bound to `v0.1.0`
   (`8bb0c1ea…`, digests `f3b5f7ea…`/`edd2f5f8…`); #915 is completed on `v0.1.1` (`33939ad4…`, digests
   `22e5069d…`/`44f2ed5c…`). §5 shows no runtime source change between them, but image bytes and
   digests differ. #525 must decide which release is the launch release and whether the
   `v0.1.0` accessibility and Demo evidence carries over to `v0.1.1` or is repeated.
3. **Attestation signer ref.** The provenance of `v0.1.1` names
   `release-evidence.yml@refs/heads/release/0.1.1-rc1` (the `v0.1.0` provenance named `refs/heads/main`).
   Expected, since the runs were dispatched on the release branch; the source digest is the release
   source. Recorded so a verifier is not surprised.
4. **Approval gate still absent.** The `production-release` environment has no protection rule (no
   required reviewer), so the publication was not gated by a human approval; unchanged since #914.
5. **`validate` is weaker than the runtime for the public URL** (`http://` origin accepted by
   `validate`, refused by the Production API). Observed in the `v0.1.0` run; not repeated here.
6. **Single-platform images.** The published images are `linux/amd64`; on an arm64 host they run
   under emulation. No effect on identity.
7. **`v0.1.0` stays as published.** Its release notes and bundle keep their defects; they were not
   touched. Its bundle needs the documented helper workaround; `v0.1.1` supersedes it.

## 13. Cleanup

At 15:37:13Z both projects were removed (`docker compose down -v`: their own containers, networks and
volumes) and the rehearsal aliases were untagged. Nothing of this exercise remains running; the
pulled release images remain in the local image cache. No secret, token or credential is recorded here.
