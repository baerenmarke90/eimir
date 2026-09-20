# G5 Evidence Delta — #1123 protected publication approval

**Date:** 2026-09-20  
**Owning issue:** #1123  
**Consumed by:** #525  
**Release:** `v0.1.2`  
**Source revision:** `9beb47317928be3b968e6f56775f7c4b9ce1b5c0`

## Purpose

This delta closes the sole blocker identified by the 2026-09-20 #525 review:
the missing explicit release-owner approval on the GitHub Environment
`production-release`.

It does not rewrite the historical #914/#915 publications. Instead, a successor
release was produced from an unchanged application runtime through the protected
approval boundary required by `docs/m6/IMMUTABLE-RELEASES.md`.

## Release scope

The launch scope is unchanged:

- Web + Self-Hosted;
- Android package/store publication: `NOT_APPLICABLE`;
- Cloud/Managed: `NOT_APPLICABLE`;
- launch Entitlement source: `ADMIN_GRANT` only.

The compare `v0.1.1...v0.1.2` contains documentation/evidence changes only. It
contains no backend, Web application, Android runtime, Compose/deployment-runtime or
migration change. Existing #916/#917 runtime evidence therefore remains applicable
without relabeling the live Demo identity.

## Candidate

Workflow: `.github/workflows/release-candidate.yml`  
Run: https://github.com/baerenmarke90/eimir/actions/runs/35521880601  
Attempt: 1  
Result: **SUCCESS**

Inputs:

- `release_version=0.1.2`
- `include_android=false`
- `initial_release=false`
- `previous_known_good_version=0.1.1`

The candidate completed the release manifest contract, input verification, artifact/
SPDX build, exact-byte attestations and release-identity binding on source
`9beb47317928be3b968e6f56775f7c4b9ce1b5c0`.

## Protected publication

Workflow: `.github/workflows/release-publish.yml`  
Run: https://github.com/baerenmarke90/eimir/actions/runs/35521890433  
Final attempt: 2  
Result: **SUCCESS**

The first attempt stopped in `Verify immutable release inputs` because the candidate
run was still completing:

```text
Release source still has pending checks: Bind release identity and candidate bundle
```

The protected publication job was skipped on that attempt. This is expected fail-closed
behavior: publication did not proceed while a required source check was pending.

After candidate success, only the failed publication path was rerun. Attempt 2 reused
the successful build/attestation jobs, completed the immutable-input preflight and then
queued `Sign and publish immutable release` behind the GitHub Environment
`production-release`.

### Environment approval evidence

GitHub's workflow-run approval history for run `35521890433` records:

- reviewer: `baerenmarke90`;
- state: `approved`;
- environment: `production-release`;
- environment id: `22334132487`.

Before approval, the protected job was reported by GitHub as `waiting`. After the
review event it moved to `in_progress`, and only then obtained the environment-scoped
publication boundary and executed the release steps.

This is the explicit release-owner approval required by the release contract. The
repository-side policy naming the authorized reviewer and least-privilege boundary was
merged in PR #1125 before this release source was frozen.

## Published immutable release

GitHub Release: https://github.com/baerenmarke90/eimir/releases/tag/v0.1.2  
Release id: `392492163`  
Published: `2026-09-20T16:17:56Z`  
Immutable: **true**  
Target/source: `9beb47317928be3b968e6f56775f7c4b9ce1b5c0`

The protected publication job completed all final checks, including:

- retained attestation verification;
- final release-manifest construction;
- exact build-once runtime image publication;
- anonymous GHCR consumption from an isolated clean Docker daemon;
- deterministic Self-Hosted operator bundle;
- release checksums;
- tag/Release unused recheck immediately before publication;
- immutable GitHub Release publication;
- final published identity verification;
- retained final evidence snapshot.

### OCI runtime identity

Backend:

```text
ghcr.io/baerenmarke90/eimir-backend:v0.1.2@sha256:42db20c2c045b7f956c3b105df547fa29de83c6ebf983826c1f8ddd5303149b4
```

Web:

```text
ghcr.io/baerenmarke90/eimir-web:v0.1.2@sha256:962afb65746ca3f44252bca77910426fb060b08de62013420ba265f05cf07e04
```

The `v0.1.2`, source-SHA and transport aliases resolved to those same digests.
The workflow then anonymously pulled both digest-qualified images successfully.

### Selected immutable release assets

| Asset | SHA-256 |
| --- | --- |
| `backend-runtime.image.tar` | `79e9cb3158ab33b284cd28ca3db2135cc128eadf6c2235088e4137626cfe8679` |
| `web-runtime.image.tar` | `a643e5a988529c8f67d32d0378b4693afb1426c16d8851f27e34dfb836a33582` |
| `eimir-release-manifest.json` | `d5b6084e18819b375fe7da57a8f720652f9dbafa223adb82d682f99d1c1f8699` |
| `self-hosted-image-identity.json` | `6cc90542cb1b438c74650bf0d14853b423e1ccf9995ff63736d09196a088bfe1` |
| `eimir-self-hosted-v0.1.2.tar.gz` | `cc916b21371c60a0d1e5d8968b323e831ae927d2589b52cc333e2e4948e94d56` |
| `SHA256SUMS` | `d57e0054a3c0197f75669786b6c9afab0cf04e2125ea331860926bc6169bc2a5` |

The retained final workflow artifact is
`published-release-v0.1.2-9beb47317928be3b968e6f56775f7c4b9ce1b5c0`
(artifact id `10608827039`, digest
`sha256:ebb6f210e5e9d81ec2c341d15a90e8cbe4d66e739d2d74b4d1f18d60785f922f`).

## #1123 acceptance

- [x] protected publication crossed an explicit release-owner approval boundary;
- [x] authorized approver and least-privilege policy are documented;
- [x] GitHub records the `production-release` approval by `baerenmarke90`;
- [x] a successor launch release was produced through that approved boundary;
- [x] candidate/publication, SBOM/attestation/provenance, immutable Release, exact OCI
  identity and previous-known-good semantics remained green;
- [x] #914/#915 historical evidence remains unchanged.

## G5 impact

**G5-02: PASS.**

The previously missing controlled-publication approval is now directly evidenced on
the immutable launch release `v0.1.2`. No other G5 criterion changes as a result of
this delta.
