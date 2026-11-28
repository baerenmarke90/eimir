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
| `android/eimir-release-unsigned.apk` | optional release-mode APK evidence candidate when Android is selected | `sbom/android-apk.spdx.json` |
| `android/eimir-release-unsigned.aab` | optional release-mode AAB evidence candidate when Android is selected | `sbom/android-aab.spdx.json` |

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
  SHA-256 values, SBOM SHA-256 values, backend roles and the explicit Android channel
  state;
- `SHA256SUMS`, which protects transport of exactly the selected subjects, SBOMs and
  evidence index.

Backend and Web are always evidence subjects. With `include_android=false`, the index
records `android: {included: false, signing: not-applicable}` and no Android package,
Android SBOM or Android attestation exists. With `include_android=true`, the existing
APK/AAB identity, SBOM and attestation contract remains mandatory.

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

`workflow_dispatch` builds the current selected revision, always generates backend/Web
SPDX evidence and optionally generates Android APK/AAB evidence when
`include_android=true`. It publishes the selected evidence set and creates GitHub
artifact attestations for exactly those subjects.

### Reusable release integration

`workflow_call` allows M6 release work to invoke the same build/evidence contract and
passes the frozen Android channel selection through to #193 evidence. If publication
mutates selected artifact bytes, those final artifacts must be re-evidenced after the
last mutation. The attestation primitive under
`.github/actions/attest-release-artifact` is reusable in the final publishing job for
file subjects.

If #519 chooses registry-published OCI images, it should use the same pinned GitHub
attestation actions with `subject-name` plus immutable `subject-digest` instead of
attesting an intermediate archive. The SBOM format, least-privilege permissions and
verification rules remain unchanged.

## 4. Android signing boundary

When Android is selected, #565 uses `de.eimir.app` for the new eimir. installation.
The `versionName` contract, publisher-supplied monotonic `versionCode` within that
package, and external release signing remain required. Historical #194 artifacts
retain their original package and attestations; they are not rewritten.

#193 deliberately does **not** consume Android signing secrets. Its optional APK/AAB
outputs are release-mode, unsigned evidence candidates. This prevents release
credentials from being introduced merely to validate SBOM/provenance generation.

When Android is excluded, there are no APK/AAB evidence candidates and no Android
signing boundary to satisfy for that release channel. For a later Android-inclusive
store release, #519 owns the protected signing/publishing environment. The invariant is
strict:

> signing changes the artifact bytes, therefore the final signed APK/AAB is the
> attestation subject and receives a freshly generated SBOM and fresh provenance
> after signing.

An attestation of `eimir-release-unsigned.*` must never be presented as evidence
for a different signed store artifact.

## 5. Build identity and coherence

Both container builds receive exactly `EIMIR_BUILD_REVISION=$GITHUB_SHA`.
`evidence-index.json` records the same source revision. Android packaging is built
from `android/` (#1008 Slice B); its product identity is verified dynamically
via `aapt dump badging` from the built APK (`package: name='de.eimir.app'
versionCode='...' versionName='...'`), and `evidence-index.json` records canonical
`apiBaseUrl` and `launchableActivity` (`de.eimir.app.MainActivity`). Its monotonic
`versionCode` is supplied as a workflow input (`-PeimirVersionCode`), and `versionName`
is parameterized via `release_version` (`-PeimirVersionName`).
The Gradle build uses verified Gradle wrapper checksums and strict dependency verification
(`gradle/verification-metadata.xml`) under pinned JDK 21 and Node 26.13.1.
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

The build/SBOM job also has only `contents: read`. It receives no signing or
server credential. An explicit Android FCM build may receive only the named
`EIMIR_ANDROID_GOOGLE_SERVICES_JSON` client configuration, whose identifiers are
public once packaged in the app. It is validated against the selected project
and `de.eimir.app` before the build and removed afterward. Pull-request and
Android-excluded evidence do not require or use this optional build input.

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

8. `supply-chain-state.json` records whether this repository has artifact
   attestations and code scanning (section 11) and is part of `SHA256SUMS`.

The attestation job downloads that exact evidence set, re-verifies
`SHA256SUMS`, confirms the recorded supply-chain state against a fresh probe of the
repository, creates build-provenance and SPDX attestations for each subject, retains
the local Sigstore bundles, captures current trusted roots, and then exercises local
bundle verification before uploading the offline-verification material. On a
repository recorded without attestations it verifies the record instead (section 11).

`tools/ci/test_release_evidence.py` is a fail-closed policy test for the workflow. It
checks the immutable action pins, the expected four-subject artifact set, SPDX 2.3,
permission separation, absence of Android signing secrets, checksum verification,
no `pull_request_target` privilege path, and runs the verification steps in both
supply-chain states with a stubbed `gh`.

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

## 11. Repositories without attestations or code scanning (Decision 0019, D5)

GitHub artifact attestations and code scanning (CodeQL) are free on a public
repository. On a private repository of a personal account neither is available:
attestations need GitHub Enterprise Cloud and code scanning needs GitHub Code
Security. The Product Owner accepted on November 25, 2026
([cut-over runbook](../CUTOVER-RUNBOOK.md#8-decisions-needed-from-the-product-owner),
decision D5) that the private `eimir-pro` repository runs without both at the cut-over,
recorded in the evidence. The public `eimir-core` keeps both.

### Detection

`scripts/supply_chain_state.py` reads the repository metadata
(`gh api repos/<owner>/<repo>`: visibility and owner type). It never infers the state
from a failing step.

| Repository | `EIMIR_SUPPLY_CHAIN_EXCEPTION` | Result |
| --- | --- | --- |
| public | unset | attestations and CodeQL **available**: unchanged behaviour |
| organization (private or internal) | unset | **available** (the plan is assumed to include the products; a missing product fails the attestation step loudly) |
| private, personal account | `decision-0019-d5` | attestations and CodeQL **unavailable**, recorded with the reason |
| private, personal account | unset or any other value | **refused**: the build stops and names the variable |
| public or organization | set | **refused**: the exception cannot waive an available capability |

The variable is a plain Actions variable in `eimir-pro` (runbook C16). It records the
Product Owner's acceptance; it is never set in `eimir-core`.

### The record

The build job writes `release-evidence/supply-chain-state.json` before any image is
built and binds it into `SHA256SUMS`:

```json
{
  "schemaVersion": 1,
  "kind": "eimir-supply-chain-state",
  "repository": "baerenmarke90/eimir-pro",
  "visibility": "private",
  "ownerType": "User",
  "sourceRevision": "<40-hex source commit>",
  "attestation": {"state": "unavailable", "reason": "GitHub artifact attestations need ..."},
  "codeScanning": {"state": "unavailable", "reason": "GitHub code scanning (CodeQL) needs ..."},
  "acceptedBy": "Decision 0019, cut-over runbook decision D5 (November 25, 2026)"
}
```

On a repository with the capabilities both entries read `{"state": "available"}` and
`acceptedBy` is absent. The record is part of every published evidence set and of the
product Release assets.

### Verification in both states

- Every consumer (the attestation job of Release Evidence and the product publisher)
  re-probes the repository and requires the transported record to be **exactly** the
  fresh one: same repository, source revision, states and reasons. A stale, copied or
  edited record fails, so a record from `eimir-pro` can never switch attestations off
  in `eimir-core`.
- **Available:** every attestation step runs; the verification step first requires a
  non-empty provenance and SBOM bundle for every expected subject, then runs
  `gh attestation verify` for each, as before. A missing bundle fails.
- **Unavailable:** the attestation steps and the bundle upload do not run. The
  verification step still runs, verifies the record, requires that **no** bundle
  exists, writes a notice annotation and a job-summary line, and only then succeeds.
  It never turns green without that check.
- **CodeQL as a required workflow:** where code scanning is recorded unavailable,
  `codeql.yml` is not dispatched by the nightly regression and is not required by the
  Nightly Regression Report or by `scripts/test_deployment_channel.py` (test channel and
  product-release full-regression gate); the job logs and summaries name the reason.
  Every other required workflow keeps its guarantees: missing, pending, failed,
  cancelled or skipped work is still refused.

`tools/ci/test_supply_chain_state.py`, `tools/ci/test_release_evidence.py`,
`tools/ci/test_release_publish_workflow.py`, `tools/ci/test_test_deployment_channel.py`
and `tools/ci/test_nightly_regression.py` cover both states, including an unavailable
state without the record and an available state with a missing attestation.

### What the private repository proves, and what it does not

Proved in `eimir-pro`, as in `eimir-core`:

- the exact archives, their SHA-256 digests and SPDX 2.3 SBOMs, bound to one source
  revision by `evidence-index.json` and `SHA256SUMS`;
- the OCI labels and registry digests checked against those archives before promotion;
- the full regression of the source revision, without CodeQL.

Not proved in `eimir-pro`:

- **no signed build provenance:** nothing outside GitHub's own run log binds an archive
  to the workflow, runner and commit that built it; a consumer can check hashes only
  against the evidence set it was given;
- **no signed SBOM claim:** the SBOM is a file next to the archive, not a signed
  statement about it;
- **no static analysis** of the Pro code and the release pipeline by CodeQL.

The Pro images are consumed only by the operator's own deployment for now, which is why
D5 accepts this gap. It must be closed before any Pro image is delivered to a
Self-Hosted operator.

### Follow-up (not implemented here)

- a free Python security linter for the Pro code in `eimir-pro` CI, for example Bandit;
- key-based image signing (for example Sigstore cosign with a key held only in
  `eimir-pro`), so the Pro images carry a verifiable signature before Self-Hosted.
