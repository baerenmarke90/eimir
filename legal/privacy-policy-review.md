# Privacy policy draft: review notes

Status: drafting baseline for the legal review of
[`de/privacy-policy.md`](de/privacy-policy.md) (version `2026-11-06.draft-1`).
This file is not legal advice and is not shown to users. It records where each
statement comes from, which facts the operator must supply and which decisions
are open, so that the reviewer can check the draft against the product instead
of against assumptions.

Baseline: `main` at `e98202bff3aefe33c46724fa0ad7b5e2ac6f6e1c`.

## Scope

The notice covers eimir. Cloud and the official apps (`legal/README.md`).
Self-Hosted operators are their own controllers and receive no Cloud legal
texts; the Web app shows the notice only where the instance publishes a Cloud
terms version. The notice is informational: it is never accepted, never part of
the terms acceptance and never blocks a flow (Art. 13 GDPR, terms § 7).

## Data-flow inventory

Each section of the draft states only what the repository implements today.
Where a feature is not yet available, the draft says so explicitly.

| Draft section | Statement | Repository source |
| --- | --- | --- |
| 3 | Account fields: email and verification, display name, optional avatar and birthday, locale/time zone/quiet hours/notification settings | `backend/src/eimir/identity/models.py` (`Account`, `AccountEmail`) |
| 3 | Terms acceptance: version, time and origin (`signup_request` / `signup_redemption`), no IP or device data, deleted with the Account | `backend/src/eimir/legal/models.py`, `docs/product/design/references/terms-of-use-acceptance/README.md` |
| 3 | Cloud sign-in: mailed link or passkey; no local password on Cloud; OIDC only when configured (the Cloud example has none) | `backend/src/eimir/auth/policy.py`, `deploy/cloud-managed.env.example` |
| 3 | Link lifetimes 15 min (magic link, signup proof), 24 h (email verification); unredeemed signup proofs, which hold the plain address, are pruned by the six-hourly maintenance job | `backend/src/eimir/auth/action_tokens.py`, `backend/src/eimir/jobs/maintenance.py` |
| 3 | Passkey record: public key, credential ID, AAGUID, transports, name, flags, last use; biometrics never leave the device | `backend/src/eimir/identity/models.py` (WebAuthn credential) |
| 3 | Sessions: platform, start, last use, hashed tokens; 60-day sliding and 180-day absolute lifetime | `backend/src/eimir/auth/tokens.py`, `backend/src/eimir/identity/models.py` (`DeviceSession`) |
| 4 | Shared vs. owner-only content, server-enforced; partner may edit opted-in shared Story items and export shared content | `docs/PRIVACY-MODEL.md`, `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md` |
| 4 | Partner presence: one overwritten `last_active_at` per member and Space; partner sees only „now“/„recently“ (2/10 min windows), no timestamp | `backend/src/eimir/relationship/presence.py`, `backend/src/eimir/api/v1/spaces.py` |
| 4 | „Gefühl für heute“/Akku: rows kept for the current and the previous Space day only | `backend/src/eimir/daily_checkins/retention.py`, ADR 0007 § 9 |
| 4 | Moment photos keep readable EXIF/ICC incl. GPS in the original; thumbnails, avatars, other uploads and videos are stripped | ADR 0014, `backend/src/eimir/attachments/videos.py` (`-map_metadata`) |
| 4, 21 | Leaving a Space deletes the leaver's owner-only data there; a zero-active Space is purged after exactly 30 days | `docs/m6/SPACE-OFFBOARDING-LIFECYCLE.md` § 8, `backend/src/eimir/relationship/policy.py` |
| 5 | Application-controlled encryption at rest (required on Cloud Production), keys apart from DB and media; plaintext metadata listed; never E2EE | `docs/ENCRYPTION-AT-REST.md` §§ 4, 5, 11; `docs/CONTENT-PRIVACY-GUIDELINES.md` § 4 |
| 5 | ServerAdmin sees account metadata only, no content | `docs/SERVER-ADMIN.md` |
| 7 | Related persons: name, relationship, optional birthday | `docs/PRIVACY-MODEL.md` (Third parties), `docs/RELATED-PERSONS.md` |
| 8 | Photo places default ON, account-wide opt-out; Android requests `ACCESS_MEDIA_LOCATION` | `docs/PRIVACY-MODEL.md` (#1459/#1478), `android/app/src/main/java/de/eimir/app/PhotoFileChooser.java` |
| 8 | Photon receives only query or coordinates plus language from the backend; default origin `https://photon.komoot.io` | `backend/src/eimir/providers/photon.py`, `place_search.py`, `docs/PHOTO-PLACE-RESOLUTION.md` |
| 8 | Map tiles load in the browser from `tile.openstreetmap.org` with `referrerPolicy: origin`; only on opening a map | `web/src/components/PlaceMapCanvas.tsx`, `web/nginx.conf` (CSP `img-src`) |
| 8 | „In Google Maps öffnen“ passes coordinates only | `web/src/client/photoPlaces.ts` |
| 9 | Immich: personal HTTPS origin and API key, encrypted, account-scoped; selected-item copy; 10-min selection | `docs/product/integrations/1444-photo-source-delivery.md`, `backend/src/eimir/photo_sources/service.py` |
| 9, 14 | Google Photos is gated off (#1467); its OAuth browser binding is the only cookie (`__Host-`, 10 min) | `docs/product/integrations/1444-google-security-gate.md`, `backend/src/eimir/photo_sources/browser_binding.py` |
| 10 | Local Ollama in the deployment; shared content only; weekly insights receive computed observations only; no prompts/outputs in logs | `docs/LOCAL-RECAP-AI.md`, `docs/product/design/references/1546/weekly-ai.md`, `backend/src/eimir/context_tags/jobs.py` |
| 11 | Mails: magic link, signup, verification; notification mail opt-in and content-free | `backend/src/eimir/i18n/locales/de.json`, `backend/src/eimir/engagement/email_delivery.py` |
| 11 | Push on Android only (no browser Web Push): FCM wake payload `type`+`activationId`, or UnifiedPush; FID cleanup; Google's 180-day deletion statement | `docs/PRIVACY-MODEL.md` (#565), `android/app/build.gradle`, `AndroidManifest.xml` |
| 12 | Link previews: explicit action, server-side fetch, nothing persisted | `backend/src/eimir/api/v1/link_previews.py` |
| 13 | Export scopes SHARED/PERSONAL, 24-hour encrypted bundle retention, credentials not exported | `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`, `backend/src/eimir/transfer/service.py` |
| 14 | Browser storage: session in `sessionStorage` (Android: Keystore-encrypted); IndexedDB read cache of shared content, media cache and drafts, each at most seven days; small `localStorage` preferences; service worker caches static files only; everything cleared on sign-out; Android `allowBackup=false` | `web/src/client/sessionPersistence.ts`, `productReadCache.ts`, `durableMediaStore.ts`, `memoryDiaryDraft.ts`, `web/public/service-worker.js`, `NativeSessionStoragePlugin.java` |
| 15 | Application access log: method, path, status, duration, request ID; no IP or payload | `backend/src/eimir/observability/middleware.py` |
| 15 | Rate limiting: SHA-256 of the lower-cased key (email or IPv4 / IPv6 /64), pruned after one day | `backend/src/eimir/auth/rate_limit.py`, `passkey_abuse.py` |
| 15 | Restore re-applies accepted deletions from a pseudonymous journal kept as long as older backups exist | `docs/m6/ACCOUNT-DELETION-RETENTION.md` § 7 |
| 16 | No analytics, advertising or crash-reporting SDK in Web or Android | `web/package.json`, `android/app/build.gradle`, `docs/PRIVACY-MODEL.md` (Analytics) |
| 17 | Pro cannot be purchased yet (no billing provider in Core) | `docs/m6/CLOUD-MANAGED-TOPOLOGY.md` § 3.6, #1525 |
| 21 | Account deletion: emails, credentials, sessions, profile, owner-only content removed; shared history kept under a neutral former-member marker | `docs/m6/ACCOUNT-DELETION-RETENTION.md` § 5 |

Product changes that contradict one of these statements need a new version of
the notice before or with the change (`legal/README.md`).

## Placeholder register

| Placeholder | Needed fact | Notes from the repository |
| --- | --- | --- |
| `EFFECTIVE_DATE` | Date the published version takes effect | — |
| `PROVIDER_NAME`, `PROVIDER_ADDRESS`, `IMPRINT_URL` | Controller identity and imprint | Shared with the terms of use |
| `PRIVACY_CONTACT` | Contact channel for privacy requests | May equal the terms' `CONTACT_EMAIL` |
| `DATA_PROTECTION_OFFICER` | DPO contact, or rewrite the sentence if none is appointed | See open decision 3 |
| `SPECIAL_CATEGORY_LEGAL_BASIS` | Art. 9 legal basis | See open decision 1; blocks publication on purpose |
| `HOSTING_PROVIDER`, `SERVER_LOCATION` | Hoster/processor and region for compute, managed PostgreSQL, media and backups | Single-region, co-located topology (`docs/m6/CLOUD-MANAGED-TOPOLOGY.md` § 3.10) |
| `MAIL_PROVIDER` | SMTP processor | `EIMIR_SMTP_*` |
| `PUSH_PROVIDER` | Contracting Google entity of the operator's Firebase project | Official Android build uses the operator's Firebase project |
| `GEOCODING_PROVIDER` | Photon operator | Default public instance `photon.komoot.io` (komoot), no SLA; review before a managed launch (`docs/PHOTO-PLACE-RESOLUTION.md`) |
| `PAYMENT_PROVIDER` | Payment processor | Shared with the terms; billing #1525 |
| `LOG_RETENTION` | Retention of application and ingress/proxy logs | Ingress IP logging depends on the selected platform |
| `BACKUP_RETENTION` | Backup horizon | Also bounds the deletion journal (`ACCOUNT-DELETION-RETENTION.md` § 7.3) |
| `SUPERVISORY_AUTHORITY` | Competent authority for the controller's seat | — |

## Open decisions before publication

1. **Special categories (Art. 9 GDPR).** Couple content can directly or
   indirectly reveal sexual orientation (a Space with a same-sex partner), sex
   life, health (illness, pregnancy, mood/energy check-ins) and beliefs. Photos
   can be marked as sensitive. The CJEU reads Art. 9 broadly: indirect
   revelation suffices (C-184/20, 1 August 2022), and an operator that processes
   data revealing such information is processing special categories regardless
   of its purpose (C-252/21, 4 July 2023). Art. 9(2) has no contract-necessity
   ground; „manifestly made public“ does not apply to a private Space. The
   reviewer must decide whether the processing falls under Art. 9 and on which
   ground. If explicit consent (Art. 9(2)(a)) is required, it needs its own
   affirmative, specific and withdrawable step at account creation, separate
   from the terms acceptance (Art. 7(2)), plus a defined consequence of
   withdrawal (for example account deletion). That is a product change and is
   not part of this draft; the placeholder keeps the notice unpublishable until
   the decision exists.
2. **Data protection impact assessment (Art. 35 GDPR).** Large-scale processing
   of intimate or special-category data and partner-visible presence/location
   features may require a DPIA (Art. 35(3)(b) and the German supervisory
   authorities' list of processing operations requiring one).
3. **Data protection officer.** § 38(1) sentence 2 BDSG requires a DPO, regardless
   of head count, when processing is subject to a DPIA. Decide together with 2.
4. **Roles and contracts of third parties.** Hoster and mail provider are
   processors (Art. 28). Confirm the roles for Firebase Cloud Messaging
   (processing terms of the Firebase project), the public Photon instance (no
   agreement; consider an operator-run or contracted geocoder before launch)
   and the OpenStreetMap Foundation tile servers (direct browser requests,
   CDN; tile usage policy for production volume; consider an operator-run or
   contracted tile source).
5. **Third-country transfers.** The draft relies on the EU-U.S. Data Privacy
   Framework for Google LLC and on the UK adequacy decision for the
   OpenStreetMap Foundation. Verify both at publication, including CDN
   locations.
6. **Language.** The UI is offered in English, the notice exists only in German
   (`docs/I18N.md`). Decide whether Art. 12 transparency requires an accepted
   English version before launch.
7. **Google Photos.** Section 9 describes the flow while it is gated off
   (#1467). Re-check the text before enabling it.
8. **Pro purchases.** Section 17 is conditional until billing exists (#1525);
   complete it with the payment flow, retention and app-store roles.
9. **Terms acceptance after account deletion.** The record is deleted with the
   Account today. Decide whether evidence of contract conclusion must be kept
   longer (limitation periods) versus data minimization; the notice must follow
   the decision.
10. **Partner presence.** „Jetzt da / vor Kurzem da“ is always on and has no
    personal switch. Confirm the legal basis (contract or legitimate interest
    with objection) or add a control.
11. **Daily check-in history.** Runtime retention is the current and previous
    Space day (ADR 0007), while the weekly-insights design describes eight
    weeks of observations. The notice states the runtime behavior; reconcile
    the product before any retention change and update the notice with it.
12. **Change notification.** Section 24 promises advance notice of material
    changes; define the channel together with the re-acceptance flow for the
    terms.

## Related follow-ups outside this draft

- Imprint (`[[IMPRINT_URL]]`).
- The terms mention voice recordings as an example of content; audio uploads do
  not exist yet (matrix: Short Audio / Voice Notes, M7).
- If OIDC sign-in is enabled for Cloud, add a section for the identity provider.
