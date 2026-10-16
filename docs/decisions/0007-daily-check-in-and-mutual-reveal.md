# 7. Use one Space-day DailyCheckIn boundary and server-side Mutual Reveal

- **Status:** accepted
- **Date:** 2026-09-02
- **Issue:** #598
- **Related:** #429, #431, #432, #493, #455, #433

## Context

ADR 0006 deliberately places new relationship-depth runtime in M7, after the
Core has reached G5. M7 itself starts with readiness because the Vibe Check
(#429), Daily Energy Check-in (#431), optional Space modules (#432), and Mutual
Reveal (#493) share product and Privacy semantics that must not be invented
independently by Web, Android, or separate backend endpoints.

The current runtime does not yet contain a `DailyCheckIn` Domain model. It also
does not have the two pieces of authoritative Space state that this feature
family needs:

- `create_space()` receives the founder while creating the first Membership, but
  `Space` does not persist a creator/configuration-manager identity;
- accounts have validated IANA timezones, but `Space` has no shared timezone
  from which both partners can derive the same relationship day.

Implementing #493 directly in the current Today client would therefore require
one of the rejected shortcuts: client-local day logic, a second Mood-only data
model, or a partner value already delivered to the client and merely hidden by
CSS.

## Decision

### 1. Preserve the release sequence

This ADR is a readiness decision, not permission to pull M7 runtime into M5 or
M6. No `DailyCheckIn`, module-configuration, Vibe, Energy, or Mutual Reveal
runtime is added before the owning M7 slices after G5.

#432 remains the M7-S0 owner for typed Space configuration and its authoritative
management capability. #429 and #431 consume the Daily Check-in foundation
defined here. #493 consumes its projection semantics.

### 2. One DailyCheckIn record owns the optional daily dimensions

Vibe and Energy are not separate daily-status backends. V1 uses one conceptual
record per account, Space, and authoritative Space day:

```text
DailyCheckIn
- id
- spaceId
- accountId
- checkedOn: LocalDate
- vibe: optional typed enum
- energyLevel: optional integer
- createdAt
- updatedAt
- version

UNIQUE(spaceId, accountId, checkedOn)
```

Rules:

- `vibe` is a typed product enum owned by #429, never free-form diagnostic text;
- the #429 V1 Vibe catalog is `GOOD`, `OKAY`, `STRESSED`, `SAD`,
  `NEEDS_CONNECTION`, and `NEEDS_SPACE`; these are stable domain values for
  today's state, while localized labels remain UI copy. They deliberately do
  not reuse `HeartEmotion`, whose values describe a remembered HeartMoment;
- `energyLevel` is 10 through 100 in steps of 10 as owned by #431;
- at least one dimension must be present;
- clearing the final populated dimension removes the current-day record rather
  than retaining an empty participation marker;
- normal optimistic concurrency/ETag semantics are reused for updates;
- no second row is created merely because one dimension changes.

A value is voluntary personal relationship information. Enabling a module does
not create a row and does not imply consent to publish a value.

### 3. DailyCheckIn uses one server-authoritative Space day

Both partners must mean the same thing by "today" for Daily Check-in. Account-
local or browser/device-local dates are therefore insufficient: partners in
different timezones could otherwise see different eligibility and reveal
states for the same interaction.

M7-S0 typed Space configuration must provide a validated IANA
`dailyContextTimezone` before any Daily Check-in dimension becomes effective.
This timezone is Space state, not a client preference and not an untyped module
key.

The server derives `checkedOn` from its clock converted through
`dailyContextTimezone`. Clients never send an authoritative `checkedOn` for a
current-day mutation and never decide the day from device time.

Initialization is explicit. The Space-configuration UI may preselect the
configuration manager's validated account timezone as a convenience, but the
server stores the selected timezone through the authoritative Space
configuration mutation before the first Daily Check-in can be written. There
is no request-time fallback to whichever partner happens to call first.

In V1, changing `dailyContextTimezone` while a current Space-day check-in exists
is rejected with a conflict. This avoids silently re-keying or splitting an
active ritual across two calendar contexts. The manager may change it when no
current-day check-in exists.

### 4. Space management authority must be explicit before runtime

The existing `create_space(session, founder)` call proves who founded a Space at
creation time, but that fact is not persisted on the `Space` model. M7 runtime
must not reconstruct authority from Membership order, `joinedAt`, invitation
history, client order, or another heuristic.

#432 must establish an authoritative configuration-management capability and a
safe migration/backfill policy. Callers consume a capability such as
`canManageSpaceConfiguration`; they do not permanently spread direct founder-ID
comparisons through Domain or client code.

Until that capability and the typed configuration exist, Daily Check-in module
configuration is not runtime-ready.

### 5. Availability, configuration, and personal participation stay separate

Effective availability preserves the ADR 0006 composition:

```text
deployment/server capability
        intersection
commercial entitlement capability
        intersection
Space module configuration
        intersection
personal preference/consent where required
        =
effective product capability
```

For Daily Check-in, V1 typed Space configuration can independently make the
Vibe and Energy dimensions available. A dimension also has a typed partner
visibility mode:

```text
IMMEDIATE
MUTUAL_REVEAL
```

`MUTUAL_REVEAL` is a presentation/eligibility mode of that dimension. It is not
another module, another persistence model, or another Privacy class.

The basic module/configuration and safe reveal mechanism are Free/Core controls.
Commercial Entitlements may govern genuinely premium future modules, but they
cannot make Privacy, consent, Accessibility, or safe hidden-state enforcement a
paid capability.

### 6. Mutual Reveal eligibility is dimension-scoped

Participation in one dimension cannot unlock another dimension.

Examples:

- the partner's Vibe under `MUTUAL_REVEAL` is eligible only after the caller has
  submitted their own Vibe for the current Space day;
- an Energy value alone does not reveal the partner's Vibe;
- the same rule applies independently if Energy later uses Mutual Reveal.

This preserves the ritual's meaning and prevents a low-friction dimension from
becoming a bypass for a more personal one.

### 7. The server owns the partner reveal projection

Clients receive an explicit partner state for each effective dimension:

```text
HIDDEN_UNTIL_SELF_CHECK_IN
NO_CHECK_IN
VISIBLE(value)
```

The semantics are exact:

- `HIDDEN_UNTIL_SELF_CHECK_IN`: Mutual Reveal is active and the caller has not
  submitted this dimension today. The response contains **no partner value**
  and **no signal that says whether the partner has checked in**.
- `NO_CHECK_IN`: the caller is eligible to know the state, but the partner has
  no current-day value for this dimension.
- `VISIBLE(value)`: the caller is eligible and an authorized current-day
  partner value exists.

A hidden response must not contain the partner check-in row ID, dimension value,
value-derived label, update timestamp, version, `hasPartnerCheckedIn` boolean,
or another field whose only purpose would reveal that a partner value exists.
Partner identity already authorized through the Space relationship is not
itself hidden by this rule.

When visibility mode is `IMMEDIATE`, the caller's own participation does not
control partner visibility; the projection resolves directly to `NO_CHECK_IN`
or `VISIBLE` subject to normal authorization and effective capability rules.

No raw/list partner-check-in endpoint may provide a bypass. A user may mutate
or read their own current check-in as needed, but partner current state is
consumed through the reveal-aware projection.

### 8. Today projection and writes use the same authoritative context

The future Today/Daily Check-in response must identify the authoritative
`checkedOn` and `dailyContextTimezone` used by the server so clients can present
the state without calculating a competing day.

A successful own-dimension mutation invalidates/refetches the authoritative
projection. The reveal then changes from hidden to `NO_CHECK_IN` or `VISIBLE`
according to server state. Web and Android use the same generated OpenAPI
contract.

The reveal transition is optional presentation only. Reduced Motion changes the
state immediately. Accessibility must announce a meaningful state change once
without exposing hidden content or repeatedly announcing unchanged values.

### 9. V1 retention is deliberately ephemeral

Daily Check-in is not a history or relationship-scoring product in V1.

The server retains only rows for:

- the current authoritative Space day; and
- the immediately preceding authoritative Space day.

Rows older than that are purge-eligible and are removed by bounded cleanup.
There is no V1 history/list API, trend chart, recap input, streak, score, partner
comparison, or analytics derived from retained values. A future historical use
requires a separate product and Privacy decision before retention is expanded.

Normal data-subject deletion applies immediately where required. If a future
export includes still-retained Daily Check-in personal data, import must not
resurrect an old exported value as a new current status.

### 10. Current partner status is not a persistent offline cache product

The V1 current-day Daily Check-in/partner projection uses private `no-store`
semantics and is excluded from persistent Web/Android read caches. Clients may
hold the current response in process memory while the active screen/session is
alive, scoped to the authenticated account and Space, but they do not persist a
partner value for later offline replay.

There is no Offline Write stack for Daily Check-in in V1. If the authoritative
projection cannot be refreshed, the client presents a neutral offline/
unavailable state rather than presenting an old partner value as today's fresh
status.

Account or Space changes must discard in-memory Daily Check-in projection state
for the previous context. Reconnect refetches the authoritative current Space
day.

### 11. Support remains voluntary and reuses existing primitives

A visible partner value may offer a voluntary support action. `ThinkingOfYou`
reuses the existing #455/M4 contract, including its idempotency and rate-limit
semantics.

No Vibe or Energy value automatically sends a message, notification, support
gesture, reminder, or task. In particular, there is no `low value -> automatic
support` rule.

Check-in changes do not produce push notifications by default. No analytics
measure how quickly one partner checks in to reveal the other.

### 12. Sensitive values stay out of operational metadata

Vibe and Energy values are not written to application logs, crash metadata,
metric labels, Deep Links, or notification payloads that do not require the
content. Operational metrics may use aggregate technical counters only when
they cannot encode the personal value or identify the partner.

## Runtime preconditions

Before #429, #431, or #493 runtime is merged, M7-S0 must provide:

1. authoritative typed Space module configuration;
2. authoritative `canManageSpaceConfiguration`-style capability with a safe
   existing-Space migration/backfill decision;
3. validated Space `dailyContextTimezone`;
4. the shared `DailyCheckIn` persistence/service boundary above;
5. OpenAPI projection types whose hidden variant structurally cannot contain a
   partner value;
6. Web and Android generated clients from that same contract;
7. cleanup/retention behavior and tests;
8. tenant, Privacy, day-boundary, concurrency, cache, and negative reveal tests.

## Consequences

- #493 remains open after this decision; it becomes a bounded M7 presentation
  slice rather than an invitation to invent a Mood backend in Today.
- #429 and #431 remain different product surfaces but share one persistence,
  day, Privacy, and partner-projection foundation.
- #432 gains two concrete M7-S0 runtime obligations: durable management
  authority and typed `dailyContextTimezone` in addition to module controls.
- A client cannot reveal a hidden partner value through CSS, Accessibility
  trees, persisted caches, or a raw partner endpoint because the value is not
  delivered before eligibility.
- Different device/account timezones do not split the couple's daily ritual.
- V1 stores less emotional-history data than a general event/history model
  would, without preventing a separately reviewed future history feature.

## Alternatives considered

### Separate Vibe and Energy backends

Rejected. They share exactly the daily identity, retention, tenant, Privacy,
and partner-projection concerns that should have one source of truth.

### Account-local or device-local "today"

Rejected. Two partners can be in different timezones, causing asymmetric day
and Mutual Reveal state. Device time is also not authoritative server state.

### UTC as the universal product day

Rejected. UTC is technically simple but produces unintuitive evening/morning
rollovers for many couples. A typed Space IANA timezone expresses the shared
product context explicitly.

### Deliver the partner value and blur/hide it in CSS

Rejected. It leaks into DOM/accessibility/client state, can flash during render,
and creates different semantics across clients.

### Keep all DailyCheckIn records for future analysis

Rejected. V1 has no approved history/analytics product purpose. Data minimization
wins until such a purpose receives its own decision.

### Persist the Today projection in the existing read cache

Rejected. A stale emotional status must not be replayed as today's partner
state, and the feature does not justify a new offline synchronization model.
