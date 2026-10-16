# Reuse Before Build - Mandatory Engineering Rule

## Status

This document is a mandatory governance addendum for eimir.

The historical Clean-Room Master Specification remains unchanged as the original specification. For new technical decisions, this rule applies in addition.

## Principle

Before implementing infrastructure, integration logic, or technical commodity functionality from scratch, check whether a suitable existing solution is available.

Consider options in this order:

1. open standard or protocol
2. operating-system or platform capability
3. established framework/runtime capability
4. permissively licensed open-source component
5. external provider or API service
6. only then custom implementation

Custom implementation is allowed, but it must be justified when a plausible existing solution exists.

## When the review is mandatory

The review is mandatory for relevant features or changes affecting at least one of these areas:

- external providers or APIs
- uploads, media processing, or playback
- search, indexing, or caching
- push, notifications, or background jobs
- calendar, maps, geocoding, routing, or weather
- storage, backup, restore, or export infrastructure
- observability, monitoring, or hoster notifications
- Web/Android API clients
- Android/Web platform capabilities
- authentication/OIDC/passkey-adjacent infrastructure
- new technical services or daemons
- new substantial dependencies

For pure domain logic without commodity infrastructure, the review may be marked `not relevant`.

Pure version bumps of already adopted dependencies are not reuse decisions and are therefore exempt. The automated gate skips pull requests opened by `dependabot[bot]`. Replacing the component itself, a major upgrade that introduces materially new capabilities, or a newly added dependency remains subject to review and is not covered by this exemption.

## Required questions before implementation

For a relevant feature, the issue or Pull Request must answer these questions traceably:

- Is there an open standard for the problem?
- Is there a suitable OS/platform/framework capability?
- Is there an established open-source component?
- Is there a suitable external provider?
- Which concrete candidates were reviewed?
- Why is the selected solution preferred?
- Why is custom implementation necessary, if applicable?

For third-party components or providers, also cover:

- license and terms of service
- commercial usability for eimir. Cloud
- Self-Hosted usability
- data flow and privacy
- storage, caching, deletion obligations, and attribution
- cost model and rate limits
- runtime/SDK dependencies
- fallback without the component
- user effort and hoster effort

## Product rule

Normal eimir. users must not need to configure technical integration details.

Target state:

- no API keys for normal users
- no technical server URLs for normal users
- no provider selection without real product value
- no token management by normal users
- as few additional provider accounts as possible
- when consent/OAuth is required: a short, understandable connection flow

The backend or operating platform handles the technical integration as far as reasonably possible.

## Decision rule

An existing component is not selected merely because it exists. Compare it with custom implementation on:

- functional fit
- maintainability
- security
- privacy
- license/ToS
- vendor lock-in
- operational effort
- cost
- maturity and maintenance status
- Cloud/Self-Hosted compatibility
- user experience

Preferred order: standards and existing platform capabilities first, replaceable components second, proprietary providers only behind clear adapters.

## Known candidates

The current candidate list is maintained in `docs/EXTERNAL-PROVIDER-CANDIDATES.md`.

The list is not exhaustive. Before starting a relevant feature, also search for new or improved options. An old candidate list never replaces a current review.

## Pull-request gate

A relevant Pull Request is not merge-ready when the reuse review is missing or only answered generically.

Acceptable outcomes are:

- documented selection of an existing component
- documented decision for custom implementation with rationale
- traceable `not relevant` classification for a pure domain change

The Pull Request template asks for this review explicitly.

## Relationship to other project rules

This governance rule supplements, in particular:

- `specification/CLEAN-ROOM-MASTER-SPEC.md`
- `docs/ENGINEERING-LANGUAGE.md`
- `docs/EXTERNAL-PROVIDER-CANDIDATES.md`
- `docs/ROADMAP.md`
- `CONTRIBUTING.md`

Clean-Room, security, privacy, and tenant-isolation rules retain priority. An external component must not weaken any of these boundaries.
