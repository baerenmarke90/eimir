# One-time partner messages

Product Owner decision: 2026-11-06. Create the optional **Nur für dich** experience
as eimir. Pro, with discreet Push, building on the separate HeartMoment voice-note
workstream without changing its durable content lifecycle.

## Delivery and parallel integration

Baseline inspected: `origin/main` at `c5e15a4c29eb60adaec5a1d39f574fdc9b8c4d25`.
The separate `feat/heart-voice-notes` worktree owns audio capture/import/player,
audio media validation and durable HeartMoment binding. This slice owns a new
temporary message domain, consent, recipient claim, expiry and neutral notification.
Integrate the voice commit before final validation; reuse its capture/player
components through a local File boundary, never attach temporary data to a
HeartMoment or duplicate its recorder. A stacked PR must name the exact dependency.

## Mobile Interaction Contract

R4 Today plus R1 capture/task continuity and R5 consent govern this slice. Reuse
QuickCreateMenu, PageHeader, TaskBackButton, the leave guard, ProMark, native file
selection, existing voice components, semantic tokens and canonical notification
navigation. A dedicated reading/composing page is necessary for sensitive media.

- Human goal: deliberately leave a fleeting text, photo or voice message for the
  current partner, who chooses when to open it. No reciprocation or read receipt.
- Entry: existing plus, with a quiet Pro mark; no fifth destination. A sealed,
  content-free incoming signal appears on Wir only while a message is available.
  It is compact support after relationship context and before the ordinary focal
  keepsake, without displacing existing Vibe, gestures, quote, upcoming, recaps or
  other configured modules. It disappears on claim, expiry, discard or withdrawal.
- Consent: both partners explicitly enable reception. Device keys are created
  only by that action. Declining has no partner notification or reminder. Turning
  reception off removes pending temporary messages; explain that consequence.
- Composer: recipient, optional text, optional photo or voice attachment, explicit
  one-time/24-hour lifetime and Senden. No title/date/emotion, auto-keyboard, durable
  save/conversion or automatic sending. The single primary action is send.
- Before opening: sender and a sealed envelope; explain single-view loss on close
  and that copies cannot be prevented. Only explicit Einmal öffnen claims content;
  routing, notification taps, polling and previews never do. Discard is deliberate.
- Content stays only in the active viewer's memory, never React Query, offline
  cache, browser storage, URL, activity, search, recaps or portable archives. Clear
  on close, route/unmount, account/Space change, pagehide or background visibility.
- Loading/error/offline remain distinct; no queued offline send. A failed send
  preserves the draft; idempotency reconciles uncertain sends. A claim is tied to
  an in-memory attempt token so transport retry cannot open a second view. A
  different attempt/device never receives already claimed content. A successful
  decrypt acknowledges destruction; a failed/dead client loses its claim at the
  five-minute ceiling. Closing clears local bytes and revokes object URLs.
- Confirmed send shows a persistent result and return action. Pending work and
  dirty exits use the shared guard; account changes invalidate late completions.
- 320/360/390/430 px and 200% text: one column, wrapping labels, at least 44 CSS px
  targets, keyboard-safe actions. Expanded keeps the same bounded reading flow.
- Feedback uses existing fast/standard roles for send/open; reduced motion retains
  all information. No timer animation, confetti or pressure-inducing streak.
- Generated reference: [Compact composition](design/references/once-messages/compact-reference.png).
  It represents real Wir identity, gesture, focal keepsake, next Plan and four-root
  navigation, plus composer and sealed reader. Dates/glyphs are illustrative;
  production retains the actual shell. No durable-copy switch is authorized.
- Acceptance: open → compose/select/record → send → confirmed result → return;
  recipient sealed entry → deliberate claim → view/play → close → unavailable.
  Cover Light/Dark, Compact/Expanded, narrow reflow, reduced motion, failed/offline
  send, double open, expired/withdrawn content, changed recipient and draft safety.

## Privacy, cryptography and lifecycle

Classify content TEMPORARY_SHARED. This is not a HeartMoment visibility flag.
Reuse standard JWE through maintained `jose` in the browser (MIT, no provider,
Cloud/Self-Hosted identical) and Web Crypto RSA-OAEP-256/A256GCM. Private device keys
are non-extractable CryptoKeys in account/Space-scoped IndexedDB; only public keys
reach the server. Existing server-known Push preview keys cannot protect messages.
The server stores a bounded opaque envelope, not plaintext or ordinary Attachment
records. Content format, photo metadata removal, decoder and audio limits are
enforced in the client; opaque envelope shape, algorithms, recipient key set and
byte budgets are enforced on the server. No bespoke cryptographic primitive.

This scoped encrypted transport does not implement the general MX migration,
recovery, device verification or forward secrecy. Do not market an independently
audited E2EE guarantee. Authentication/TLS and the server's public-key directory
remain trust assumptions; existing key changes invalidate stale sends. No recovery
or migration of pending messages to a new device. Screenshots/external copies are
not preventable. Deleted browser keys can make pending envelopes unreadable.

Use current Membership identities, active accounts, bilateral consent and atomic
Space/message locks for send/claim/withdrawal. Rejoining cannot revive old content.
Unopened messages expire after 24 hours. Claim leases last at most five minutes;
acknowledgement destroys the envelope. Replays retain only bounded idempotency
metadata until expiry. Cleanup removes message, derived notification and delivery
state without retaining a read-receipt history. Jobs/events contain references only.
Official database dumps exclude temporary message and receiving-device rows,
so restore cannot replay pending messages. External infrastructure snapshots may
contain opaque envelopes until their normal backup retention expires.
No export/import of temporary payloads or device private keys. Ordinary permanent
media and voice notes retain their existing portability and downgrade guarantees.

## Push and attention

One reference-only Outbox event in the send transaction, one recipient Notification,
existing PushDelivery/provider pipeline, inherited partner-message channel choices,
Quiet Hours and active-device consent. Current recipient/source/expiry are checked
at projection, delivery and tap. No email, reminder, digest, foreground banner,
content excerpt, title, photo, audio, filename or decrypted rich native preview.
Legacy apps receive the existing neutral wake and open the Center safely. A tap
opens the sealed page and does not consume it. Retries cannot duplicate unread work.

## Business / Freemium Model Consistency

Business/freemium impact reviewed: new Space-level `partner.once_messages`
capability, Premium creation in Cloud and Self-Hosted under the PO decision above.
One Pro grant covers both partners. Consent, key removal, receipt, pending reads,
discard and withdrawal are never paywalled. Downgrade stops new sending; an existing
message keeps its originally chosen one-time lifetime, independently of billing.
The intentional ephemeral contract is not deletion caused by a downgrade. Update
the authoritative matrix before introducing runtime gating. Bounded bytes/TTL and
existing notification transports limit managed cost; no per-message purchases.

## Reuse-before-build and cross-cutting review

Reviewed W3C Web Crypto, JOSE/JWE and the existing server `joserfc` Push preview
implementation. Use browser `jose` rather than hand-written encryption/framing;
server preview encryption alone is unsuitable because the server owns that key.
Sources: https://www.w3.org/TR/webcrypto/ and
https://github.com/panva/jose/blob/main/docs/jwe/general/encrypt/classes/GeneralEncrypt.md.
No external messaging/storage provider, account, fee or infrastructure UI is added.
The small domain-specific claim/consent lifecycle has no suitable generic app API.

Cross-cutting acceptance includes cross-Space/account/device authorization, stale
membership and consent races, two-device claim races, idempotent send, bounded
uploads/storage, ciphertext-only events/logs, no durable projections/export,
expiry/cleanup/restore, non-destructive downgrade, localized labels and errors,
keyboard/focus/reflow/reduced motion and existing session credential rotation.
Device microphone and Push delivery reuse their existing platform contracts;
physical-device evidence must not be inferred from mocked browser tests.
