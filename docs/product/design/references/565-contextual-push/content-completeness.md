# Complete contextual push content

## Follow-up scope and preflight

The 2026-11-04 Product Owner follow-up requests concrete content for every
supported push occasion, a new PR based on #1643, and its validated merge.
Inspected baseline: #1643 at `c6653838a06d9bb347c7cfa73ba5db88afa78e01`,
including main `0d0ab5f809b61059a862fa2bd97d414684d449e1`.

Immediate comments and gentle invitations currently fall through to the generic
Android body. Several title-bearing kinds also discard their available title.
The v1 device envelope cannot carry authored excerpts, and its exact field set
must remain compatible with existing installations.

## Acceptance and privacy contract

- Give every existing NotificationKind an accurate localized presentation.
  This does not admit Center-only events into Push or change delivery policy.
- Show the actual sender and currently authorized title when available.
  Negotiated v2 adds a bounded current comment or shared-experience answer
  excerpt, without copying text into Outbox, Notification, job or log state.
- Distinguish automatic invitations, due reminders, creations and digests.
  Digests must not misrepresent an aggregate as one authored message.
- Keep v1's exact envelope and legacy configuration field. Negotiate the
  highest mutually supported version through additive maximum-version fields.
  Store the selected version separately from the existing protected key payload
  so legacy workers can still read their keys.
- Recheck recipient/source authorization before reading content. A comment
  must match the source event, actor, Space and current authorized parent.
  Deleted or inaccessible content cannot supply an excerpt.
- Preserve neutral public lock-screen presentation, system sensitive-content
  settings, bounded JWE size/lifetime, session/activation binding, preference and
  Quiet Hours, replay suppression and authenticated canonical opening.
- Unknown future kinds retain the safe generic body without unknown content or
  fabricated actions. Legacy peers retain compatible v1 or generic delivery.

## Product, reuse and business review

This is a correction to the existing notification presentation contract, not a
new screen or native capability. Reuse the [generated whole-shade reference](android-preview.png)
and [Mobile Interaction Contract](README.md), inspected against the current
NativePushNotifications BigTextStyle, public version and immutable source tap.
The reference predates implementation and already depicts this OS composition.
Product Reference v1's actor/content, meaning and action hierarchy applies.
The sender and words remain focal, followed by one canonical view action when
appropriate. Android owns Compact/Expanded shade layout, themes, large text,
accessibility and motion. No typing, new sheet, foreground banner or Web layout.
Keep unavailable/legacy fallbacks and the existing Web resolver/draft guard.

Reuse NotificationCompat, FCM data messages and standard RFC 7516 JWE through
the adopted joserfc/Nimbus libraries. Plaintext provider bodies disclose content;
background fetching adds a token/network/background lifecycle; another broker
duplicates the existing pipeline. The closed event catalog, bounded authorized
projection and additive capability negotiation are application responsibilities.
No new dependency, provider, license, credentials or operator configuration.

Primary platform sources rechecked on 2026-11-04:
[FCM encrypted data](https://firebase.google.com/docs/cloud-messaging/encryption),
[expandable notification templates](https://developer.android.com/develop/ui/compose/notifications/expanded),
and [notification privacy/public versions](https://developer.android.com/develop/ui/compose/notifications/create-notification).

**No business/freemium impact:** Notification Policy/Digest/Quiet Hours remains
Free/Core, equal in Cloud and Self-Hosted. Originating feature entitlements stay
authoritative. No pricing, quota, Space ownership, retention, storage, downgrade
or export change. There is no added provider request or content cache.

## Required validation

Exercise the complete native catalog, title/no-title and digest variants,
localized content and source actions, Python-to-Android encryption, v1/v2 and
mixed-version registration, expiry/tamper/unknown-data rejection, Unicode and
provider bounds, current-source deletion/privacy/foreign-parent rejection,
both shared experience kinds, additive migration/rollback and OpenAPI/client
drift. Retain source-tap ownership, neutral public content and retirement checks.
Native synthetic presentation evidence and final-head CI remain merge gates.
Merging source does not publish a signed Android update or deploy a server.

## Runtime evidence and remaining acceptance

The API 36 emulator's [Light capture](evidence/content-api36-light.png) shows
the real decrypted comment excerpt, source action, kiss and titled reminder.
All names and authored words are synthetic interoperability fixtures. The
additional Android System serial-console notice belongs to the emulator.

The [Dark capture at 150% font size](evidence/content-api36-dark-large.png)
currently shows Android's collapsed notification group. It does **not** prove
expanded excerpt readability. Remaining acceptance is to expand the group and
the comment through Android's accessibility actions, assert the displayed
authored words, and replace that capture with the reviewed expanded result.
SystemUI can expose a child's text to accessibility while its group is still
visually collapsed; checking only text presence is insufficient for this proof.

The source/transport implementation at `4ecc731bf4cfb91ebad138d601b878a1134a1be1`
passed hosted native tests on APIs 28, 36 and 37.1. Local API 36 coverage also
passed all six preview tests, three activation-binding tests and eight source-
opening tests. The refined screenshot wait passes locally in Light and Dark,
but still needs the explicit expansion acceptance above and fresh hosted checks.
The initial hosted CI's language gate rejected new German product copy; the
correction registers exact approved literals and keeps surrounding engineering
prose in scope, with its negative regression checks intact. No path exclusion,
assertion relaxation or hosted manual rerun is used.

## Final correction preflight

The identity scan rejected an accidental legacy-name byte sequence inside one
sender-produced compact JWE. Only the complete `jwe` property line in the exact
native catalog is now classified as opaque. Other fields, other paths, malformed
compact values and accompanying prose remain subject to the unchanged guard.
The scanner and upgrade regressions pass locally (16 and 5 tests), and the full
tracked identity scan reports zero MUST_RENAME findings. The engineering-language
audit and its 27 regressions also pass.

The native source-action test now expands the outer group and comment through
Android's ACTION_EXPAND contract. Acceptance requires the actual authored
TextView, an expanded ancestor, no collapsed expandable ancestor, and text bounds
fully contained by visible parents. A merged description alone cannot pass.
Capture both screenshot and hierarchy, re-read after the OS animation, and retain
all PendingIntent, activation, source-action and public-redaction assertions.
The existing hosted API 36 job additionally runs this same case in Dark at 150%
font scale and verifies the effective configuration; APIs 28/36/37.1 retain their
normal coverage. Fresh hosted execution and replacement visual evidence remain
required before merge. This environment has no installed Android SDK/emulator;
the existing hosted native matrix supplies that execution rather than a claimed
local Android pass.

The completed baseline API 36 run exposed a second test defect: Android's
auto-group summary appears in getActiveNotifications as a fourth entry. Count
the exact three individual notices separately from at most one OS-flagged group
summary, require its GROUP_SUMMARY flag, and reject app-authored summary rows.
The three messages retain every existing privacy/action assertion. This follows
the OS grouping contract rather than loosening the expected message count.
