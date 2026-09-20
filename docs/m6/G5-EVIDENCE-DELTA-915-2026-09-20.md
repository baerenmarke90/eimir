# G5 Promotion and Rollback Identity Evidence Delta — v0.1.0 (#915)

**Owner:** #915  
**Consumed by:** `docs/m6/G5-EVIDENCE.md` (G5-05), #525  
**Release under test:** `v0.1.0`, source `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` (published by #914)  
**Historical evidence retained unchanged:** the 2026-09-05 report, the earlier deltas and
`docs/m6/G5-EVIDENCE-DELTA-914-2026-09-20.md`. This document is additive. It does not decide
G5; #525 does.

> **Update:** condition C1 below was closed by the successor release `v0.1.1`, whose
> published operator bundle carries the helper and was exercised without workaround; see
> `docs/m6/G5-EVIDENCE-DELTA-915-V0.1.1-2026-09-20.md`. The text below records the first run on
> `v0.1.0` as executed.

## 1. Result

The exact published `v0.1.0` images were accepted on a Development target, promoted to a
Production-mode launch target through the released launcher, and reported the release source
revision from both API and Web. Every container of both targets ran the published digests. No
image was built or rebuilt. The rollback/forward-fix boundary was demonstrated from the
published contract and a non-destructive rehearsal.

`#915` stays **open**. Two conditions are unresolved and belong to #525 and the Product Owner
(see §10):

1. The launcher inside the published, immutable `v0.1.0` operator bundle does not start
   (missing helper module). The promotion used the launcher bytes of the release source plus
   the missing helper from the same source revision. The fix for future releases is PR #1121.
2. Both targets were isolated Compose projects on one Docker host, not long-lived instances
   on separate hosts behind real TLS ingress.

Launch scope covered: Self-Hosted release set. Cloud/Managed and Android are out of this
scope (§8, §9).

## 2. Release identity under test

| Item | Value |
|---|---|
| Release | `v0.1.0`, immutable, `gh release verify v0.1.0` passes |
| Tag target / release source | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` (tag ref is a commit) |
| Candidate run / publish run | `35512593794` / `35513301429` |
| Backend | `ghcr.io/baerenmarke90/eimir-backend:v0.1.0@sha256:f3b5f7ea23aad99844ed558dd4a148d4196cb1b52c6ceed3a0d8636a9715ddd1` |
| Web | `ghcr.io/baerenmarke90/eimir-web:v0.1.0@sha256:edd2f5f88bafe8fde5a2dd6223507b3fb71d14474d0c5f7162d2696324be12f1` |
| Image OCI labels | `org.opencontainers.image.revision` = release source, `version` = `0.1.0` (both images) |
| `previousKnownGood` | `null` (initial release) |
| `main` at time of test | `f6691890`, **not used** as a deployment artifact |

Inputs were downloaded from the published release and checked against its `SHA256SUMS`
before use: `eimir-release-manifest.json`, `evidence-index.json`,
`self-hosted-image-identity.json`, `eimir-self-hosted-v0.1.0.tar.gz`, `RELEASE-NOTES.md`.

| File | SHA-256 |
|---|---|
| `eimir-release-manifest.json` | `ae2f104d1d49b8a5eb4de1cbce372022b813d37534f490ce0c934f2085a7277a` |
| `self-hosted-image-identity.json` | `ba3644affc35dabfe99ba8c2ac7972e58c0b16bfd4474d49269e04eefb2ea7e4` |
| bundle `compose.yaml` | `899bda807cb336d3d4525dd00db59a2d2c7697e71a84bc4acc7442fbb6ba171f` (equals `compose.yaml` at the release source) |

The identity file inside the bundle is byte-identical to the standalone release asset. The
bundle's `self_hosted_release.py` and `check_runtime_environment.py` are byte-identical to the
files at the release source. Both targets used the same identity file and the same `compose.yaml`.

## 3. Targets

Both targets were created from the extracted operator bundle, each with its own Compose
project, database, media and deletion-journal volumes, generated secrets, ports and env file
(secrets were not retained). The workstation also runs unrelated stacks; they were not touched.

| | Development target | Launch / staging-equivalent target |
|---|---|---|
| Compose project | `eimir-dev-915` | `eimir-staging-915` |
| `EIMIR_ENVIRONMENT` | `development` | `production` |
| Entry point | `docker compose` on the bundle manifest (the launcher refuses non-Production) | `scripts/self_hosted_release.py` (`pull`, `bootstrap-deletion-authority`, `validate`, `deploy`) |
| Guard | `Production release guard not applicable: EIMIR_ENVIRONMENT=development` | `Production release guard passed` |
| Data | fictional only (one synthetic smoke account) | none |
| Image selection | the two digest-qualified references from the identity file, `pull_policy` default (`always`) | the same two references, loaded by the launcher from the identity file |

## 4. Development acceptance

Deploy window 2026-09-20 14:05:03Z – 14:06:15Z.

| Check | Result |
|---|---|
| Backend / Web image ID of every container | equals the published digests (`api`, `worker`, `migrate`, `release-guard`: backend; `web`: Web) |
| `migrate` | ran after `release-guard`, exit 0, Alembic head `0061`, which is the newest revision in `backend/alembic/versions` at the release source |
| Services | `postgres`, `api`, `web` healthy, `worker` running |
| API `EIMIR_BUILD_REVISION` | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` |
| Web `/.well-known/eimir-revision` | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` |
| `deployment_smoke.py` at the release source, with `--expected-revision 8bb0c1ea…` | Web health ok, Web revision ok, API ready and revision ok, password sign-in ok, authenticated memberships read ok, sign-out ok (exit 0) |
| Persistence | `docker compose down` without `-v` (14:07:05Z), `up -d --wait`, same smoke again incl. sign-in of the account created before the restart (exit 0, 14:07:56Z); `migrate` was a no-op |

## 5. Promotion to the launch target

Executed 14:08Z – 14:22Z with the launcher of the bundle. The launcher was validated with the
bundle's own identity file; it selects both images from that file and rejects conflicting
image overrides.

1. `pull` — image identity check passed, both references pulled by digest.
2. `bootstrap-deletion-authority` — created the deletion journal and an instance ID; the ID
   was stored in the target's env file.
3. `validate` — rendered configuration check passed.
4. `deploy` — validate, pull, `postgres`, `migrate`, then the full stack, with the launcher's
   fixed sequence. Two attempts failed before the final successful one (§7, finding 3). The
   successful attempt ran 14:19:55Z – 14:22:06Z.

Observed order of the successful attempt, from container state timestamps:

| Step | Start – finish |
|---|---|
| `release-guard` (logged `Production release guard passed`, exit 0) | 14:20:51Z – 14:20:53Z |
| `migrate` (exit 0) | 14:21:02Z – 14:21:08Z |
| `api`, `worker` | started 14:21:08Z |
| `web` | started 14:22:00Z |

Post-deploy state: `postgres`, `api`, `web` healthy, `worker` running, Alembic head `0061`.

| Check | Result |
|---|---|
| Configured image and image ID of `release-guard`, `migrate`, `api`, `worker` | backend digest `sha256:f3b5f7ea…ddd1`, identical to the Development target |
| Configured image and image ID of `web` | Web digest `sha256:edd2f5f8…e12f1`, identical to the Development target |
| `build:` keys in the rendered Compose configuration | 0 |
| API `EIMIR_BUILD_REVISION` / `EIMIR_ENVIRONMENT` | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` / `production` |
| API readiness (`/api/v1/health/ready` from inside the API container, loopback) | HTTP 200 `{"status":"ok","database":"ok"}`, `X-Eimir-Revision: 8bb0c1eadbeb4864788d277a25a3673c79f5e46f` |
| Web `/healthz` and `/.well-known/eimir-revision` | `ok` and `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` |
| API from the host over cleartext | refused with `HTTPS_REQUIRED` — the Production transport contract, not a failure |

The Production API accepts cleartext HTTP only from a loopback peer, so `deployment_smoke.py`
cannot be pointed at a cleartext Production target. API readiness and revision were therefore
read from inside the API container. An authenticated sign-in was not exercised on the
Production-mode target; it was exercised on the Development target only.

### No rebuild

- Both targets reference the same two digest-qualified references; every container's image ID
  equals the published digest; the rendered configuration contains no `build:` key.
- Images were pulled with `pull_policy: always`; no `scripts/build_self_hosted_source.py` or
  `scripts/compose_checked.py` was run and no source-built image tag exists. The only local tags
  ever created were aliases of the published images for the rehearsal in §6; they were removed.
- The published archives' SHA-256 values are bound to the digests through
  `releaseArtifactSha256` in the identity file (`c7eacb50…d306`, `da7220ef…8ffd`).
- The images are the bytes published by run `35513301429`, not those of candidate run
  `35512593794` (see #914 delta §8, finding 1). Acceptance therefore ran on the shipped artifact.

## 6. Rollback and forward-fix boundary

`v0.1.0` is the first release, so no earlier release exists and none was created.

Contract, taken from the published manifest and the release-publication workflow:

- The manifest of `v0.1.0` has `previousKnownGood: null`, and
  `rollback = {applicationReleaseSelectable: false, databaseRollbackImplied: false,
  schemaCompatibilityReviewRequired: true, authority: [#190, #375]}`.
- A later non-initial release must name `previous_known_good_version`; the workflow downloads
  that release's manifest and `release_manifest.py` stores `previousKnownGood` as
  `{version, tag, sourceRevision, manifestSha256}` and sets
  `applicationReleaseSelectable: true`. A non-initial build without a previous manifest, and an
  initial build with one, are rejected. Called against the published `v0.1.0` manifest at the
  release source, the derivation yields
  `{"version":"0.1.0","tag":"v0.1.0","sourceRevision":"8bb0c1ea…","manifestSha256":"ae2f104d…7277a"}`.
- The OCI digests of a previous release are not inside `previousKnownGood`; they come from that
  release's own `self-hosted-image-identity.json` (an immutable, checksummed release asset).
  App rollback is: put the previous release version and both digest-qualified references from
  its identity file into the env file (or Arcane project environment), rerun the launcher
  `deploy` or an Arcane Redeploy, and repeat smoke verification. Selection is deterministic
  because the previous release, its manifest hash and its identity file are all immutable.
- App rollback is never a database rollback. Compatible schema: select the previous release.
  Incompatible schema already applied: no blind old-image start; choose a tested forward fix,
  downgrade migration or coordinated restore per #190 and
  `docs/DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md` §9 and §11.

Rehearsal (non-destructive, isolated): `scripts/self_hosted_upgrade_rehearsal.py --scenario
release` at the release source, run against local tags of the published `v0.1.0` backend and
Web images, 14:24:28Z – 14:29:59Z, exit 0 (`release lifecycle rehearsal passed`):

1. fresh installation from release A;
2. upgrade to release B without schema change, and rollback to A (allowed, schema compatible);
3. upgrade to release C with a new migration; the migration is applied exactly once;
4. rollback C → A while the database is ahead **fails closed**; running services, schema and
   data are untouched;
5. re-selecting the newer release recovers.

Releases A/B/C are synthetic fixtures derived from the `v0.1.0` backend image inside the
throw-away rehearsal project; they are not product versions, were not tagged or pushed, and were
deleted with the project. The two rehearsal image tags were removed afterwards.

Not exercised, because it would require a second published release: a real rollback from a
newer release to `v0.1.0`.

## 7. Findings

1. **The published operator bundle cannot start its launcher.** `scripts/self_hosted_release.py`
   and `scripts/check_runtime_environment.py` import `scripts/_identity_environment.py` (added
   by #954). `release-publish.yml` copies both scripts into the bundle but not the helper, so
   starting either from the extracted `eimir-self-hosted-v0.1.0.tar.gz` fails with
   `ModuleNotFoundError`. Repository CI always runs the scripts inside a full checkout and could
   not see it. The #914 delta proved the Compose/guard path, which does not use the scripts, so
   the launcher path was first exercised here. The release asset is immutable and covered by
   `SHA256SUMS`. **Fix:** PR #1121 ships the helper, lists it in the expected bundle listing and
   adds a regression test that starts every shipped script from a bundle assembled from the
   workflow's own copy lines (red without the fix, green with it); it applies from the next
   release. **Workaround used here:** `scripts/_identity_environment.py` taken from the release
   source `8bb0c1ea…` (SHA-256 `d1e147b9b55dd87c87107915da17a8b360ae08f94d5aa3d254fe2710ee883f9a`)
   and placed next to the bundle's scripts; no other file differed from the bundle. Operators
   of `v0.1.0` need the same file, or the Arcane path (in-manifest `release-guard`), which does
   not use the scripts.
2. **Development is not guarded.** `release-guard` does nothing for `development`, so the
   published digests on the Development target are enforced only by operator configuration.
   `docs/DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md` §4 describes Development as source-built at
   the candidate SHA; #915 requires accepting the published candidate there. The chain in §14 of
   that document (Development before publication) is inverted for this exercise by design.
3. **`validate` accepts a configuration the API refuses.** With `EIMIR_ENVIRONMENT=production`
   and an `http://` `EIMIR_PUBLIC_BASE_URL`, `validate` passed, `migrate` ran, and the API then
   refused to start (`Production requires an https EIMIR_PUBLIC_BASE_URL`), failing the launcher's
   `--wait` after about two minutes. The API never served, so it fails closed; it is a usability
   gap (the launcher's own check is weaker than the runtime's), not a contract violation. This
   was an operator configuration error in this exercise. A second attempt failed only because another local
   stack held port 38000. Both were corrected in the env file; images and identity did not change.
4. **Single-platform images.** The published images are `linux/amd64` only; on an arm64 Docker
   host they run under emulation (Compose printed a platform warning). No effect on identity.

## 8. Cloud/Managed scope

`NOT_APPLICABLE` for this evidence. The repository does not declare Cloud/Managed part of the
reviewed launch scope: the 2026-09-12 gate review states Cloud/Managed must not be declared
launch-ready and recommends Self-Hosted-only; #914 published a Self-Hosted release set; the
published release contains no `cloud-deployment-identity.json`; #797 and the real managed target
evidence remain open. No managed-environment evidence was produced. The scope decision is
owned by #525; this classification does not certify Cloud/Managed as launch-ready. If #525 later
includes Cloud/Managed, the #668 evidence (resolved backend/Web digests and
`cloud-deployment-identity.json`) becomes a separate blocker.

## 9. Android

`NOT_APPLICABLE` for this scope. The manifest carries
`android: {"included": false, "signing": "not-applicable"}`; no Android artifact was involved
in the promotion.

## 10. Acceptance criteria of #915

| Criterion | Status | Basis |
|---|---|---|
| Exact #914 release version/commit is used | `PASS` | §2; digests, source SHA and OCI labels equal; `main` unused |
| Persistent Development acceptance is recorded | `PASS` — condition C2 | §4; migrate, health, revision, authenticated smoke, restart with retained volumes |
| Same immutable candidate is promoted to the launch/staging-equivalent target | `PASS` — conditions C1, C2 | §5; same two digests, launcher path, no rebuild |
| Deployed API/Web revision identity matches the release | `PASS` — condition C2 | §4, §5; both `8bb0c1ea…` on both targets |
| Previous-known-good application identity is retained | `PASS` | `previousKnownGood: null` is the correct value of the initial release; derivation for the next release shown (§6) |
| Rollback/forward-fix boundary exercised or traceably demonstrated | `PASS` | §6; contract plus fail-closed rehearsal; a real rollback needs a second release |
| Cloud/Managed digest evidence only if in scope | `NOT_APPLICABLE` | §8 |
| G5-05 has traceable evidence consumable by #525 | `PASS` for the evidence; the criterion decision is #525's | this document |

Conditions:

- **C1** — the published `v0.1.0` bundle's launcher needs the missing helper (§7 finding 1);
  fix PR #1121, not merged by this work. #525 or the Product Owner must accept the documented
  `v0.1.0` workaround or require a later release that carries the fix.
- **C2** — both targets are isolated, disposable Compose projects on one workstation Docker
  host: no long-lived Arcane Development instance, no second host, no real TLS ingress, no
  external secret custody. The 2026-09-05 report already recorded that a genuine two-host
  promotion needs real infrastructure; this exercise does not change that. #525 or the Product
  Owner must accept this boundary as the launch/staging-equivalent boundary, or supply real
  hosts.

Recommended G5-05 input for #525: the promotion and identity mechanics are proven for the exact
published release; the criterion can be decided `PASS` once C1 and C2 are accepted, otherwise it
remains `BLOCKED` on them. #915 is left open until then.

## 11. Cleanup

At 14:30:43Z both target projects were removed (`docker compose down -v`: their own containers,
network and volumes only). Nothing of this exercise remains running. The pulled release images
remain in the local image cache. No secret, token or account credential is recorded here.
