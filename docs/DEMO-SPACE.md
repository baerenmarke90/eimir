# Canonical Demo & Manual Test Space

Issue: #304  
Status: development/QA and public product-demo facility; required before Go Live

The canonical demo Space turns the scenario in `docs/m2/DEMO-SCENARIO.md` into a repeatable,
fictional dataset for manual Web/Android QA, screenshots, demonstrations, privacy regression
coverage, and a permanently reachable public demo deployment.

It is not a database dump or a parallel domain implementation. Seeded product data still uses the
normal domain, media, privacy, outbox, reminder, and entitlement paths.

## Identities

The reserved demo identities are:

| Person | Reserved address |
|---|---|
| Lea Sommer | `demo-lea@eimir.invalid` |
| Alex Winter | `demo-alex@eimir.invalid` |

`.invalid` is deliberately non-deliverable. For manual development/QA creation, initial local
passwords are supplied only while the canonical accounts are first created through
`EIMIR_DEMO_LEA_PASSWORD` and `EIMIR_DEMO_ALEX_PASSWORD`; they are never committed or printed.

The dedicated public demo does not require an operator to provide or persist these seed passwords.
Its Compose bootstrap creates high-entropy ephemeral initial values in process memory when the
reserved Accounts do not exist yet. Those values are neither printed nor written to deployment
configuration and are not used for public entry.

Public visitors do **not** receive or enter passwords. A demo deployment shows a persona selection
page with:

- the Lea persona action (`demo.joinLea`); and
- the Alex persona action (`demo.joinAlex`).

The selected persona receives a rate-limited, one-time authentication proof. That proof is then
consumed through the ordinary magic-link session path. The deployment-only entry endpoint is
intentionally excluded from the product OpenAPI contract so generated Android/Web API clients do
not treat public-demo entry as a normal authentication capability.

## Environments

`EIMIR_ENVIRONMENT` has three operational meanings relevant here:

- `development`: local development and QA;
- `demo`: isolated public demo deployment;
- `production`: ordinary production deployment.

`demo` receives the same public-runtime hardening as `production`: HTTPS public URL, explicit
allowed hosts, a real cursor signing key, and no logging mail transport are required.

`EIMIR_ENVIRONMENT=demo` requires:

```env
EIMIR_DEMO_MODE=true
```

Conversely, the ordinary `production` environment rejects `EIMIR_DEMO_MODE=true`. This prevents the
main production instance from accidentally becoming the public demo.

## Manual create for development / QA

Run migrations first. For local development/QA, execute from `backend/`:

```bash
export EIMIR_DEMO_LEA_PASSWORD='choose-a-local-demo-password'
export EIMIR_DEMO_ALEX_PASSWORD='choose-a-different-local-demo-password'
uv run python -m scripts.demo_space create
```

Creation is idempotent. If the verified reserved accounts already share their canonical Space, the
command returns that Space instead of duplicating data. The command also reconciles the canonical
Space to the deterministic M7 module configuration defined in
`docs/m7/SPACE-MODULE-CONFIGURATION.md`; it does not infer or repair configuration authority for
ordinary user Spaces.

For deterministic acceptance runs:

```bash
uv run python -m scripts.demo_space create --reference-date 2026-08-24
```

Without `--reference-date`, the current local date becomes the reference date. The scenario derives
recent memories, future plans, past milestones, and mixed open/completed states from it.

The explicit `create` command intentionally remains available for development and QA. Public demo
Compose deployments use the automatic `ensure` path described below instead.

## Permanent public demo deployment

Run the demo as a **separate stack/database/media store/domain**, for example
`https://demo.eimir.example`. Never reuse the production database or media volume.

A representative demo environment is:

```env
EIMIR_ENVIRONMENT=demo
EIMIR_DEMO_MODE=true
EIMIR_DEMO_MODE_RESET_TIMER=true
EIMIR_DEMO_MODE_RESET_INTERVAL=6h

EIMIR_PUBLIC_BASE_URL=https://demo.eimir.example
EIMIR_ALLOWED_HOSTS=["demo.eimir.example","localhost","127.0.0.1"]
EIMIR_CURSOR_SIGNING_KEY=<independent-random-secret-at-least-32-characters>
EIMIR_MAIL_TRANSPORT=none
```

Normal production hardening remains mandatory. The demo should additionally be protected by the
reverse proxy's ordinary request/rate-limit controls because it is intentionally reachable without
a personal account.

### Explicit Compose bootstrap

Demo initialization is **not** part of the normal Self-Hosted startup chain. The canonical
`compose.yaml` defines a one-shot `demo-init` service in the additive `demo` profile only;
`api` and `worker` do not depend on it. Normal startup stays:

```text
postgres -> migrate -> api / worker -> web
```

For an intentional Demo deployment, deploy normally and then run the idempotent one-shot
explicitly. `self-hosted` supplies its `migrate` dependency and `demo` supplies the service:

```bash
docker compose --profile self-hosted --profile demo --env-file .env run --rm demo-init
```

`demo-init` runs `python -m scripts.demo_space ensure` from the same backend image as `api`
after `migrate` has succeeded.

- on `EIMIR_ENVIRONMENT=demo` with `EIMIR_DEMO_MODE=true`, it creates the canonical Lea/Alex Space if it
  is missing;
- creation is idempotent, so running it again or redeploying does not duplicate or replace an
  existing demo Space (it reports `already present`);
- initial Account passwords are generated ephemerally inside the process and are never printed or
  stored in `.env`/Arcane;
- on development and ordinary production deployments, `ensure` exits successfully without creating
  demo data;
- API and worker do not wait for it: until the command has completed, `POST /api/v1/demo/entry`
  answers `404 DEMO_IDENTITY_MISSING`. Concurrent `ensure` and periodic reset are serialized by the
  canonical-dataset lock, and the first reset is scheduled one interval after startup;
- do not put `demo` into `COMPOSE_PROFILES` and use `up --wait`: Compose treats an exited standalone
  one-shot as a failed wait;
- migrations themselves still never seed product data.

Manual `create` remains available for local development/QA and explicit troubleshooting.
`scripts/self_hosted_upgrade_rehearsal.py --scenario demo` exercises this lifecycle end to end.

## Demo-instance banner

When `EIMIR_DEMO_MODE=true`, the Web build renders a visible notice above the entire demo UI. It states
that the deployment is a demo and that visitor changes are temporary.

The banner uses the same deployment values as the reset worker:

```env
EIMIR_DEMO_MODE_RESET_TIMER=true
EIMIR_DEMO_MODE_RESET_INTERVAL=6h
```

With the example above, the UI states that the demo is reset automatically every **6 hours**. The
compact interval syntax is formatted into user-facing German text (`30m` -> `30 Minuten`, `1h` ->
`1 Stunde`, `1d` -> `1 Tag`). If the reset timer is disabled, the banner says so rather than claiming
a reset cadence that is not active.

The interval is a Web build input as well as a backend runtime setting. Changing the reset timer or
interval therefore requires rebuilding/redeploying the Web image so the displayed notice remains in
sync with the worker configuration.

## Link from the main login

The normal/main Web build can advertise the isolated demo without enabling demo mode itself:

```env
EIMIR_ENVIRONMENT=production
EIMIR_DEMO_MODE=false
EIMIR_DEMO_PUBLIC_URL=https://demo.eimir.example
```

`EIMIR_DEMO_PUBLIC_URL` is a Web build input. When present, the login screen shows the configured demo
launch action (`demo.launch`) and links to the separate demo deployment. Changing the value therefore
requires rebuilding the Web image.

On the demo deployment, `EIMIR_DEMO_MODE=true` replaces the normal unauthenticated entry screen with
the Lea/Alex selection page.

## Manual reset

Reset keeps the two reserved demo Accounts and their local seed credentials, removes only the
verified canonical demo Space, and recreates its product data:

```bash
uv run python -m scripts.demo_space reset
```

A deterministic reset is also possible:

```bash
uv run python -m scripts.demo_space reset --reference-date 2026-08-24
```

The reset refuses ambiguous/partial reserved-account state, a demo Account in another active Space,
or unsafe media cleanup. It never accepts an arbitrary Space ID.

## Canonical technical identity

`display_name` is presentation state in the domain model and must never serve as durable technical
demo identity. create/ensure/reset must not depend on it to recognize a canonical demo Account:
legacy data, an operator edit, or a direct database change can leave it drifted, and that alone must
never make `demo-init` fail (#633). Public Demo visitors are separately, and already, prevented from
causing that drift themselves through the normal profile API -- see "What a visitor may change" below
(#697) -- but the technical identity does not rely on that guard either; it must hold even against
drift the guard cannot see, such as data from before this marker existed.

Each reserved persona is instead recognized by a durable technical marker, `DemoCanonicalIdentity`
(`eimir.demo.models`, table `demo_canonical_identities`): a small registry stating which
Account currently plays the `LEA` or `ALEX` persona, independent of any presentation field. Resolving
a persona for create/ensure/reset checks, in order:

1. the reserved, non-deliverable `.invalid` address belongs to the Account;
2. the durable marker for that persona, if one already exists, points at the same Account.

Owning the reserved address is a necessary check but never sufficient proof on its own to adopt a
still-missing marker -- see "Existing deployments" below for exactly when adoption is and is not
safe. If a marker already exists and points at a *different* Account than the one the reserved
address resolves to, the operation is refused; the same happens if only one of the two reserved
accounts exists, or if the reserved accounts do not share exactly one active Space. None of these
fail-closed checks are weakened by the marker: they refuse rather than guess which Account was meant,
exactly as before.

A successful reset additionally restores the canonical presentation state it owns: both personas'
display names are set back to `Lea Sommer` / `Alex Winter` regardless of what drifted them. Account
IDs never change as part of this. `ensure` (the idempotent create path Compose's `demo-init` calls)
does not itself restore the display name -- it recognizes and returns the existing Space without
touching it -- but it no longer fails because of a drifted one either; the next reset puts it back.

## What a visitor may change

Everything the reset replaces stays editable: the Space and all of its product data, and the
profile avatar, whose attachment lives in that Space and is purged with it.

Public Demo visitors are prevented from changing an Account-global reserved-persona name at all
through the normal profile API (#697), independently of anything create/ensure/reset does. In a demo
deployment (`EIMIR_ENVIRONMENT=demo` or `EIMIR_DEMO_MODE=true`), a request that would change the
Account-global display name of a reserved persona is refused with `403
DEMO_CANONICAL_IDENTITY_IMMUTABLE`. Recognition follows the reserved address rather than the current
name, so the guard still applies to an identity that has already drifted through some other path.
Setting the name to the value it already has is not a mutation and stays accepted. The Web UI hiding
a control is not part of this boundary; a visitor holds an ordinary bearer token and the refusal is
made server-side. This is not what create/ensure/reset rely on to stay working -- #633 made them
recover from a drifted name regardless -- it exists so a persona is never visibly mislabeled to other
visitors in the meantime.

Two Account-global operations were already blocked for every Account in a demo deployment and stay
that way, deliberately broader than the reserved-identity guard: self-service Account deletion
(`ACCOUNT_DELETION_DEMO_FORBIDDEN`) and Space self-offboarding
(`SPACE_OFFBOARDING_DEMO_FORBIDDEN`). All three now share one definition of "this deployment is the
demo".

The remaining Account-global surfaces are covered by the reset contract rather than by a guard.
Passkeys, linked non-local identities, one-time tokens, and device sessions are removed by the
reset itself. The local seed password cannot be reached by a public visitor at all: changing it
requires the current password, which the public demo never issues, and recovery would need a link
delivered to a deliberately non-deliverable `.invalid` address. There is no self-service endpoint
that changes an Account's email address.

## Existing deployments

A demo database created before #633 has no `demo_canonical_identities` rows yet. Adoption -- writing
the still-missing marker for a reserved-address Account -- only happens once the *existing* demo
structure already unambiguously proves that Account is the canonical persona: specifically, once the
two reserved-address Accounts are found to already share exactly one active, verified Space (the same
check `create`/`reset` always required before touching anything). Only then are any missing markers
backfilled, immediately before the operation that needed them proceeds.

Two reserved-address Accounts that exist but carry no marker *and* do not already share such a
canonical Space are **not** adopted. `create`/`ensure` refuse instead of guessing that they must be
the legitimate demo pair and building a new Space around them: owning the reserved `.invalid` address
is a necessary signal, not sufficient proof by itself, and a genuinely fresh install never carries
reserved-address Accounts without also creating their marker and Space together in the same
operation, so this state is never a false positive for one. Resolve it by hand (see "Manual reset"
and `scripts.demo_space` above), or drop the two Accounts and let the next `ensure` create them fresh.

An operator who directly edited the database into some other genuinely ambiguous state -- for
example binding the marker to an Account other than the one the reserved address resolves to --
still needs to resolve that by hand as well. Create/ensure/reset refuse to guess in that case, the
same as they always refused a partial or ambiguous reserved-account state before #633.

## Automatic reset timer

The public demo can reset itself through the existing durable PostgreSQL job queue:

```env
EIMIR_DEMO_MODE_RESET_TIMER=true
EIMIR_DEMO_MODE_RESET_INTERVAL=6h
```

Supported interval syntax is `m`, `h`, or `d`, for example `30m`, `6h`, or `1d`. Values below `5m`
or above `7d` are rejected.

The timer is independent from `EIMIR_DEMO_MODE`: demo mode may be enabled while automatic reset is
disabled. The timer itself requires demo mode.

After a successful automatic reset, public-demo authentication artifacts for Lea and Alex are
expired/removed, including device sessions, one-time authentication tokens, passkeys, and linked
non-local identities. Existing visitors therefore re-enter through the persona selection page
instead of carrying authentication state indefinitely across resets.

Automatic resets use the same complete canonical wrapper as initial creation: presentation cleanup
and stable Reminder examples are restored before the reset is considered complete.

## Seed coverage

The canonical dataset is created through normal domain services and currently includes:

- relationship start and duration settings;
- shared self-profile preferences for Lea and Alex;
- private partner notes for both owners;
- shared and owner-only RelatedPerson / ImportantDate examples;
- Memories with and without curated local stock photos;
- shared and owner-only HeartMoments;
- Milestones and Comments;
- Wishes in OPEN, PLANNED, and COMPLETED states;
- Plans in IDEA, PLANNED, and COMPLETED states, including scheduled examples;
- Places used by the canonical planning and Chapter examples;
- Chapters, including Place-linked content;
- shared Collections/items, including a realistic shared checklist pinned to Today for both personas;
- recent Daily Check-in history for both personas with Vibe and Energy/Battery values, intentional gaps,
  and Mutual Reveal enabled so the current privacy interaction is demonstrable;
- a recent completed shared Plan so completion/achievement surfaces have current content;
- independent PrivateNote, GiftIdea, and PrivateCollection content for both Accounts;
- Search-visible shared/private material;
- Activity and in-app Notification projections;
- generated M4-C Reminder examples for ImportantDate, birthday, relationship anniversary, and
  planned Plan rules;
- one manual Reminder plus recipient-specific mute/rule-preference examples.

The canonical demo ships a hash-pinned set of curated real stock photos under
`backend/demo_assets/`. They are imported locally through upload registration, normal MediaStore
storage, finalize, validation/sanitization, thumbnailing, and normal binding. Runtime bootstrap and
reset never download media from a stock provider or hotlink an external CDN.

## Curated demo media

The repository carries the canonical media set in:

```text
backend/demo_assets/manifest.json
backend/demo_assets/images/
backend/demo_assets/README.md
```

The current set contains twelve real Pixabay stock photos. Each concrete source page was checked individually. The selected files were published before **2019-01-09**; Pixabay's current terms identify content published before that date as CC0 content. The manifest records the real asset id, creator, source publication date, source-page URL, `CC0 1.0 Universal`, the Pixabay terms as the licensing basis, the date of the license check, SHA-256, MIME type, German alt text, and intended usage. Source URLs are provenance only and are never used as media URLs.

Do not infer redistribution permission merely from the provider name. Current provider licenses may restrict standalone redistribution. A maintainer adding an image must check the concrete source page and applicable terms, commit the approved bytes locally, compute the exact hash, update all provenance fields, and run:

```bash
uv run python -m scripts.demo_space validate-assets
```

`validate-assets` does not open the database. Creation and reset run the same complete asset preflight before any demo mutation: manifest schema, required provenance, provider/source URL, local file existence, exact directory membership, SHA-256, decodable image type, MIME agreement, alt text, and the historical Pixabay CC0 cutoff used by this curated set. A failure aborts before accounts are created or existing demo media is purged.

The runtime image copies `demo_assets` explicitly and validates it during image build. There are no stock-site downloads at container startup. Seeding calls the existing attachment service (`create_upload` -> `open_upload` -> `complete_upload` -> `finalize_upload` -> validation) so normal size/type checks, image sanitization, thumbnails, MediaStore, and database bindings remain authoritative. No parallel demo storage exists.

Reset first validates the local catalog, then detaches all demo bindings and purges every attachment provider object before replacing the verified demo Space. The same local asset ids are re-imported in the same deterministic order, so repeated resets do not accumulate duplicate or orphaned media.

The five album-like demo themes declared by `eimir.demo.story.CHAPTERS` use the existing Chapter model. eimir. currently has no separate Album product model, and this demo change intentionally does not add a DB column, API, or Web feature solely to simulate one.

### Maintainer flow for a new image

1. Inspect the concrete Pexels/Pixabay source page and its applicable redistribution terms.
2. Avoid identifiable people, logos, trademarks, and other third-party rights unless reviewed separately.
3. Download the approved image once into `backend/demo_assets/images/`; never add a runtime CDN URL.
4. Record real provider/asset/creator/license metadata and meaningful `alt_text_de`/`usage_context` values.
5. Compute SHA-256 over the exact committed file and update `manifest.json`.
6. Run `uv run python -m scripts.demo_space validate-assets` plus demo unit/integration tests.
7. Build the backend image to prove the packaged runtime contains exactly the validated set.

## Privacy canaries and presentation cleanup

The seed deliberately uses unmistakable owner-only canary tokens while its privacy fixtures are
assembled. They allow automated tests to detect leakage into the partner's Story, Search, Activity,
Notifications, Dashboard, and other shared read models.

Those tokens are **not product copy**. Before the completed canonical demo dataset is returned to
public callers, the presentation-normalization step replaces them with natural fictional values
such as private notes, dates, gift ideas, and private-list titles. The privacy class and ownership do
not change. Automated coverage verifies both properties: the internal tokens are absent from the
completed public demo data, and the natural private content still remains owner-only.

Do not solve presentation problems by weakening privacy tests or adding demo-only filtering
exceptions.

## Freemium / entitlement behavior

The demo does not use a frontend-only, unconditional, or "all Premium" bypass. Free/Core behavior
continues to use the same entitlement model as for ordinary users.

The canonical dataset records purpose-scoped normalized `TEST_FIXTURE` grants through the ordinary
entitlement service. One grant exposes `games.couple` for Couple Games; a second exposes
`daily.insights` and `daily.quote` for the implemented Today Pro capability boundary. The Daily
Quote preferences are deterministic for both personas and use the same entitlement and preference
contracts as ordinary Accounts.

All fixture grants are evaluated through the same tenant-scoped entitlement endpoint and server-side
capability checks as ordinary grants. Production forbids creating `TEST_FIXTURE` grants and excludes
restored fixture grants from effective Production entitlement evaluation.

Curated media, richer seed content, and reset behavior do not themselves change paywall,
storage-tier, billing, or capability semantics. Future Demo Premium scenarios must continue to use
the authoritative capability/entitlement model rather than a client-side or Demo-only bypass.

## Practical QA loop

1. deploy/update the build under test; the public demo is ensured automatically;
2. reset the canonical demo Space when a fresh reference state is needed;
3. enter once as Lea and once as Alex in separate browser sessions;
4. exercise the changed screen at compact, medium, and expanded widths;
5. explicitly check the opposite persona for owner-only leakage; and
6. rerun the relevant automated tests before merge.

The canonical demo complements automated tests. It does not replace negative API cases, concurrency
tests, migration checks, authorization tests, or CI/security gates.
