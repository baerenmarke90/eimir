# Decision 0013: Temporary migration from `de.sidebyside.app` to `de.eimir.app`

**Status:** Proposed (design preflight, no implementation)  
**Date:** October 21, 2026  
**Owning issues:** #565 (package decision, FCM), #1331/#1332 (sideload update channel)  
**Builds on:** [ADR 0011](0011-web-first-pwa-capacitor-mobile-delivery.md),
`docs/CAPACITOR-ANDROID-FOUNDATION.md`, Draft PR #1392 (`codex/565-live-fcm`)  
**Does not change:** the package decision in #565 (`de.eimir.app` is a new application identity, the
former package stays a separate installation) or anything in PR #1392.

## Context

The Product Owner replaced package continuity with the fresh identity `de.eimir.app` (Firebase-registered) on
2026-10-20. #565 additionally forbids silently copying cross-package credentials and deleting the existing
installation or its data. On 2026-10-21 the Product Owner added: **a temporary migration from the old test
app to the new one MUST be possible**; without it the tester loses the signed-in state and local state of the
test APK. The migration may be temporary.

Terms used below: **L** = legacy app `de.sidebyside.app` (test channel `0.2.0-test.N`, sideload updater from
#1331); **S** = successor app `de.eimir.app`. Both can be installed side by side on one phone.

## 1. What lives where

Inventory taken from the code on `main` (`ff274b23`) and `codex/565-live-fcm` (`8bc54112`). The wrapper keeps
no native product-data cache (`docs/CAPACITOR-ANDROID-FOUNDATION.md`, "Reading older documents").

| State | Location in L | Authoritative copy | Migration treatment |
| --- | --- | --- | --- |
| Account, Spaces, relationship content, media | server | server | Nothing to migrate; S reads it after sign-in. |
| App icon choice | server (`app_icon_preferences`, per Account + Space), applied natively | server | Re-applied by S after sign-in. |
| Notification preferences (#638), Quiet Hours | server | server | Nothing to migrate. |
| Encrypted session envelope (`NativeSessionStorage`, Keystore AES-GCM, no-backup file) | L sandbox | server (`DeviceSession`, refresh family) | **Not copied.** S obtains its own session (see §3). |
| Web session copy (`sessionStorage` key `eimir-session-v1`) | L WebView | server | Dies with L; never read by S. |
| Read cache (IndexedDB `sidebyside-web-read-cache`, 7-day TTL) and authorized media cache | L WebView | server | Non-authoritative; S rebuilds it. Not migrated. |
| Drafts | memory only (`profilePreferenceDraft`, `importantDateDraft`, `attachmentDraftState`, composer state); attachment draft uploads are already on the server | server for uploads | Nothing persisted locally. The handoff UI must still use the existing document-leave/draft guard so an open unsaved draft is never discarded by switching apps. |
| Theme preference, product-tour "seen", WishDetective hide flag (`localStorage`/`sessionStorage`) | L WebView | none | Cosmetic. Re-chosen or re-shown in S. Not worth a transfer channel. |
| UnifiedPush endpoint ids and pending revocations (`eimir-unifiedpush-endpoint-v1:*`), connector registration held by the distributor under L's package | L sandbox + distributor | server (`PushEndpoint`, Account-owned) | **Must be revoked.** Only L knows the endpoint ids. See §4. The published test line may not contain UnifiedPush at all (#565 states the published test.13 lacks the receiver); verify the installed build before building push-specific steps. |
| Updater cache/state (`sideload` source set) | L cache dir | public GitHub catalog | Discarded with L. |
| `LegacyNativeDataCleanup` marker | L sandbox | none | Irrelevant. |

Conclusion: the only local state with business meaning is the **signed-in state**. Everything else is either
server-authoritative or cosmetic. This keeps the migration small.

## 2. Options and reuse review (`docs/REUSE-BEFORE-BUILD.md`)

Order of consideration: open standard, platform capability, framework capability, open-source component,
provider, custom.

| Candidate | Finding |
| --- | --- |
| **A. Fresh sign-in in S** (existing magic link / OIDC; Cloud disables local passwords) plus manual cleanup of L | Zero new code, always available, already what #565 verifies ("fresh authentication into the existing Account/Space"). Costs: depends on mail delivery and on the email App Link reaching S, no automated revocation of L, no carried-over login. **Kept as the guaranteed floor and fallback.** |
| **B. Server-mediated one-time handoff with PKCE binding, transported by an Android explicit-intent result** | Selected as the carry-over path. Uses RFC 7636 (PKCE) semantics, the token-exchange idea of RFC 8693 (a refresh token is the subject proof) and the Android activity-result mechanism, which only returns to the caller. Detailed in §3. |
| RFC 8628 device authorization grant (S shows a code, any signed-in client approves) | Right shape for cross-device sign-in, but needs an approver UI in some signed-in client; L (test.N) has none and a browser session is a different session. Not rejected as a product feature: the server primitive in §3 is deliberately generic so this can reuse it later. Not built now. |
| Copy session through shared storage, `ContentProvider`, clipboard, broadcast, `sharedUserId`, or Account Manager | Prohibited by #565 (cross-package credential copying) and technically weak: `sharedUserId` is deprecated, cannot be adopted by already installed packages with different identity, and any exported channel is an interception target. Rejected. |
| Auto Backup / device-to-device transfer, Block Store | Per-package; the manifest keeps no-backup storage deliberately; credentials must not enter backups. Rejected. |
| HTTPS App Link or custom-scheme URL carrying the ticket | A URL goes through browser/history/other handlers, and both packages may claim the same verified host during the overlap (§4). Rejected as the transport for the same-device handoff (the emailed magic link in A still uses it, as today). |
| QR code / typed code between two devices of the same user | Useful only for different devices; same-device is the real case. Rejected here. |
| OAuth/OIDC server library (e.g. Authlib) | The handoff is first-party, two endpoints, and sits on `eimir.auth.action_tokens`, `sessions`, `rate_limit` already in the repository. A new dependency would add surface for no gain. Not adopted. |
| Capacitor plugins for cross-app launch | `@capacitor/app` exposes launch URLs only, not activity results. A small native plugin using Capacitor's own `@ActivityCallback` is the platform-conformant route. |
| In-repo reuse | `eimir.auth.action_tokens` (hashed one-time tokens, subject lock, supersession), `sessions.start_session/revoke`, `rate_limit`, the `security_retention` prune job, `NativeSessionCipher`, the `sideload` source-set/flag pattern from #1331, the `TEMPORARY_UPGRADE_MIGRATION` classification from the Capacitor foundation. |

Custom code is needed only for the two endpoints, their table and the thin native/React glue. No new
third-party dependency is required. License/ToS/cost review for third parties: not applicable.

## 3. Decision: handoff protocol (Option B) with Option A as floor

### Invariants

- No credential crosses the package boundary. The only object crossing it is a **single-use redemption ticket**
  that is useless without a secret that never leaves S (the PKCE verifier). The server issues S its own
  session family; the refresh token of L is never read by S.
- The handoff is a **move**, not a copy: after a successful redemption L's session is revoked.
- Failure never reduces what the user has: a failed or abandoned handoff leaves L signed in; A remains
  available.

### Preconditions

1. S is installed through the declared channel (#565 completion item 5).
2. L is updated once to a **bridge release** (same package, same signing key, higher `versionCode`) through the
   existing #1331 updater. The bridge adds only the "move to the new app" route, removes its own claim on the
   verified email-link paths (§4) and shows a "replaced" notice after revocation. A plain A migration needs no
   bridge.

### Flow

```
S (IdentityEntry)               L (bridge release)                 server
-----------------               ------------------                 ------
1. user taps "Continue from
   the previous test app"
   (only shown if L installed
   and its signer == pinned cert)
2. verifier = CSPRNG(32 B),
   challenge = S256(verifier),
   state = CSPRNG; verifier is
   kept in S private storage
   (Keystore-wrapped, TTL 5 min)
3. startActivityForResult(
   explicit component of L,
   extras: challenge, state)
                                4. verify getCallingActivity():
                                   package == de.eimir.app AND
                                   signing cert == pinned set;
                                   else RESULT_CANCELED, no UI
                                5. confirmation sheet (names the
                                   target app, says L will be
                                   signed out); respects the draft
                                   guard
                                6. disable device push if active
                                   (existing path), then
                                   POST /auth/device-handoff
                                   { refreshToken, codeChallenge,
                                     codeChallengeMethod: S256,
                                     targetClient } ------------->  7. verify refresh token
                                                                      (possession, no rotation),
                                                                      store hash(ticket),
                                                                      challenge, account,
                                                                      source session; TTL 120 s
                                <-------- { ticket, expiresAt } --
                                8. setResult(ticket, state);
                                   finish()
9. receive result in the same
   process/launcher; check state
10. POST /auth/device-handoff/redeem
    { ticket, codeVerifier,
      deviceName, platform } ------------------------------------>  11. one transaction:
                                                                      lock ticket, check unused,
                                                                      unexpired, S256(verifier)
                                                                      == challenge, account in
                                                                      good standing, source
                                                                      session still active;
                                                                      mark consumed;
                                                                      start_session(new);
                                                                      revoke(source)
    <------------------------------ TokenView ------------------
12. store through the existing
    session facade (S Keystore
    slot); continue normal
    bootstrap
                                13. on next foreground the refresh
                                    fails (401) -> existing path
                                    clears L's local session; the
                                    bridge shows the "replaced"
                                    notice
```

Why this shape:

- The result of `startActivityForResult` is delivered only to the calling activity. There is no URL, broadcast,
  clipboard or exported provider that a third app can observe.
- Step 4 is the security-critical check. A hostile app can choose its own challenge, so L must refuse every
  caller other than S, identified by `getCallingActivity()` **and** its signing certificate (not by package
  name alone). The calling component must also pass an exported-activity guard (explicit signature-level
  permission when both apps share the test key; certificate pinning in code when they do not — see open
  question 3). No intent extra, ticket or verifier is logged.
- The mint requires the **refresh token**, not just an access token. A stolen 15-minute access token must not
  be convertible into a long-lived session. This also keeps the endpoint independent of recent-auth, which
  would force a full re-authentication in L and defeat the purpose.
- The server revokes L's session at redemption, not at mint. An abandoned handoff therefore changes nothing.
- A lost redeem response (server committed, S never saw it) leaves S unauthenticated and L revoked. This is an
  explicit, accepted edge case: the user falls back to A. The redeem endpoint is deliberately not made
  retry-idempotent, because that would require storing reusable token material.

### Server contract

- New table `device_handoff_tickets` (separate table per flow, consistent with `action_tokens.py`): hashed
  ticket (SHA-256), account id, source `DeviceSession` id, `code_challenge`, target client enum, created,
  expires (120 s), consumed. Retention via the existing `security_retention` job (24 h after expiry).
- `POST /auth/device-handoff` (authenticated session + refresh token proof) and
  `POST /auth/device-handoff/redeem` (unauthenticated, rate-limited). Strict request models, generic problem
  responses that do not distinguish unknown, expired, consumed or wrong verifier.
- Rate limits through `eimir.auth.rate_limit`: mint per session, redeem per source address and per ticket hash.
- Operator switch `EIMIR_DEVICE_HANDOFF_ENABLED` (default off; enabled on `eimir-test` for the window). Disabled
  means the endpoints answer as if absent. Self-Hosted default behavior is unchanged.
- Refusals: demo-authority accounts, accounts in deletion/offboarding, revoked or expired source sessions.
- Security events (no secrets): `device_handoff_minted`, `device_handoff_redeemed`, `device_handoff_rejected`.
- OpenAPI plus regenerated TypeScript client; Alembic revision with a reversible downgrade (dropped at sunset).

The endpoints are named and shaped generically (not "legacy") so they stay valid if a general "sign in on a
new device" feature later reuses them.

### Fallback path A (also the documented manual guide)

1. Install S; open it; request a magic link for the Account's address; open the link on the phone and choose
   S if Android asks which app should open it (§4).
2. Confirm that the Space and shared content are visible.
3. In L: Settings → sign out (this disables device push through the existing sign-out cleanup).
4. Uninstall L through Android settings **only after** step 2 is verified. L's local data disappears with it;
   there is nothing to export (§1). No code deletes L automatically (#565).

## 4. Parallel operation

- **Duplicate push.** In-app and email channels are Account-level and unaffected. Push is device-bound.
  Rules: S never enables push before the user does; L (bridge) disables its registration before minting; the
  server revokes L's session at redemption. A residual risk remains if L held an endpoint but cannot run the
  bridge. The server does not currently link `PushEndpoint` to `DeviceSession`, so a revoked session does not
  disable its endpoints. Recommended hardening, **separate issue, not bundled into #1392**: nullable
  `device_session_id` on push endpoints, set at registration, with endpoint disablement on session
  revocation. Before investing, the operator should check whether any L-owned endpoint exists for the two
  Accounts (`push_endpoints`: provider, created, disabled).
- **Email/App Link ambiguity.** `demo.eimir.ur-cloud.de/.well-known/assetlinks.json` currently lists L's
  certificate. During the window both packages may be listed so S verifies; if L still claims the same five
  paths, Android shows a chooser or uses a stored preference. The bridge release removes L's claim, and
  `assetlinks.json` drops L's package at sunset. OIDC callbacks use per-package custom schemes
  (`de.eimir.app://…` in S) and need the matching redirect registered for `eimir-test` if OIDC is enabled
  there; verify, do not assume.
- **Updater.** L's updater correctly refuses an APK of another package (package identity check). S has its own
  catalog (#565/#1331 adaptation). The bridge release does not widen this check; it only shows instructions
  and a link to S's release page. Installing S stays a deliberate user action.
- **FCM.** Not present in L (the Firebase app is registered only for `de.eimir.app`); the bridge variant must
  be built without the Google Services plugin so package matching never conflicts.
- **Bridge build source.** Recommended: a maintenance branch cut from the last released L source commit plus
  the small migrate-out change, published through the existing L catalog. It keeps `main` free of the legacy
  application ID and of the FCM/package mismatch, and keeps L's API contract frozen to what already runs
  against the server. Trade-off: the migrate-out route is written against L's older generated client
  (a small hand-typed request for the two new endpoints). Alternative (rejected for now): a `legacy` build
  variant on `main`, which reintroduces the old application ID and requires excluding FCM per variant.

## 5. Sunset and rollback

Temporary by construction:

- **Classification:** `TEMPORARY_UPGRADE_MIGRATION` in the Capacitor native inventory. Everything lives behind
  the `sideload` source set in S, a bridge-only L release, a build flag (`VITE_EIMIR_LEGACY_MIGRATION`) and the
  server flag. A tracking issue with the removal checklist is opened together with the first implementation PR.
- **Exit criteria (any of):** both testers confirm migration and L is uninstalled; or a hard stop date set by
  the Product Owner (proposal: 2026-12-31, to be confirmed). Exit evidence: no active L session in the
  database for the two Accounts.
- **Removal:** disable the server flag; delete S's migration source set and flag; drop the table (Alembic
  downgrade/new revision) and the two endpoints unless the generic sign-in feature has adopted them; remove
  L from `assetlinks.json`; delete the `<queries>` entry; remove the bridge notice. No product data is
  affected.
- **Rollback during the window:** server flag off stops new handoffs and never touches existing sessions. If S
  misbehaves before redemption, L is untouched. After redemption, L signs in again through A and continues as
  a regular client until its API support ends (declare L supported until the sunset date, because L is frozen
  while the API evolves).

## 6. Privacy and security consequences

| Topic | Assessment |
| --- | --- |
| Ticket interception | Bound to S256 challenge, 120 s, single use, hashed at rest. Useless without the verifier, which stays in S. |
| Impersonation of S toward L | Calling package plus signing certificate verification, signature-level exported-activity guard, explicit user confirmation naming the target app. Negative instrumentation test with a hostile caller APK is mandatory. |
| Stolen access token | Cannot mint (refresh token proof required). |
| Account takeover through enumeration/guessing | 256-bit tickets, generic errors, rate limits per session/address/ticket hash, security events. |
| Package visibility | S needs `<queries>` for `de.sidebyside.app` to hide the action when L is absent. It reveals only whether L is installed, only in the temporary source set. |
| Local secrets | Verifier and `state` in S are Keystore-wrapped no-backup storage with TTL; never in `localStorage`, logs, URLs or analytics. |
| Data lifecycle | Nothing from L's local state is exported or copied. Ticket rows are pruned. Account deletion/offboarding invalidates pending tickets. No new personal data category, no new provider. |
| Demo mode | Handoff refused for demo authority sessions. |
| Session accounting | A move leaves exactly one live session of the pair; replay detection of the old family remains unchanged. |

## 7. Business / freemium consistency

**No business/freemium impact.** The capability falls under the matrix row "Authentication security, Passkeys
& Session protection": **Non-paywallable**, identical on Cloud and Self-Hosted
(`docs/FREEMIUM-FEATURE-MATRIX.md`). No entitlement, quota, retention, managed-resource or pricing change, no
degraded Self-Hosted behavior; the server flag is off by default. Operating cost is two small requests per
migrated device. No matrix update is required. Re-evaluate before merge only if the endpoints are generalized
into a user-facing "sign in on a new device" feature, which would need its own classification.

## 8. Cross-cutting assessment (`docs/CROSS-CUTTING-QUALITY.md`)

- **Security/authorization:** §6. Ticket scope is the issuing Account and source session only.
- **Privacy/lifecycle:** §1, §6. No local state is exported; tickets are short-lived and pruned.
- **Internationalization:** all new strings in the localization layer; dates/times (none shown) not needed.
- **Accessibility:** confirmation sheet with focus management and TalkBack labels; no time-boxed interaction
  visible to the user (120 s is a transport bound); status announcements for success/failure; reduced motion.
- **Concurrency/consistency:** consume and revoke in one transaction with the ticket row locked
  (`lock_subject` pattern); double tap and parallel redemption yield exactly one session.
- **Resilience:** S killed while L is in the foreground (verifier persisted, TTL); offline mint/redeem show a
  retryable state; lost redeem response falls back to A (§3).
- **Observability:** low-cardinality counters and the three security events; no secrets in logs or metrics.
- **Performance:** negligible.
- **Contracts/migrations:** two OpenAPI operations, regenerated client, one reversible migration.
- **Operations/Self-Hosted:** default off; documented operator flag; sunset removal in §5.
- **Testing:** §9.

## 9. Test plan

Backend: PKCE success and mismatch, expiry boundary, single use under concurrent redemption, replay,
source-session revoked or expired between mint and redeem, refresh-token proof required (access token alone
rejected), another Account's refresh token, account in deletion, demo refusal, flag off, rate limits, generic
error equivalence, retention prune, migration upgrade/downgrade drift, tenant-isolation matrix entry, log
scrubbing.

Web/native unit: verifier/challenge generation, TTL persistence across process death, state mismatch,
signer verification against genuine and spoofed certificates, calling-package check, extras validation,
fail-closed behavior when L is absent or re-signed, draft-guard integration, i18n and component states.

Instrumentation (API 28 and 36): install L-bridge and S, run S → L → S, kill S mid-flow, hostile caller APK
that targets L's activity with its own challenge (must be refused with no UI and no mint), L re-signed with a
different key (S hides the action), L absent.

Physical acceptance on the real Pixel: both apps installed, handoff, S shows existing Space data, L is
signed out on next foreground and shows the notice, no duplicate push (if L had push), uninstall L and confirm S
unaffected, then a same-package S upgrade preserves the session. Fallback A exercised separately. JVM and
bridge tests do not establish the physical outcomes.

## 10. Product design preflight (to complete before UI work)

User-facing surfaces are small but real: an optional secondary action in S's IdentityEntry, and in the bridge
release a confirmation sheet plus a "replaced" notice. Before implementation `AGENTS.md` still requires, per
surface: a generated whole-screen Compact visual reference against current `main` (IdentityEntry in S; the
actual L Settings/entry in the bridge baseline), the owning screen template, reused components and tokens,
the Mobile Interaction Contract, Loading/Error/Offline/Success states, motion and reduced-motion behavior.
Draft contract:

- Focal point: the Account the user is moving; primary action "Move sign-in to the new app" (S side: "Continue
  from the previous test app"), secondary "Not now".
- No technical terms (ticket, PKCE, package names) in normal-user text; the target app is named by its
  product name.
- Never interrupts an unsaved draft; confirmation is explicit and cancellable; success returns to the normal
  S entry flow.
- Compact is the reference; Expanded only matters for the Web build and the surface is hidden there.

These references are not generated by this preflight because no UI is being implemented here.

## 11. Proposed implementation PRs

| # | PR | Depends on | Notes |
| --- | --- | --- | --- |
| 0 | Tracking issue (this decision as issue text), manual migration guide for A, operator checks (existing push endpoints/sessions for the two Accounts, assetlinks and OIDC redirect plan, which L builds contain UnifiedPush) | none | Delivers the guaranteed floor now. |
| 1 | Backend: handoff table, service, two endpoints, flag, rate limits, retention, OpenAPI + client, tests | none (flag off) | Independently mergeable. |
| 2 | S: `sideload` migration source set (native result plugin, signer verification, verifier custody), IdentityEntry action, i18n, tests | PR 1, #1392 merged | Visual reference first. |
| 3 | L bridge release from a maintenance branch: migrate-out route, claim removal for email paths, replaced notice; published through the existing L catalog | PR 1 | Needs signing custody of the existing test key. |
| 4 | Ops/docs: assetlinks listing both packages for the window, operator flag enablement on `eimir-test`, device acceptance record | PR 1–3 | No source behavior change. |
| 5 | Optional: push endpoint ↔ device session binding | separate issue | Only if step 0 finds L-owned endpoints or the gap is wanted generally. |
| 6 | Sunset removal PR (checklist from §5) | exit criteria | Prepared with PR 2. |

## Open questions for the Product Owner

1. Does "keep the login" mean a seamless carry-over (then PR 1–4), or is a quick fresh sign-in via A enough
   for the two testers (then only PR 0)? Recommendation: build B, ship A first.
2. Acceptable stop date for the window (proposal 2026-12-31)?
3. Will S be signed with the same test key as L? Same key allows the signature-level permission guard;
   a different key requires certificate pinning per package only. Either works; this decides the guard form.
4. Is a hard "move" (L revoked at redemption) the wanted semantics, or should both stay signed in until the
   user signs out of L?
