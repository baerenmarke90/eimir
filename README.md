# eimir.

<!-- status-surface: secondary-overview -->

A private digital companion for a couple's shared life.

eimir. is an independent reimplementation. It is offered in two
operating models:

- **eimir. Cloud** — a managed service for users who do not want to administer their own infrastructure
- **eimir. Self-Hosted** — a self-operated installation for personal and noncommercial use

Both share the same Application Core. The Cloud monetizes operations,
convenience, and service; Self-Hosted must not be artificially deprived of
Core functionality solely to promote the Cloud. The strategic model is
documented in [docs/BUSINESS-MODEL.md](docs/BUSINESS-MODEL.md).

## Product preview

The screenshots below are real captures of the current eimir. Web app (the same
UI the Android wrapper ships), taken at a smartphone width of about 390 px in
the Light theme. They show the canonical demo Space with entirely fictional
data and photographs (see [docs/DEMO-SPACE.md](docs/DEMO-SPACE.md)). The app
UI is intentionally de-DE localized product content. They are not mockups.

<p align="center">
  <strong>Erinnerungen, Wünsche, Pläne und gemeinsame Zeit – ruhig gestaltet und privacy-first gedacht.</strong>
</p>

> The technical implementation state is documented under [Status](#status).

<table>
  <tr>
    <th>Anmelden</th>
    <th>Wir</th>
    <th>Momente</th>
    <th>Erinnerung</th>
  </tr>
  <tr>
    <td><img src="docs/assets/readme/01-anmelden.webp" alt="Sign-in screen with the headline Euer Ort für das, was euch verbindet." width="200"></td>
    <td><img src="docs/assets/readme/02-wir.webp" alt="Wir tab with the couple header, mood and battery status, a daily quote and a featured moment" width="200"></td>
    <td><img src="docs/assets/readme/03-momente.webp" alt="Momente tab with a retrospective memory card and the shared experiences" width="200"></td>
    <td><img src="docs/assets/readme/04-erinnerung.webp" alt="A diary memory with a lake photograph, tags and a comment section" width="200"></td>
  </tr>
  <tr>
    <th>Tagebuch</th>
    <th>Wünsche</th>
    <th>Mehr</th>
  </tr>
  <tr>
    <td><img src="docs/assets/readme/05-tagebuch.webp" alt="Diary timeline grouped by month with photo entries" width="200"></td>
    <td><img src="docs/assets/readme/06-wuensche.webp" alt="Planen tab showing the shared wish list grouped alphabetically" width="200"></td>
    <td><img src="docs/assets/readme/07-mehr.webp" alt="Mehr tab with profile, private notes, notifications and the story areas" width="200"></td>
  </tr>
</table>

### Design and UX foundations

- [Product Reference v1 and design authority](docs/product/design/README.md) — current eimir. direction, five reference experiences, legacy precedence, and implementation sequence
- [Design Principles](docs/DESIGN-PRINCIPLES.md) — compatible visual, Accessibility, and Privacy-first foundations
- [Information Architecture](docs/INFORMATION-ARCHITECTURE.md) — navigation, areas, routes, and Deep Links
- [Critical User Flows](docs/USER-FLOWS.md) — end-to-end flows for Auth, invitations, content, Offline, and conflicts
- [UX Patterns](docs/UX-PATTERNS.md) — cross-platform interaction and state patterns
- [Screen Templates](docs/SCREEN-TEMPLATES.md) — responsive layouts for Compact, Medium, and Expanded
- [Component Contracts](docs/COMPONENT-CONTRACTS.md) — behavior, variants, and Accessibility of shared components
- [API/UI Contracts](docs/API-UI-CONTRACTS.md) — shared DTOs, errors, Privacy classes, Cache, and Concurrency
- [Accessibility and QA Matrix](docs/ACCESSIBILITY-QA-MATRIX.md) — binding Release Gates for Web and the Android wrapper
- [Content and Privacy Guidelines](docs/CONTENT-PRIVACY-GUIDELINES.md) — tone, system text, Notifications, and Analytics boundaries
- [Design System Delivery](docs/DESIGN-SYSTEM-DELIVERY.md) — Token pipeline, component stages, and delivery phases
- [Design Tokens](design/tokens.json) — colors, typography, spacing, layout, and Motion as a machine-readable source
- [Component Manifest](design/component-manifest.json) — canonical Web product-UI implementation status

## Roadmap

<p align="center">
  <a href="docs/ROADMAP.md">
    <img src="docs/assets/roadmap/roadmap-overview.svg" alt="eimir. Roadmap von Foundation bis Release" width="100%">
  </a>
</p>

<p align="center">
  <a href="docs/IMPLEMENTATION-STATUS.md"><strong>Open the authoritative current implementation and gate status</strong></a><br>
  <a href="docs/ROADMAP.md">View milestone sequence and Release Gate definitions</a> ·
  <a href="docs/STATUS-SOURCES.md">View status-source and drift rules</a>
</p>

## Principles

Privacy is a Core function, not an add-on. No advertising, no sale of personal
data, no unnecessary tracking. Sensitive content does not flow into Analytics.

The central tenant is named **Space** — the shared private area of a couple.
Every shared record belongs to exactly one Space. No access is performed from
a Resource ID alone.

For M2, additionally: `SHARED` and `PRIVATE` are domain-level values.
`SPACE_SHARED` and `OWNER_ONLY` are internal Authorization/Privacy classes.
Clients do not redundantly write `privacyClass` as a second source of truth.

## Structure

```text
backend/             FastAPI, SQLAlchemy 2, Alembic, PostgreSQL
web/                 React, TypeScript, Vite
android/             Capacitor Android wrapper around the canonical React/Vite Web product
compose.yaml         the single Docker Compose manifest for all supported profiles
deploy/              deployment environment templates and PostgreSQL init data
docs/                architecture, security, Privacy model, dependencies
specification/       product specification as the binding requirement
tools/               helper scripts
```

## Development

### Prerequisites

- **Docker** for the development database
- **Python 3.13** and `uv` for Backend and tests
- **Node 22 and npm** for the Web client

PostgreSQL is required. There is deliberately no SQLite fallback — the data
model uses PostgreSQL properties, and a second test dialect would create a
false sense of confidence rather than equivalent coverage.

### Backend

The development database uses the `dev-db` profile of the canonical
`compose.yaml`:

```bash
docker compose --profile dev-db up -d dev-postgres
python -m pip install uv==0.12.15
cd backend && uv sync --frozen
uv run alembic upgrade head
uv run uvicorn eimir.main:app --reload
```

### Web

```bash
cd web && npm ci
npm run dev
```

### Tests

Integration tests run against a dedicated `eimir_test` database created
by `deploy/postgres-init/10-testdatenbank.sql` when the `dev-db` profile starts
with an empty volume. The test fixture creates its own schema there and removes
it again at the end — running that lifecycle against the development database
would be data loss, not a test run.

```bash
export EIMIR_TEST_DATABASE_URL=postgresql+psycopg://eimir:eimir@localhost:5432/eimir_test
cd backend && uv run pytest                         # everything
cd backend && uv run pytest -m "not integration"   # without database
```

**Without `EIMIR_TEST_DATABASE_URL`, all Integration Tests are skipped** — even
when the development database is running and reachable. `pytest` can still
report the run as green, for example `353 passed, 1141 skipped`. That is not a
complete run. Skipped means skipped and must not silently be treated as
passed; without the variable, only the Unit level is being tested.

If the database volume predates the initialization script,
`eimir_test` is missing. The Postgres image runs `deploy/postgres-init/`
only for an empty data directory. Create it once manually:

```bash
docker compose --profile dev-db exec dev-postgres \
  createdb -U eimir eimir_test
```

The Web client is tested with `cd web && npm test`.

`backend/uv.lock` is the binding cross-platform dependency state. After an
intentional API change, update the versioned contract with
`uv run python scripts/openapi_contract.py write`; CI compares it with the
schema of the actual application.

## Self-Hosted

eimir. supports exactly one Docker Compose manifest: root `compose.yaml`.
`.env.example` selects the `self-hosted` profile for a normal complete checkout:

```bash
cp .env.example .env    # then fill in the required values
docker compose up -d
```

The API is then available at `http://127.0.0.1:8000`. This plaintext endpoint
is deliberately restricted to the local host. Access from a LAN or the
Internet requires an HTTPS reverse proxy; the API must not be published
directly on all interfaces for that purpose.

Management surfaces such as **Arcane** use the same `compose.yaml` and
`self-hosted` profile. When the Arcane workspace does not contain a full
checkout, Backend and Web build contexts are configured as Git/BuildKit URLs
through environment values rather than through another Compose file. Setup,
private repositories, and Release refs are documented in
[docs/ARCANE.md](docs/ARCANE.md).

The `migrate` service upgrades the schema once before `api` and `worker`
start. The application does not migrate itself; otherwise two starting API
containers could attempt the migration concurrently.

The complete secure startup procedure, reverse-proxy requirements, and a
Smoke Test are documented in [docs/SELF-HOSTING.md](docs/SELF-HOSTING.md).
Existing installations must also follow the
[project-identity migration guide](docs/PROJECT-IDENTITY-MIGRATION.md) before
changing a checkout path, Compose project name, image identity, or legacy
configuration keys.

## Status

[docs/IMPLEMENTATION-STATUS.md](docs/IMPLEMENTATION-STATUS.md) is the single
authoritative living source for current milestone, gate, launch-blocker, and
acceptance status. This README intentionally does not duplicate that detailed
state.

Use [docs/ROADMAP.md](docs/ROADMAP.md) for milestone order and gate definitions.
For G5 evidence and decision records, follow the links from the living status
rather than inferring launch readiness from a green CI run or a closed
implementation issue.

## Project control

The complete binding requirement is the
[Clean-Room Master Specification](specification/CLEAN-ROOM-MASTER-SPEC.md).
The [living implementation status](docs/IMPLEMENTATION-STATUS.md) contains the
current work list. Dated files under [docs/reviews](docs/reviews) are immutable
review snapshots; if they conflict with current normative guidance, the Master
Specification remains authoritative.

Parallel implementation work is coordinated through clearly scoped GitHub
Issues, separate branches, and Pull Requests. Enforcement for `main` is
defined by the repository's [active GitHub ruleset](https://github.com/baerenmarke90/eimir/rules/21286018);
GitHub is the canonical source for repository visibility, required checks, and
rule enforcement. This README intentionally does not copy a static required-check
list that would drift independently.

## Security

Do not report suspected security vulnerabilities through public issues,
discussions, or pull requests. Follow the repository
[Security Policy](.github/SECURITY.md) for the supported branch, private
reporting path, triage process, and coordinated-disclosure guidance.

When GitHub provides the **Report a vulnerability** action for this repository,
use that private channel. Never include secrets, private user data, production
data, or exploit details that would materially enable abuse in public
contributions.

The technical security architecture and application security invariants remain
documented separately in [docs/SECURITY.md](docs/SECURITY.md).

## License

eimir.'s own source code is provided under the **PolyForm
Noncommercial License 1.0.0**. Noncommercial use, modification, and
distribution are allowed under that license. Commercial use requires a
separate commercial license from the rights holder.

- [LICENSE](LICENSE) — PolyForm Noncommercial License 1.0.0
- [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) — commercial licensing
- [CONTRIBUTING.md](CONTRIBUTING.md) and [CLA.md](CLA.md) — contributions and contribution rights
- [TRADEMARKS.md](TRADEMARKS.md) — name, logo, and branding
- [docs/BUSINESS-MODEL.md](docs/BUSINESS-MODEL.md) — Self-Hosted, eimir. Cloud, and product principles

eimir. is therefore **source-available**, not Open Source in the
narrower OSI sense, because commercial use is not granted generally.
Third-party dependencies remain under their respective licenses; obligations
are documented in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).
