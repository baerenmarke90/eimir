# M6 SBOM and Artifact-Attestation Contract

**Owner:** #193  
**Consumes:** #194, #375  
**Consumed by:** #519 and the G5 release rehearsal

This document defines how eimir. produces machine-readable software bills of
materials and cryptographically signed provenance for release artifacts. It is
release-evidence infrastructure only: it does not choose the final publication
model, publish a product release, introduce a second deployment platform or change
product behavior.

## 1. Reuse-before-build decision

eimir. uses existing standards and platform primitives rather than a custom
provenance format:

- **SPDX 2.3 JSON** is the machine-readable SBOM format;
- **Syft 1.42.3** generates the SPDX documents;
- the Syft Linux AMD64 release archive is pinned by version and SHA-256 before it is
  executed;
- GitHub's `actions/attest-build-provenance` creates SLSA build-provenance
  attestations;
- GitHub's `actions/attest-sbom` binds the SPDX document to the exact artifact
  subject;
- GitHub CLI verifies the resulting Sigstore bundles online or offline.

The workflow intentionally does not use `anchore/sbom-action`. The project already
requires immutable action/build inputs, and the direct Syft release-asset path lets
CI verify the exact downloaded binary archive before execution.

`docs/DEPENDENCIES.md` remains the human-reviewed dependency, license and asset
inventory. It is **not replaced** by release SBOMs: the two records have different
purposes and both remain required.

## 2. Release-evidence artifact set

`.github/workflows/release-evidence.yml` builds one coherent evidence set from
`github.sha`.

| Evidence subject | Runtime meaning | SBOM |
|---|---|---|
| `backend-runtime.image.tar` | one Docker-compatible backend image archive used by API, worker and migrate | `sbom/backend-runtime.spdx.json` |
| `web-runtime.image.tar` | Docker-compatible Web image archive | `sbom/web-runtime.spdx.json` |
| `android/eimir-release-unsigned.apk` | release-mode APK evidence candidate | `sbom/android-apk.spdx.json` |
| `android/eimir-release-unsigned.aab` | release-mode AAB evidence candidate | `sbom/android-aab.spdx.json` |

API, worker and migrate are deliberately **not** represented as three invented
container artifacts. `compose.yaml` already builds all three roles from the same
backend context and image contract, so one backend runtime identity is the correct
release subject.

The container evidence path intentionally uses the repository's existing Docker build
primitive followed by `docker image save`. This works on the stock GitHub Hosted
Runner Docker driver and avoids introducing a second BuildKit driver solely for OCI
file export. Syft inventories these archives through its `docker-archive` source.
#519 can still choose immutable registry OCI digests as the final launch artifact;
#193 does not pre-empt that publication decision.

The evidence bundle additionally contains:

- `evidence-index.json`, which records the source revision, subject paths, subject
  SHA-256 values, SBOM SHA-256 values, backend roles and Android release identity;
- `SHA256SUMS`, which protects transport of the subjects, SBOMs and evidence index.

The evidence index is not the #519 product release manifest. #519 remains responsible
for the final mapping `product version -> commit -> published release artifacts` and
for previous-known-good release selection.

## 3. Workflow modes

The workflow supports three deliberately different invocation modes.

### Pull request

A pull request that changes the evidence implementation executes the real build and
SBOM-generation path. The attestation job is skipped for pull requests so unreviewed
PR commits do not receive repository release attestations.

### Manual evidence run

`workflow_dispatch` builds the current selected revision, generates all four SPDX
SBOMs, publishes the evidence workflow artifact and creates GitHub artifact
attestations. This is suitable for validating the complete #193 mechanism before a
final launch workflow exists.

### Reusable release integration

`workflow_call` allows M6 release work to invoke the same build/evidence contract.
If #519 chooses a publication path whose final bytes differ from these evidence
subjects, the final artifacts must be re-evidenced after the last mutation. The
attestation primitive under `.github/actions/attest-release-artifact` is reusable in
the final publishing job for file subjects.

If #519 chooses registry-published OCI images, it should use the same pinned GitHub
attestation actions with `subject-name` plus immutable `subject-digest` instead of
attesting an intermediate archive. The SBOM format, least-privilege permissions and
verification rules remain unchanged.

## 4. Android signing boundary

#194 already freezes `de.sidebyside.app`, the `versionName` contract, publisher
supplied `versionCode` and external release signing.

#193 deliberately does **not** consume Android signing secrets. Its APK/AAB outputs
are release-mode, unsigned evidence candidates. This prevents release credentials
from being introduced merely to validate SBOM/provenance generation.

For the first store release, #519 owns the protected signing/publishing environment.
The invariant is strict:

> signing changes the artifact bytes, therefore the final signed APK/AAB is the
> attestation subject and receives a freshly generated SBOM and fresh provenance
> after signing.

An attestation of `eimir-release-unsigned.*` must never be presented as evidence
for a different signed store artifact.

## 5. Build identity and coherence

Both container builds receive exactly `EIMIR_BUILD_REVISION=$GITHUB_SHA`.
`evidence-index.json` records the same source revision. Android packaging is built
from `android/` (#1008 Slice B); its product identity is verified dynamically
via `aapt dump badging` from the built APK (`package: name='de.sidebyside.app'
versionCode='...' versionName='...'`), and `evidence-index.json` records canonical
`apiBaseUrl` and `launchableActivity` (`de.eimir.app.MainActivity`). Its monotonic
`versionCode` is supplied as a workflow input (`-PeimirVersionCode`), and `versionName`
is parameterized via `release_version` (`-PeimirVersionName`).
The Gradle build uses verified Gradle wrapper checksums and strict dependency verification
(`gradle/verification-metadata.xml`) under pinned JDK 21 and Node 22.19.0.
The legacy client under `android/` is completely decoupled from evidence pipelines and
will be retired in #1009.

#519 will add the human product version/tag and final release manifest. #193 does not
pre-empt that decision or introduce a second version source.

## 6. Security and permissions

The default workflow permission is only:

```yaml
permissions:
  contents: read
```

The build/SBOM job also has only `contents: read`. It receives no signing secret and
no repository secret.

Only the isolated attestation job receives:

```yaml
permissions:
  contents: read
  id-token: write
  attestations: write
```

That job executes only after the evidence files have been built and transported via a
checksum-verified workflow artifact. It does not run project build scripts and does
not receive release signing credentials.

All external GitHub Actions are pinned to immutable commit SHAs. Syft's downloaded
release archive is SHA-256 verified before extraction. SBOM output is written to
files and is not intentionally dumped to the Actions log.

Do not add tokens, provider credentials, signing material, `.env` contents or other
secret configuration to the evidence index, SBOM metadata, attestation metadata or
workflow logs.

## 7. Verification in CI

The build job fails unless all of the following hold:

1. backend and Web image archives were produced successfully;
2. release-mode APK and AAB were produced successfully;
3. every subject is non-empty;
4. each expected SPDX document is non-empty JSON;
5. each document declares `SPDX-2.3` and `SPDXRef-DOCUMENT`;
6. artifact/SBOM digests are recorded in `evidence-index.json`;
7. `SHA256SUMS` verifies before upload.

The attestation job downloads that exact evidence set, re-verifies
`SHA256SUMS`, creates build-provenance and SPDX attestations for each subject, retains
the local Sigstore bundles, captures current trusted roots, and then exercises local
bundle verification before uploading the offline-verification material.

`tools/ci/test_release_evidence.py` is a fail-closed policy test for the workflow. It
checks the immutable action pins, the expected four-subject artifact set, SPDX 2.3,
permission separation, absence of Android signing secrets, checksum verification and
no `pull_request_target` privilege path.

## 8. Online verification

For a produced subject, GitHub CLI can verify build provenance directly against the
repository attestation store:

```bash
gh attestation verify backend-runtime.image.tar \
  -R baerenmarke90/eimir \
  --signer-workflow baerenmarke90/eimir/.github/workflows/release-evidence.yml
```

Verify the SPDX attestation by selecting the SPDX predicate:

```bash
gh attestation verify backend-runtime.image.tar \
  -R baerenmarke90/eimir \
  --signer-workflow baerenmarke90/eimir/.github/workflows/release-evidence.yml \
  --predicate-type https://spdx.dev/Document/v2.3
```

The same commands apply to Web, APK and AAB subjects.

## 9. Offline verification

The `release-attestations-<sha>` workflow artifact contains, per subject:

- `<subject>-provenance.json`;
- `<subject>-sbom.json`;
- `trusted_root.jsonl`.

Place the matching release subject next to the downloaded bundle material. Then
verification requires no attestation lookup from the GitHub API:

```bash
gh attestation verify backend-runtime.image.tar \
  -R baerenmarke90/eimir \
  --bundle attestations/backend-runtime-provenance.json \
  --custom-trusted-root attestations/trusted_root.jsonl \
  --signer-workflow baerenmarke90/eimir/.github/workflows/release-evidence.yml
```

For the SBOM claim:

```bash
gh attestation verify backend-runtime.image.tar \
  -R baerenmarke90/eimir \
  --bundle attestations/backend-runtime-sbom.json \
  --custom-trusted-root attestations/trusted_root.jsonl \
  --signer-workflow baerenmarke90/eimir/.github/workflows/release-evidence.yml \
  --predicate-type https://spdx.dev/Document/v2.3
```

Trusted roots should be refreshed whenever new signed material is transferred into a
long-lived offline verification environment, so later key rotation or revocation
handling is not silently ignored.

## 10. What #519 must consume

When #519 creates the actual launch release, it must preserve these invariants:

1. the final backend, Web and Android artifacts all map to the same approved source
   revision/product release identity;
2. every final subject has a machine-readable SPDX 2.3 JSON SBOM;
3. build provenance is attached to the final bytes or final immutable OCI digest;
4. Android is attested **after** final signing;
5. no signing secret appears in the release manifest, SBOM, attestation or log;
6. the release manifest references the exact subject digests/checksums to which the
   #193 evidence belongs;
7. the previous-known-good and database rollback boundary remain owned by #190/#375
   and #519 rather than being implied by an attestation.

This keeps #193 evidence composable with either immutable-source or build-once OCI
publication without deciding #519's release-engineering policy in advance.
