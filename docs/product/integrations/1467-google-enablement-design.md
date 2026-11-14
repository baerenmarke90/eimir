# Google import: browser proof and device-recovery decision

Owner: [#1467](https://github.com/baerenmarke90/eimir/issues/1467).

The [operator project-migration preparation](1467-google-project-migration.md)
adds account-independent Web-client configuration, transaction rotation binding,
provider deadline handling and secret-free setup diagnostics. It does not enable
Google or satisfy the installed-app/video and real-provider acceptance below.
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

## Private-test eligibility (2026-11-14)

The Product Owner approved a narrow first live test on the private `eimir-test` instance. The
literal production gate (`google_import_available()`) is unchanged and still pinned by tests. A
separate fail-closed `google_test_eligible()` opens Google for an Account only when one of its
verified email addresses is listed in the operator-local `EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS`
(empty by default, at most ten, lowercase-normalized) and photo sources, required encryption, an
HTTPS public address and a valid Google OAuth configuration are present; demo mode never qualifies.
It is applied at every gate seam (start, ownership for commercial access, polling, reading, callback,
availability). The entitlement and all ownership, browser-proof and recovery checks are unchanged,
and cancel, removal and expiry cleanup stay ungated. This refines, and does not satisfy, the
acceptance below; it is not production enablement.

## Remaining enablement acceptance

- Independent security/code review of browser binding and device recovery.
- Real same-origin HTTPS provider return, cookie policy/expiry and user-agent
  rejection in the actual deployment; native/cross-origin transport stays gated.
- Installed-device interruption, old-client/legacy-state and storage inspection.
- Google policy/app verification, operator ingress logging and #797's separate
  Cloud operational acceptance. A repository merge is not deployment/go-live.

## Production delivery blueprint — proposal, 2026-11-05

This section finishes the implementation plan requested in #1661. It is a
**concept only**; #1467 remains the delivery owner. No integration, availability
gate, provider configuration or native capability is changed by this update.
The earlier implemented safety/recovery sections remain the baseline, not a
claim that the following gaps are closed.

### Current code and specific remaining gaps

Rechecked main `91a12b2eb87d9e95c9a7f4ff57bc7cb410ea4714`:

| Boundary | Reuse | Remaining work |
| --- | --- | --- |
| Source choice | `PhotoSourcePicker`, `DeviceMediaPicker`, `AttachmentDraftPicker`, `PlanPhotosEditor` | Offer Google only when server eligibility accepts this destination, client contract and platform. Keep one shared source entry. |
| Authorization | `google_photos.py`, API callback and `browser_binding.py` | Accept the existing same-origin browser proof in a real HTTPS deployment; add the authenticated app-to-browser task below. |
| Selection lifetime | `PhotoSelection` / protected payload and expiry job | Current task lifetime is ten minutes. Current polling clamps an interval to 3–60 seconds and does not honor all provider deadlines. Persist and validate the provider interval, timeout and expiry; never poll earlier than permitted. |
| Media types | `SelectedPhotoItem`, Google `items()` / `read()` | Current adapter rejects a whole selection containing VIDEO and returns in-memory image bytes. Add typed per-item outcomes and bounded streaming for supported videos. |
| Saving / recovery | Attachment draft ownership, `memory-only-v1`, exact-save journal | Prove the same retention/idempotency contract on every supported create/edit destination and installed client; no provider-derived bytes in durable device caches. |
| Admission | `google_import_available()` currently always returns false | Replace only after independent review and the platform/deployment acceptance below; no user or operator flag may override missing prerequisites. |

### Consumer journey

1. In an existing Memory, HeartMoment or Plan draft, open **„Andere Fotoquelle“**
   and choose **„Google Fotos“**. The device/system picker remains directly
   usable. No technical Google setup belongs in the consumer flow.
2. Explain selected copying, temporary transfer and the destination before
   authorization. Candidate de-DE copy:
   **„Wähle bei Google Fotos aus, was du hinzufügen möchtest. eimir. übernimmt nur deine Auswahl. Geteilt wird sie erst, wenn du diesen Eintrag speicherst.“**
   A private HeartMoment instead
   explains that saved copies stay private until explicitly shared.
3. Open Google authorization and the official Photos Picker in the supported
   browser. On return, show selected media in the existing draft, preserving
   words, date, existing attachments, order, cover and sensitivity.
4. Permit removing/reordering, retrying individual failed imports and explicitly
   saving. Provider selection alone never creates a shared Moment or publishes
   files into Photos. Show partial success as partial success.

No full-library browser, continuous synchronization, background album import,
permanent Google connection, facial analysis or source-side editing is planned.
Apple/iCloud stays with supported system selection. Android's system picker
may expose a cloud source on some devices; that does not replace this explicit
cross-platform Google flow or require Google services for ordinary eimir. use.

### Authorization and installed-app handoff

Use the existing server OAuth library, exact callback, state/PKCE and per-task
HttpOnly browser proof. Request only
`https://www.googleapis.com/auth/photospicker.mediaitems.readonly`, with online
temporary authorization. Do not add a refresh-token store or broaden library
scopes. Google authorization must use an external user agent, not the app's
embedded WebView ([OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies)).

For Android/iOS, select the already proposed **authenticated browser-hosted
task**. This is an eimir. application design, not a Google SDK requirement:

- Authenticated app start creates an expiring selection bound to Account,
  Space, initiating DeviceSession, destination restrictions and client/recovery
  version. A random launch locator identifies it but grants no access.
- The system browser authenticates the **same eimir. Account**, rechecks active
  membership/entitlement and displays the intended destination. An explicit
  one-use approval binds its browser transaction/proof to that app task.
  Forwarding a launch link cannot authorize a different account/browser.
- The Google callback can complete only that approved browser transaction.
  App polling/read still requires the initiating DeviceSession. The browser
  identity cannot substitute for the app identity or silently change the draft.
- Completion wakes the app through a fixed validated HTTPS app/universal link;
  the app then reads task state through authentication. No bearer, provider
  token, OAuth code, browser proof or media URL belongs in the return link.
  If automatic return is unavailable, show a plain return instruction and let
  foreground authenticated polling discover completion.
- Define and test production origins, exact callbacks, Android association and
  iOS association/signing configuration before enabling those platforms. No
  cookie copying, custom credential-bearing scheme or hardcoded demo origin.
- Cancellation, browser closure, process death, logout, session revocation or a
  changed Account/Space cancel or invalidate the owning task; a late callback
  cannot import into the next draft. Multiple tasks remain individually bound.

Extend the existing selection API with narrowly scoped prepare/approve/complete
operations if needed; the final names belong in the OpenAPI change. Keep app
read/cancel authenticated and all ownership checks server-side. An opaque client
identifier is never proof of a secure client. Legacy tasks stay unadmitted, and
independent review must verify effective old-client handling without trusting
an easily spoofed version header.

### Typed transfer and attachment contract

The provider adapter should produce a bounded typed item descriptor with an
opaque eimir. item ID, stable selection ordinal, IMAGE/VIDEO type, sanitized MIME,
processing state and eligibility/failure code. Provider IDs, URLs and tokens stay
only in the existing encrypted expiring payload; they do not enter public URLs,
draft storage, exports or diagnostics. Enumerate every selected item so that
an unsupported item cannot silently disappear or fail the entire valid batch.

The Google session API owns completion and its polling/deadline advice
([session contract](https://developers.google.com/photos/picker/reference/rest/v1/sessions)).
Persist validated deadlines; stop at the earliest local authorization, provider
session or polling timeout. Respect a zero timeout, cancellation and rate-limit
backoff without extending the overall deadline. Delete tracked sessions and
erase credentials on completion, cancellation and expiry using existing jobs.

For images use authenticated downloads during authorization; Google's download
excludes location metadata. For video bytes use the documented download variant
only after provider processing is READY; this is a high-quality transcoded copy,
not a promise of the original file ([media access](https://developers.google.com/photos/picker/guides/media-items)).
Do not promise imported GPS, RAW/Live Photo semantics or lossless originals.

Plans remain image-only. Other destinations accept video only where their
existing video capability, deployment policy, size/count and storage quotas
permit it. Recheck eligibility before starting each transfer and before binding.
Validate actual bytes through the existing attachment ingestion and video
processing pipeline; provider MIME/metadata is not authoritative.

Use bounded server streaming into the existing protected staging storage and
attachment pipeline for large media. Do not route entire videos through a browser
Blob or the current image-bytes adapter. This extends attachment ingress, not a
second uploader: one staged Attachment ID, existing progress/state, READY,
authorized binding and normal orphan cleanup. Preserve ordinal/sensitivity on
retry; an item-level idempotency key prevents duplicate staging after an uncertain
response. A provider READY result is distinct from an eimir. Attachment READY.

### Recovery, security and lifecycle

Keep `memory-only-v1`: durable recovery may retain authored fields, opaque
authorized attachment references and the exact save/binding journal, never
Google-derived bytes or provider authorization material. Reload/process death
restores READY references after authorization; missing volatile media requires
explicit reselection or removal. Reconcile an uncertain Save before issuing a
new create identity. Keep the earlier explicit unknown-provenance legacy draft
decision; do not silently purge or relabel old device Files as encrypted.

The secure-retention review must cover **saved imported copies as well as
temporary files**: private storage, backups, workers, export intermediates,
thumbnails, installed WebView HTTP/media caches and service workers. Apply the
existing encryption/key-management and cache boundaries; if the accepted policy
cannot be enforced for a deployment/client, leave Google unavailable there.
Do not infer compliance from an encrypted database alone. Google's policy
requires clear purpose/consent, deletion controls and secure handling, including
encryption of stored derived data
([provider policy](https://developers.google.com/photos/support/api-policy)).

Account-owned authorization never grants the partner access to Google. Saved
copies use the destination's existing visibility and later deletion/export
rules. Ending authorization stops future retrieval; it is distinct from deleting
already saved eimir. copies, which users can remove normally. Cover both actions
in help/consent. No additional local-model proposals or external AI processing of
imported content is implicitly authorized by this integration; assess any
secondary use separately before enablement.

### Delivery slices and completion evidence

| Slice | Concrete output | Required evidence |
| --- | --- | --- |
| 1. Contract and policy preflight | Final typed item/task contracts, destination matrix, provider retention/use decision, current API/SDK review | Independent security/reuse review; repository-aware visual reference and Mobile Interaction Contract before new UI; Google project/verification blockers recorded |
| 2. Web integration | Real same-origin authorization, provider deadlines, typed images and bounded attachment ingress; gate stays closed outside accepted test eligibility | Two-browser/account/replay negatives; denial/empty/partial/expired/offline/quota/429 cases; explicit Save and exact recovery; real provider test |
| 3. Supported videos | Existing processing pipeline receives selected supported video through bounded server staging | Mixed selection/order, not-ready provider, actual MIME/codec/size limits, cancellation, no duplicate staging or unbounded heap use |
| 4. Installed platform handoff | Browser approval, authenticated app completion and production associations/configuration | Signed Android/iOS release builds: browser closure, Back, foreground/background, process death, concurrent tasks, changed Account/Space and secret-free return |
| 5. Deployment acceptance and enablement | Reviewed fail-closed eligibility replaces the blanket false gate only for accepted deployments/platforms | Provider verification, exact production callback, encryption/storage/backup/cache inspection, worker cleanup, sanitized ingress logs, #797 acceptance and working device/Immich fallback |

Web validation can precede installed-app acceptance. #1467 stays open until the
complete authorized Web/Android/iOS scope is accepted; merged preparation,
synthetic providers and an operator probe are not production completion.

External integration remains Premium through `integration.external_sync` for
Cloud and Self-Hosted; ordinary device media remains Free/Core. Keep existing
video tiers/quotas and non-destructive downgrade. Cancel, privacy recovery,
disconnect, deletion/export and access to saved content remain non-paywallable.
Costs are OAuth/provider operations, bounded transfer bandwidth, temporary plus
final storage and existing video processing. Inspect the actual Google project's
current quotas before rollout; do not invent a fixed universal API price or
capacity. Measure concurrent transfers, memory, cleanup age and rate-limit
frequency with aggregate counters, never media names/URLs or user content.

Before implementation, re-read current #1467 and its discussions, this blueprint,
the provider policies and the actual main. Production setup still requires the
operator-owned Google project/API/OAuth client, verified origin/domain and
privacy/consent information, supported secret injection and any required Google
verification. Self-Hosted uses the same security contract with documented
operator configuration; unsupported setups retain usable local/system media.
