# Own-Account notification preference contract: #638 follow-up

**Baseline:** `main` at `a65fef94` (merged backend foundation, 24 September
2026). This follow-up exposes the existing PUSH override to its owner through
an authenticated, account-scoped API. It does not claim the full channel matrix,
Web settings, mail delivery or a configured push provider. The five persisted
`NotificationKind` values and #515's closed delivery-class catalog remain the
only event taxonomy. Neither Account nor Space identifiers are accepted in the
route or body. An unknown kind fails validation; a known digestible kind cannot
be promoted to immediate push.

The GET response includes every persisted kind, its policy class and separate
channel states. `IN_APP` reports the existing enabled default as read-only;
`EMAIL` reports disabled and read-only until the channel has a safe delivery
path. `PUSH` is writable only for current immediate kinds. Channel capability
is distinct from the stored preference: no endpoint or provider means no
deliverable push, even if the choice is enabled. The API does not promise
provider readiness from an endpoint row alone. Capabilities fail closed for
EMAIL while notification mail delivery is absent, including on SMTP hosts.
Future channel implementations may add writable states without changing the
route or introducing a second event catalog. All responses are private and
uncacheable. Partner credentials can neither address nor discover a different
Account's rows.

**Reuse review before implementation:** use FastAPI `CurrentAccount` and
`DbSession`, the #638 normalized override table, #515 policy catalog, existing
PushEndpoint and the generated OpenAPI/TypeScript client. Alternatives were a
new preference store, Space-scoped switches, handwritten client DTOs or an
external notification service; each would duplicate authority or violate
account isolation. This is small domain-specific HTTP adaptation; no provider,
dependency, broker or second API client is introduced. The Android Capacitor
wrapper consumes the same Web-generated contract. No third-party license,
pricing, host configuration or new credential is involved.

**Business/freemium:** the Notification Policy matrix row is Free/Core on
Cloud and Self-Hosted; existing Premium sender eligibility for extended
gestures never limits the recipient's personal switch. No entitlement, quota,
retention, downgrade, cost or plan boundary changes. This API itself sends no
additional mail or push.

**Cross-cutting preflight:** bearer authentication chooses the sole Account;
body fields forbid extras, so another Account and arbitrary email cannot be
targeted. An Account lock serializes writes with provider delivery and
deletion. Idempotent upserts preserve retry safety; terminal suppressed
deliveries never replay. Existing foreign-key cascade and backup/restore
cover the rows. A single indexed read retrieves the owner's overrides;
API errors use stable codes and reveal no partner state. No new product text,
visuals, focus or motion are introduced. PostgreSQL integration tests must
cover owner isolation, unavailable capability, invalid channels and the
push-policy intersection; OpenAPI and the generated client must match.

**Next product slice:** independent IN_APP visibility and EMAIL delivery need
their own complete persistence, privacy, capability, and retry review before
they become writable. Web Settings UI also requires the issue's generated
visual reference and Compact Mobile Interaction Contract before code, plus
Light/Dark and Expanded acceptance. #638 stays open.
