# G5 Release Publication Evidence Delta — v0.1.0 (#914)

**Owner:** #914  
**Consumed by:** `docs/m6/G5-EVIDENCE.md` (G5-02, G5-03), #915, #525  
**Release source:** `main` at `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`  
**Historical evidence retained unchanged:** `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md` and the
earlier deltas. This document is additive; it does not rewrite what earlier records said
about the state of release publication at their own dates.

## 1. Result

`PASS` for the #914 publication step of the launch release **v0.1.0**: the protected
publish workflow produced an immutable GitHub Release from the frozen source, published the
digest-pinned runtime images, and the published artifacts were verified independently. The
Arcane/Compose release guard introduced by #1112 was proven against the real published
digests. This document does not decide G5; #525 does.

Launch scope covered: Self-Hosted release set, Android **not included**
(`NOT_APPLICABLE`, see §7).

## 2. Identity

| Item | Value |
|---|---|
| Release | `v0.1.0` — https://github.com/baerenmarke90/eimir/releases/tag/v0.1.0 |
| Tag target / release source | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` (`main`, identical to `release/0.1.0-rc1`) |
| Release immutability | `isImmutable = true`; `gh release verify v0.1.0` passed |
| Candidate run | `35512593794` (`release-candidate.yml`, `release_version=0.1.0`, `include_android=false`, `initial_release=true`, success) |
| Publish run | `35513301429` (`release-publish.yml`, same inputs plus `confirm_publish=true`) |
| Publish attempts | Attempt 1 failed closed: the repository setting "Immutable releases" was disabled, so the workflow deleted the staged release and tag. The GHCR images had already been pushed. After the setting and the `production-release` environment were configured, only the failed job was re-run (attempt 2, success). Evidence artifacts and image digests were unchanged between the attempts. |
| Previous known-good release | none (initial release; manifest `previousKnownGood: null`) |

## 3. Published images

| Role | Reference |
|---|---|
| Backend (`api`, `worker`, `migrate`) | `ghcr.io/baerenmarke90/eimir-backend:v0.1.0@sha256:f3b5f7ea23aad99844ed558dd4a148d4196cb1b52c6ceed3a0d8636a9715ddd1` |
| Web | `ghcr.io/baerenmarke90/eimir-web:v0.1.0@sha256:edd2f5f88bafe8fde5a2dd6223507b3fb71d14474d0c5f7162d2696324be12f1` |

The publish job pulled both digests anonymously. OCI labels of both archives:
`org.opencontainers.image.revision` = release source, `version` = `0.1.0`,
`source` = `https://github.com/baerenmarke90/eimir`.

## 4. Release assets (15)

`eimir-release-manifest.json`, `evidence-index.json`, `self-hosted-image-identity.json`,
`eimir-self-hosted-v0.1.0.tar.gz`, `backend-runtime.image.tar`, `web-runtime.image.tar`,
`backend-runtime.spdx.json`, `web-runtime.spdx.json`, `backend-runtime-sbom.json`,
`web-runtime-sbom.json`, `backend-runtime-provenance.json`, `web-runtime-provenance.json`,
`trusted_root.jsonl`, `RELEASE-NOTES.md`, `SHA256SUMS`.

Verified after download: all 14 entries of `SHA256SUMS` match. `self-hosted-image-identity.json`
is byte-identical to the copy inside the operator bundle, has `schemaVersion` 1, kind
`eimir-self-hosted-image-identity`, product `eimir.` `v0.1.0`, the release source revision, the
two references above with their digests, and roles `api/worker/migrate` and `web`. It contains
no placeholder marker and no `latest`. Its `releaseArtifactSha256` values equal the SHA-256 of the
published archives:

| Artifact | SHA-256 |
|---|---|
| `backend-runtime.image.tar` | `c7eacb504cbd34c9a5c5f836bd404d8043df44c238ab068c6ffefa663f0bd306` |
| `web-runtime.image.tar` | `da7220efdb16234259a6d19df734d9bb742608195ef40fa4433afb61ba288ffd` |

The operator bundle contains `compose.yaml` (identical to the file at the release source),
`deploy/self-hosted-release.env.example`, `scripts/self_hosted_release.py`,
`scripts/check_runtime_environment.py` and the published `self-hosted-image-identity.json`.

## 5. Provenance and SBOM

`gh attestation verify` succeeds for both archives against the repository. Each verified
attestation carries source digest `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` and signer workflow
`.github/workflows/release-evidence.yml@refs/heads/main`. The retained DSSE bundles bind SLSA
provenance and SPDX 2.3 SBOM statements to the archive digests above; the provenance payloads
name the release source revision. The OCI digest itself carries no separate attestation: the
attested subject is the archive bound to the digest through `releaseArtifactSha256`, which is the
existing #519/#193 contract.

## 6. Positive real Production/Compose proof (#1112)

Executed in an isolated disposable Compose project (`eimir-rel-proof`, own volumes, ports bound
to loopback, no existing data), using the extracted published operator bundle, its
`compose.yaml` and its `self-hosted-image-identity.json`:

- `EIMIR_ENVIRONMENT=production`, `EIMIR_RELEASE_VERSION=0.1.0`, both published references with
  their digests, `pull_policy=always` (default), no local image or source build (`build` absent
  from every service);
- **Bootstrap:** `COMPOSE_PROFILES=bootstrap` pulled the backend by digest, the guard logic
  accepted the published identity, and the one-shot created the deletion journal and printed a
  fresh Account-deletion instance ID;
- **Deploy:** `COMPOSE_PROFILES=self-hosted` with that instance ID. `release-guard` logged
  `Production release guard passed` and exited 0 at 13:41:09Z; `migrate` started at 13:41:18Z
  and exited 0; `api`/`worker` started at 13:41:24Z and `web` at 13:41:36Z. The migration
  therefore ran only after the guard had completed;
- every container of `release-guard`, `migrate`, `api`, `worker` and `web` ran the exact published
  digest (configured image reference and resolved image ID equal the digests in §3);
- smoke: all services healthy under `up --wait`; Web `/healthz` ok; Web
  `/.well-known/eimir-revision` = release source; API container `EIMIR_BUILD_REVISION` = release
  source. Direct host access to the API is refused with `HTTPS_REQUIRED`, which is the
  Production reverse-proxy contract and not a failure.

Teardown removed only the project's own containers, network and three volumes and the pulled
images. The negative cases of #1112 were not repeated; no contract doubt arose.

## 7. Android

Android is excluded from this launch scope: the manifest and evidence index carry
`android: {"included": false, "signing": "not-applicable"}` and no APK/AAB or Android
attestation exists. Status for the G5 criteria that concern Android signing: `NOT_APPLICABLE`
for this scope.

## 8. Findings for #915 / #525

1. **Candidate and published bytes differ.** The publish workflow builds its own evidence from the
   same source revision; the archives it publishes are not the archives of candidate run
   `35512593794` (candidate backend `18049df4…`, web `aee0877f…`). The contract binds the release to
   the frozen source revision and to its own archives, not to the candidate run's bytes. The
   candidate run is therefore evidence that the candidate/manifest contract works for this source,
   not the origin of the published bytes.
2. **`RELEASE-NOTES.md` of v0.1.0 is defective.** An unquoted heredoc executed backticked values
   as commands, so the notes read `Source revision: ` and lack the file names. The asset is
   immutable and covered by `SHA256SUMS`; this document is the authoritative record. The
   generator is fixed in PR #1117 for later releases.
3. **Approval gate.** When attempt 1 ran, the `production-release` environment did not exist, so
   it was created implicitly without protection. Before attempt 2 it existed with no protection
   rules (no required reviewer), so neither attempt was gated by a human approval. Adding a
   required-reviewer rule is recommended before further releases.
