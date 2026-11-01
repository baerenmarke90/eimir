# Google application-import security gate

Owner: [#1467](https://github.com/baerenmarke90/eimir/issues/1467).
Review baseline: `main@198c5421`; related #1444, #1451, #1460, #1461, #797.

## Current result

Application Google import is **unconditionally unavailable**. Operator flags,
HTTPS, REQUIRED server encryption, configured Google credentials and Premium
do not bypass the gate. The existing source sheet omits unavailable Google and
keeps the local/system picker and optional personal Immich integration.

The standalone synthetic operator probe from #1451 is a separate tool with no
eimir. persistence and remains unchanged. Its successful synthetic transfer and
cleanup do not establish acceptance of the later application flow.

The #1467 follow-up adds a per-transaction, short-lived HttpOnly browser proof
to the authenticated start/callback seam. Legacy selections have no proof and
cannot complete. The literal availability gate remains closed. See the
[implemented browser binding and proposed device-recovery contract](1467-google-enablement-design.md)
for exact same-origin Web limits, native/cross-origin exclusions, legacy-draft
decisions and remaining acceptance. The nonpersistent recovery implementation now accompanies that contract; real
provider/device acceptance and native transport remain separate.

## Why the later runtime delivery needs this gate

The original runtime checked stored Account/Space/DeviceSession, expiry,
one-use state and PKCE without proving the returning browser. The follow-up
now requires an independent cookie proof and covers separate browser cookie
jars, encrypted persistence and replay with synthetic provider responses.
Matching stored ownership metadata alone remains insufficient. Before
enablement, accept the same-origin Web flow in real browsers and resolve the
separate Capacitor transaction binding. Do not improvise a bearer-in-URL native handoff.
See [OAuth security BCP](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1).

The original Google flow copied Files into the diary's raw IndexedDB checkpoint;
that new-copy path now uses memory-only Files and byte-free local descriptors.
Provider credentials and URLs are excluded and server payloads are encrypted,
but that does not encrypt copied photo bytes on the device. Disclosure alone
does not establish Google's required secure storage. See [Google's secure
operating-environment policy](https://developers.google.com/photos/support/api-policy#maintain_a_secure_operating_environment).
The seven-day window is recovery expiry since the last checkpoint, not a
physical deletion timer that runs while the browser is closed.

The new nonpersistent path preserves Save, uncertain outcomes, idempotency,
ordering, sensitivity and mixed device/provider drafts. Missing photos retain
explicit slots; available server uploads are reloaded with current authorization.
Old client/task admission is blocked by the versioned recovery-policy contract.
Independent review and actual device/provider acceptance remain before enablement.

## Enforcement and privacy lifecycle

`google_import_available()` is a literal false decision, not a configuration
toggle. Availability hides Google; start refuses it before authorization;
commercial ownership/poll/read and direct service transfer methods reject even
pre-existing Google selections. Callback returns before database lookup or
token exchange. No new provider bytes or credentials are transferred by these
application paths. Existing fixed redacted unavailable responses are reused.

Cancellation, expiry and revoked-device cleanup remain available after feature
disable or downgrade; they can delete an existing remote session and erase
local encrypted provider state. Existing saved relationship content is retained.
The gate does **not** encrypt or selectively purge copied Files already present
in generic local drafts: there is no trustworthy provider provenance there.
Do not silently delete a user's draft. Legacy device-state handling remains an
explicit #1467 follow-up before Google enablement.

## Scope, reuse, business and product review

Reuse the current availability condition, authorization/ownership checks,
localized unavailable state and cleanup; no public API/schema change, new
provider abstraction, key-management scheme or dependency. Continuing exposure,
an operator bypass and ad-hoc native/browser encryption were rejected.

Business/freemium impact reviewed: preserve external integrations' Premium
boundary and Free/Core device selection. No quota, entitlement, storage,
downgrade or existing-content ownership changes. Cleanup stays non-paywallable.

Product/UX review: no component, style, label, new control, route or native
capability is implemented. Google uses the existing unconfigured/unavailable
presentation; the current diary composition and Immich selection remain.
There is no new visual pattern or typing/touch/focus/motion behavior. The current
whole-composer source reference remains composition history, not proof that
Google is available. Native/provider acceptance cannot override the hard gate.

Immich malformed MIME/account-ID types are also normalized through fixed
provider failures/unsupported filtering. They no longer escape as TypeError or
AttributeError. Credentials, source URLs and upstream body text are not quoted.

## Validation and remaining acceptance

123 combined gate/Google/Immich unit tests pass. New negative API/PostgreSQL
tests cover configured on/off attempts, seeded encrypted legacy Google tasks,
callback/poll/read denial and cancel/expiry/revocation after disable/downgrade.
Local PostgreSQL cases explicitly skip without a disposable database; hosted
PostgreSQL checks must pass before merge. Existing Immich lifecycle tests remain.
Ruff and strict provider mypy pass. Independent security review approves this
gate, not future Google enablement.

Keep #1467 open for browser binding, copied-media/legacy device persistence,
provider-specific verification/disclosure and real integrated-provider/device
acceptance. #797 remains the separate Cloud security/operational acceptance;
no E2EE, verified publisher or Cloud production certification is claimed.
