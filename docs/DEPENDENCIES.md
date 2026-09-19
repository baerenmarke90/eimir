# Dependencies and Assets

Every dependency is recorded with its name, version, source, and license. Every
asset is recorded with its origin, license, and creator. Anything not listed
here does not belong in the project.

As of: 2026-09-01

## Reproducibility and verification

`backend/uv.lock` is the binding, cross-platform resolution of all direct and
transitive Python dependencies. The uv version `0.12.5`, Python `3.13.7`, the
build backend, and the Python container image are pinned exactly. CI and
container installations run exclusively in frozen/locked mode;
`uv lock --check` prevents a stale lock file.

`web/package-lock.json` is the binding npm resolution for the thin M2-S8 Web
reference flow. Direct versions are pinned exactly in `web/package.json`, CI
installs exclusively with `npm ci`, and `npm audit --audit-level=high` blocks
known vulnerabilities at high severity and above. The Node CI and Web build
image is additionally pinned by digest. The static production build runs in
an unprivileged Nginx image that is also pinned by digest.

`web/e2e/package-lock.json` is the separate binding npm resolution for the
#192 Web browser/accessibility QA harness. Its direct versions are pinned
exactly in `web/e2e/package.json`; CI also installs this package exclusively
with `npm ci` and runs the same high-severity npm audit gate. These dependencies
are development-only and are never shipped with the production Web bundle.

The Android application is the Capacitor wrapper in `android/` around the
canonical Web bundle (ADR 0011). Its release CI evidence pins JDK 21, Gradle
8.14.3 (wrapper distribution and wrapper-JAR SHA-256), Android Gradle Plugin
8.13.0, compileSdk 36, and Build Tools 36.0.0, and resolves every Gradle
artifact under `--dependency-verification strict` against
`android/gradle/verification-metadata.xml`. The toolchain and direct dependency
selection therefore do not depend on local Android Studio defaults.

Backend CI runs `uv audit --preview --frozen` against OSV. Policy permits no
known security finding and no adverse package status. An exception could only
be recorded under `[tool.uv.audit]` with an advisory ID, rationale, expiration
date, and linked Issue; there are currently none.

After the locked installation, the documented Backend state is automatically
compared with the actually installed versions and the packages'
`License-Expression` or `License` metadata. Direct Web dependencies are listed
below; the complete transitive npm graphs including integrity hashes are in
`web/package-lock.json` and `web/e2e/package-lock.json`. Direct Android
wrapper, test, and build dependencies are listed below; CI resolves them
exclusively from Google Maven and Maven Central, verified by checksum.

`.github/dependabot.yml` schedules weekly updates for uv, npm, Gradle, Docker,
and GitHub Actions dependencies. On a new fork or repository, **Dependabot
alerts** and **Dependabot security updates** must additionally be enabled under
**Settings → Security and analysis**; normal version updates already start from
the configuration file.

### Documented policy dry run

The following test creates an intentionally vulnerable lock state only in a
temporary directory. It must end with a finding and a non-zero exit code; the
actual project lock file remains unchanged.

```bash
probe=$(mktemp -d)
printf '[project]\nname="audit-probe"\nversion="0"\nrequires-python=">=3.12"\ndependencies=["jinja2==2.10"]\n' > "$probe/pyproject.toml"
uv lock --directory "$probe"
uv audit --preview --frozen --directory "$probe"
```

`argon2-cffi` serves exactly one purpose: password derivation. Project-owned
tokens use `secrets` and `hashlib` from the standard library; for a value with
full entropy, an intentionally slow algorithm would only impose unnecessary
cost on every request.

OIDC adds `pyjwt[crypto]` and therefore `cryptography`: the signature of an
external ID Token cannot be verified with `hashlib`, and a custom RSA/ECDSA
verifier would be exactly the wrong kind of in-house implementation in the
Auth path. `httpx` moves from a development dependency to a runtime dependency
because Discovery, JWKS retrieval, and the Token endpoint require outbound
HTTP.

`webauthn` (py_webauthn) is added for the same reason: Passkey registration
involves CBOR, COSE keys, and Attestation, and reading these formats by hand
would be custom implementation at the most sensitive boundary.

`cbor2` is development-only: the virtual Authenticator in tests constructs
`attestationObject` and COSE keys itself so the suite verifies real signatures
instead of recorded example data.

`Pillow` and `pillow-heif` are added with media processing. Decoding images,
determining their dimensions, removing embedded metadata, and generating a
Thumbnail is not functionality that is reasonable to implement from scratch;
a custom JPEG, PNG, or WebP decoder would be in-house implementation at one of
the product's largest attack surfaces. `pillow-heif` brings libheif and thus
HEIC/HEIF, which are part of the M2-D04 allowlist; it registers as a Pillow
plugin and is not called separately.

Both are deliberately the only additions in this slice. Video and the ffmpeg
invocation it requires are a separate later step under M2-D23 because a system
binary affects the container image and installation instructions and falls
outside the `uv audit` gate.

Media parsers are an explicit attack surface. They therefore receive special
attention under the existing policy: no known security finding in the lock,
Dependabot updates are not left unresolved, and processing runs exclusively
in a background job under resource limits — never in the request path.

## Backend — Runtime

| Package | Version | Source | License |
|---|---|---|---|
| fastapi | 0.141.1 | PyPI | MIT |
| uvicorn[standard] | 0.52.4 | PyPI | BSD-3-Clause |
| sqlalchemy | 2.0.52 | PyPI | MIT |
| alembic | 1.19.1 | PyPI | MIT |
| psycopg[binary] | 3.3.4 | PyPI | **LGPL-3.0-only** |
| pydantic | 2.13.4 | PyPI | MIT |
| pydantic-settings | 2.15.0 | PyPI | MIT |
| uuid6 | 2025.0.1 | PyPI | MIT |
| argon2-cffi | 25.1.0 | PyPI | MIT |
| httpx | 0.28.1 | PyPI | BSD-3-Clause |
| pyjwt[crypto] | 2.13.0 | PyPI | MIT |
| webauthn | 3.0.0 | PyPI | BSD-3-Clause |
| pillow | 12.3.0 | PyPI | MIT-CMU |
| pillow-heif | 1.5.0 | PyPI | BSD-3-Clause |

## Backend — Development

| Package | Version | Source | License |
|---|---|---|---|
| pytest | 9.1.1 | PyPI | MIT |
| pytest-asyncio | 1.4.0 | PyPI | Apache-2.0 |
| httpx2 | 2.12.0 | PyPI | BSD-3-Clause |
| cbor2 | 6.1.4 | PyPI | MIT |
| ruff | 0.16.4 | PyPI | MIT |
| mypy | 2.3.1 | PyPI | MIT |

## Web — M2-S8 Runtime

| Package | Version | Source | License |
|---|---|---|---|
| @tanstack/react-query | 5.85.5 | npm | MIT |
| i18next | 26.4.0 | npm | MIT |
| react-i18next | 17.0.11 | npm | MIT |
| react | 19.1.1 | npm | MIT |
| react-dom | 19.1.1 | npm | MIT |
| react-router-dom | 7.18.2 | npm | MIT |

## Web — M2-S8 Development

| Package | Version | Source | License |
|---|---|---|---|
| @types/react | 19.1.12 | npm | MIT |
| @types/react-dom | 19.1.9 | npm | MIT |
| typescript | 5.9.2 | npm | Apache-2.0 |
| vite | 7.3.6 | npm | MIT |
| vitest | 3.2.7 | npm | MIT |

These Web dependencies serve only the thin S8 reference flow. They do not
pull M5 functionality such as persistent Offline Caches, complete navigation,
or Client Parity forward. The generated `typescript-fetch` code remains free
of additional runtime dependencies and uses the browser Fetch API.

## Web — Browser QA Development

| Package | Version | Source | License |
|---|---|---|---|
| @playwright/test | 1.62.1 | npm | Apache-2.0 |
| @axe-core/playwright | 4.13.0 | npm | MPL-2.0 |

Playwright is selected instead of a custom browser harness because it provides
established Chromium automation, browser-isolated tests, keyboard/focus and
history assertions, and deterministic browser-revision management. The axe
integration provides an established WCAG rule engine instead of project-owned
accessibility heuristics. Both are test-only; no eimir. user data is sent
to either project or to a testing SaaS. Details and manual-gate boundaries are
in `docs/m5/WEB-BROWSER-QA.md`.

## Web — Container toolchain

| Component | Version | Source | License |
|---|---|---|---|
| Node.js build image | 24.21.0-bookworm-slim, `sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90` | Docker Hub / nodejs/docker-node | MIT (Node.js and image definition) |
| nginx-unprivileged | 1.31.4, `sha256:197f252f060ed357f2ab98d4256762d7d107c76f18ad8f0b9d5178854611566d` | GHCR / nginx/docker-nginx-unprivileged | BSD-2-Clause (NGINX), Apache-2.0 (image definition) |

Both images are used only during the build or as a local static Web server.
No eimir. user data is sent to Node.js, NGINX, or their registries;
registries see only the hoster's normal image pull. There are no recurring
Provider costs, Accounts, or Rate Limits. If a registry is unavailable, an
already built local image can continue running; a new build waits for the
registry or uses a hoster-controlled mirror.

## Android — Capacitor wrapper runtime

The Android Gradle project in `android/` contains no product UI code. Product
screens are the React application from `web/`, packaged as a local asset
bundle. Capacitor plugin versions are pinned exactly in `web/package.json` and
locked in `web/package-lock.json`; the Gradle modules below are resolved from
`web/node_modules` by `npx cap sync android`.

| Package / platform component | Version | Source | License |
|---|---|---|---|
| @capacitor/android (native bridge) | 8.5.2 | npm | MIT |
| @capacitor/app | 8.1.1 | npm | MIT |
| @capacitor/browser | 8.0.4 | npm | MIT |
| androidx.appcompat:appcompat | 1.7.1 | Google Maven | Apache-2.0 |
| androidx.coordinatorlayout:coordinatorlayout | 1.3.0 | Google Maven | Apache-2.0 |
| androidx.core:core-splashscreen | 1.2.0 | Google Maven | Apache-2.0 |
| Apache Cordova Android framework (Capacitor plugin compatibility layer) | 14.0.1 | Maven Central | Apache-2.0 |

The wrapper adds **no** Room, WorkManager, Kotlin, or Compose dependency. It
holds no product state: session, cache, and read models live in the Web client.
The former native read cache and its Keystore key belonged to the retired,
non-authoritative Kotlin client and are not part of server data continuity.
`google-services.json` is intentionally absent, so the Google Services plugin
stays inactive until a push-notification slice adds Firebase.

## Android — Wrapper test and build

| Package / tool | Version | Source | License |
|---|---|---|---|
| Android Gradle Plugin | 8.13.0 | Google Maven | Apache-2.0 |
| Gradle | 8.14.3 | gradle.org / CI setup-gradle | Apache-2.0 |
| Google Services Gradle Plugin (inactive without `google-services.json`) | 4.4.4 | Google Maven | Apache-2.0 |
| JUnit 4 | 4.13.2 | Maven Central | EPL-1.0 |
| androidx.test.ext:junit | 1.3.0 | Google Maven | Apache-2.0 |
| androidx.test.espresso:espresso-core | 3.7.0 | Google Maven | Apache-2.0 |

The Android release evidence job uses JDK 21, installs SDK Platform 36 and Build
Tools 36.0.0, builds the unsigned release APK/AAB, and verifies package
identity, the local Web bundle, and the SBOM. The GitHub Actions themselves are
pinned to commit SHAs.

## Container base images

| Image | Version | Source | License |
|---|---|---|---|
| python | 3.13.7-slim@sha256:5f55cdf0c5d9dc1a415637a5ccc4a9e18663ad203673173b8cda8f8dcacef689 | Docker Hub | PSF-2.0 (Python), Debian packages under their respective licenses |
| postgres | 17-alpine | Docker Hub | PostgreSQL License |
| node | 24.21.0-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90 | Docker Hub | MIT (Node.js), Debian packages under their respective licenses |

## Build-time tools

| Tool | Version | Source | License |
|---|---|---|---|
| openapi-generator-cli | v7.16.0@sha256:e56372add5e038753fb91aa1bbb470724ef58382fdfc35082bf1b3e079ce353c | Docker Hub | Apache-2.0 |

The generator creates the Client API layers from `backend/openapi.json`. It
runs only at build time and is not shipped; Apache-2.0 imposes no conditions
on generated code. Version and digest are stored in
`tools/openapi/generator.env`; details are in
[`tools/openapi/README.md`](../tools/openapi/README.md).

## To review: psycopg under LGPL

`psycopg` is licensed under **LGPL-3.0-only** and is therefore the only
dependency whose license is not permissive.

Practical situation:

- The driver is loaded dynamically as a standalone package and is not
  compiled into project-owned code.
- For the operated Cloud service, there is no distribution; the LGPL
  typically does not apply there.
- For Self-Hosted distribution as a container image, distribution occurs.
  The LGPL then requires, among other things, that recipients can replace the
  driver with their own version and that the license text and source notice
  are provided.

This is achievable for a separately installed Python package, but it is a
deliberate obligation rather than a formality. It must be reviewed before
commercial launch — potentially by switching to a permissively licensed
driver.

This assessment is not legal advice.

## Assets

The repository now contains project-specific image and SVG assets. They were
created for eimir. or its Roadmap and M2 handoff; assets of unclear
third-party or predecessor origin continue to be excluded. The product images
are explicitly mockups, not screenshots of an already finished application.

No separate public license is currently granted for files marked below as
**project assets**. This classification does not change the still-open license
decision for the project's own source code.

| Asset | Origin | Creator | License |
|---|---|---|---|
| `docs/assets/playstore/app-icon.png` | eimir. product preview | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/feature-graphic.png` | eimir. product preview | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-01-onboarding.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-02-heute.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-03-story.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-04-wuensche.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-05-plan.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-06-discovery.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-07-einkauf.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/playstore/screen-08-privacy.png` | eimir. product mockup | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/roadmap/roadmap-overview.svg` | eimir. Roadmap | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/assets/roadmap/roadmap-tracks.svg` | eimir. Roadmap | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `design/m2/m2-screenflow.svg` | M2 Client handoff | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |
| `docs/m2/m2-privacy-flow.svg` | M2 Privacy/Acceptance handoff | eimir. project workflow, AI-assisted and human-reviewed | project asset; no separate public license grant |

No font or audio assets are currently documented in the repository.

## Maintenance

A new direct dependency is added here together with its entry. CI checks the
Backend documentation against the locked, installed environment. Transitive
Python versions are fully recorded in `backend/uv.lock`; transitive Web
versions and integrity hashes are fully recorded in `web/package-lock.json`
and `web/e2e/package-lock.json`. Android keeps all direct coordinates pinned
exactly in the Gradle build and checksummed in
`android/gradle/verification-metadata.xml`; Dependabot monitors the `/android`
build separately.

New assets are documented here in the same change. If origin, license, or
creator is unclear, the asset is not admitted until Provenance is resolved.
