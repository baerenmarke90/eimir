# Cross-Cutting Quality Review

## Purpose

eimir. treats cross-cutting requirements as architecture and product requirements, not late release cleanup.

Larger runtime slices, client features, and production user flows must be reviewed against the areas below before implementation and before merge. Not every area applies to every change; `not relevant` is acceptable when the decision is intentional, traceable, and briefly justified.

The review complements existing Clean-Room, Security, Privacy, Reuse, engineering-language, and milestone gates. It does not replace or weaken them.

## Review areas

### Security

Review:

- new attack surface, authentication, and authorization consequences;
- tenant isolation and indirect existence disclosure;
- abuse resistance, rate limits, replay, idempotency, and race conditions;
- input validation, external content, and file or network parsers;
- secure defaults and fail-closed behavior.

### Privacy and data lifecycle

Review:

- data classification and visibility;
- logs, events, analytics, crash reports, and support data;
- retention, deletion, export, and backup behavior;
- caches, read models, notifications, and indirect relationships;
- provider and third-party data flows.

### Internationalization and locale

Review:

- all user-facing text through the applicable localization layer;
- dates, times, numbers, and currencies through the active locale instead of a hard-coded locale;
- pluralization through locale-aware rules;
- stable language-neutral error codes instead of localized backend prose as a client contract where possible;
- layouts with longer translated text and RTL implications where relevant to the affected screen;
- user-generated content must not be translated automatically merely because the surrounding product UI is localized.

### Accessibility

Review:

- semantics, accessible name/role/value, and screen-reader or TalkBack behavior;
- keyboard navigation, focus behavior, system Back, and alternative input methods;
- text scaling, contrast, and reduced-motion behavior;
- error, loading, empty, and conflict states;
- relevant requirements from `docs/ACCESSIBILITY-QA-MATRIX.md`.

### Concurrency and consistency

Review:

- concurrent writes and lost updates;
- `If-Match`/409 semantics, lock ordering, and database constraints;
- idempotent retries and rollback safety;
- delete or transition races and consistent semantics under concurrency.

### Resilience, offline behavior, and retry

Review:

- network failures and timeouts;
- safe retries without duplicate side effects;
- behavior under partial failures;
- offline display versus offline writes;
- no sync promise unless a real synchronization mechanism exists.

### Observability

Review:

- which logs, metrics, and traces are required for operations and diagnostics;
- correlation or request IDs for new distributed or asynchronous paths;
- secrets, tokens, presigned URLs, `OWNER_ONLY` payloads, and other sensitive content must never enter observability output;
- failures must remain diagnosable without weakening privacy boundaries.

### Performance and resources

Review:

- query count, pagination, and index requirements;
- payload, media, storage, memory, and CPU impact;
- expensive work should not remain in the request path when it can safely be moved elsewhere;
- client recomposition or rendering behavior, lists, and large data sets;
- resource limits for parsers, jobs, and external integrations.

### Contracts and migrations

Review:

- OpenAPI and DTO impact and client compatibility;
- database migrations, roll-forward behavior, and existing data;
- versioning and backward compatibility;
- generated clients and contract tests;
- avoid introducing a second source of truth for the same domain value.

### Operations, Self-Hosted behavior, and release

Review:

- new configuration and secure defaults;
- impact on Compose, containers, health/readiness, and reverse proxies;
- upgrade, backup, and restore consequences;
- Cloud and Self-Hosted parity for core behavior;
- new provider, secret, cost, or support requirements.

### Testing

Review:

- the smallest meaningful unit or component tests;
- PostgreSQL or integration tests for database and concurrency rules;
- cross-tenant and privacy negative tests;
- contract, E2E, accessibility, or build tests when the scope requires them;
- regression tests must actually prove the regression and must not merely repeat the happy path.

## Usage in issues and pull requests

### Before implementation

For each larger slice or production user flow, record relevant cross-cutting areas in the issue or owning slice documentation before runtime implementation begins.

Resolve open design questions before runtime code when they shape the API, persistence model, privacy boundary, or client architecture.

### Before merge

Relevant pull requests include a `Cross-Cutting Quality` section that records what was reviewed for the applicable areas. Non-relevant areas may be summarized together when the reasoning remains traceable.

A PR is not merge-ready when a recognizable cross-cutting consequence is untreated or merely deferred in a way that creates an incompatible contract, a privacy or security gap, or difficult-to-reverse architecture.

## Example

A new date card may document:

- security/privacy: no new data surface;
- i18n: content through translation keys and dates through the active locale;
- accessibility: semantic heading and keyboard behavior reviewed;
- performance: not affected;
- API/migration: not affected;
- tests: default-locale rendering and fallback behavior covered.

This keeps cross-cutting consequences visible early without turning every small pull request into unnecessary process overhead.
