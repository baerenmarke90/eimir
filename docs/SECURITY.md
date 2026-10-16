# Security

Security is a release gate, not follow-up work. A feature is not considered
complete until its cross-tenant and privacy tests exist.

## Core invariant: tenant isolation

The tenant is called a **Space**. Every shared record carries exactly one
`space_id`.

Every access to Space data verifies four things:

1. an authenticated account,
2. active membership in exactly that Space,
3. the resource actually belongs to that Space,
4. any additional resource-level authorization that applies.

**There is no data access based solely on a resource ID.**

For

```text
GET /api/v1/spaces/{spaceId}/memories/{memoryId}
```

it is not sufficient to load the Memory and compare its `space_id` with the
path. Membership is checked first, and the resource is then queried within the
Space. The query must not load foreign rows in the first place.

## 404 instead of 403

For privacy-relevant resources, eimir. deliberately returns **404** where
403 might be more technically precise. A 403 confirms existence. Someone
probing foreign IDs must not learn which resources exist.

## Privacy classes

Every domain assigns its data to a class. There is no implicit public class.

| Class | Meaning |
|---|---|
| `SPACE_SHARED` | both partners in the Space |
| `OWNER_ONLY` | owner only, never the partner |
| `TEMPORARY_SHARED` | shared for a limited time |
| `EPHEMERAL_CONTEXT` | short-lived, with expiry |
| `SYSTEM_METADATA` | technical, no user content |

`OWNER_ONLY` means the partner receives the content through **no** path — not
by ID, not in lists, not through search, dashboard, Story, comments,
notifications, export, or an indirect relationship.

**Hiding content in the client is not enforcement.** The filter belongs in the
query. A row that is loaded and discarded afterward is already a leak — it was
in memory, logs, or response-size behavior.

### Enforcement

The tenant guard determines whether an account belongs to a Space. The
owner/privacy authorization in `eimir.authorization` then determines
what the account may read and modify within that Space. Both conditions are
part of the query, not post-query checks.

Owner-/author-related domains that use this foundation inherit three columns —
`space_id`, `owner_id`, and `privacy_class` — and call `readable()`,
`require_readable()`, or `require_writable()`. They do not implement their own
visibility predicate. There is neither a universal content table nor a second
hand-written guard per domain.

Shared Space-owned resources without a domain owner are not artificially
forced into the owner model. The tenant guard remains their common foundation;
additional write rules come from the respective domain.

Currently, `SPACE_SHARED` and `OWNER_ONLY` are enforceable server-side. Only
those two values are also persistable: a class without a rule would create rows
whose protection nobody enforces. A class without a rule evaluates to `false`
in queries — an omission makes content invisible, not visible. Adding another
class therefore always requires three things together: an authorization rule,
allowing the value in the stored range, and a migration.

`SPACE_SHARED` describes visibility, not blanket write permission. For
owner-/author-related resources, `SPACE_SHARED` currently still means the
owner or author writes and the partner reads. `SpaceProfile` is the
counterexample: it belongs to the Space, has no `owner_id`, and may be changed
by either active partner. No `PrivateResourceMixin` is invented for it.

Denial is intentionally split into two cases:

| Situation | Response |
|---|---|
| not readable — foreign Space, another owner's `OWNER_ONLY`, unknown or malformed ID | 404, identical wording in every case |
| readable but not writable — owner-related shared row owned by someone else | 403 |

Returning 404 for something the caller has just been allowed to view would not
protect anything; it would be false. Returning 403 for something the caller
must not see would disclose the existence that `OWNER_ONLY` is specifically
designed to hide.

## Authentication

Android and other native clients use Bearer tokens, not a Web session cookie.

```text
Authorization: Bearer <access-token>
```

Access tokens are short-lived, on the order of 15 minutes. Refresh tokens are
persisted **only as hashes**, rotate on use, and attempted reuse must be
detectable because it indicates a copied token.

`DeviceSession` stores `refresh_token_hash`, device name, platform,
`last_used_at`, `expires_at`, and `revoked_at`. Sessions can be revoked
individually.

The intended Cloud product model uses email verification, Magic Link, Passkey,
and Recovery without requiring a password. Self-Hosted additionally intends to
support local password login and configurable OIDC without a special-case
provider model. The deployment-mode matrix below is normative product policy;
current runtime enforcement is stated separately.

### Target policy by deployment mode

Cloud/Managed and Self-Hosted share the same application core but do not
necessarily expose the same authentication methods. The target is a
**server-side** policy, not merely hiding buttons in the client:

| Deployment mode | Intended authentication methods |
|---|---|
| Managed/Cloud | Passkey, Magic Link, and later managed providers such as Google and Apple |
| Self-Hosted | local password, Passkey, and freely configurable OIDC; Magic Link only when mail delivery is deliberately configured |

The `EIMIR_DEPLOYMENT` configuration value governs deployment mode enforcement.
**The route/provider policy above is strictly enforced server-authoritatively by
the runtime router and domain services.** On Managed/Cloud (`EIMIR_DEPLOYMENT=cloud`),
local password registration, sign-in, recovery, and password changes are rejected
with HTTP 403 `AUTH_METHOD_DISABLED` prior to credential checks or user lookup,
ensuring privacy without account enumeration. Pre-existing local identities from
restored databases are likewise rejected. Magic Link is available when mail
transport is configured (`EIMIR_MAIL_TRANSPORT != none`), and OIDC is enabled when
one or more OIDC connections are configured. Capability projections (`/api/v1/instance/status`
and `/api/v1/auth/capabilities`) reflect this policy to official clients, but
the server remains authoritative. This enforces the security boundary tracked by
Issue **#710**.

### How a new Account comes into being

Sign-in methods and Account creation are separate policies. A method being
available for existing Accounts never implies that it may create Accounts.

| Deployment mode | New Account |
|---|---|
| Managed/Cloud | Self-service: a mailed signup proof (`/auth/signup/request`, `/auth/signup/consume`) proves control of the address first (#923). Requires configured mail transport. Local registration is disabled; Passkey never creates an Account; OIDC creates one only when started with an Invitation. |
| Self-Hosted | First local Account only with the one-time bootstrap proof; every later Account only with an Invitation. The signup endpoints reject every request with `403 AUTH_METHOD_DISABLED`, before reading the address or the proof. |

`/api/v1/instance/status` keeps these questions apart: `registrationAvailable` is
whether the administrator admits new Accounts right now (false in maintenance),
`accountCreation` is the deployment path (`self_service` or `invitation`), and
`selfServiceSignupAvailable` is their combination. The administrative state
blocks only creation: existing Accounts keep signing in through the methods in
`auth`.

For OIDC, the external account is identified exclusively by `(issuer,
subject)`. A freely configurable `connection_id` selects the adapter; Pocket ID
is therefore a normal OIDC connection, not a special case. A new identity may
be stored only after complete validation of discovery, signature, and claims.

### ID Token validation

An ID Token initially represents only a claim made by another server. It
becomes an identity only when five conditions are valid. None of these checks
lives in the endpoint; all providers pass through `auth.oidc`:

| Check | Against | Why |
|---|---|---|
| Signature | issuer JWKS, asymmetric algorithms only | `none` and HMAC are excluded; with `HS256`, the signing key would be the client secret |
| Issuer | configured value **and** the discovery document, which must identify itself | otherwise a document at the expected address could point to foreign endpoints |
| Audience | exclusively the `client_id` configured for this connection; additional untrusted audiences are rejected, and multiple audience values require a matching `azp` | a token for another or additional application is not valid here |
| Nonce | value generated at flow start | binds the token to exactly this request; without it, a token captured elsewhere could be replayed |
| State | server-side stored hash, redeemable exactly once | binds the return path to exactly this browser |

The discovery document is not just configuration either: `issuer` must match
the configured connection exactly, and `authorization_endpoint`,
`token_endpoint`, and `jwks_uri` are accepted only as real HTTPS URLs. A
formally reachable discovery document therefore cannot redirect subsequent
protocol traffic to plaintext endpoints.

PKCE is mandatory (`S256`). The verifier remains on the server and never
appears in the authorization URL; the client sees only the challenge.

`oidc_auth_requests` stores the state hash, nonce, and verifier for ten minutes.
The nonce and verifier are stored there in plaintext intentionally: the server
must present or compare them itself. They are not authentication credentials;
they are binding values. The maintenance job removes them once consumed or
expired.

### OIDC sign-in, linking, and invitations

An unknown OIDC identity does **not** freely create an account. Without an
existing identity, an authenticated linking flow, or a valid invitation, the
callback ends with 401.

There are two controlled ways to introduce a new OIDC identity:

1. **Normative invariant:** `/auth/oidc/{connectionId}/link` remains bound,
   after a successful OIDC callback, to exactly the Account that initiated the
   authenticated link flow. The callback resolves request intent **before**
   existing-identity sign-in: when the request carries an Account, an identity
   that is already linked to a different Account fails closed with
   `OIDC_IDENTITY_ALREADY_LINKED` (409) instead of signing the caller into that
   other Account, and an identity already linked to the initiating Account is
   accepted idempotently. The rejection writes nothing to either Account, and it
   never names the owning Account: the caller has just proved control of the
   external identity at the provider, so "this method is already in use" states
   nothing an ordinary unbound sign-in would not also reveal.
2. A flow started through `/auth/oidc/{connectionId}/start` may carry an
   invitation. Only the invitation-token hash is stored. Account, OIDC identity,
   and Membership are created in the same request transaction only after
   successful OIDC validation and renewed locked validation of the invitation.

A callback serializes on the external identity itself before it reads and
decides it, through a PostgreSQL advisory transaction lock over
`(issuer, subject)`. A row lock cannot cover the case that actually has to be
serialized, because the identity row does not exist yet while two callbacks are
both about to create it. The lock is taken after the provider calls, so no
network request is made while it is held, and it is released when the request
transaction ends. Two link flows for the same unlinked identity therefore end as
one link and one `OIDC_IDENTITY_ALREADY_LINKED`, not as a database uniqueness
error.

OIDC state single-use follows the authorization-code lifecycle rather than the
external error code. Once the token exchange succeeds, the state remains
redeemed even if a later JWKS request, ID-token validation, Account resolution,
invitation validation, or link-binding decision rejects the callback. The outer
request may roll back, but a separate transaction preserves the consumed state
because the exchanged authorization code cannot legitimately continue the same
browser flow. Failures before a successful exchange may deliberately return the
state to the pool when the provider has not accepted the authorization code and
a retry of the same browser flow remains legitimate.

An invalid, expired, revoked, or already-used invitation token does not open an
alternative path. Concurrent callbacks for the same invitation serialize on
the invitation, so at most one new account can result. An OIDC email address
never causes an account merge: it is adopted only if the provider explicitly
confirms `email_verified=true` and the address does not already belong to
another account.

Provider error text never leaves the adapter because it may contain internal
addresses or the client secret. Externally, errors remain the stable codes
`OIDC_TOKEN_INVALID`, `OIDC_STATE_INVALID`, `OIDC_PROVIDER_UNREACHABLE`,
`OIDC_NO_ACCOUNT`, and `OIDC_IDENTITY_ALREADY_LINKED`.

Passkeys are stored as independent WebAuthn credentials with globally unique
credential ID, public key, signature counter, AAGUID, transports, and
discoverable/backup metadata. The private key remains in the authenticator and
is neither received nor stored by the server.

### The two ceremonies

Registration happens **only from an existing authenticated session**: a
Passkey is an additional way to access an account that already exists. Sign-in
happens **without an account reference** — the options contain no candidate
list; the authenticator chooses which discoverable credential to offer. An
endpoint that listed matching credentials for an email address would become an
account directory.

Challenge, origin, RP ID, signature, and signature counter are validated.
Every failure returns the same response (`PASSKEY_CEREMONY_INVALID`); the
specific failed check is not exposed in the response.

The challenge is stored in `webauthn_challenges` for five minutes. Completion
is bound to the exact challenge carried by that ceremony and consumes that
single unexpired challenge even when later WebAuthn validation fails. A
parallel ceremony therefore cannot make a finish operation consume some other
newer challenge.

Anonymous authentication start has a database-backed abuse boundary that works
across API instances. That hardening was delivered under GitHub issue **#59**;
#59 is complete and is not an open security item.

Authentication sign-counter verification is serialized per credential after
the owning Account is locked. Verification therefore uses the authoritative
post-lock counter, while authenticators that legitimately remain at counter 0
continue to work.

A signature counter that stops increasing after previously increasing suggests
a copied authenticator and causes rejection. If a device does not count at all
and both values remain 0, that is allowed: many Passkeys behave this way, and
rejecting them would lock all of them out.

Credential IDs are globally unique, including across accounts. Registration
does not establish whether a credential is discoverable (`residentKey` is a
preference, not a guarantee); discoverability becomes observable only during
sign-in without a candidate list and is recorded there.

Email verification, Magic Link, and Account Recovery use separate tables and
separate consumption functions. Every proof is random, short-lived, revocable,
single-use, and persisted only as a hash. A token from one flow therefore
cannot be redeemed in another flow, not because a generic check rejects it but
because the other flow never searches for it. OIDC, WebAuthn, Magic Link,
email verification, and Recovery have production adapters/API flows; every
successful authentication method converges on the same `DeviceSession` output.

### The four mail flows

| Flow | Endpoints | Lifetime |
|---|---|---|
| Magic Link | `/auth/magic-link/request`, `/auth/magic-link/consume` | 15 minutes |
| Signup proof (Cloud only) | `/auth/signup/request`, `/auth/signup/consume` | 15 minutes |
| Email verification | `/auth/email/verification/request` (authenticated), `/auth/email/verification/confirm` | 24 hours |
| Account Recovery | `/auth/recovery/request`, `/auth/recovery/consume` | 30 minutes |

**No account-existence disclosure when mail delivery is available.** The
unauthenticated Magic Link, signup, and Recovery request endpoints return `202`
with an empty body for a known address exactly as for an unknown one. Rate limiting
applies identically to both; otherwise the behavior difference would itself
disclose existence. A mail-server delivery failure is logged without message
content and does not change the response.

With `EIMIR_MAIL_TRANSPORT=none`, mail-dependent endpoints fail at the common mail
dependency before address lookup, token issuance, or rate-limit reservation.
They therefore do not create undeliverable proofs and do not turn the disabled
mail capability into an account-existence oracle.

A residual timing difference remains for Magic Link and Recovery when mail
delivery is enabled: a mail is handed off for a known address but not for an
unknown one. This is accepted because the endpoints are rate limited; equalizing
it would require deliberately delaying delivery. The signup request does not have
this difference: it never looks up an Account and issues and mails one proof for
every valid address.

**Normative invariant — only the most recently requested link is valid.** A new
request invalidates every older still-open link for the same flow, so valid
authentication proofs do not accumulate in a mailbox. All three flows enforce
this, including Email verification, where repeating the request is enough to
accumulate proofs without any concurrency at all.

The rule is about the relationship between generations, so it is enforced by
serializing the subject rather than by hoping two requests do not overlap.
Issuing takes a PostgreSQL advisory transaction lock on `(flow, subject)`
before it reads the open predecessors it is about to supersede, and consuming
takes the same lock, in the same order, before it locks the token row. The
subjects are the `AccountEmail` for Magic Link and Email verification and the
Account for Recovery.

The lock is deliberately not a row lock on the Account or AccountEmail: that
would also block unrelated work on the Account for as long as the request runs,
including the mail delivery that follows. It is also not the rate-limit
advisory lock, which is reserved and released inside its own short security
transaction before token work begins and therefore does not span
revoke-then-issue. The token tables cannot express the rule either: only
`token_hash` is unique, and a partial unique index cannot represent "open",
because expiry depends on the current time.

**Consuming and reissuing have a defined order, not a lucky one.** Both take
the generation lock first, so whichever wins decides. A reissue that commits
first has already revoked the older proof, so redeeming it fails with the
ordinary `ACTION_TOKEN_INVALID` response. A redemption that commits first
leaves a consumed token that the reissue no longer treats as an open
predecessor. Neither order reopens a superseded or consumed proof, and neither
leaves two open generations.

**A delivery failure changes nothing about the generation.** The authoritative
generation is established before the message is handed to the transport, and a
transport failure is logged without content and without changing the response.
It neither reactivates the predecessor nor creates a second open generation;
the recipient simply requests a new link, which supersedes this one in turn.

Operator-issued recovery proofs go through the same issuing function, so a
ServerAdmin proof and a recovery link the Account holder requests at the same
moment still leave exactly one live generation.

**Redeeming a Magic Link verifies the address.** Opening the link from the
mailbox proves possession; a second verification path would create another
opportunity to forget this relationship.

**Recovery does not establish a new authentication method.** An account without
a local password, such as an OIDC-only account, receives no link; externally,
that is indistinguishable from an unknown address. A successful reset ends
**all** existing sessions and creates exactly one new session: the one on the
current device.

**Every successful method ends in the central `DeviceSession` output.** There
is no second place where tokens are issued.

### Outgoing mail

Action-token plaintext is transient only. It exists while an issuance result is
being turned into a mail message; persisted token material is hashed. General
application logging and error tracking must redact authentication tokens.

Production and Demo permit `EIMIR_MAIL_TRANSPORT=smtp` or
`EIMIR_MAIL_TRANSPORT=none`; the development `log` adapter is forbidden there.
`EIMIR_PUBLIC_BASE_URL` must also start with `https://` in a public runtime, or
the application refuses to start.

`none` is an explicit supported no-mail mode, not a degraded SMTP adapter. Mail
flows are unavailable and stop before token issuance, while password, Passkey,
and OIDC authentication remain technically available subject to the separate
deployment-mode policy above.

The non-production `log` adapter still emits the development mail body into the
logging pipeline, but the current global redaction filter removes sensitive
query-token values before configured log sinks receive them. As a result, the
historical local workflow of copying a valid Magic-Link, verification, or
Recovery token from container logs does **not** currently work. GitHub issue
**#676** owns that focused development/bootstrap blocker. The fix must preserve
general token redaction rather than making authentication tokens broadly
loggable.

The base address for links comes from configuration and never from a request
header. A forged `Host` header could otherwise redirect a link to a foreign
server and cause the recipient to submit the token there.

The first Self-Hosted account requires a one-time secret bootstrap proof.
PostgreSQL serializes competing first registrations; after the first success,
bootstrap remains permanently closed and every subsequent registration
requires an invitation. The secret value is neither persisted nor logged.

### Cloud self-service signup proof

A Magic Link is bound to an existing `AccountEmail`, so it cannot represent an
address without an Account. Cloud onboarding (#923) therefore uses its own
`SignupProof` table, whose subject is the normalized address. It shares the
action-token rules above: 32 random bytes, SHA-256 hash only, 15 minutes,
single use, and one live generation per address.

**Request.** `POST /auth/signup/request` checks the deployment policy, validates
the address format, reserves a per-address slot (the Magic Link budget) and a
per-network slot (30 per 15 minutes, keyed like the passkey start limit), issues
a proof, and mails a link built from `EIMIR_PUBLIC_BASE_URL`. It reads neither
Accounts nor the registration state, so a known and an unknown address produce
the same response and the same work.

**Redemption.** `POST /auth/signup/consume` takes the proof in the body, reserves
the same per-network slot, and redeems the proof under the generation lock for
its address, which stays held until commit:

| State at redemption | Result |
|---|---|
| Active Account owns the address | Session for that Account; address marked verified; `accountCreated=false` |
| Account owns the address but is disabled | `422 ACTION_TOKEN_INVALID` |
| No Account, registration admitted | One Account with the verified address, session; `accountCreated=true` |
| No Account, registration disabled | `403 REGISTRATION_DISABLED`, nothing created |
| No Account, maintenance | `503 MAINTENANCE_MODE`, nothing created |
| Consumed, superseded, expired, or unknown proof | `422 ACTION_TOKEN_INVALID` |

A rejected redemption rolls back, including the consumption itself, so the proof
stays usable until it expires. Redemption never touches Memberships.

**Duplicate Accounts cannot arise.** Every redemption for one address waits for
the same generation lock, so two of them cannot both observe "no Account". A
different creation path committing the same address after the lookup (for
example OIDC onboarding with a verified email claim) makes the insert violate the
unique address constraint inside a savepoint; redemption then re-reads the
address and signs into the committed owner. An Account that appears between
request and redemption is signed into the same way.

**Retention.** Security retention deletes expired, consumed, and superseded
signup proofs, so addresses that never became Accounts are not kept beyond the
proof lifetime. Deleting a row does not reopen it: a missing hash is rejected
like a consumed one.

**First Space.** `POST /spaces` creates a Space only for the authenticated
Account and only while it has no active Membership. A PostgreSQL advisory lock
per Account is taken before the Membership read, so concurrent or retried
requests produce exactly one Space and `409 ACCOUNT_HAS_ACTIVE_SPACE` otherwise.
Ended relationship history is not reused. The partner joins through the ordinary
Invitation, with its unchanged one-time, expiry, revocation, and two-partner rules.

**ServerAdmin.** The `EIMIR_SERVER_ADMIN_EMAILS` allowlist still matches only
verified addresses. A signup proof verifies the address it was mailed to, so the
mailbox owner of an allowlisted address becomes ServerAdmin exactly as through a
Magic Link; no bootstrap secret is involved on Cloud.

### Refresh-token family

The `DeviceSession` is also the token family: every refresh token issued from
an authentication event belongs to exactly that session. Every consumed
generation remains associated with the family as a `ConsumedRefreshToken`
hash for as long as the session is alive.

Detection is therefore not limited to the immediately previous generation. If
`T0` appears again after `T0 → T1 → T2`, it is not merely an invalid token but
evidence of a copy: the legitimate client should hold `T2`. The session is
therefore revoked permanently, even when the request itself ends with 401 and
is rolled back.

Revocation requires a real token from that family. An arbitrary unknown value
revokes nothing; otherwise anyone could terminate someone else's session.
Externally, unknown, expired, revoked, and replay-detected tokens are
indistinguishable.

The history contains hashes only and is therefore not a second source of
authentication credentials. It disappears with the session and is pruned for
ended sessions after a retention period; active sessions keep their history
because the history *is* the replay detection mechanism.

### Retention is actually executed

A retention period that exists only as a function in code is not a retention
period. The `security_retention` job regularly executes
`sessions.prune_replay_history()`, `rate_limit.prune()`,
`oidc.prune_auth_requests()`, and `passkeys.prune_challenges()` as a normal job
in the PostgreSQL queue. After completing, it schedules itself again. The
default interval is six hours, well below the shortest retention period.

There is no second scheduler and no cron process in the container. The queue is
already stored in the database and survives restarts. Scheduling happens under
an advisory lock so two workers starting at the same time do not both enqueue
the job; even a duplicate run would be harmless because the prune operations
are idempotent.

If a job gives up permanently, no future chain remains attached to it. The
worker therefore also checks periodically whether any run is scheduled and
creates one if not. A permanently absent cleanup must not fail silently.

**Operational consequence:** retention depends on a running worker process
(`python -m eimir.jobs.runner`, service `worker` in the Compose setup).
Running only the API retains data longer than documented.

### Two expiry times per session

For the family and its history to be genuinely finite, `DeviceSession` has two
different boundaries:

| Field | Meaning | Extended? |
|---|---|---|
| `expires_at` | sliding inactivity window | yes, on every rotation |
| `absolute_expires_at` | hard upper limit from sign-in | **no** |

The sliding window alone would not be a limit: regular refreshes could move it
forward indefinitely. A continuously used session would then run without an
upper bound and add another history row on every rotation, none of which could
ever be pruned.

The absolute boundary is fixed at sign-in. No rotation moves it. Once reached,
refreshing no longer works; a new sign-in and therefore a new family is
required. Even an access token issued shortly before the boundary expires at
that boundary, otherwise it would not be a real upper bound.

`expires_at` is never set beyond `absolute_expires_at`. Through
`refreshExpiresAt`, the client therefore receives the expiry time that actually
applies.

### Bounded rotation rate

The absolute boundary makes history growth finite, but not slow. A client with
a valid token could create many generations in a tight loop. Therefore
`/api/v1/auth/refresh` has its own budget (`rate_limit.REFRESH`, currently 20
rotations per 15 minutes). This is many times the normal rate: an access token
lives for 15 minutes, so a normal client refreshes roughly once per window.

The counter is keyed to the **`DeviceSession`**, not the token value. The token
changes on every rotation; limiting by token would reset the counter after each
successful attempt. Other sessions for the same account remain unaffected.

Unlike sign-in, **successful** attempts count here, and the counter is not
cleared after success because successful rotations are exactly what is being
limited.

The check occurs after token validation. Only someone holding the family's
current token can receive 429; unknown, old, and revoked tokens still end with
401 and are not counted. The rate limit therefore does not become an oracle
for whether a session exists.

Every generation of the family remains attributable. The rate limit does not
shorten replay history and is explicitly not a time window through which old
tokens can fall out of detection.

Rate-limit threshold reservation is serialized per `(action, key)` with a
PostgreSQL advisory transaction lock and is therefore shared across API
instances. Production request sessions reserve and commit the slot in a short
security transaction so a later request rollback does not erase the attempt.
This concurrency hardening was delivered under GitHub issue **#60**; #60 is
complete and is not an open security item.

## Invitations

Invitation tokens are random, have sufficient entropy, are stored **only as
hashes**, have an expiry, are revocable, and can be used exactly once.

Required tests: expired, revoked, reused, Space already full, race between two
concurrent acceptances, invalid token.

## Media

Cloud media is not public. Reads use an authorized route or a short-lived
signed URL.

Storage keys are **never** derived from user filenames:

```text
spaces/{spaceUuid}/attachments/{attachmentUuid}/original
```

Uploads validate the actual MIME type, size, allowed media type, image
dimensions, and Space association. The Content-Type claimed by the client is
not sufficient.

## Content Security Policy of the Web frontend

The production Web server delivers CSP as an HTTP header using `always`. The
policy starts fail-closed with `default-src 'none'` and allows only sources
required by the current Vite build:

| Directive | Allowance | Rationale |
|---|---|---|
| `script-src` / `style-src` | `'self'` | Vite bundle, theme bootstrap, and CSS are external files on the same origin |
| `script-src-attr` / `style-src-attr` | `'none'` | no inline handlers or styles embedded in HTML; CSSOM property assignments require no source allowance |
| `img-src` | `'self' blob:` | local assets and authorized image bytes exposed through short-lived object URLs |
| `connect-src` | `'self'` plus explicit hosting origins | API plus direct presigned uploads/reads through `fetch()` |
| `font-src` | `'self'` | no external font CDNs |
| `object-src`, `frame-src`, `media-src`, `manifest-src`, `worker-src` | `'none'` | no currently approved domain requirement; video remains fail-closed |
| `base-uri` / `frame-ancestors` | `'none'` | no base-URL rewriting and no framing |
| `form-action` | `'self'` | forms may navigate only to the same origin |

`unsafe-inline`, `unsafe-eval`, wildcards, and broad scheme sources such as
`https:` are not allowed. `blob:` applies only to `img-src`; the actual media
bytes are first loaded through authorized `fetch()` requests and therefore
fall under `connect-src`.

In the normal Self-Hosted/reverse-proxy path, Web and API use the same public
origin. With `EIMIR_MEDIA_STORE=s3`, Compose automatically carries the already
configured `EIMIR_S3_ENDPOINT` into `EIMIR_WEB_CSP_CONNECT_ORIGINS`. Other hosting
platforms may set a whitespace-separated list of exact HTTP(S) origins there.
The Web entrypoint normalizes this list and refuses startup for wildcards,
paths, credentials, free-form CSP expressions, or invalid ports. This value is
host/admin configuration, not a user field.

A `VITE_EIMIR_API_BASE_URL` whose origin differs from the Web frontend must also
have its exact origin included in `EIMIR_WEB_CSP_CONNECT_ORIGINS`.

An upstream reverse proxy must forward exactly this header unchanged and must
neither replace nor duplicate it. Multiple CSP policies are evaluated together
restrictively; a second policy therefore cannot add origins and can easily
break functionality. Required alternative origins are configured at the Web
container instead of being added through a broadly permissive proxy policy.

### Reuse decision

The options reviewed were the W3C CSP standard as an HTTP header, a CSP `meta`
element, application middleware, external CSP products, and custom
implementation. The selected solution uses the browser standard, the existing
Nginx `add_header`, and the template/`envsubst` functionality already included
in the unprivileged Nginx image. For the static Web server, the header is the
complete delivery boundary and also supports `frame-ancestors`; a `meta`
element is not equivalent. Backend middleware would run at the wrong hop, and
an external service would add no privacy, operational, or maintenance benefit
for a static policy. No new dependency, external data flow, license/ToS
binding, or additional user effort is introduced. The fallback is a fully
static same-origin policy without an additional connect origin.

## Mandatory test cases

- cross-tenant / IDOR,
- private-resource leak,
- malformed IDs,
- invitation abuse,
- token replay,
- refresh rotation,
- revoked sessions,
- rate limiting,
- concurrent and reused Self-Hosted bootstrap,
- upload abuse and malicious media,
- XSS, CSRF in browser flows, SQL injection,
- signed-URL expiry,
- backup authorization,
- privacy leaks in search.

### Where they are enforced

The list above defines the requirements. The table below records where each
requirement is proven. It is updated when a gap is closed, not merely when a
test is created.

| Invariant | Evidence |
|---|---|
| Every Space endpoint rejects anonymous access, foreign access, and malformed IDs consistently | `test_endpoint_matrix.py` |
| The published contract is completely covered by this matrix | `test_endpoint_matrix.py::test_the_contract_is_complete_covered` |
| No write access without `If-Match` | `test_endpoint_matrix.py::test_without_if_match_is_not_geschrieben` |
| Private resources remain invisible to the partner — detail, list, filter, error response | `test_private_authorization.py`, `test_related_persons.py`, `test_partner_profiles.py` |
| Failed attempts remain counted durably even when the request is rejected | `test_auth_flows.py::TestProduktiveTransaktionsgrenze` |
| Refresh replay permanently revokes the family across generations | `test_auth_flows.py`, `test_sessions.py::TestReplay` |
| Concurrent refresh has exactly one winner | `test_auth_flows.py::test_parallele_refresh_rotation_hat_exactly_a_sieger` |
| Successful rotations are themselves limited | `test_sessions.py::TestRotationsflut` |
| Passkey finishes consume the exact ceremony challenge rather than a global newest challenge | `test_passkey_challenge_binding.py` |
| WebAuthn sign-counter verification serializes per credential under the Account-first lock order | `test_passkey_counter_concurrency.py` |
| Each action-token flow keeps at most one live generation per subject under concurrent requests, repeated requests, and consume-versus-reissue | `test_action_token_generation.py` |
| Two concurrent invitation acceptances cannot grow a Space beyond two partners | `test_invitations.py::TestRace` |
| Concurrent bootstrap creates exactly one initial owner | `test_auth_flows.py::test_paralleler_bootstrap_hat_exactly_a_owner` |
| The Cloud signup request is identical for known and unknown addresses; one proof creates at most one Account under replay, concurrency, and a creation race with another path | `test_cloud_self_service_onboarding.py::TestEnumerationNeutrality`, `::TestProofLifecycle`, `::TestExistingCloudUser`, `::TestProductionTransactions` |
| Concurrent first-Space requests for one Account create exactly one Space | `test_cloud_self_service_onboarding.py::TestProductionTransactions::test_concurrent_first_space_requests_create_exactly_one_space` |
| Cloud self-service signup cannot bypass Self-Hosted bootstrap and invitation rules | `test_cloud_self_service_onboarding.py::TestDeploymentIsolation` |
| Security-relevant integration tests actually run in CI and are not silently skipped | CI step **Integration tests actually ran** |
| The production Web server serves exactly the restrictive CSP; arbitrary origins fail before startup | `web/scripts/check_csp_header.sh`, `web/scripts/test_csp_config.sh`, CI step **CSP origins are narrowly and fail-closed configurable** |

The rows covering uploads, signed URLs, backups, and search remain open because
the corresponding features do not yet exist. They are implemented with their
domain, not before it.

### Tenant matrix

| Access | Expected |
|---|---|
| Account A on Space A (member) | allowed |
| Account B on Space A (member) | allowed |
| Account C on Space B accessing Space A | never |
| anonymous | never |

### Private isolation

For every `OWNER_ONLY` domain, test separately through: list, search, dashboard,
timeline, notifications, export, relationships, attachments, update, and
delete.

## Logging

Allowed: `request_id`, `account_id`, `space_id`, route, duration, status, error
code.

Never logged: passwords; Bearer, refresh, Magic Link, signup, verification, or
Recovery tokens; OIDC tokens; WebAuthn challenges; contents of Memories, HeartMoments,
answers, private notes, and gift ideas; sensitive preference values; precise
locations. Error tracking is sanitized in the same way.

## Encryption at rest (application-controlled)

Protected payloads and all stored media are encrypted at rest by the application
under operator-held keys (authenticated encryption, a data key per record or object
wrapped by a versioned key-encryption key). Cloud Production requires it; Self-Hosted
must choose a mode explicitly; nothing falls back to plaintext silently. The
architecture, threat model, key rotation, backup/recovery, and failure modes are in
[ENCRYPTION-AT-REST.md](ENCRYPTION-AT-REST.md). This is **not** end-to-end
encryption: the running application holds the keys and can read the content.

## End-to-end encryption

**Not yet implemented.** The architecture is prepared for it; see
[ARCHITECTURE.md](ARCHITECTURE.md).

The claim that even the operator cannot read content may be used **only** after
actual implementation and an external audit. Stage 1 is not E2EE and must not
be called E2EE.

Sensitive domain content is bound as a concrete `ProtectedPayload` class to a
designated JSONB column; raw dictionaries are rejected. With `crypto_version = 2`
the column holds application-encrypted ciphertext; `crypto_version = 0` is legacy
plaintext that `required` mode rejects. In both cases the server can read the
content: there is no client-side sealing and no protection from the server operator.
Application-controlled encryption at rest protects a stolen database dump, replica,
or bucket, not a compromised or malicious operator.

Outbox payloads are separately restricted to explicitly allowed,
non-sensitive metadata. Free-text fields and `ProtectedPayload` objects are
rejected both by domain validation and by direct ORM binding.
