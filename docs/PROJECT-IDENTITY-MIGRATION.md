# eimir. project identity migration

This guide is the controlled upgrade contract for the project-identity change
introduced by issue #953. The product display name is **eimir.** and the
machine-safe name is **eimir**. The GitHub repository was renamed from its
legacy name to `baerenmarke90/eimir` on 2026-09-15 after the implementation PR
passed its complete protected-branch gate matrix.

## Canonical identity

| Surface | Canonical identity | Upgrade behavior |
| --- | --- | --- |
| Display name | `eimir.` | Replaced on active user-facing and service metadata surfaces |
| Code/packages | `eimir`, `de.eimir.app.*` | Internal namespaces move immediately |
| Configuration | `EIMIR_*`, `VITE_EIMIR_*`, `eimir*` Gradle properties | Deprecated old names are lower-precedence read aliases |
| Python package | `eimir` | All runtime, test, and Alembic imports use the new namespace |
| Web package | `eimir-web` | Package and build metadata use the new identity |
| OCI images | `ghcr.io/baerenmarke90/eimir-backend`, `ghcr.io/baerenmarke90/eimir-web` | New releases publish only the canonical names |
| Release assets | `eimir-*` | New releases publish canonical asset names; prior manifests remain readable |
| OpenAPI | title `eimir.`, schemas under `eimir.*` | The generated TypeScript client uses the new model identity (the Kotlin client was retired in #1009) |
| Android namespace | `de.eimir.app` | The Capacitor wrapper (#1009) uses the new namespace; the installed-app identity `de.sidebyside.app` is unchanged |

## Before upgrading a Self-Hosted installation

1. Create and verify a backup with the currently installed release. Keep the
   backup, its manifest, and the exact release bundle together.
2. Record the current Compose project name before moving or renaming the
   checkout:

   ```bash
   docker compose --env-file .env --profile self-hosted config --format json \
     | jq -r '.name'
   ```

3. If the checkout directory, repository name, or deployment path will change,
   set the recorded value as `COMPOSE_PROJECT_NAME` in `.env` before the first
   new Compose invocation. Compose prefixes named volumes with this value. A
   changed project name creates different empty volumes; it does not migrate
   the existing ones.
4. Keep the existing `postgres_data`, `media_data`, and
   `deletion_journal_data` volumes. Do not delete, rename, or recreate them as
   part of the product rename.
5. Keep the existing `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `POSTGRES_DB`
   values. In particular, an existing PostgreSQL volume initialized with the
   former `sidebyside` role/database must continue using those values. Renaming
   a database or role is an independent database migration, not a branding
   operation.
6. Replace configuration key names according to the table below. It is safe to
   make this a separate deployment before switching image references.
7. Run `python3 scripts/check_runtime_environment.py --env-file .env`, render
   Compose configuration, and only then deploy the new release.

The supported release and checked-Compose entry points pass
`COMPOSE_PROJECT_NAME` through unchanged. Existing installations upgraded in
place therefore keep their current volume identity. The documented explicit
value protects installations whose checkout directory will change during the
later repository rename.

## Configuration aliases

For every prior `SBS_<NAME>` setting, use `EIMIR_<NAME>`. For Web build-time
settings, use `VITE_EIMIR_<NAME>` instead of `VITE_SBS_<NAME>`. Android release
builds use `eimirVersionCode`, `eimirVersionName`, and `eimirRelease*`
properties (`eimirReleaseKeystore`, `eimirReleaseKeystorePassword`,
`eimirReleaseKeyAlias`, `eimirReleaseKeyPassword`); the API base URL is a Web
build-time setting (`VITE_EIMIR_API_BASE_URL`). In `android/app/build.gradle`,
`sbsVersionCode` and `sbsRelease*` are accepted as lower-precedence `TEMP_COMPAT` fallbacks;
`sbsVersionName` is deliberately not introduced because no such legacy property existed.

During the compatibility window:

- a canonical value always wins when both names are present in the same
  configuration source; normal process-environment precedence over dotenv
  files remains unchanged;
- an old value is read only when its canonical replacement is absent;
- processes, Compose, Docker builds, backend dotenv loading, and Android Gradle
  configuration follow the same precedence rule;
- no compatibility layer logs secret values; and
- generated examples and new deployments contain only canonical keys.

The aliases are deprecated, not permanent parallel configuration. They remain
for at least two stable eimir. release cycles and cannot be removed before a
separately approved breaking-change issue documents the removal version,
release notes, operator notice, and an inverse migration test. Old and new key
names must never acquire different meanings.

## Persistent and externally immutable identifiers

Some names are deliberately not changed in place:

- Android `applicationId` `de.sidebyside.app`, its debug suffix, and the OIDC
  callback scheme remain stable so stores and installed devices receive an
  upgrade rather than a second application.
- The retired Kotlin client's Room read cache and Keystore alias are not part of
  the Capacitor architecture. Because an in-place Android update preserves the
  existing app sandbox, the wrapper runs a one-way startup cleanup that deletes
  the old `sidebyside-read-cache.db`, the remembered-Space preference and the
  `sidebyside_owner_only_read_cache` Keystore entry. It never reads or migrates
  their contents and retries cleanup on later starts if Android reports a
  deletion failure. Server data continuity is unaffected.
- The IndexedDB database `sidebyside-web-read-cache` remains stable. Web session,
  auth-return, theme, cache-context, and demo-mode keys are read once from their
  old names, written to canonical `eimir` keys, and then removed where removal
  is safe.
- The old revision endpoint and response header remain read-only aliases for
  older deployment probes. New probes use `/.well-known/eimir-revision` and
  `X-Eimir-Revision`.
- Restore accepts the old `sidebyside-self-hosted-backup` archive format, and
  the deletion journal accepts an existing
  `sidebyside-account-deletion-journal` header. Newly created artifacts use
  `eimir` format identities.

These exceptions preserve identity and data; they must not be reused for new
unrelated storage or protocols.

## Images, releases, SBOMs, and provenance

New builds, manifests, release bundles, SBOM subjects, attestations, and image
identity documents use `eimir`. A release upgrade may consume an immutable
prior `sidebyside-release-manifest.json` and the former product/cloud identity,
but it emits canonical evidence. Published historical assets are never
rewritten.

Before removing old GHCR packages, confirm that all supported deployments have
switched to the digest-qualified `eimir-backend` and `eimir-web` references.
Package deletion is not part of this change.

## External demo hostname

The currently deployed `demo.sbs.ur-cloud.de` hostname remains a temporary
compatibility endpoint until DNS, certificates, OAuth/OIDC allowlists, CSP, and
deployment health checks can move together. Documentation examples use
`demo.eimir.example`; no replacement production hostname is invented by this
repository change.

## Final GitHub repository rename — completed 2026-09-15

The controlled repository rename was performed only after the parallel
read-only product-design audit and calibration pass ended and PR #954 passed
all required checks. Recorded post-rename evidence:

- the last pre-rename `main` commit was
  `9da8087695f3f952ab344e25dc693d87f5d327d5`;
- the canonical repository and clone URL are `baerenmarke90/eimir` and
  `https://github.com/baerenmarke90/eimir.git`;
- the stable GitHub repository ID remains `1344232309`;
- both the legacy and canonical Git endpoints resolve `main` to the same
  recorded commit, confirming GitHub's compatibility redirect; and
- the post-rename validation change and its CI run use the canonical repository
  endpoint, proving that current automation does not require the redirect.

Operators must update local remotes to the canonical URL. Do not reclone or move
an existing Self-Hosted checkout until its Compose project name is pinned as
described above. Repository settings such as branch protection, environments,
Actions permissions, variables, secrets, webhooks, app installations, deploy
keys, badges, and external status checks remain part of the normal operational
review after any GitHub repository rename.

Canonical `EIMIR_*` release secrets must remain provisioned alongside the
deprecated aliases during the compatibility window. Release-evidence runs must
continue to verify that GHCR package links, SBOM subjects, signatures, and
attestations resolve to the canonical repository.

Renaming the GitHub repository, deleting old packages/assets, changing Android
application identity, changing Compose project names, or migrating PostgreSQL
roles/databases are explicitly outside the automatic rename operation.

## Legacy-reference classification

`python3 tools/ci/project_identity_scan.py` inventories tracked files and fails
on every unexplained active reference. Its classifications are:

| Class | Allowed scope |
| --- | --- |
| `MUST_RENAME` | Active reference with no approved exception; CI fails |
| `TEMP_COMPAT` | Lower-precedence config alias, old reader/endpoint, immutable installed/persistent ID, or explicitly deferred external migration |
| `HISTORICAL_IMMUTABLE` | Original clean-room input, dated review snapshots, and predecessor provenance |
| `FALSE_POSITIVE` | Generic side-by-side layout terminology, negative brand tests, and the scanner's own fixtures |

The allow rules are content-specific. Adding an old name in an otherwise active
file defaults to `MUST_RENAME`; there is no repository-wide blanket exclusion.

## Change-scope review

This migration introduces no new dependency, external service, entitlement,
paywall, data-sharing rule, or product interaction. It uses existing framework
configuration, browser storage, Android/Gradle, Compose, release, and CI
mechanisms. The visible change is branding; layout and interaction contracts
remain unchanged.
