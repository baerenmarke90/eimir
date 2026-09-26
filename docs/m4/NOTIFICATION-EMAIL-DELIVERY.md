# Notification email delivery: #638 follow-up

**Baseline:** `main` at `ae8a36fa` (24 September 2026). This backend slice
uses the five existing NotificationKind keys and #515's policy. Individual
email is eligible only for the four currently IMMEDIATE kinds. The DIGESTIBLE
comment kind cannot be turned into a separate per-comment mail by a personal
choice; its eventual digest remains under #515. All EMAIL overrides default
off. No existing Account receives surprise mail on upgrade.

**Reuse review before implementation:** the existing Python standard-library
SMTP adapter and `MailSender` boundary, verified primary `AccountEmail`,
SQLAlchemy/PostgreSQL notification source, Account/Membership locks, existing
Job Queue and #515 catalog are sufficient. Alternatives were a new SMTP SDK,
external mail provider, separate recipient address in preferences, and a
second queue. They duplicate infrastructure, create new license/provider and
Cloud/Self-Hosted obligations, or weaken the Account ownership boundary.
Only the domain-specific delivery record/state and neutral message are new.
No new dependency, broker, provider contract, license, credentials, hoster
settings or normal-user technical configuration is introduced.

**Business/freemium impact reviewed:** Notification Policy, Digest & Quiet
Hours remains Free/Core on Cloud and Self-Hosted per the versioned matrix.
An extended gesture still requires the sender's existing entitlement, but
recipient opt-in is not paywalled. SMTP messages create usage cost only with
explicit consent for currently allowed immediate events; no new quotas,
storage limits, trial, downgrade, grandfathering or export semantics. Existing
mail transport configuration is a host/operator capability. The new delivery
record carries only a Notification FK, status and bounded technical code;
Account deletion cascades it with the Notification.

**Cross-cutting and safety:** owner-only GET/PATCH uses the authenticated
Account ID, no client-supplied recipient or destination. GET may expose only
that Account's verified primary address and is private/no-store. SMTP and a
currently verified primary address are required to enable EMAIL; LOG and NONE
are unavailable. A missing capability after opt-in still allows disabling.
The address is read again at send time so a future primary change takes effect;
it is never copied to the delivery row, queue payload or technical error.
After projection the worker rechecks current Account and Membership, Space
module, target privacy, policy, preference and transport under matching locks.
It never discloses sender name, event kind, private target, payload or presence
in the email. The generic subject/body is selected from the recipient locale
(German or English) and uses the configured public base URL, not a request
host. IN_APP and PUSH remain independent.

SMTP cannot provide a reliable idempotency key or confirm whether a connection
failure happened before or after the provider accepted the message. The worker
therefore commits a single durable CLAIMED state **before** attempting SMTP.
Job retries, lease expiry and crashes never try that delivery again. A crash
between claim and SMTP can omit one opted-in mail; a transport error is
terminal because acceptance may be ambiguous. This explicitly chooses
at-most-once delivery over duplicate relationship mail. Deterministic retries
remain safe before the claim; a future provider supporting idempotency could
change this tradeoff after a separate contract review. Claims and outcomes
are observable through bounded technical status/error codes without logging
message bodies or email addresses.

PostgreSQL tests cover one delivery per source event, current verified primary
address, owner-only capability and destination, unavailable transport/address,
opt-out after enqueue, left Membership, ambiguous SMTP failure and worker
retry. The migration adds the empty delivery table without sending historical
Notifications. The Settings interface still needs #638's generated visual
reference, Compact Mobile Interaction Contract and product acceptance before
UI implementation. No UI or native Android change is included.
