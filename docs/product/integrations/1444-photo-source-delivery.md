# Selected photo sources: delivery contract

Preflight: 2026-10-27, main `8c78c2eabc4a20dbdc71f067677cdc123fb4d293`.
Owner: #1444. The Product Owner authorized completion of #1460, #1462,
#1375, #1444 and #1461; real-provider and device acceptance follows in the
running test deployment. That changes the acceptance sequence, not consent,
tenant isolation, secure transport, commercial eligibility or provider policy.

## Reuse and product decision

Keep the existing system file input as the immediate Free/Core path on Web,
Apple and Android. Apple/iCloud and eligible Android cloud providers are exposed
by their system picker; no Apple login, blanket permission or new native bridge.
Use the Google Photos Picker API, online-only OAuth and a temporary selection,
not the Library API or background sync. Immich has no delegated external picker
OAuth: provision an explicitly owned per-Account credential in the operator
layer, verify the external account, and allow a bounded temporary selection.
Never accept a normal user's API key, arbitrary URL or foreign library account.

Reuse the existing attachment selection handle, bounded upload queue, validation,
READY, parent binding, diary recovery, problem/i18n layer, ShortTaskSheet,
object-URL ownership and entitlement service. No second upload/gallery domain,
universal provider framework, client token store or recurring synchronization.

External provider capabilities use `integration.external_sync` (Premium), the
existing external-integration matrix boundary, on Cloud and Self-Hosted alike.
Ordinary device/system selection stays Free/Core. Provider setup is optional;
unconfigured deployments keep their functioning local picker. Downgrade or
disconnect never removes imported relationship content or its export access.

## Mobile interaction contract

Product Reference R1/F2 and the later #1458 diary remain normative: editable
date and sustained prose, existing preview/reorder/remove/retry, optional title
and custom tags, local recovery status, fixed shared audience and one Save.
Add one quiet secondary source action at the existing photo input. A named
ShortTaskSheet owns Close, Back/Escape, focus containment/restoration, inactive
background, safe area and reduced motion. Expanded adapts the same bounded task.
The generated whole-composer/sheet reference is
`../design/references/1444/photo-source-sheet-delivery.png`.

The reference is composition guidance, not a pixel lock: image-only allowlists
remain authoritative despite the illustration's generic system-library wording.
No new provider logos or exact brand artwork is required. Selection thumbnails
use the existing photo-grid semantics; no persistent library/browser screen.

Before external authorization, disclose selected-photo copying to private
staging, device-local draft recovery for up to seven days, and partner access
only after explicit Save. Continue is affirmative consent; Close is not.
Loading, empty, denied, expired, unsupported, partial, offline and success states
retain authored text and existing photos. Cancellation aborts stale completions
and cleans the provider session; it does not falsely claim no bytes transferred.
Choose/cancel -> stage -> Save -> canonical result -> return uses the existing
composer lifecycle. Test Compact 320/360/390/430, large text, keyboard, Light/Dark,
reduced motion and Expanded. Real installed-device/provider acceptance is deferred.

## Security, persistence and operations

Google Web OAuth belongs to the operator; use the maintained Google OAuth
library, exact configured HTTPS callback, state/PKCE and the system browser.
No refresh token or permanent Google connection. Temporary selection state is
bound to Account, Space and DeviceSession, encrypted with the existing server
payload protector, expires after ten minutes and is never a shared projection.
All access still proves active authorization; callback state is one-use.
Expiration, cancel and session revocation remove token/media references. Do not
persist source URLs or credentials in a browser or diary draft. Copied Files
enter the disclosed existing owner-local recovery lifecycle, without provider
identifiers. Imported bytes still pass ordinary image validation and binding.

Immich origins and credentials are operator-owned, account-scoped and secret;
the external account must match. Reuse the pinned public-HTTPS transport from
#1461, fixed endpoints, no redirects/proxy, existing 25 MiB limit and deadlines.
No unrestricted LAN/SSRF opt-out. Bound concurrent work, requests, page size and
session count; generic failures expose no URLs, identifiers or upstream bodies.

Encryption-at-rest implementation already exists. Require encrypted provider
state and preserve #797's distinct operational/security acceptance. This work
does not certify Cloud go-live or invent Google OAuth verification. Operators
must enable/register their approved Google OAuth app or testing audience and
declare the selected-copy/private-sharing use case. Live secrets, credentials,
callback logging controls, provider availability and physical device evidence
remain deployment responsibilities, documented separately from automated tests.

## Sources and verification

- Google Picker REST root: https://developers.google.com/photos/picker/reference/rest
- Sessions: https://developers.google.com/photos/picker/reference/rest/v1/sessions
- Policy: https://developers.google.com/photos/support/api-policy
- OAuth Web flow: https://google-auth-oauthlib.readthedocs.io/en/latest/reference/google_auth_oauthlib.flow.html
- Immich v3.3.5 OpenAPI: https://github.com/immich-app/immich/blob/v3.3.5/open-api/immich-openapi-specs.json
- Existing selected-reader review: `1444-immich-selected-reader.md`.

Verify authenticated cross-Account/Space/session denial, expiry/replay, secure
credential storage, explicit selected-item-only transfer, partial/cancel and
late completion, normal upload/READY/Save behavior, unconfigured fallback and
Premium enforcement with meaningful unit, PostgreSQL/API and browser coverage.
Required CI and branch protections remain mandatory before merge.
