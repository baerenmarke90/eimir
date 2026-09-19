# Architecture

## Shape

A **modular monolith**. No microservices unless a concrete technical need
requires them.

```text
        Web / PWA (React/TypeScript) ── same bundle ──▶ Capacitor Android wrapper
                    │                                          │
                    └──────────────────  HTTPS  ───────────────┘
                                 │
                           REST API v1
                                 │
                             FastAPI
                                 │
                        Application Core
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
      PostgreSQL             MediaStore               Worker
                                 │
                        ┌────────┴────────┐
                    Filesystem            S3
                   (Self-Hosted)        (Cloud)
```

Cloud and Self-Hosted share the same core. Differences live in adapters —
storage, mail, auth, push — rather than in domain logic.

## Layers

**API** (`eimir.api`) — HTTP, serialization, error mapping. Contains no
domain rules.

**Domain** (`eimir.domain`) — domain objects, rules, and events. Knows
neither HTTP nor a concrete provider.

**Infrastructure** (`eimir.db`, `.media`, `.providers`) — persistence and
external systems behind interfaces.

Dependencies point inward: API knows Domain; Domain knows Infrastructure only
through interfaces.

## Authentication architecture

Profile identity and authentication methods remain separate. The existing local
Self-Hosted path stores only the Argon2 hash in `AuthIdentity`. OIDC adds the
standards-based key `(issuer, subject)` and a freely configurable
`connection_id`; concrete providers such as Pocket ID therefore need no custom
domain model.

WebAuthn is not modeled as a generic string provider. `WebAuthnCredential`
stores the public credential data and signature counter needed for registration
and assertion; private keys exist only in the authenticator.

Short-lived proofs for email verification, Magic Link, and Recovery use three
separate models. Shared invariants — hash instead of plaintext, expiry,
revocation, and single use — are shared, but tables and consumption paths are
not. A token therefore cannot be confused between authentication flows.
Protocol adapters and HTTP flows are built on top of this foundation but are
not part of the persistence model itself.

## Conventions

### Identifiers

Persistent domain objects use **UUIDv7**. No incrementing public IDs: a
sequential number leaks inventory size and invites enumeration. UUIDv7 is time
sortable and therefore index-friendly as a primary key.

### Time

| Meaning | Type |
|---|---|
| Technical timestamp (`created_at`, `updated_at`) | `TIMESTAMPTZ`, always UTC |
| Domain date (`happened_on`, `birthday`) | `DATE` |

A domain date is not a timestamp. A birthday has no time zone, and storing it as
a timestamp will eventually shift it by a day.

#### What day is today?

A stored domain date has no time zone. The question of which day it currently
*is* does, and that determines shared days, anniversaries, and every other
visible day boundary.

The authoritative time zone is the **reading person's** time zone
(`Account.timezone`), not UTC:

```text
today_utc()             technical purposes
today_in(zone)          every user-visible day boundary
```

`today_utc()` would be up to one day ahead for people west of UTC and one day
behind for people east of it. An anniversary would then appear hours too early
or too late — visibly wrong on exactly the day when it matters.

Two partners in different places may therefore briefly see different values.
That is intentional: each person sees their own day. An unusable zone name
falls back to UTC with logging rather than failing the response.

#### Time zone and locale are written, not guessed

The UTC fallback on read is a recovery layer for legacy data and explicitly not
the normal path. To keep it that way, exactly **one** place writes
`Account.timezone` and `Account.locale`:
`identity.preferences.set_preferences`. Every future write path — account
settings, import, data migration — passes through it.

| Field | Rule | Error |
|---|---|---|
| `timezone` | exact IANA name, validated against the available zone database | `ACCOUNT_TIMEZONE_INVALID` |
| `locale` | BCP-47 subset `language[-Script][-REGION]` | `ACCOUNT_LOCALE_INVALID` |

Validation uses the zone database rather than a pattern: `Europe/Berlinn`
looks like a zone name but is not one. Casing is left untouched —
`europe/berlin` is rejected rather than silently corrected.

Locale normalization is fully specified and therefore deterministic: `_`
becomes `-`, language is lowercase, Script starts with an uppercase letter,
and REGION is uppercase (`de_DE` → `de-DE`, `zh-hans-cn` → `zh-Hans-CN`).
Normalizing twice changes nothing further; stored and returned values are the
same. Anything that still does not match the pattern is rejected instead of
corrected.

Both values are validated completely before either is assigned, so an invalid
second value never leaves a half-modified account.

### JSON

Externally **camelCase**, internally **snake_case**. Conversion happens at the
serialization boundary rather than by renaming domain code.

### Optimistic concurrency

Mutable domain objects carry a `version`. Updates validate it and return
**409** on mismatch. This also prepares for later offline synchronization:
without a version concept, a conflict cannot be distinguished from an
overwrite.

Over HTTP this is represented through ETag and `If-Match`:

```text
GET  .../profile        -> 200, ETag: "3"
PUT  .../profile        If-Match: "3"  -> 200, ETag: "4"
PUT  .../profile        If-Match: "3"  -> 409
```

`If-Match` is **mandatory**, including in the OpenAPI contract. An optional
header would invite clients to omit it and thereby accidentally disable
conflict protection. `*` and weak validators are rejected because neither
names a concrete version.

Two independent safeguards apply: concurrent writers are serialized per Space
so the 409 occurs deterministically rather than by timing accident; the
database also checks the version column in the `UPDATE` itself. A lost update
therefore does not occur even if one safeguard is bypassed later.

## Transactional Outbox

The domain change and its event are written in **one** transaction:

```text
BEGIN
  INSERT/UPDATE  Domain object
  INSERT         outbox_event
COMMIT
```

A worker reads and delivers the Outbox. This prevents an event from being lost
because delivery failed after commit and prevents a notification from being
created for a change that was rolled back.

Domain and delivery channel remain decoupled: the Domain knows neither push,
mail, nor any integration.

## Job Queue

PostgreSQL-based, without requiring Redis or Celery. Concurrent workers claim
jobs through `FOR UPDATE SKIP LOCKED`, so two workers never take the same job.

Jobs carry `attempts`, `max_attempts`, `run_after`, and `locked_until`. A stale
lock expires and the job becomes claimable again.

## Read Models

Story, Dashboard, yearly recap, and the de-DE product feature **„Weißt du
noch?“** are **derived**, not stored. There is no Story table. Duplicated data
stores drift apart, and a second place holding the same content is a second
place where a visibility rule can be forgotten.

## E2EE readiness

The first release has **no** real end-to-end encryption. The architecture must
be able to adopt it later without being rebuilt.

Every sensitive domain object therefore separates two areas:

| Metadata | ProtectedPayload |
|---|---|
| `id`, `space_id`, `author_id` | `title`, `body` |
| `happened_on`, `created_at` | additional sensitive fields |
| `crypto_version` | |

In version 1 the payload is plaintext (`crypto_version = 0`). The boundary
already exists in API and persistence, so a later switch to client-generated
ciphertext is a format change rather than an architectural rewrite.

Persistence uses `ProtectedPayloadJSON` with a concrete `ProtectedPayload`
class. A raw dictionary or payload from another domain is rejected before SQL
binding. This is a type and architecture boundary, **not encryption**: with
`crypto_version = 0`, the server can still read the content.

Outbox events enforce the opposite boundary. Their payload is not an arbitrary
JSON dictionary but `PublicEventPayload` with a central allowlist of
non-sensitive metadata. The JSONB persistence type also rejects raw
dictionaries during direct ORM use. Sensitive text therefore remains in the
ProtectedPayload and is not persistently copied into Outbox, worker, or logs.

Derived functionality — Dashboard, recaps, rules, notifications — should use
metadata whenever possible. Anything that requires plaintext will no longer
work once real E2EE is introduced.

See [SECURITY.md](SECURITY.md).

## Provider framework

External providers are used exclusively through adapters: maps, geocoding,
places, discovery, recipes, entertainment, external media, and location
history.

Domain code knows no concrete provider. External data is transformed into
eimir.-owned normalized forms before entering the Domain.

The contracts are named `MapProvider`, `GeocodingProvider`, `PlacesProvider`,
`DiscoveryProvider`, `RecipeProvider`, `EntertainmentProvider`,
`ExternalMediaProvider`, and `LocationHistoryProvider`. They return only
eimir.-owned immutable models such as `GeoPoint`, `MapRoute`,
`PlaceCandidate`, `RecipeItem`, or `EntertainmentItem`; provider-specific DTOs
end at the adapter boundary.

A `ProviderRegistry` binds an interface to a freely configurable provider name
only at the Composition Root. Cloud or Self-Hosted can therefore switch an
adapter without changing Domain code. M0 deliberately implements no commercial
provider and no dependent M6/M7 functionality.

## Deliberately absent

- **No generic universal table** such as `items(type, content, ...)` across all
  domains. Domain areas receive their own models.
- **No SQLite.** A second test dialect does not test what runs in production.
- **No uncontrolled universal relation** without referential integrity.
  Relationships use real foreign-key tables.
