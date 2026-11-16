# Google Photos: replace the operator project

Owner: [#1467](https://github.com/baerenmarke90/eimir/issues/1467).

## Approved request and implementation boundary

The Product Owner requested a fresh, account-independent Google Photos adapter
configuration on 2026-11-05, prepared for a replacement Google account/project.
External import remains Pro through `integration.external_sync` in Cloud and
Self-Hosted. This work starts from main `c37d427f2b7b914b3dbc86cbe218c92df0bb7d56`.
The concurrent Wir wording work owns its separate branch; this slice does not
edit Today, the module catalogue, global translations or the release branch.

The existing adapter contains no hardcoded Google user identity. The old account
owns the OAuth project/client and its test audience. Replacing an OAuth client
must not reuse transactions, credentials or Picker resources from that client.

Prepare a bounded Google Web-client JSON loader, fixed official OAuth endpoints,
per-transaction configuration binding, provider deadline handling and a sanitized
operator setup command. Retain the adopted OAuth SDK, independent browser proof,
protected payload, expiry jobs and explicit selected-media import. No second
sign-in subsystem, permanent Google connection or refresh-token store is added.

This preparation is **not complete production enablement**. The complete
[delivery blueprint](1467-google-enablement-design.md) and #1467 still own typed
video ingress, authenticated installed-app handoff, secure device/cache acceptance,
independent security review and live Google/deployment acceptance. Credentials
alone must not override the existing application safety gate. Do not claim that
only Google Console work remains while those application gates are open.

## Reuse and cross-cutting preflight

- Reuse OAuth 2.0 state/PKCE, `google-auth-oauthlib` and Google's official Photos
  Picker REST API. A new provider SDK, account allowlist or custom OAuth protocol
  is unnecessary. Keep proprietary data inside the existing provider boundary.
- Support Google's downloaded **Web application** client JSON as an operator
  secret mount; retain the existing environment pair for compatible deployments.
  Mixing both sources is invalid. Never use a service-account or desktop client.
- Bind each Google transaction to the actual client configuration, including its
  exact callback. Rotation rejects callback, polling and selected-byte access
  under the replacement client. Cancel/cleanup remains available after rotation
  or Pro expiry and never needs the old client secret.
- Bound configuration reads and provider JSON/media transfers. Honor provider
  polling and expiry advice without extending the local task lifetime.
- Output only sanitized readiness codes and public setup values. Never output
  OAuth secrets, Google identities, filenames, media URLs or callback query data.
- No new consumer surface or visual composition is introduced by this adapter
  preparation. Existing source controls and local/Immich fallback are retained.
  Before the later UI/handoff slice, refresh the repository-aware visual preflight.

Business/freemium impact reviewed: the existing matrix's External Integrations
Premium row remains authoritative. Space grants serve both partners; provider
authorization stays personal. Saved imports, deletion/export, cancellation and
privacy recovery retain existing non-destructive, non-paywallable rights. No new
quota, storage allowance, provider fee or Self-Hosted restriction is introduced.

Official sources reviewed: [app setup](https://developers.google.com/photos/overview/configure-your-app),
[scopes](https://developers.google.com/photos/overview/authorization),
[sessions](https://developers.google.com/photos/picker/guides/sessions),
[media access](https://developers.google.com/photos/picker/guides/media-items),
and [data policy](https://developers.google.com/photos/support/api-policy).
Google verification, quotas and permitted retention/use must be checked for the
replacement operator project. The adapter's license remains the repository's;
the existing OAuth SDK is Apache-2.0. Network access and copying selected content
require the user's contextual consent. Local/system picking remains available.

## Validation plan

Prove different operator clients/accounts work without source changes; reject
desktop/service-account/malformed/oversized/mismatched JSON and secret-source
ambiguity. Prove rotation rejects stale transactions before provider access while
preserving cleanup and Pro enforcement. Cover provider deadlines, zero timeout,
long recommended intervals and no deadline extension. Run focused provider,
configuration, browser-binding and API regressions, lint/type/OpenAPI checks and
the normal affected CI gates. Synthetic tests are not real Google acceptance.

The first hosted check exposed a prohibited second Compose manifest in the
initial preparation. That addition was removed; the canonical runtime uses its
existing environment injection. The topology contracts and their assertions
are preserved unchanged.

The same check found two changed security baselines. The existing OAuth stack
now has an explicit `oauthlib>=4.0.1,<5` floor and a refreshed lock, following the
corrected [upstream advisory](https://github.com/oauthlib/oauthlib/security/advisories/GHSA-3jp2-3mrg-2vxc).
The frozen audit and focused OAuth/configuration tests pass with 4.0.1. No device
grant flow is introduced. Separately, the current primary Debian JSON marks
CVE-2026-6385 resolved in sid; its previous unresolved review is retained in the
codec evidence as a resolved finding. The restricted MOV-only build and missing
DVD subtitle parser/decoder were rechecked. No codec gate, ignore rule or decoder
surface is changed, and no upstream fix is claimed for the pinned source.

## Operator handover: replacement Google project

Use the Google account/organization that should own eimir.'s integration. The
operator account owns the project, not each importing person's photo library.
Each person chooses their own Google account in Google's consent flow.

1. Enable **Google Photos Picker API** (`photospicker.googleapis.com`) in the new
   Google Cloud project. The separate Google Picker/Drive API and a sign-in/OIDC
   client do not replace it.
2. Configure Google Auth Platform branding, support/contact details, audience,
   verified domains and published privacy information for the real deployment.
   Add the intended Google accounts as test users while testing.
3. Request only `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
   This is temporary selected-content access. No library-wide/offline scope or
   Google service-account credential is needed.
4. Create a **Web application** OAuth client. Set the exact authorized redirect
   URI printed below. Do not reuse the old standalone probe's `/oauth/callback`
   or its dedicated test hostname. This server OAuth flow does not need a
   JavaScript OAuth client or browser-shipped client secret.
5. Download that Web client's JSON directly into the operator's secret store, or
   inject its client ID/secret with the existing deployment secret mechanism.
   Do not paste filled values into issues, PRs, chat, build arguments or logs.
6. Complete Google's verification for the intended public audience. Test-mode
   consent is not production verification. Check the actual project's quotas
   and approved use/retention before rollout.

Print the public Google Console values **before credentials exist**, from a
source checkout with locked backend dependencies:

```bash
cd backend
uv run --frozen python -m eimir.photo_sources.google_setup \
  --public-base-url https://eimir.example
```

Replace that example with the actual externally reachable HTTPS origin. The
resulting callback is:

```text
https://eimir.example/api/v1/photo-sources/google/callback
```

No Google request, DB read, sign-in email or mutation occurs. The command does
not print credentials or enable the importer. Its two statuses are deliberately
separate: `configurationStatus` and `applicationImportAvailable`.

## Install configuration without a source edit

Choose one supported deployment approach:

| Source | Required operator values |
| --- | --- |
| Environment/secret injection | `EIMIR_GOOGLE_PHOTOS_CLIENT_ID`, `EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET`; leave `EIMIR_GOOGLE_PHOTOS_WEB_CLIENT_FILE` empty |
| Mounted Web-client JSON | `EIMIR_GOOGLE_PHOTOS_WEB_CLIENT_FILE=/run/secrets/google-photos-web-client.json`; leave both environment credentials empty |

The canonical Compose runtime keeps exactly one `compose.yaml`. Use its existing
environment/secret injection with the client ID/secret pair; no second maintained
orchestration manifest is added. Retain the existing profiles, image identity,
release guard, encryption keys, volumes and migration/start procedure.

Before any restart, validate the normal topology without printing its expanded
environment, which can contain secrets:

```bash
docker compose --env-file /absolute/private/eimir.env config --quiet
```

Runtime images must include this preparation before using its setup module.
Check the actual configuration inside the running API image:

```bash
docker compose --env-file /absolute/private/eimir.env exec -T api \
  python -m eimir.photo_sources.google_setup --check-config
```

Use `cloud-api` for the existing Cloud profile. An operator-managed topology
that already supports private read-only file mounts may use the JSON alternative;
set its container path with `EIMIR_GOOGLE_PHOTOS_WEB_CLIENT_FILE`. The canonical
Compose path uses the existing environment pair and does not require such a mount.
Keep any mounted file outside the checkout, readable by container UID 10001 and
inaccessible to unrelated users. No secret file is included in an application
image or repository. Different operator accounts/projects require no source edit.
Recreate API/worker processes through the normal deployment procedure after
environment changes. Mounted files are re-read per new OAuth transaction;
replace them atomically rather than editing an active secret file in place.

Exit 0 means the public manifest/configuration check succeeded; it does not mean
API enablement, consent, verification, live transfer, secure storage or device
acceptance succeeded. Exit 2 means invalid settings; output contains a fixed
status instead of the underlying secret-bearing error.

## Retire the old project safely

- Cancel active selections and let the existing cleanup worker finish before a
  planned rotation. No Account/Space/user-content deletion is required.
- A changed client ID, secret or exact callback invalidates outstanding Google
  transactions. Old and pre-binding tasks cannot callback/poll/read under the
  new client. Authenticated cancellation and cleanup remain available.
- Keep already saved eimir. media. It is separate from Google authorization and
  remains readable/exportable under existing domain and downgrade rules.
- Retire the old standalone probe and old client grants through normal Google/
  host controls after confirming they are no longer needed. Do not automatically
  revoke or delete unrelated Google clients/projects.
- Record real Google/browser/device results in #1467 without codes, tokens,
  account identities, private photos or live Picker/media URLs. Use the complete
  blueprint's acceptance list before an application enablement decision.
