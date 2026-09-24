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
Light/Dark and Expanded acceptance. This paragraph describes the #1252 baseline;
the IN_APP follow-up below supersedes its read-only channel statement.

## Independent IN_APP choice follow-up (baseline `1eb61ec4`)

This backend follow-up makes `IN_APP` writable for every current persisted
`NotificationKind`. The GET channel state reflects the Account's effective
choice, with `configurable: true`; PATCH reuses the same authenticated
`/{kind}/{channel}` route, normalized override store and Account lock. Missing
overrides default to enabled for all existing kinds. The closed #515 catalog
still governs allowed kinds. `PUSH` eligibility, provider capability and
`EMAIL` read-only/unavailable behavior remain separate.

Every authorized projection retains the internal Notification as the source
for independent delivery, and snapshots its recipient's IN_APP choice in
`notifications.in_app_visible`. The migration backfills existing rows as
visible without changing their read state. Account locking serializes the
projection with preference writes; conflict-safe insertion preserves the
original snapshot on Outbox replay. The Center page, cursor pagination,
unread count, individual read and read-all operate only on visible rows.
A hidden ID yields the same 404 as an absent or unauthorized one. Disabling
the choice affects future projections, not delivered Center items; re-enabling
does not reveal past hidden items. Activity remains an independent feed, and
push uses the internal Notification even if it is hidden from the Center.
Projection uses the choice current when queued Outbox work is processed; an
event emitted while disabled but first processed after re-enablement follows
the then-current setting. No recipient-controlled plaintext or email address
is copied into the new column.

**Reuse review:** existing SQLAlchemy/PostgreSQL upserts, the own-Account API,
the #515 catalog, #565 PushDelivery, the Center read paths and generated
OpenAPI client are reused. Alternatives were deleting internal Notifications
when IN_APP is off, querying current choice on each Center read, or a second
delivery/event table. Those would respectively lose push, retroactively hide
delivered items, or duplicate the source of truth. One boolean snapshot is
the minimal domain-specific extension; no new dependency, provider, license,
host credential, cost or fallback stack is introduced.

**Business/freemium impact reviewed:** Notification Policy, Digest & Quiet
Hours is Free/Core and identical on Cloud and Self-Hosted per the versioned
feature matrix. This recipient choice adds no entitlement or quota and
does not alter Premium sender eligibility for extended gestures, managed
transport cost, retention, downgrade, export or restored historical read
state. Backups include the additive column and normalized preference rows.

**Cross-cutting review:** server authentication binds changes to the own
Account, never a request-supplied recipient; privacy, current membership,
Space modules and target authorization run before projection/read. The
Account lock serializes deletion and preference writes with projection.
The visibility snapshot is stable under retries and does not alter PushDelivery
or provider-send checks. Page and count queries filter in SQL before limits;
existing recipient/Space indexes are retained. PostgreSQL tests cover
isolation by Account and kind, push while Center is off, snapshot/replay,
404 for hidden items, read-all and unread count, and Activity independence.
No product UI, localized text, accessibility behavior or motion changes in
this backend slice. The Web Settings visual preflight and Mobile Interaction
Contract remain required before any UI implementation, and notification mail
needs its own verified account-email and delivery review.
