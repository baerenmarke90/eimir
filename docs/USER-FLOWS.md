# eimir. Critical User Flows

**Status:** Binding UX/product foundation  
**Version:** 1.1  
**As of:** September 15, 2026

This document describes the critical end-to-end flows for the WebApp and Android app. It complements the Screen Templates with transitions, decisions, system responses, and acceptance criteria. The product specification and OpenAPI contract remain the authoritative domain sources.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current design and interaction source. These flows retain their compatible domain outcomes, authorization, privacy, and API constraints. Their screen composition follows the [five reference experiences](./product/design/reference-screens.md), not an implied field order or fixed desktop layout; v1 supersedes conflicting older design guidance unless a later explicit Product Owner decision supersedes it.

## 1. Binding flow rules

- Web and Android produce the same domain outcome; presentation and platform mechanics may differ.
- Every access runs in the current `spaceId` and with an active Membership.
- `OWNER_ONLY` is enforced exclusively server-side and never appears in Story, partner search, Dashboard, partner notifications, or partner export.
- `SPACE_SHARED` means the intentional de-DE product label **„Für uns beide“** in the regular couple UI.
- Android may show the most recently loaded data offline in the MVP, but must **not write offline**.
- Mutable objects carry a `version`; conflicts surface as HTTP 409 and are never silently overwritten.
- Sensitive content appears neither in Analytics nor in logs.
- Every flow has Loading, Empty, Error, Offline, and cancellation behavior where applicable.
- Validate open → interact → save/complete → observe result → return. A created item must remain easy to find; draft safety and restored scope/filter/scroll context are part of the same outcome, not optional polish.
- User-facing flow steps describe the **human outcome and domain invariants**, not a mandatory database-field order. Compact implementations use established mobile/platform patterns and minimize avoidable typing/keyboard activation as required by `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` and `docs/UX-PATTERNS.md`.

## 2. Shared states

```text
Entry → Loading → Ready → Action → Submitting → Success
                    │          ├──────────────→ Validation error
                    │          ├──────────────→ Authorization/not found
                    │          ├──────────────→ Conflict
                    │          └──────────────→ Network error
                    └─────────────────────────→ Read-only offline cache
```

After an error, the last safe input is preserved. The screen explains whether the action can be retried or requires a new decision.

## 3. Flow A — Create an account or sign in

**Goal:** A person securely gains access to their Account and most recently active Space.

**Entry points:** start screen, expired session, protected Deep Link, Invitation.

### Deployment contract

- **Cloud/Managed:** verified self-service Account → own private Space → invite partner. A new couple needs neither an operator bootstrap secret nor an existing Invitation (#923).
- **Self-Hosted:** operator bootstrap for the first local Account → Invitation for every later Account. There is no invitation-free self-service registration.

Clients decide which entry points to offer from `GET /instance/status`, never from a single field standing in for another: `registrationAvailable` is the administrative state, `accountCreation` (`self_service` or `invitation`) is the deployment path, `selfServiceSignupAvailable` combines both, and `auth` lists the sign-in methods of existing Accounts.

### Cloud happy path

1. The person chooses the intentional de-DE entry **„Anmelden“** or **„Gemeinsam starten“**, enters their email address, or selects an existing Passkey.
2. The UI explains the next step without revealing whether another person's email address is registered. **„Gemeinsam starten“** calls `POST /auth/signup/request`, which does the same work and answers the same empty `202` for known and unknown addresses. **„Anmelden“** keeps using the Magic Link request for existing Accounts.
3. The mailed one-time link, Magic Link, or Passkey is confirmed. Redeeming the signup link (`POST /auth/signup/consume`) signs into the Account that already owns the verified address, or creates exactly one new Account bound to it; `accountCreated` tells the client which happened.
4. The client receives a secure session; tokens are not copied into URLs, Analytics, or logs. After redeeming a mailed proof, the client removes it from the address bar and history.
5. If an active Membership exists, the originally requested Deep Link or the intentional de-DE destination `Wir` opens.
6. If no Space exists yet, Flow B starts.

### Self-Hosted variants

- Local password login and OIDC may be offered.
- Provider and server selection happen before the credential step.
- Error messages do not unnecessarily distinguish incorrect input from unknown Accounts.
- Account creation stays operator-controlled: the first local Account requires the one-time bootstrap proof and every later Account an Invitation. The Cloud signup endpoints answer `403 AUTH_METHOD_DISABLED`, even for a genuine proof, and `accountCreation` is `invitation`.

### Errors and branches

- Expired/used/superseded Magic Link or signup link: request a new link while preserving destination context.
- Registration disabled or maintenance: a signup link for an address without an Account fails with `403 REGISTRATION_DISABLED` or `503 MAINTENANCE_MODE` and creates nothing; it stays usable until it expires. Existing Accounts still sign in with it.
- Rate Limit: show the waiting time understandably; no repeated automatic submission.
- Revoked session: close local sensitive caches and sign in again.
- Offline: existing read cache may be shown only after valid local access protection; never pretend authentication succeeded.

**Allowed Analytics:** `auth_started`, `auth_method_selected`, `auth_completed`, `auth_failed` with method and technical error code; never email, token, or Provider claims.

**Acceptance:** Cloud and Self-Hosted paths, Deep-Link return, token revocation, Rate Limit, keyboard, password manager/Passkey, and screen reader are tested.

## 4. Flow B — Create a Space and invite a partner

**Goal:** A person creates a private couple Space and connects exactly one partner.

### Creating person

1. After first login, eimir. explains the private shared Space.
2. The person confirms profile name and optional basic information.
3. The Space is created with `POST /spaces`. The request has no body: the founder is always the authenticated Account. The server allows it only while that Account has no active Membership and serializes it per Account, so a retry or a concurrent request answers `409 ACCOUNT_HAS_ACTIVE_SPACE` and the client selects the existing Space through `GET /auth/memberships`. Ended relationship history is never reactivated or merged; a new Space is always fresh.
4. An Invitation is created through a deliberately selected channel with the existing one-time, expiring, revocable Invitation (`POST /spaces/{spaceId}/invitations`).
5. The UI shows status, expiry, and the intentional de-DE action **„Einladung widerrufen“**.
6. Until acceptance, the app remains usable wherever the particular feature does not require a partner.

### Invited person

1. The Invitation link opens app/Web and shows a neutral, non-sensitive preview.
2. Before acceptance, sign-in or Account creation occurs. On Cloud an unknown person uses the same signup link as in Flow A and then accepts with `POST /invitations/accept`; the client keeps the Invitation token out of URLs and does not create an own Space in between. On Self-Hosted a new Account is created together with the acceptance (local registration with the Invitation, or OIDC started with it). In both modes a disabled registration blocks new Accounts but not existing ones.
3. The inviting person's name and the effect of the connection are confirmed.
4. The one-time token is redeemed atomically.
5. Both clients update Space and Membership state.
6. The new person enters a short shared onboarding and then lands on the intentional de-DE destination `Wir`.

### Required branches

- Token invalid, expired, revoked, or already used.
- Space already has two active partners.
- Two concurrent acceptances: exactly one may succeed.
- Person is already a member.
- Wrong Account: sign out/switch Account without leaking the token into history or telemetry.

**Privacy:** Invitation preview shows no Memories, preferences, or other Space content.

**Allowed Analytics:** `space_created`, `invitation_created`, `invitation_revoked`, `invitation_completed`, `invitation_failed`; no token, email, or partner names.

## 5. Flow C — Capture a Memory with optional media/context

**Goal:** Safely capture a shared Memory and make it available in Momente without turning capture into database entry.

**Privacy class:** `SPACE_SHARED`. A private note is a separate `OWNER_ONLY` domain and not a hidden Memory mode.

### Human flow

1. Entry through Momente or an intentional contextual/Quick Action such as **„Erinnerung hinzufügen“** / **„Moment festhalten“**.
2. The person starts with the content that expresses the Memory: for example a photo/media item, a thought/text, or another domain-supported capture entry. The UI does not require a title-first sequence merely because the persistence model contains a title.
3. Required Memory information and any useful context are completed with the least-friction appropriate controls. Dates/times and bounded choices use established picker/selection patterns; optional metadata remains progressive. Media can be selected, previewed, validated, removed, retried, and described where relevant.
4. Before completion, the UI communicates the `SPACE_SHARED` result with understandable intentional de-DE product copy such as **„Mit Partner geteilt“**. Sharing is a domain state, not an optional marketing promise.
5. With connectivity, the authoritative Memory is created according to the API contract and media processing/upload state remains visible. Implementation details such as whether the object or upload request is persisted first must not leak into the interaction model.
6. Success presents the captured Memory in its meaningful product context and refreshes affected Momente/Wir read models.

### Interaction invariants

- The Compact capture path minimizes unnecessary typing and does not summon the software keyboard before the person chooses a text-entry task.
- The primary capture action remains reachable with the keyboard/IME visible.
- Optional metadata must not block fast capture when the domain does not require it.
- Established platform/media/date selection patterns are reused unless a documented product need requires otherwise.

### Media states

```text
selected → validating → uploading → processing → ready
                              └──────────────→ failed → retry/remove
```

- The client does not trust file extension or reported MIME type alone.
- A failed media item does not automatically discard the whole draft.
- Non-public media is loaded only through an authorized route or a short-lived signed URL.

### Errors

- Offline while saving: intentional de-DE state **„Noch nicht gespeichert“**; retain the draft locally in the form but do not represent it as synchronized content.
- Validation: show field/control errors directly at the affected input or decision.
- Upload failure: Retry/Remove per file.
- 409: Flow H.
- 404 after Deep Link: neutral unavailable state without confirming existence.

**Allowed Analytics:** `memory_create_started`, `memory_create_completed`, `memory_create_failed`, `attachment_upload_failed`; no titles, text, dates, filenames, or media characteristics.

## 6. Flow D — Capture a HeartMoment privately or shared

**Goal:** Capture an emotional moment with deliberate visibility and minimal interaction overhead.

### Human flow

1. The person captures the thought/emotional content using the established HeartMoment composition. Text, emotion, media, or other supported context is presented according to the human task rather than a generic field stack.
2. Visibility is a required, understandable decision before completion: intentional de-DE **„Nur für mich“** (`OWNER_ONLY`) or **„Mit Partner teilen“** (`SPACE_SHARED`). The control uses the established visibility pattern rather than exposing API terminology.
3. Before the first switch to shared, the UI briefly explains that the content becomes visible in the shared Space.
4. Optional context is progressively disclosed and must not obscure the emotional content or privacy decision.
5. After saving, the resulting detail/product state shows the Privacy label and Sync result while keeping the HeartMoment content as the primary meaning.

### Interaction invariants

- Capture does not require a generic title or metadata-first sequence unless the domain specification explicitly makes that information necessary.
- Important privacy state is recognized from visible text/icon state; it is never hidden behind a gesture or color alone.
- Established mobile selection, media, Back, and completion patterns are reused unless a documented product reason requires deviation.

### Domain invariants

- `OWNER_ONLY` appears only to the owner, including Lists, Search, Story, Dashboard, notifications, Export, Attachments, and relations.
- Comments are available only for shared HeartMoments.
- Changing Privacy class requires connectivity and the current `version`.
- When switching from shared to private, the UI explains that already read content cannot be made unseen.

**Allowed Analytics:** `heart_moment_create_started/completed/failed`, optionally Privacy category as a coarse class; never text or emotion when classified as sensitive.

## 7. Flow E — Develop a Wish into a Plan

**Goal:** Turn an idea into a concrete Plan transparently and complete it.

### Flow

1. A Wish is created as `OPEN`.
2. Location or additional information may optionally be linked.
3. The intentional de-DE action **„Als Plan weiterführen“** opens a preview of transferred data.
4. Confirmation creates/links the Plan in `IDEA` or `PLANNED` according to the input.
5. Wish state and relation are updated in one domain transaction.
6. After the experience, the Plan becomes `COMPLETED`.
7. It may optionally be assigned to a Chapter; original content remains independent.

### Rules

- Wishes and Plans are `SPACE_SHARED` in the Core unless the product specification defines a private variant.
- An unfinished Plan can move back to Wish state in a controlled way.
- A recommendation/discovery experience inside `Momente` creates a Wish or Plan only after explicit confirmation.
- Deleting a Chapter removes links, not Memories or Plans.

### Errors

- Duplicate confirmation must not create duplicates.
- 409 exposes current and own version; Flow H.
- Feature not enabled/entitled: clear explanation, no disabled dead end.

## 8. Flow F — Search Momente and open content

**Goal:** Safely filter/search the shared history and open content through a Deep Link.

### Flow

1. Momente loads cursor-based and grouped according to the current timeline/product composition.
2. Type/year filters and Search are processed server-side with Space and Privacy filtering.
3. Selection opens a page on Compact and the Detail Pane on Expanded when the selected composition supports it.
4. Back restores search term, filters, selection, and scroll position.
5. The intentional de-DE feature **„Weißt du noch?“** links to originals and creates no copy.

### Privacy

- Momente contains Memories, Milestones, and shared HeartMoments — never `OWNER_ONLY`.
- 404 is treated identically for nonexistent and unauthorized privacy-sensitive resources.
- Result count, load time, and response size must not reveal private partner content.

**Allowed Analytics:** search start and result class only in aggregate; no search text, content title, or resource ID.

## 9. Flow G — Read offline and handle write attempts safely

**Goal:** Android remains understandable during connectivity loss without pretending unsupported offline synchronization exists.

### Read

1. The last authorized read cache may be shown with the intentional de-DE copy **„Offline · Stand …“**.
2. Cache content preserves Privacy and Space boundaries.
3. Sign-out, session revocation, or Space change locks/removes the corresponding cache according to the security model.

### Write

1. Missing connectivity is detected before or during submission.
2. The action does not end in `success` or `synced`.
3. Intentional de-DE message: **„Noch nicht gespeichert. Verbinde dich mit dem Internet und versuche es erneut.“**
4. Form input may be retained as a local draft in the current secure context.
5. After reconnection, Retry begins only through deliberate action; no uncontrolled background transfer in the MVP.

### Acceptance

- Airplane mode before and during the request.
- Connectivity loss after upload starts.
- Process restart with and without local draft.
- Account/Space switch with existing cache.
- UI never shows the de-DE claims **„Offline gespeichert“** or **„wird später synchronisiert“**.

## 10. Flow H — Resolve a version conflict

**Goal:** Concurrent changes are never silently overwritten.

### Flow

1. Client sends the loaded `version` with the update.
2. API returns 409 with a stable error code on mismatch.
3. Client loads the current server version.
4. UI shows the intentional de-DE message **„Dieser Inhalt wurde inzwischen geändert.“**
5. The person can accept the current version or copy/reapply their own input.
6. Another save uses the new `version`.

### Rules

- Automatic merge is allowed only for demonstrably safe field-wise independent changes.
- Privacy class, deletion, and Membership are never merged automatically.
- If the target was deleted, no overwrite option is offered.
- Conflict details contain no unauthorized content.

## 11. Flow I — Data export and account protection

**Goal:** Receive one's own data portably and perform sensitive Account actions deliberately.

### Export

1. Export scope and excluded security data are explained.
2. Re-authentication may be required.
3. An Export job is started; its status remains discoverable later.
4. Download is time-limited and authorized again.
5. Transfer Bundle contains Manifest, checksums, domain files, and media — no passwords, Passkeys, tokens, sessions, or Push Tokens.

### Account/Space actions

- Sign out, revoke session, delete Account, and delete Space are separate flows.
- Partner removal is not available in the MVP.
- Before destructive actions, scope, retention period, and recoverability are explained.
- Concrete retention periods must be decided and made binding before Cloud launch.

## 12. Flow acceptance per platform

Every flow is verified at minimum for:

- Web: keyboard, screen reader, 200% text zoom, Browser Back, direct URL.
- Android: TalkBack, large text, System Back, process restart, read cache.
- Compact, Medium, and Expanded.
- Cloud and Self-Hosted where authentication or Provider differences matter.
- normal Membership, foreign Space, `OWNER_ONLY`, expired session.
- Loading, Empty, Validation, 401, privacy-safe 404, 409, 429, Offline, and server failure.
- established platform/mobile interaction patterns or a documented deviation;
- first-time discoverability without relying on hidden gestures or memorized controls;
- minimized avoidable typing and keyboard burden on Compact.

## Related documents

- [Product Specification](../specification/PRODUCT-SPEC.md)
- [Information Architecture](./INFORMATION-ARCHITECTURE.md)
- [UX Patterns](./UX-PATTERNS.md)
- [API/UI Contracts](./API-UI-CONTRACTS.md)
- [Accessibility and QA Matrix](./ACCESSIBILITY-QA-MATRIX.md)
- [Content and Privacy Guidelines](./CONTENT-PRIVACY-GUIDELINES.md)
