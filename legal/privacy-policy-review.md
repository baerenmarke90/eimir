# Privacy policy draft: review notes

Status: drafting baseline for the legal review of
[`de/privacy-policy.md`](de/privacy-policy.md) (version `2026-11-06.draft-2`).
This file is not legal advice and is not shown to users. It records where each
statement comes from, which facts the operator must supply and which decisions
are open, so that the reviewer can check the draft against the product instead
of against assumptions.

Baseline: `main` at `aa62b721aafcb6fd56d4176f46f9f0dcda07d578` (includes the voice notes #1671 and the one-time messages #1673).

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
| 3 | Cloud signup needs only the email address; an omitted display name falls back to a neutral default | `backend/src/eimir/api/v1/auth.py` (`SignupConsumeRequest`), `backend/src/eimir/identity/service.py` |
| 3 | Terms acceptance: version, time and origin (`signup_request` / `signup_redemption`), no IP or device data, deleted with the Account | `backend/src/eimir/legal/models.py`, `docs/product/design/references/terms-of-use-acceptance/README.md` |
| 3 | Cloud sign-in: mailed link or passkey; no local password on Cloud; OIDC only when configured (the Cloud example has none) | `backend/src/eimir/auth/policy.py`, `deploy/cloud-managed.env.example` |
| 3 | Link lifetimes 15 min (magic link, signup proof), 24 h (email verification); unredeemed signup proofs, which hold the plain address, are pruned by the six-hourly maintenance job | `backend/src/eimir/auth/action_tokens.py`, `backend/src/eimir/jobs/maintenance.py` |
| 3 | Passkey record: public key, credential ID, AAGUID, transports, name, flags, last use; biometrics never leave the device | `backend/src/eimir/identity/models.py` (WebAuthn credential) |
| 3 | Sessions: platform, start, last use, hashed tokens; 60-day sliding and 180-day absolute lifetime | `backend/src/eimir/auth/tokens.py`, `backend/src/eimir/identity/models.py` (`DeviceSession`) |
| 4 | Shared vs. owner-only content, server-enforced; partner may edit opted-in shared Story items and export shared content; only the author deletes | `docs/PRIVACY-MODEL.md`, `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md` |
| 4 | Partner presence: one overwritten `last_active_at` per member and Space; partner sees only „now“/„recently“ (2/10 min windows), no timestamp; no personal switch | `backend/src/eimir/relationship/presence.py`, `backend/src/eimir/api/v1/spaces.py` |
| 4 | „Gefühl für heute“/Akku: rows kept for the current and the previous Space day only | `backend/src/eimir/daily_checkins/retention.py`, ADR 0007 § 9 |
| 4 | Moment photos keep readable EXIF/ICC incl. GPS in the original; thumbnails, avatars, other uploads and videos are stripped | ADR 0014, `backend/src/eimir/attachments/videos.py` (`-map_metadata`) |
| 4, 22 | Leaving a Space deletes the leaver's owner-only data there; a zero-active Space is purged after exactly 30 days | `docs/m6/SPACE-OFFBOARDING-LIFECYCLE.md` § 8, `backend/src/eimir/relationship/policy.py` |
| 4 | Voice notes: in-app recording (microphone only while recording; Android `RECORD_AUDIO`) or audio import incl. Android share intent; ≤ 180 s / 20 MiB; normalized to metadata-stripped AAC/M4A; no transcription; parent visibility, export and deletion apply | `docs/product/design/heart-voice-notes.md`, `backend/src/eimir/attachments/audios.py`, `limits.py`, `AndroidManifest.xml` |
| 5 | Application-controlled encryption at rest (required on Cloud Production) for protected payloads and every media object, voice notes included; keys apart from DB and media; plaintext metadata listed; never E2EE | `docs/ENCRYPTION-AT-REST.md` §§ 4, 5, 11; `docs/CONTENT-PRIVACY-GUIDELINES.md` § 4 |
| 5 | ServerAdmin sees account metadata only, no content | `docs/SERVER-ADMIN.md` |
| 6 | One-time messages „Nur für dich“: Pro sending, bilateral per-device reception opt-in; non-extractable RSA-OAEP device keys in IndexedDB, public keys on the server; JWE envelope encrypted on the sending device; client-side metadata-free JPEG; unopened 24 h, claim lease 5 min, envelope destroyed on acknowledgement; withdrawal/discard/opt-out delete pending messages; no export; official dumps exclude the tables, infrastructure snapshots may hold opaque envelopes; neutral push, no email; no audited-E2EE claim | `docs/product/once-messages.md`, `backend/src/eimir/once_messages/service.py`, `web/src/client/onceMessageCrypto.ts`, `scripts/self_hosted_recovery.py` |
| 8 | Related persons: name, relationship, optional birthday | `docs/PRIVACY-MODEL.md` (Third parties), `docs/RELATED-PERSONS.md` |
| 9 | Photo places default ON, account-wide opt-out | `docs/PRIVACY-MODEL.md` (#1459/#1478) |
| 9 | Android delivers photo location only with `ACCESS_MEDIA_LOCATION` (asked once) or the system picker's own metadata consent; declined means photos without location | `android/app/src/main/java/de/eimir/app/PhotoFileChooser.java` |
| 9 | Photon receives only query or coordinates plus language from the backend; default origin `https://photon.komoot.io` | `backend/src/eimir/providers/photon.py`, `place_search.py`, `docs/PHOTO-PLACE-RESOLUTION.md` |
| 9 | Map tiles load in the browser from `tile.openstreetmap.org` with `referrerPolicy: origin`; only on opening a map; the CSP allows no other external image, font, frame or script origin | `web/src/components/PlaceMapCanvas.tsx`, `web/nginx.conf` (CSP) |
| 9 | No live location: no Geolocation API or location permission in Web or Android | `web/src`, `android/app/src/main` (no `navigator.geolocation`, no `ACCESS_FINE_LOCATION`) |
| 9 | „In Google Maps öffnen“ passes coordinates only | `web/src/client/photoPlaces.ts` |
| 10 | Immich: personal HTTPS origin and API key, encrypted, account-scoped; selected-item copy; 10-min selection | `docs/product/integrations/1444-photo-source-delivery.md`, `backend/src/eimir/photo_sources/service.py` |
| 10, 15 | Google Photos is gated off (#1467); its OAuth browser binding is the only cookie (`__Host-`, 10 min) | `docs/product/integrations/1444-google-security-gate.md`, `backend/src/eimir/photo_sources/browser_binding.py` |
| 11 | Local Ollama in the deployment; shared content only; no prompts/outputs in logs | `docs/LOCAL-RECAP-AI.md`, `backend/src/eimir/context_tags/jobs.py` |
| 11 | Eure Woche: the backend computes descriptive observations from visible Vibe/Energy values (selected week plus seven preceding weeks, bounded by retention); the model only selects observation and catalog IDs; no score, diagnosis or personality label | `docs/product/design/references/1546/weekly-ai.md`, `backend/src/eimir/daily_checkins/weekly_review.py` |
| 12 | Mails: magic link, signup, verification; notification mail opt-in and content-free | `backend/src/eimir/i18n/locales/de.json`, `backend/src/eimir/engagement/email_delivery.py` |
| 12 | Push on Android only (no browser Web Push): FCM wake payload `type`+`activationId`, or UnifiedPush; auto-init off; FID cleanup; Google's 180-day deletion statement | `docs/PRIVACY-MODEL.md` (#565), `android/app/build.gradle`, `AndroidManifest.xml` |
| 13 | Link previews: explicit action, server-side fetch, nothing persisted | `backend/src/eimir/api/v1/link_previews.py` |
| 14 | Export scopes SHARED/PERSONAL, 24-hour encrypted bundle retention, credentials not exported | `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`, `backend/src/eimir/transfer/service.py` |
| 15 | Browser storage: session in `sessionStorage` (Android: Keystore-encrypted); IndexedDB read cache of shared content, media cache and drafts, each at most seven days; small `localStorage` preferences; service worker caches static files only; everything cleared on sign-out; Android `allowBackup=false` | `web/src/client/sessionPersistence.ts`, `productReadCache.ts`, `durableMediaStore.ts`, `memoryDiaryDraft.ts`, `web/public/service-worker.js`, `NativeSessionStoragePlugin.java` |
| 16 | Application access log: method, path, status, duration, request ID; no IP or payload. The Web nginx disables its access log for API and health routes; static file requests use the stock log format, and the ingress may log client IPs | `backend/src/eimir/observability/middleware.py`, `web/nginx.conf` |
| 16 | Rate limiting: SHA-256 of the lower-cased key (email or IPv4 / IPv6 /64), pruned after one day | `backend/src/eimir/auth/rate_limit.py`, `passkey_abuse.py` |
| 16 | Restore re-applies accepted Account deletions from a pseudonymous journal before traffic resumes; the journal is kept as long as older backups exist | `docs/m6/ACCOUNT-DELETION-RETENTION.md` § 7 |
| 17 | No analytics, advertising or crash-reporting SDK in Web or Android (Android: AndroidX, Capacitor, UnifiedPush connector, Firebase Messaging/Installations, Nimbus JOSE); no external fonts or update checks | `web/package.json`, `android/app/build.gradle`, `docs/PRIVACY-MODEL.md` (Analytics) |
| 18 | Pro cannot be purchased yet (no billing provider in Core) | `docs/m6/CLOUD-MANAGED-TOPOLOGY.md` § 3.6, #1525 |
| 22 | Account deletion: emails, credentials, sessions, profile, owner-only content removed; shared history kept under a neutral former-member marker | `docs/m6/ACCOUNT-DELETION-RETENTION.md` § 5 |

Product changes that contradict one of these statements need a new version of
the notice before or with the change (`legal/README.md`).

## Placeholder register

| Placeholder | Needed fact | Notes from the repository |
| --- | --- | --- |
| `EFFECTIVE_DATE` | Date the published version takes effect | — |
| `PROVIDER_NAME`, `PROVIDER_ADDRESS`, `IMPRINT_URL` | Controller identity and imprint | Shared with the terms of use |
| `PRIVACY_CONTACT` | Contact channel for privacy requests | May equal the terms' `CONTACT_EMAIL` |
| `DATA_PROTECTION_OFFICER` | DPO contact | See open decisions 2 and 3; most likely required |
| `SPECIAL_CATEGORY_LEGAL_BASIS` | Art. 9 legal basis | See open decision 1; blocks publication on purpose |
| `HOSTING_PROVIDER`, `SERVER_LOCATION` | Hoster/processor and region for compute, managed PostgreSQL, media and backups | Single-region, co-located topology (`docs/m6/CLOUD-MANAGED-TOPOLOGY.md` § 3.10) |
| `MAIL_PROVIDER` | SMTP processor | `EIMIR_SMTP_*` |
| `PUSH_PROVIDER` | Contracting Google entity of the operator's Firebase project | Processor once the Firebase Data Processing and Security Terms are accepted in that project (decision 4) |
| `GEOCODING_PROVIDER` | Photon operator | Default public instance `photon.komoot.io` (komoot), no SLA; review before a managed launch (`docs/PHOTO-PLACE-RESOLUTION.md`) |
| `PAYMENT_PROVIDER` | Payment processor | Shared with the terms; billing #1525 |
| `LOG_RETENTION` | Retention of application, Web server and ingress/proxy logs | Ingress IP logging depends on the selected platform |
| `BACKUP_RETENTION` | Backup horizon | Also bounds the deletion journal (`ACCOUNT-DELETION-RETENTION.md` § 7.3) |
| `SUPERVISORY_AUTHORITY` | Competent authority for the controller's seat | — |

## Operator facts entered (2026-11-14)

The Product Owner supplied the operator facts step by step; they are now in the text (version
`2026-11-14.draft-3`) and in the public imprint of the main site (#1835). The text stays
`status: draft` with `legal_review: pending`.

| Fact | Entered value | Check before publication |
| --- | --- | --- |
| Controller, address, imprint URL, contact | Sole proprietor (name and address as in the imprint), `https://eimir.de/impressum/`, one contact address for imprint and privacy requests | Matches the imprint page |
| Hoster, server location | netcup GmbH (Karlsruhe), servers in Vienna (Austria) | Confirm the contracting entity and site in the netcup contract; the address range was identified as netcup KVM in the RIPE registry |
| Mail | Own mail server run at the hoster (no separate processor) | The processor list names the hoster for it |
| Push | Google Ireland Limited, Dublin (Ireland) | Verify the contracting entity in the Firebase/Cloud terms of the project; the Product Owner confirmed the data processing terms were accepted |
| Geocoding | komoot GmbH, Potsdam (public Photon instance) | Review before a managed launch |
| Payment | None yet; the section names the provider later | New text version when purchases open |
| Logs | 30 days | Confirm the real rotation of application, Docker and proxy logs |
| Supervisory authority | The state data protection authority of the controller's seat (Saarland) | Verify the address with the authority |
| Data protection officer | None designated | Open legal question: Art. 37 may apply because of the special-category content; decide in the legal review |

Still open and intentionally blocking publication:

- `EFFECTIVE_DATE`: set when the Product Owner publishes.
- `SPECIAL_CATEGORY_LEGAL_BASIS`: Art. 9 legal basis (open decision 1).
- `BACKUP_RETENTION`: the Product Owner stated that no backups exist yet, while section 16 and the
  retention list describe regular encrypted backups. The text must not be published until backups are
  set up with a retention period, or the text is changed to match reality. Not having backups is also an
  operational data-loss risk for the stored memories.

## Self-review (2026-11-06)

The Product Owner asked the drafting agent to review the draft itself. The
review checked the mandatory information, re-verified the riskiest factual
claims against the code and verified the legal status of every adequacy
decision and statute the draft relies on. Its limits are stated at the end of
this section.

### Mandatory information

| Requirement | Draft | Result |
| --- | --- | --- |
| Controller identity and contact (Art. 13(1)(a)) | § 1 | Placeholders |
| DPO contact (Art. 13(1)(b)) | § 1.3 | Depends on decisions 2 and 3 |
| Purposes and legal basis (Art. 13(1)(c)) | §§ 3–19 | Present for every purpose; draft-2 adds presence, retained shared content and map tiles |
| Legitimate interests (Art. 13(1)(d)) | §§ 3.5, 4.4, 4.8, 8.2, 9.2, 9.4, 16.4 | Stated for every use of lit. f |
| Recipients (Art. 13(1)(e)) | § 20 | Complete for the current flows (CSP and dependency review) |
| Third-country transfers (Art. 13(1)(f)) | § 21 | Both adequacy decisions verified as current |
| Storage period or criteria (Art. 13(2)(a)) | §§ 3–16, 22 | Concrete periods bound to the code by `test_privacy_policy_statements.py`; logs and backups are placeholders |
| Rights, withdrawal, complaint (Art. 13(2)(b)–(d)) | §§ 23, 24 | Present; the objection right is separate and bold (Art. 21(4)) |
| Requirement to provide data and consequences (Art. 13(2)(e)) | § 3.6 | Present; the Cloud display name is optional |
| Automated decisions and profiling (Art. 13(2)(f)) | § 11 | No Art. 22 decisions; the Eure Woche evaluation is described |
| Data from other sources (Art. 14) | §§ 2.1, 8.4 | Partner: own notice at signup (Art. 14(5)(a)); third persons: public notice and rights path (Art. 14(5)(b)) |
| Transparency (Art. 12) | whole notice | Layered summary, plain language; German only (decision 6) |
| Device storage and access (§ 25 TDDDG) | §§ 9.2, 12.5, 15 | Strictly necessary items under § 25(2) no. 2; Android photo location under § 25(1) |

### Changes in draft-2

- Summary: no unqualified claim that content is never looked at; § 5.4 lists
  the exceptions.
- Grammar in §§ 4.2 and 4.3 and in the summary.
- § 2.4: adults only, as in terms § 4.
- § 4.4: presence based on legitimate interest, with objection (decision 10).
- § 4.8: legal basis for keeping a leaver's shared content, deletion before
  leaving and an objection path (decision 15).
- § 5.2: voice notes are media objects and are encrypted like photos and videos.
- § 7: indirect revelation (C-184/20) and check-in values; no diagnoses or
  personality traits.
- § 8.4: Art. 14 path for people who appear in content without using eimir.
- § 9.2: Android photo location only with the user's permission and the
  consequence of declining.
- § 9.4: map tiles under legitimate interest instead of contract necessity
  (decision 4).
- § 11.2: what Eure Woche evaluates.
- § 16.1: the application log has no IP address; Web server and ingress logs
  may contain it.
- § 16.3: restore order as in `ACCOUNT-DELETION-RETENTION.md` § 7.3.
- § 18: invoices are kept for eight years since 1 January 2025.
- § 20: FCM as processor; UnifiedPush as a service the user chooses.
- § 24: examples of processing the user can object to.

### Legal status verified on 2026-11-06

- **UK adequacy:** renewed on 19 December 2025 until 27 December 2031.
- **EU-U.S. Data Privacy Framework:** in force. The General Court dismissed
  Latombe (T-553/23, 3 September 2025); the appeal C-703/25 P is pending.
  Re-check at publication and keep standard contractual clauses as fallback.
- **Digital Omnibus (GDPR amendments, 2025/0360(COD)):** not adopted. The
  Council agreed its mandate on 21 October 2026; the Parliament position is
  pending. The current GDPR text applies (decision 17).
- **CJEU C-492/23 Russmedia (Grand Chamber, 2 December 2025):** a platform
  operator is a controller of personal data in user content, including Art. 9
  data, regardless of knowledge; hosting liability exemptions do not displace
  GDPR duties. This supports decision 1.
- **Retention of invoices and accounting vouchers:** eight years since
  1 January 2025 (Viertes Bürokratieentlastungsgesetz; § 147 AO, § 257 HGB,
  § 14b UStG); books and financial statements remain ten years.

### Limits of this review

The review checks completeness, accuracy against the repository and internal
consistency, and applies case law and guidance known to the drafting agent. It
is not legal advice, carries no professional liability and can miss newer
developments. Decisions 1, 2, 3, 4 and 15 are judgment calls with real
liability: the Product Owner decides them, and a lawyer or the data protection
officer should confirm them before publication.

## Open decisions before publication

1. **Special categories (Art. 9 GDPR).** Couple content can directly or
   indirectly reveal sexual orientation (a Space with a same-sex partner), sex
   life, health (illness, pregnancy, mood/energy check-ins) and beliefs. Photos
   can be marked as sensitive. The CJEU reads Art. 9 broadly: indirect
   revelation suffices (C-184/20, 1 August 2022), an operator that processes
   data revealing such information processes special categories regardless of
   its purpose (C-252/21, 4 July 2023; C-21/23, 4 October 2024), and a platform
   is a controller of special-category data in user content even without
   knowledge (C-492/23, 2 December 2025). Art. 9(2) has no contract-necessity
   ground; „manifestly made public“ does not apply to a private Space.
   **Recommendation:** treat the processing as Art. 9 processing and rely on
   explicit consent (Art. 9(2)(a)). The product is built for intimate content,
   and two flows reveal special categories in structured form: the couple
   pairing and the Vibe/Energy check-ins with their weekly evaluation. The
   consent needs its own unticked checkbox at Cloud account creation, separate
   from the terms acceptance (Art. 7(2)), a versioned record like the terms
   acceptance, and withdrawal in the settings. Because the service cannot run
   without this processing, conditioning the contract on it is permissible
   (Art. 7(4)), and withdrawal ends the account with the deletion semantics of
   § 22. § 7.3 then names this consent and its withdrawal. This is a product
   change and is not part of this draft; the placeholder keeps the notice
   unpublishable until it exists. Residual risk: special-category data of
   third persons (no consent possible) and of a leaver in retained shared
   content (decision 15). The one-time message consent copy itself says that
   messages can contain intimate texts, photos or audio, and its per-device
   reception opt-in is an existing affirmative step the review may assess.
2. **Data protection impact assessment (Art. 35 GDPR).** **Recommendation:**
   carry one out before launch. The processing meets several criteria of the
   EDPB-endorsed WP248 rev.01: data of a highly personal nature (shared
   diaries and life-logging, criterion 4), innovative technology (local LLM,
   criterion 8), evaluation of personal aspects (Eure Woche, criterion 1) and,
   with growth, large scale (criterion 5). Two criteria usually require a
   DPIA. The German supervisory authorities' list for the private sector also
   names AI that evaluates personal aspects.
3. **Data protection officer.** If a DPIA is required, § 38(1) sentence 2 BDSG
   requires a DPO regardless of head count; at scale, Art. 37(1)(c) GDPR may
   require one anyway. The controller's owner or managing director cannot be
   the DPO (conflict of interest); an external DPO is common. The DPO can also
   confirm this notice and decisions 1 and 4.
4. **Roles and contracts of third parties.** Hoster and mail provider are
   processors (Art. 28). Firebase Cloud Messaging: Google acts as processor
   under the Firebase Data Processing and Security Terms; accept them in the
   operator's Firebase project and record that. Photon: the public demo
   instance has no agreement and no SLA; use an operator-run instance before
   launch. OSM tiles: direct browser requests give the user's IP address to the
   OpenStreetMap Foundation in the UK. A German court denied a legitimate
   interest for comparable third-party font requests when self-hosting was
   possible (LG München I, 20 January 2022, 3 O 17493/20). Serve tiles through
   an operator proxy or self-hosted tiles before launch, after a reuse review;
   §§ 9.4, 20, 21 and 24 then change. The OSMF tile usage policy also limits
   production volume.
5. **Third-country transfers.** Verified on 2026-11-06 (see above); re-check
   both adequacy decisions and CDN locations at publication.
6. **Language.** **Recommendation:** publish an English version before the
   Cloud launch if the English UI is offered there (Art. 12; WP260 rev.01,
   para. 13).
7. **Google Photos.** Section 10 describes the flow while it is gated off
   (#1467). Re-check the text before enabling it.
8. **Pro purchases.** Section 18 is conditional until billing exists (#1525);
   complete it with the payment flow, retention and app-store roles.
9. **Terms acceptance after account deletion.** The record is deleted with the
   Account today. **Recommendation:** keep that; once Pro exists, the billing
   records kept under tax law document the contract.
10. **Partner presence.** „Jetzt da / vor Kurzem da“ is always on and has no
    personal switch; draft-2 bases it on legitimate interest with objection.
    `docs/PRIVACY-MODEL.md` (Location) says presence is off by default; that
    refers to location presence, but the wording invites confusion.
    **Recommendation:** add a personal switch. It makes the objection
    self-service and matches terms § 8.2.
11. **Daily check-in history.** `weekly_review.py` evaluates the selected week
    plus seven preceding weeks, but retention deletes rows after the previous
    Space day, so Eure Woche can only see two days. Reconcile the product.
    Longer retention changes §§ 4.5, 11.2 and 22 and weighs on decisions 1
    and 2.
12. **Change notification.** **Recommendation:** use the channel of the terms
    changes (email and in-app), without acceptance.
13. **One-time messages in Cloud backups.** The canonical dump excludes the
    message and device tables, but Cloud relies on managed database snapshots
    that may contain opaque envelopes until their retention ends. Confirm that
    this matches section 6 and the backup horizon.
14. **Photo places default ON (Art. 25(2) GDPR).** Privacy by default favours
    opt-in for optional processing. The Product Owner decision (#1459) is
    defensible because the partner already receives the original with its
    EXIF, but consider a one-time hint when the first place is derived.
15. **Shared content after leaving or account deletion.** The leaver's shared
    content stays with the partner (§§ 4.8, 22) on the partner's legitimate
    interest; the leaver can object. For intimate images, German courts grant
    the depicted person a deletion claim after the relationship ends (BGH,
    13 October 2015, VI ZR 271/14). With Art. 9 consent (decision 1),
    withdrawal or deletion also removes the ground for the leaver's
    special-category data in retained content. **Recommendation:** offer to
    remove one's own photos, videos and other authored shared content when
    leaving or deleting the account, and keep a support path for content the
    partner authored.
16. **Restore and individually deleted content.** The reconciliation journal
    re-applies Account deletions only. Restoring an older backup can bring back
    individually deleted items. Journal item deletions as well, or describe the
    behaviour in § 16.3.
17. **Digital Omnibus.** If the GDPR amendments are adopted, re-check the
    Art. 9 scope and the information duties.

## Related follow-ups outside this draft

- Imprint (`[[IMPRINT_URL]]`).
- If OIDC sign-in is enabled for Cloud, add a section for the identity provider.
