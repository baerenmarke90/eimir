# Google import: browser proof and device-recovery decision

Owner: [#1467](https://github.com/baerenmarke90/eimir/issues/1467).
Baseline: `main@ee6064fda6466258636e1e0446539336edb06a86` (2026-10-28).

## Delivery boundary

The browser-proof and nonpersistent selected-media recovery implementations
below are ready for code/security review. This is repository implementation,
not independent approval, deployment or real-provider acceptance. Google remains
unconditionally unavailable. No configuration flag, operator credential or
Premium grant changes that decision. Do not close #1467 with this slice.

Memory-detail, gallery, shared authorization and export remain outside this
slice. The additive PhotoSelectionCreate recovery-policy field updates OpenAPI
and its generated model; regenerate against the combined baseline when
integrating alongside #1485/#1486.

## Reuse and alternatives

Reviewed on 2026-10-28:

- [RFC 9700 section 2.1.1](https://www.rfc-editor.org/rfc/rfc9700.html#section-2.1.1):
  retain state and PKCE and bind the response to its initiating user agent.
- [Google's Web-server OAuth guidance](https://developers.google.com/identity/protocols/oauth2/web-server#httprest_1):
  retain the adopted Google OAuth library and exact registered callback.
- [Cookie platform semantics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie):
  use a short-lived host-only HttpOnly proof for the same-origin Web flow.
- [Google Photos data policy](https://developers.google.com/photos/support/api-policy#maintain_a_secure_operating_environment):
  device-local copied bytes need their own secure-storage review; server
  encryption and consent alone do not settle that boundary.

Alternatives: server state/PKCE alone (does not prove the returning browser),
a public launch-ticket endpoint that sets a cookie (the launch link can be
forwarded to another browser), browser fingerprinting (not an authenticating
proof), a bearer in a native redirect (credential disclosure), and browser
encryption with a colocated persistent key (does not establish the intended
device protection). None is selected.

Reuse FastAPI/Starlette cookie handling, existing random-token generation and
constant-time hash comparison, protected selection payloads, locks, expiry,
membership, entitlement and device-session checks. No dependency, cryptographic
primitive, provider, native plugin or framework is added. Google SDK licensing,
terms, bounded traffic, operator ownership and local/Immich fallback remain as
documented in `1444-photo-source-delivery.md`.

## Implemented browser binding

The authenticated selection POST generates a fresh 256-bit random proof for
each Google transaction. It is independent of OAuth state, PKCE and the bearer.
Only its hash is stored inside the encrypted `PhotoSelectionPayload`.

The raw proof leaves the server only as a cookie:

- name `__Host-eimir-photo-` plus the SHA-256 of the transaction's OAuth state;
- `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, 600-second lifetime;
- no raw proof in JSON, query strings, authorization URLs, logs or diagnostics.

State selects the matching cookie, but is never the cookie value. Separate names
allow the existing maximum of two active selections without replacing an older
transaction's proof. Cookie creation happens only after authenticated start has
succeeded. The cookie is not a login/session credential and does not authorize
selection start, polling, reading or cancellation.

The public callback accepts the proof only from that cookie. No query/body/
header fallback exists. Missing, malformed, mismatched or legacy proof fails
before exchange; a wrong browser cannot consume another browser's transaction.
The existing Account, matching DeviceSession, current Membership, entitlement,
expiry, protected-payload binding and selection-row lock remain cumulative.
The callback also checks that the DeviceSession belongs to the stored Account.

After a valid proof, denial/provider failure consumes the transaction just as
success does. State, verifier and browser hash are erased, and changes are
flushed before return; the request unit of work still commits before delivery.
The response expires only that transaction cookie and retains private/no-store,
no-referrer and the existing fixed failure page. Unreturned cookies expire in
the browser; cancellation/expiry/offboarding erase the corresponding server
record using the existing lifecycle. Cancellation does not need the proof or Pro.

Legacy selections default to no hash and cannot complete even if state/PKCE
are present. Cleanup remains possible. No active selection is silently upgraded.

### Web, cross-origin and native limits

The supported proof transport is **same-origin HTTPS Web/PWA**: an authenticated
start sets the API-host cookie in the browser that will receive Google's return.
Lax permits the top-level safe-method callback navigation. Preserve existing
bearer authentication and strict CORS; do not add credentialed wildcard CORS.
Blocked cookies and HTTP fail closed. Exact HTTPS origin/domain/cookie behavior
still needs a real browser and deployment acceptance check before enablement.

The Capacitor HTTP bridge and the external system browser do not establish a
shared cookie jar. This change deliberately supplies no cookie copying, native
redirect scheme, launch-ticket workaround or claimed Android support. Native
Google selection remains unavailable. A future native implementation must reuse
a separately reviewed platform authorization broker or a fully authenticated
browser-hosted task, with explicit initiating-app ownership and cancellation.
Its return must not grant a different browser/app/account the selection. Keeping
the gate closed is preferable to making an unverified cross-agent assumption.

The preferred native follow-up is the existing authenticated Web product in
the system browser: verify the same eimir. Account there before authorizing a
pending app task, require explicit browser consent, and bind both the initiating
app DeviceSession and the authorized browser transaction. An opaque task link
alone must not establish that authorization. The app receives no bearer/code
in a URL and observes completion only through its existing authenticated task.
This adds a browser sign-in when necessary and requires a separate product/
security preflight; it is not an implemented native bridge in this slice.

## Implemented nonpersistent selected-photo recovery

Google copies use a **memory-only File path plus authorized server attachment
references**. No persistent browser encryption key is introduced. The current-
screen generated reference and Mobile Interaction Contract were committed and
[recorded on #1467](https://github.com/baerenmarke90/eimir/issues/1467#issuecomment-6470260243)
before UI implementation. See [the reference and runtime evidence](../design/references/1467/README.md).

### Ingress and checkpoint contract

1. Mark provider-derived Files at the source ingress, before generic attachment
   selection commits. Carry only a local retention class, never provider URLs,
   asset/account IDs or credentials. Preserve the class through reorder/retry.
2. Provider file/thumbnail bytes and object URLs exist only in task-owned memory;
   never put them in IndexedDB, local/session storage, Cache Storage or a worker
   cache. Reuse ordinary encrypted server upload, image validation and READY.
3. Replace diary checkpoint file entries with a versioned discriminated union:
   existing permitted device File; authorized READY attachment reference; or
   explicitly unavailable volatile selection. Keep stable local position,
   sensitivity and recovery identity. Never drop an entry and shift indices.
4. Persist authored text/date/tags, the exact create attempt/idempotency key,
   submitted body, ordered attachment IDs, sensitivity and partial-binding state
   together. Removing bytes must not remove or rewrite an uncertain operation.
5. Before a volatile-photo Save, require a successful local checkpoint of the
   exact operation journal. Storage/quota failure sends no create request,
   keeps editable work and offers retry/removal; never call that an unknown
   server outcome. Ordinary device-file fallback keeps its existing behavior.
6. On resume, resolve READY references through current owner/Space authorization.
   A missing/expired staging upload or unfinished volatile file requires explicit
   reselection/removal; no empty placeholder upload or invented success. Keep
   authored work and do not create a second Memory while the old result is unknown.
7. Confirm/reconcile the exact original Memory operation before considering a new
   create identity. A confirmed Memory with failed photo association stays a
   partial-binding task. Reselection must not silently rewrite its original
   uncertainty journal or the attachment-to-sensitivity ordering. A missing local
   preview does not block retrying unchanged known attachment IDs in their
   original positions when current server metadata confirms READY. Metadata
   transport failures retain the confirmed partial task, never an unknown create.

New Google tasks require `mediaRecoveryPolicy: "memory-only-v1"` and retain it
in the protected task payload. Callback, poll and item reads reject old tasks
without that policy; cleanup remains available. Old clients/tasks cannot use a
future server enablement to fall back to the old raw-File checkpoint. This is
a compatibility admission rule, not proof that an untrusted client is secure.
All supported client builds still need actual device/browser storage inspection.

### Legacy local Files

Existing draft records have no reliable provider provenance. Do not guess from
names, MIME types, hashes or EXIF, delete all drafts on upgrade, or claim to
encrypt old copies by merely changing future writes. Keep the current literal
Google gate while legacy-state handling is incomplete.

The existing recovery prompt now explains the changed photo retention before
its explicit Resume or Discard actions. Loading an unversioned draft preserves
its Files. Resume writes a version-3 checkpoint containing descriptors for all
unknown-origin Files, while retaining their existing File objects in task-owned
memory, authored text and exact uncertainty journal. No file position is dropped.
The transaction retains the existing writer lease and epoch checks. No background
purge of unknown-provenance drafts is introduced. Existing explicit discard,
logout/owner invalidation and recovery expiry retain their current behavior.
The seven-day expiry is enforced when storage is opened; it is not a physical
deletion timer while a browser or an old APK is closed. Never advertise otherwise.

### Required negative and interruption cases

- Mixed device/provider files, removal/reorder, sensitive flags and partial reads.
- Reload during download/upload, before POST, after an unknown POST result and
  after Memory creation but before attachment binding.
- Missing/expired staging attachments, ownership loss, offline resume and retry.
- Multiple tabs and writer-lease conflict, Account/Space change and logout.
- IndexedDB/storage/cache inspection proving provider bytes are absent.
- Old drafts with unknown provenance; explicit consent/discard without losing
  text, ordering or an uncertain operation's identity.
- Old client/new server and old task/new server cannot regain unsafe transfer.

## Product, business and cross-cutting result

The accepted R1/F2 diary composition remains. Recovery adds honest missing-photo
slots, protected-read retry, explicit legacy-Resume disclosure and memory-only
draft status, plus source-specific consent. The generated Compact reference
preceded UI code; five final runtime captures cover 320/360/390/430/1280px,
Light/Dark, reduced motion and 200% text at 320px. The narrow photo layout stacks
within the available width. Google still uses the unavailable presentation.

Business/freemium impact reviewed: external integration remains Premium via
`integration.external_sync`, device selection stays Free/Core, and cancellation,
disconnect, deletion/export and privacy protection remain non-paywallable.
Cloud and Self-Hosted have the same gate and proof. No new provider cost, quota,
storage allowance, downgrade deletion or entitlement change is introduced.

Security/privacy: proof is ephemeral, host-only and hashed inside the existing
encrypted payload; old/mismatched browser state cannot exchange. No content,
token, proof or provider URL enters observability. Concurrency preserves the
Membership -> entitlement -> selection lock order and consumed-state boundary.
Resilience retains fail-closed callbacks and independent cleanup. The API adds
only the optional recovery-policy contract, required for future Google admission.
No database column/migration changes; new protected fields default to absent.
UI text uses i18n; existing semantic components, focus and reduced motion remain.
The IndexedDB database version/indexes remain; a per-record format 3 distinguishes
byte-free checkpoints without destructively upgrading unopened drafts.

## Local validation

- All 1,012 backend unit tests and 25 Photo Source PostgreSQL/API tests passed.
  Concurrency uses real request commits and proves exactly one token exchange.
- All 2,183 Web unit/component tests passed (two existing skips).
- All 28 pre-existing diary browser journeys, eight new recovery journeys and six
  real IndexedDB/storage journeys passed. The new journeys cover five widths,
  missing-photo retry, byte absence, legacy migration, unknown create response
  and exact identity preservation. A known-partial journey additionally proves
  repeated read/binding failures retain the same Memory, ordered attachment IDs
  and sensitivity without replacement uploads or another create. A quota-failure
  journey proves that a missing
  durable save journal prevents POST without inventing an uncertain result,
  retains work and permits a later safe retry. Five viewport journeys also passed Axe
  checks without critical/serious WCAG findings.
- Ruff lint/format, strict source mypy, Web typecheck/build, OpenAPI comparison
  and exact generated-client comparison passed. Language audits are required
  on the final commit. No assertion, timeout, workflow or gate was weakened.
- All provider responses are synthetic. Browser fixtures are not real Google,
  native-device, operator/deployment or Cloud acceptance.

## Remaining enablement acceptance

- Independent security/code review of browser binding and device recovery.
- Real same-origin HTTPS provider return, cookie policy/expiry and user-agent
  rejection in the actual deployment; native/cross-origin transport stays gated.
- Installed-device interruption, old-client/legacy-state and storage inspection.
- Google policy/app verification, operator ingress logging and #797's separate
  Cloud operational acceptance. A repository merge is not deployment/go-live.
