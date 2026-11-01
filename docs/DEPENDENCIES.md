# Dependencies and Assets

Every dependency is recorded with its name, version, source, and license. Every
asset is recorded with its origin, license, and creator. Anything not listed
here does not belong in the project.

As of: 2026-10-20

## Reproducibility and verification

`backend/uv.lock` is the binding, cross-platform resolution of all direct and
transitive Python dependencies. The uv version `0.12.15`, Python `3.14.8`, the
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
9.8.1 (wrapper distribution and wrapper-JAR SHA-256), Android Gradle Plugin
9.4.0, compileSdk 36, and Build Tools 36.0.0, and resolves every Gradle
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

`cryptography` is a direct runtime dependency for the application-controlled
encryption-at-rest boundary. eimir. uses its established AES-256-GCM primitive
for authenticated encryption and does not implement a cryptographic primitive
itself. The package was already present transitively through `pyjwt[crypto]`,
but is declared directly now that application code imports it.

OIDC uses `pyjwt[crypto]`: the signature of an external ID Token cannot be
verified with `hashlib`, and a custom RSA/ECDSA verifier would be exactly the
wrong kind of in-house implementation in the Auth path. `httpx` is a runtime
dependency because Discovery, JWKS retrieval, and the Token endpoint require
outbound HTTP.

`webauthn` (py_webauthn) is added for the same reason: Passkey registration
involves CBOR, COSE keys, and Attestation, and reading these formats by hand
would be custom implementation at the most sensitive boundary.

`pywebpush` encrypts Web Push payloads and signs VAPID requests for the
UnifiedPush backend transport. Using its established protocol implementation
avoids custom RFC 8291 cryptography. The application supplies a restricted
HTTPS transport for destination validation and connection pinning; it does not
modify the upstream package.

`google-auth[requests]` supplies the official service-account OAuth credentials,
token state and refresh transport for the FCM HTTP-v1 adapter. The existing
`httpx` client sends one bounded generic wake request per DB-worker attempt;
no JWT/OAuth grant implementation or second notification pipeline is added.
The maintained source is
[google-cloud-python/packages/google-auth](https://github.com/googleapis/google-cloud-python/tree/main/packages/google-auth);
the former standalone repository is archived. Sender credentials are operator
files, not package assets, environment JSON or client APK material.

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

`google-auth-oauthlib` is the official maintained Web OAuth client for the
optional Google Photos Picker (#1444, 2026-10-27). It supplies PKCE/state and
OAuth protocol handling instead of a custom token-flow implementation. Its
Apache-2.0 license is recorded below using the package metadata spelling so the
inventory gate can verify it exactly. The locked transitive Google auth,
requests-oauthlib and oauthlib dependencies remain in `backend/uv.lock`; no
upstream server code or Immich SDK is bundled. The application requests online
Picker-only access and bounds transport without persisting refresh tokens.

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
| google-auth-oauthlib | 1.5.0 | PyPI | Apache 2.0 |
| pyjwt[crypto] | 2.15.1 | PyPI | MIT |
| cryptography | 50.0.0 | PyPI | Apache-2.0 OR BSD-3-Clause |
| pywebpush | 2.5.0 | PyPI | MPL-2.0 |
| google-auth[requests] | 2.62.0 | PyPI | Apache 2.0 |
| joserfc | 1.7.7 | PyPI | BSD-3-Clause |
| webauthn | 3.0.0 | PyPI | BSD-3-Clause |
| pillow | 13.0.0 | PyPI | MIT-CMU |
| pillow-heif | 1.5.0 | PyPI | BSD-3-Clause |

## Backend — Development

| Package | Version | Source | License |
|---|---|---|---|
| pytest | 9.1.1 | PyPI | MIT |
| pytest-asyncio | 1.4.0 | PyPI | Apache-2.0 |
| httpx2 | 2.12.0 | PyPI | BSD-3-Clause |
| cbor2 | 6.1.4 | PyPI | MIT |
| ruff | 0.16.8 | PyPI | MIT |
| mypy | 2.3.1 | PyPI | MIT |

## Web — M2-S8 Runtime

| Package | Version | Source | License |
|---|---|---|---|
| @tanstack/react-query | 5.102.2 | npm | MIT |
| i18next | 26.4.6 | npm | MIT |
| react-i18next | 17.0.11 | npm | MIT |
| react | 19.2.8 | npm | MIT |
| react-dom | 19.2.8 | npm | MIT |
| react-router-dom | 7.18.2 | npm | MIT |
| leaflet | 1.9.4 | npm / Leaflet | BSD-2-Clause |

## Web — M2-S8 Development

| Package | Version | Source | License |
|---|---|---|---|
| @types/react | 19.2.18 | npm | MIT |
| @types/react-dom | 19.2.5 | npm | MIT |
| @types/node | 24.19.1 | npm | MIT |
| @types/leaflet | 1.9.22 | npm / DefinitelyTyped | MIT |
| typescript | 7.0.2 | npm | Apache-2.0 |
| rolldown | 1.2.14 | npm | MIT |
| vite | 8.2.4 | npm | MIT |
| vitest | 5.0.4 | npm | MIT |

### TypeScript 7 and the i18n key check

TypeScript 7 no longer ships the JavaScript compiler API, which `web/src/i18n/i18n.test.ts` used to
collect static translation keys. The test now parses TS/TSX with `parseSync` from `rolldown/utils`
(oxc). `rolldown` is already installed through Vite 8; it is declared as an explicit exact-pinned
development dependency so the test does not rely on a transitive package. The extracted keys were
compared with the previous compiler-API result over all 262 sources (2450 keys, identical lines).

### October 2026 audit maintenance

The 2026-10-20 frozen audit identified the compromised emSign trust-root advisory
[GHSA-6q48-6c7w-9gw2](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2)
in transitive `certifi` 2026.7.22. The lock now selects 2026.10.19 (upstream's
first patched release is 2026.10.18). This trust-bundle update also protects the
new Google OAuth/FCM HTTPS path; certificate verification remains enabled.
The same audit exposed nine findings in existing Pillow 12.3.0, fixed in 13.0.0.
The direct minimum and lock are updated to 13.0.0 and validated with the existing
image/media tests. These are targeted security updates, with no audit exclusions;
the resulting frozen audit reports no known vulnerabilities or adverse status.

The lock refresh updates PyJWT to 2.15.1 and Alembic's transitive Mako to
1.4.3. PyJWT's declared minimum also prevents restoring the vulnerable
verification dependency during a future resolution. Both remain existing MIT
dependencies; no authentication provider, algorithm policy or migration is added.

Vite is pinned to 8.2.4, the patched 8.2 release for the upstream bundled
`launch-editor` advisories
[GHSA-698v-4r3x-3vcv](https://github.com/vitejs/launch-editor/security/advisories/GHSA-698v-4r3x-3vcv),
[GHSA-r825-w8mm-5pxw](https://github.com/vitejs/launch-editor/security/advisories/GHSA-r825-w8mm-5pxw), and
[GHSA-587h-7wmj-h5pm](https://github.com/vitejs/launch-editor/security/advisories/GHSA-587h-7wmj-h5pm).
This keeps the existing minor line and dependency ranges; it introduces no
provider, runtime feature or audit exception. The normal build, token, PWA and
Capacitor foundation checks validate the patched toolchain.

The Vitest 5.0.4 upgrade follows the prior 4.1.11 security refresh.
Its updated matcher augmentation preserves the custom focus assertion and
uses the declared return/received type parameters. Compatibility is checked
against the locked Vite and Node versions by the existing gates. The [upstream migration guide](https://vitest.dev/guide/migration/)
was reviewed; object-URL and callback mocks now declare their actual callable
signatures. Node 24 types are explicit because the removed transitive type
dependency previously supplied the existing filesystem/layout tests. Existing
test assertions and timeouts remain unchanged. The
lockfile also advances Vite/PostCSS's transitive `source-map-js` to 1.2.2.
These are test/build dependencies and do not add a production feature or
runtime provider. Core behavior and Cloud/Self-Hosted tiers are unchanged.

`npm audit --audit-level=high` retains its existing policy. The remaining
moderate `uuid` finding is in the already-adopted Capacitor CLI's `xcode`
dependency; this maintenance does not force an unsupported transitive major
override or downgrade the wrapper CLI. Backend audit still permits no findings.

These Web dependencies serve only the thin S8 reference flow. They do not
pull M5 functionality such as persistent Offline Caches, complete navigation,
or Client Parity forward. The generated `typescript-fetch` code remains free
of additional runtime dependencies and uses the browser Fetch API.

### Explicit place map selection (2026-10-29)

Leaflet is loaded only inside the deliberately opened place-map task. It reuses
browser map interaction, keyboard panning, zoom and attribution instead of
implementing a map engine. Raster tiles come from OpenStreetMap under its public
best-effort tile policy, with visible OSM attribution and ordinary HTTP caching;
there are no bulk/offline tile downloads. Photon search reuses the existing
backend provider normalization and an operator-controlled origin. It adds no
Python dependency, end-user key or paid account. Google Maps and MapLibre were
reviewed; billing/key setup and a separate vector-style boundary are unnecessary
for this bounded choice task. Existing places and manual coordinates survive
provider outages. The preflight, privacy disclosure and provider terms are
recorded in `docs/product/design/plan-images-and-map-picker.md`.

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
| Node.js build image | 26.6.0-bookworm-slim, `sha256:81502e860176e63695d769d3d1a2d3a403abc1c27c6a02169b765f3e43b60ede` | Docker Hub / nodejs/docker-node | MIT (Node.js and image definition) |
| nginx-unprivileged | 1.31.6, `sha256:e44b470e571b20d935336bfb9f8277c1468d15e1e4d105a12ab5609d0b4682cb` | GHCR / nginx/docker-nginx-unprivileged | BSD-2-Clause (NGINX), Apache-2.0 (image definition) |

Both images are used only during the build or as a local static Web server.
No eimir. user data is sent to Node.js, NGINX, or their registries;
registries see only the hoster's normal image pull. There are no recurring
Provider costs, Accounts, or Rate Limits. If a registry is unavailable, an
already built local image can continue running; a new build waits for the
registry or uses a hoster-controlled mirror.

## Android — Capacitor wrapper runtime

The Android Gradle project in `android/` contains no product UI screens. Product
screens are the React application from `web/`, packaged as a local asset
bundle. A small native bridge handles FCM/UnifiedPush registration, wake events,
and content-free system notifications. Capacitor plugin versions are pinned
exactly in `web/package.json` and locked in `web/package-lock.json`; the Gradle
modules below are resolved from `web/node_modules` by `npx cap sync android`.

| Package / platform component | Version | Source | License |
|---|---|---|---|
| @capacitor/android (native bridge) | 8.5.2 | npm | MIT |
| @capacitor/app | 8.1.1 | npm | MIT |
| @capacitor/browser | 8.0.4 | npm | MIT |
| org.unifiedpush.android:connector | 3.3.3 | Maven Central | Apache-2.0 |
| com.google.firebase:firebase-bom | 35.0.2 | Google Maven | Apache-2.0 |
| com.google.firebase:firebase-messaging | 26.0.0 (BoM-managed) | Google Maven | Apache-2.0 |
| com.google.firebase:firebase-installations | 20.0.0 (BoM-managed) | Google Maven | Apache-2.0 |
| com.nimbusds:nimbus-jose-jwt | 10.10 | Maven Central | Apache-2.0 |
| androidx.appcompat:appcompat | 1.7.1 | Google Maven | Apache-2.0 |
| androidx.coordinatorlayout:coordinatorlayout | 1.3.0 | Google Maven | Apache-2.0 |
| androidx.core:core-splashscreen | 1.2.0 | Google Maven | Apache-2.0 |
| Apache Cordova Android framework (Capacitor plugin compatibility layer) | 14.0.1 | Maven Central | Apache-2.0 |

The wrapper adds **no** direct Room, WorkManager, Kotlin, or Compose dependency. It
holds no independent product state: cache and read models live in the Web client.
The current Android session envelope is retained in app-private no-backup storage
using Android Keystore, standard AES/GCM and AtomicFile through the bounded
`NativeSessionStorage` Capacitor adapter (#1357). No dependency is added. Web/PWA
credentials remain sessionStorage-only, and the existing Web session facade owns
credential rotation, logout and expiry.
The shared push bridge binds native work to an opaque activation ID and a local
Account/API-instance snapshot; FCM's installation ID is a transport target, never
the Account identity. The authenticated Web client owns registration/revocation.
Firebase Messaging and Installations provide Android registration, target cleanup
and data-only wakes. No Firebase Analytics, Crashlytics, Firebase Auth, Firestore,
Storage or independent product UI is added. Google receives transport/installation
metadata under the provider terms/privacy review in #565; the backend and normal
notification API retain content/policy authority. Upstream SDK binaries and POMs
are resolved from Google Maven under the existing strict checksum verification.
The former native read cache and its Keystore key belonged to the retired,
non-authoritative Kotlin client and are not part of server data continuity.
`google-services.json` is public Android Firebase application configuration; it
contains no server sender private key. The Google Services plugin activates only
when that configured build input is present. Official distribution and Firebase
project/package alignment are separate from server credential installation.

## Android — Wrapper test and build

| Package / tool | Version | Source | License |
|---|---|---|---|
| Android Gradle Plugin | 9.4.0 | Google Maven | Apache-2.0 |
| Gradle | 9.8.1 | gradle.org / CI setup-gradle | Apache-2.0 |
| Google Services Gradle Plugin (inactive without `google-services.json`) | 4.5.0 | Google Maven | Apache-2.0 |
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
| python | 3.14.8-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170 | Docker Hub | PSF-2.0 (Python), Debian packages under their respective licenses |
| postgres | 17-alpine | Docker Hub | PostgreSQL License |
| node | 26.6.0-bookworm-slim@sha256:81502e860176e63695d769d3d1a2d3a403abc1c27c6a02169b765f3e43b60ede | Docker Hub | MIT (Node.js), Debian packages under their respective licenses |

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

The #1471 Android photo-location preflight at `docs/product/design/references/android-photo-location-import/compact-permission-reference.png` is an original ImageGen workflow asset generated on 2026-10-27 from the existing #1444 diary composition. It guides permission-layer placement only, with no separate public license grant; illustrative OEM wording is not runtime product copy. The embedded cabin image retains the existing Darkmoon_Art/Pixabay 3374201 CC0 provenance. Exact prompt and scope are recorded beside the image.

The automatic photo places preflight `docs/product/design/references/1459/compact-current.png` is an original image generated through the eimir. project ImageGen workflow on 2026-10-27. It is a project asset with no separate public license grant; its illustrative photo is generated, not a third-party stock image. See the adjacent README and prompt for scope and provenance.

The actual browser renders `docs/product/design/references/1459/evidence/1459-*.png` use synthetic account/content fixtures and the existing cabin/lake photograph by Darkmoon_Art (Pixabay 3374201). UI screenshots are project assets with no separate public license grant; the embedded photograph is CC0 1.0 Universal as recorded in `backend/demo_assets/manifest.json`. The evidence README names the runtime source and validation limits.

The repository now contains project-specific image and SVG assets. They were
created for eimir. or its Roadmap and M2 handoff; assets of unclear
third-party or predecessor origin continue to be excluded. The store preview images
are explicitly mockups. Runtime QA screenshots are identified separately below.

No separate public license is currently granted for files marked below as
**project assets**. This classification does not change the still-open license
decision for the project's own source code.

| Asset | Origin | Creator | License |
|---|---|---|---|
| `docs/product/design/references/1444/photo-source-sheet-delivery.png` | Generated whole-diary/source-sheet preflight for #1444, 2026-10-27 | eimir. project workflow using ImageGen | project asset; no separate public license grant |
| `docs/product/design/references/1444/evidence/photo-source-*.png` (eight named files in its README) | Actual local browser renders of the project UI using synthetic account data and the existing cabin/lake demo fixture | eimir. project workflow; embedded photo by Darkmoon_Art (Pixabay 3374201) | UI screenshots: project asset, no separate public license grant; embedded photo: CC0 1.0 Universal, as recorded in `backend/demo_assets/manifest.json` |
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

The native-continuity/passport and unified Plan/map preflight PNGs in
`docs/product/design/references/native-continuity/` were generated with ImageGen
on 2026-10-29 against the recorded repository baseline. They are project assets
with no separate public license grant; exact prompts are adjacent. Evidence
PNGs in its `evidence/` directory are actual browser renders with synthetic
couple data. The Plan cover fixture is Darkmoon_Art/Pixabay 3374201 under CC0,
as recorded in `backend/demo_assets/manifest.json`. The synthetic map tiles in
browser evidence are a test fixture, not a third-party cartographic screenshot.

## Optional local recap inference and reference assets (#1528)

| Component / asset | Version / origin | License / use |
| --- | --- | --- |
| Ollama, optional operator container | `ollama/ollama:0.40.12@sha256:20d1bbfbabe1c97ba4b16301f08a20d8484bcf77047742a3cb71c613d8e12d0b`, [upstream](https://github.com/ollama/ollama) | MIT; local CPU inference; no runtime package dependency added to API/worker |
| Qwen3 1.7B quantized model | Operator download `qwen3:1.7b-q4_K_M`, [model card](https://huggingface.co/Qwen/Qwen3-1.7B) / [distribution](https://ollama.com/library/qwen3:1.7b-q4_K_M) | Apache-2.0; not bundled in application releases; downloaded into the operator's model volume |
| `docs/product/design/references/automatic-relationship-recaps/compact-reference.png` | eimir. workflow, built-in ImageGen, 2026-10-30; exact prompt alongside | Project-owned illustrative UI reference; not production user content |
| `web/e2e/fixtures/recap-lake.webp` | eimir. workflow, built-in ImageGen, 2026-10-30; illustrative empty lake/jetty photograph | Project-owned test fixture only; no claimed user location/person/event; no production fallback photograph |
| `docs/product/design/references/automatic-relationship-recaps/evidence/*.png` | Playwright screenshots of the real eimir. UI using explicitly synthetic fixtures | Project validation evidence; no real couple data |

The optional model is not assumed immutable from its tag alone. Operators can
record `ollama list`'s model identifier after download, and should review model
updates deliberately. See [local recap operations](LOCAL-RECAP-AI.md) for resource,
privacy, fallback and deployment behavior. No paid remote model provider is used.

`joserfc` and Nimbus JOSE+JWT implement RFC 7516 compact JWE for bounded
per-activation device previews (`dir` / `A256GCM`). Names and titles are encrypted
before FCM delivery; no protocol or cryptographic primitive is implemented here.
The per-activation key is registered over authenticated HTTPS, protected by the
existing server endpoint encryption and wrapped by AndroidKeyStore on the device.
No key is shipped in source or APK. See the #565 contextual-push preflight.

Nimbus 10.10 embeds Gson 2.14.0 (Apache-2.0). The unchanged upstream Nimbus
copyright header, Apache-2.0 license and Gson license are packaged under
`android/app/src/main/assets/licenses/`. Backend wheel license metadata remains
in the installed distribution. No additional provider account or terms are introduced.
