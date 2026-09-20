# G5 Public Demo Evidence Delta — #917 — 2026-09-20

**Owner:** #917  
**Consumed by:** `docs/m6/G5-EVIDENCE.md` (G5-17), #525  
**Launch release:** `v0.1.0`  
**Required release source:** `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`  
**Public Demo exercised:** `https://demo.sbs.ur-cloud.de`  
**Initial execution:** 2026-09-20 14:11:42Z / 16:11:42 CEST  
**Post-promotion rerun:** 2026-09-20 14:41:08Z / 16:41:08 CEST  
**Post-reset verification:** 2026-09-20 14:47:02Z / 16:47:02 CEST  
**Revision-addressable live run:** GitHub Actions CI run `35515696671`; initial job `106091191660`, post-promotion job `106095097944`, post-reset job `106095845891`  
**Historical evidence retained unchanged:** the 2026-09-05 report and earlier deltas. This
document is additive and records what was actually observed on 2026-09-20.

## 1. Result

**#917: `PASS`. The live public Demo isolation rehearsal is complete for the current launch topology.**

The immutable launch release `v0.1.0` is running on the public Demo, the operator executed the
documented canonical Demo reset against that release, and the public boundary was verified again
after the reset.

Current release identity:

```text
8bb0c1eadbeb4864788d277a25a3673c79f5e46f
```

Operator-observed runtime images:

- API/worker/backend = `ghcr.io/baerenmarke90/eimir-backend:v0.1.0@sha256:f3b5f7ea23aad99844ed558dd4a148d4196cb1b52c6ceed3a0d8636a9715ddd1`;
- Web = `ghcr.io/baerenmarke90/eimir-web:v0.1.0@sha256:edd2f5f88bafe8fde5a2dd6223507b3fb71d14474d0c5f7162d2696324be12f1`.

The initial 14:11Z run remains historical evidence of the pre-promotion drift
(`957e343127a761ac3d8bc7df3d45bc4e6e13a27a`). After promotion, job `106095097944`
proved the exact release publicly. The operator then reset the canonical Demo Space and job
`106095845891` repeated the public release/entry/entitlement checks successfully after reset.

There is currently **no Production eimir. instance**. Therefore there is no Production database,
media volume or Production runtime secret set that the Demo could be sharing. The live Demo is
nevertheless explicitly scoped to its own Compose project `eimir-demo`, its own PostgreSQL named
volume/database, its own local media named volume and its own Demo runtime configuration. The
separate Production fail-closed contract is covered by the exact-release tests in §5. If a
Production instance is deployed later, its resources must remain independent; that future
deployment is outside the live topology exercised by #917.

All #917 acceptance criteria are satisfied for the topology that actually exists on 2026-09-20.

## 2. Release identity

| Item | Required | Observed after promotion | Status |
|---|---|---|---|
| Release | `v0.1.0` | operator-selected `EIMIR_RELEASE_VERSION=0.1.0`; runtime images carry `v0.1.0` | **`PASS`** |
| Source revision | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` | Web + API both `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` | **`PASS`** |
| Backend image | published digest-qualified backend reference | configured and resolved digest both `sha256:f3b5f7ea23aad99844ed558dd4a148d4196cb1b52c6ceed3a0d8636a9715ddd1` | **`PASS`** |
| Web image | published digest-qualified Web reference | configured and resolved digest both `sha256:edd2f5f88bafe8fde5a2dd6223507b3fb71d14474d0c5f7162d2696324be12f1` | **`PASS`** |

The operator-side image evidence came from `docker compose ps` plus `docker inspect` of the
running API and Web containers. No secret values were included. The networked rerun then
independently observed the release source on both public revision surfaces and ran the existing
`scripts/deployment_smoke.py` contract successfully.

## 3. HTTPS / TLS / domain

Observed on `https://demo.sbs.ur-cloud.de`:

- certificate hostname verification passed for `demo.sbs.ur-cloud.de`;
- certificate subject CN is `demo.sbs.ur-cloud.de` and SAN contains the same DNS name;
- issuer is Let's Encrypt (`YE2`);
- certificate validity observed: 2026-08-31 10:54:50Z through 2026-11-29 10:54:49Z;
- plaintext HTTP redirects to the same canonical HTTPS origin;
- HTTPS root returned the eimir. Web application with status 200 and zero HTTPS redirect hops;
- CSP was present and contained no plaintext `http://` origin;
- the delivered HTML contained no plaintext asset references;
- the referenced JS/CSS assets were fetched successfully.

**Status: `PASS` for the live HTTPS/domain boundary.** The same boundary was rechecked successfully after the live reset.

## 4. Public entry and origin boundary

The live public entry was exercised without any pre-shared credential:

1. `POST /api/v1/demo/entry` with persona `LEA` returned exactly one opaque proof and
   `Cache-Control: no-store`;
2. no password was sent;
3. that proof was consumed through the ordinary magic-link session path;
4. a second consume of the same proof returned 422, proving single-use behavior;
5. the resulting ordinary session was used only for tenant-scoped reads and then signed out;
6. no proof/access token value was printed or retained as evidence.

An unrelated-origin preflight was not granted an `Access-Control-Allow-Origin` permission
(preflight status 405). The public HTML and its referenced JS/CSS were scanned for committed Demo
password variable names and known static test-password markers; none was present.

Release-source review also confirms that `DemoEntry` submits only the selected persona. The
one-time proof is transiently carried to the ordinary magic-link consumer; it is not a reusable
public credential. The client-side `?demo=true` / session-storage marker controls presentation
only and cannot enable the backend Demo entry route.

**Status: `PASS` on the promoted immutable `v0.1.0` deployment.**

## 5. Production fail-closed semantics

The exact `v0.1.0` source was checked out in the live runner and the existing Demo/Production
boundary tests were run unchanged.

Release-source guards include:

- `EIMIR_ENVIRONMENT=demo` requires `EIMIR_DEMO_MODE=true`;
- ordinary `production` rejects `EIMIR_DEMO_MODE=true`;
- reset timer requires Demo mode;
- the Demo entry endpoint returns 404 when Demo mode is disabled;
- canonical Demo dataset creation raises before writes in Production;
- deterministic `TEST_FIXTURE` entitlement grants are forbidden in Production and restored
  fixture grants are excluded from Production entitlement evaluation;
- Web query/session markers do not confer backend Demo authority.

Focused exact-release test result:

```text
30 passed
```

The run covered `test_demo_config.py`, `test_demo_entry.py`,
`test_demo_reset_schedule.py`, the reset-scope and Production-no-write tests from
`test_demo_space.py`, `test_games_entitlement_capability.py`, and
`test_entitlements_api.py`.

**Status: `PASS` for the release contract.** No destructive experiment was performed against a
real Production deployment.

## 6. Database, media and secret isolation

The public Demo is an isolated Arcane/Compose project:

```text
COMPOSE_PROJECT_NAME=eimir-demo
EIMIR_ENVIRONMENT=demo
POSTGRES_USER=sidebyside
POSTGRES_DB=sidebyside_demo
EIMIR_MEDIA_STORE=local
```

Operator inspection recorded the actual persistent resources:

```text
eimir-demo_postgres_data project=eimir-demo role=postgres_data
eimir-demo_media_data project=eimir-demo role=media_data
eimir-demo_deletion_journal_data project=eimir-demo role=deletion_journal_data
```

The Demo cursor-signing secret was checked only through a SHA-256 fingerprint; the secret value was
not disclosed or retained in evidence.

There is currently **no Production eimir. instance**. Consequently no Production database, media
resource or Production secret/configuration set exists that could be shared with this Demo. This
is not treated as an invented Demo-vs-Production comparison: the evidence records the topology that
actually exists, plus the exact-release Production fail-closed contract in §5.

| Boundary | Live evidence | Status |
|---|---|---|
| Database | Demo-scoped Compose project and named `postgres_data` volume; database `sidebyside_demo`; no Production eimir. database exists | **`PASS`** |
| Media | Demo-scoped named `media_data` volume with local media store; no Production eimir. media resource exists | **`PASS`** |
| Secrets/config | Demo environment has its own runtime configuration and signing-secret fingerprint; no Production eimir. secret/config set exists | **`PASS`** |
| Origin | public Demo is bound to `https://demo.sbs.ur-cloud.de`; unrelated Origin was not granted CORS access | **`PASS`** |

No secret value, full database connection string, object-storage credential or private user content
is included in this evidence.

## 7. Reset

The documented reset contract never accepts an arbitrary Space ID. It resolves the durable
canonical Demo identities, fails closed on partial/ambiguous identity, purges canonical Demo media,
replaces only the verified Demo Space, restores canonical product state and invalidates Demo
authentication artifacts.

The exact-release automated test
`test_reset_replaces_only_verified_demo_space` passed and proves an unrelated Account/Space
survives reset while the canonical Demo Space is replaced.

The operator then executed the documented live reset against the isolated `eimir-demo` project.

Before reset:

```text
Canonical demo Space already present:
space=01a0bed0-9315-7c1d-87cd-4440c437e1db
reference_date=2026-09-20
```

Reset result:

```text
Canonical demo Space created:
space=01a0bf47-09e6-7928-af7b-9b2026515ccf
reference_date=2026-09-20
```

A subsequent idempotent `ensure` returned the same replacement Space
`01a0bf47-09e6-7928-af7b-9b2026515ccf`, proving the reset produced one stable canonical
replacement rather than a duplicate.

Because no Production eimir. instance exists, the live reset had no Production eimir. resource it
could mutate. The reset ran only inside the Demo Compose project and the release contract/test
provides the unrelated-Space isolation proof.

After the reset, targeted live job `106095845891` repeated HTTPS, exact release identity, public
entry, single-use proof and authoritative entitlement checks successfully.

**Status: `PASS` for the required live Demo reset rehearsal and reset-scope contract.**

## 8. Entitlement behavior

The live Demo session queried the ordinary tenant-scoped
`GET /api/v1/spaces/{spaceId}/entitlements` endpoint. It returned:

- tier: `PREMIUM`;
- status: `ACTIVE`;
- capabilities: exactly `games.couple`.

At `v0.1.0`, canonical Demo seeding records this through the normal
`entitlements.service.record_grant` path as a normalized `TEST_FIXTURE` grant with the
`games.couple` capability. There is no frontend-only all-Premium switch. The same central
entitlement service remains authoritative, and Production both refuses creation of
`TEST_FIXTURE` grants and excludes restored fixture rows from effective entitlement evaluation.

**Status: `PASS` on the promoted immutable `v0.1.0` deployment and in the exact-release contract.**

## 9. Acceptance matrix

| #917 criterion | Status | Evidence |
|---|---|---|
| Real HTTPS/domain Demo exercised | **`PASS`** | live TLS/HTTP/CSP/static-asset probe, including post-reset rerun |
| Deployed revision maps to reviewed launch release | **`PASS`** | Web/API = `8bb0c1e...`; resolved image digests match published `v0.1.0` |
| DB isolation | **`PASS`** | Demo-scoped DB/project/volume; no Production eimir. instance/database exists |
| Media isolation | **`PASS`** | Demo-scoped local media volume; no Production eimir. media resource exists |
| Secrets isolation | **`PASS`** | Demo-only runtime config/secret fingerprint; no Production eimir. secret set exists |
| Origin isolation | **`PASS`** | canonical TLS host; unrelated origin not granted CORS |
| Production fail-closed | **`PASS`** | exact-release config/service/entitlement guards + focused tests |
| Public entry has no reusable credential | **`PASS`** | release-bound opaque no-store proof is single-use |
| Reset only affects Demo scope | **`PASS`** | live canonical replacement + isolated Demo project + exact-release unrelated-Space test |
| Authoritative entitlement model | **`PASS`** | post-reset live server-side read = PREMIUM/ACTIVE, `games.couple` only |
| Revision-addressable evidence consumable by #525 | **`PASS`** | run `35515696671`; jobs `106095097944` and `106095845891`; this dated additive record |

**Overall #917 result: `PASS`.**

## 10. Closure

No further operator action is required for #917.

The public Demo now runs the immutable launch release, the live reset was exercised, the Demo's
actual resources were recorded without exposing secrets, and the public boundary remained healthy
after reset.

The absence of a Production eimir. instance is explicit evidence about the current topology, not a
claim that a future Production deployment is already isolated. A future Production deployment must
use its own DB/media/secrets/origin and remains subject to the release guard and the separate
Production deployment/recovery evidence.

## 11. Security / privacy handling

The live runner used temporary files with restrictive permissions for the one-time proof and access
token, printed neither value, signed out the rehearsal session, and retained no token artifact.
Evidence contains no Production personal data, secret values, full connection strings, reusable
credentials, or private relationship content.

The temporary PR-only workflow hook used to obtain networked live evidence was removed after the
run; the GitHub Actions run history remains revision-addressable.

## 12. Post-promotion rerun details

Targeted rerun job `106095097944` completed every step successfully:

- execution identity: `2026-09-20T14:41:08Z`, immutable source `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`;
- TLS/HTTPS/static boundary: PASS;
- Web revision: matches the immutable source recorded above;
- API revision: matches the same immutable source;
- `scripts/deployment_smoke.py`: PASS;
- unrelated-origin CORS permission: not granted;
- public persona entry: no password, one opaque `no-store` proof;
- second consume of the same proof: rejected;
- ordinary authenticated session: established and signed out;
- authoritative tenant entitlement: `PREMIUM` / `ACTIVE`, capability exactly `games.couple`;
- focused exact-release boundary suite: `30 passed in 18.74s`.

The workflow-level conclusion for attempt 2 is not used as the acceptance signal because GitHub's
single-job rerun retains unrelated historical cancelled/failed jobs from the original workflow
attempt. The specifically rerun #917 job and all of its steps are successful and revision-addressable.

## 13. Post-reset verification

Targeted job `106095845891` completed every #917 step successfully after the live reset:

- execution identity: `2026-09-20T14:47:02Z`, immutable source `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`;
- TLS/HTTPS/static boundary: PASS;
- Web revision: matches the immutable source recorded above;
- API revision: matches the same immutable source;
- deployment smoke: PASS;
- unrelated-origin CORS permission: not granted;
- public persona entry: one opaque `no-store` proof, no password;
- second proof consume: rejected;
- authoritative tenant entitlement: `PREMIUM` / `ACTIVE`, capability exactly `games.couple`;
- rehearsal session: signed out;
- focused exact-release boundary suite: `30 passed in 18.47s`.

This post-reset run is the final public verification for #917.
