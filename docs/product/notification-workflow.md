# Module notification workflow

**Product Owner decision:** 2026-11-01, approved implementation on PR #1568.
**Runtime policy:** v17 in `engagement/notification_policy.py`.

**Narrow follow-up decision #1620 (2026-11-03):** personal default-off gentle
prompts may offer adaptive writing/Memory invitations under the complete
[own-use, attention, transport and lifecycle contract](gentle-prompts.md).
This supersedes the inactivity exclusion below only for that explicit opt-in;
ordinary partner events, daily rediscovery and questions retain their semantics.

This is the product's event-to-attention contract, not a settings specification.
It supersedes the older deferral of wider Activity admission in the #515 delivery
foundation. It does not introduce the previously rejected daily summary.

## Shared delivery sequence

1. Commit the authoritative domain change and a reference-only Outbox event in
   the same transaction. Routine edits, automated rediscovery and private work
   do not become partner messages.
2. Resolve the intended recipient from current domain membership/ownership,
   suppress self notices except an owner's own reminder or background-job outcome, and
   recheck accounts, membership, module and target authorization.
3. Create one canonical recipient Notification, with source-event uniqueness.
   Reactions and Wish-round invitations/results coalesce by recipient and target.
   A replay cannot clear a later read state. No second unread ledger exists.
4. Intersect event class, existing recipient consent, quiet hours and transport
   readiness. The 2026-11-03 Product Owner correction (#1626) makes partner
   comment Push immediate by default for registered endpoints, retaining explicit
   opt-outs and Quiet Hours. Comment Email retains its separately opted-in hourly
   digest; there is no daily engagement Push. New kinds
   inherit the relevant existing recipient group rather than another settings UI.
5. **Android decides (Product Owner decision 2026-11-21, #2158, amending M4-D41).**
   The app forces no neutral lock-screen presentation. Every native notice is
   `VISIBILITY_PRIVATE` with a neutral public version and the channel sets no
   lock-screen override, so the person's Android setting alone decides: "show all
   notification content" shows the full notice on a locked screen, "hide sensitive
   content" shows only the neutral public version, "don't show notifications" shows
   nothing. Negotiated FCM preview v3 gives every kind its real content (see
   [Detailed device content](#detailed-device-content-2158)); the exceptions there
   are surprise and technical protections. The Product Owner's 2026-11-01 follow-up
   authorizes named event/title previews on the device. Negotiated FCM preview v1
   carries standard JWE ciphertext bound to the current activation. Names, kinds,
   titles and the canonical notification ID stay inside that envelope; the key
   is registered over authenticated HTTPS and stored through the protected-payload
   boundary. The key is bound to the registering device-session family. Delivery
   locks and rechecks that family for revocation, inactivity and absolute expiry;
   a short-lived access-token expiry alone does not interrupt background previews.
   Token rotation preserves the binding; a fresh authenticated registration can
   rebind the same endpoint after sign-in. Invalid families retain only the legacy
   generic wake. Legacy registrations keep their generic wake. A standard
   UnifiedPush wake may carry a canonical Notification ID. Standard browser Web
   Push and iOS APNs carry a reference and an activation identifier, with neutral
   system copy. The negotiated Wish date exception below adds only encrypted
   device copy. Providers receive no relationship fields in plaintext. Legacy
   wakes open the Center. See the [multi-platform push contract](multi-platform-push.md).
   The 2026-11-04 [content-completeness correction](design/references/565-contextual-push/content-completeness.md)
   adds negotiated preview v2 with a short current comment/shared-answer excerpt.
   V1 retains its exact field set. Additive server/native maximum-version fields
   select v2 only when both support it; older workers retain readable keys and
   emit v1. Text is projected from the exact currently authorized source only
   for delivery, never persisted in notification/event/job metadata. The
   deliberate Wish date exchange in #1910 has the scoped presentation exception
   below. Every known native kind has its own
   accurate localized label, including content-free automatic invitations and
   source-free due notices; a digest remains explicitly plural. Preview v3
   (#2158) is negotiated the same way through the additive
   `encryptedPreviewDetailVersion` field, so installed apps keep v2 and v1 with
   their exact fields and meaning.
6. A tap resolves current authenticated recipient state and opens its canonical
   destination. An unavailable target falls back to the Center. Account/Space
   changes invalidate pending navigation, and an active editor defers navigation
   through the existing document-leave guard. Dismissing/receiving is not reading.
7. A wake from the current native activation or a bound browser Wish date
   notification can trigger a fresh, authorized inbox read in the focused
   app even with an unchanged unread count. An increase in the observed count
   can also trigger a read. A recent unread item can appear in the
   [shared foreground banner](design/partner-gesture-receipt.md), with a
   one-shot animation or the settled symbol for reduced motion. Only one banner
   is visible. Focused tasks keep the screen, and notifications that arrived
   while the app was away stay in the inbox. The active native app suppresses
   system presentation. The [browser Web Push contract](multi-platform-push.md)
   governs browser system notifications.

## Complete module inventory

| Module / surface | Meaningful occasion | App behavior / external delivery |
| --- | --- | --- |
| One-time partner message (#1672) | Deliberately send a one-time message after bilateral reception consent | One recipient Center item and neutral Push; never a rich native preview or Email: the message is sealed on the sender's device and the server cannot read it (#2158 exception a). Tap opens the sealed page; claim/discard/expiry removes its derived notice. Existing channels and Quiet Hours apply; sending is Pro, pending reception is not. |
| Glucksmomente | Deliberately share an authored present joy/appreciation | One partner Notification and immediate Push naming the partner, title and an excerpt of the words; latest incoming source on Wir; canonical Memory read/history. |
| Zeitreise | Deliberately share a recollection | Same authored-source workflow, optional past date. |
| Daily writing questions | Three optional inspirations per module/Space day | Fetch only; no Outbox, Notification, Push or completion obligation. Free writing is unlimited. |
| Thinking of you / kiss / check-in gesture | Deliberate paced partner signal | Existing neutral immediate delivery and quiet-hours behavior. No request to reciprocate. |
| Vibe / energy check-in | Enter/update own dimension; permitted mutual reveal | Refresh current module only; no submission/status/mood/presence notification. |
| Relationship duration / presence | Clock/day or presence changes | Display only; no online/offline, absence or daily counter notice. |
| Personal gentle prompts | Explicit own-account opt-in and conservatively learned eligibility | One recipient-wide rolling budget, 14/28-day backoff and pause after three attempts without use. Dedicated automatic semantic, no partner actor, unread item or foreground banner. Existing queue/Outbox/PushDelivery, source rechecks and expiry own delivery. |
| Daily quote | New quote | Display on opening; no notice. |
| Retrospective / keepsake / daily rediscovery | New authorized selection | Quiet source card; no Push or unread item. PR #1568's daily eligibility remains. |
| Upcoming / anticipation | A selected source reminder becomes due | Existing recipient-specific occurrence, idempotency and schedule; no duplicate reminder from the dashboard projection or countdown. |
| Monthly highlights / recaps / relationship summary | A new authorized edition is available | Existing invitation/edition in Wir/recaps; no repeated external prompt. Source deletion/privacy still controls content. |
| Recently shared / pinned Collection | Source content changes | Refresh the derived module; no second notice for its underlying event. |
| Memories / diary / HeartMoments | Create ordinary shared content | Activity and source refresh; explicit experience sharing uses the deliberate message workflow. Owner-only HeartMoments stay private. |
| Milestones / chapters | Shared creation; important date approaches | Existing Activity; the date's existing reminder occurrence owns timed attention. |
| Shared photos / saved map | Upload, gallery or place relation changes | Refresh/progress in context; no per-photo, GPS, map or import-history Push. |
| Comments | Either partner comments on accessible content, including replies on their own parent entry | One reference-only event, Activity and partner Center item; immediate Push under existing endpoint/recipient choices and Quiet Hours. No self-notice. Email remains an opted-in hourly digest; the open thread updates silently. |
| Manual shared reminders | A partner deliberately creates a shared reminder | One recipient-owned creation notice, with current creator/title, its time and an excerpt of its description (v3) and an authorized reminder read action; inherits existing reminder choices and respects Quiet Hours. Generated/private-source rules and imports remain silent. |
| Photo reactions | Partner adds or changes a preset reaction on the recipient's shared Memory | One coalesced Center item per recipient/Memory and one Push delivery per active endpoint for that item, naming the Memory and the reaction symbol (v3). Inherits the comment Push choice and respects Quiet Hours. Opens the authorized Memory. Removing the last incoming reaction removes the notice and suppresses pending delivery. |
| Plans | A new binding scheduled Plan, including scheduling an existing idea | Center and a partner Push for today or tomorrow in the recipient's calendar, naming the title, the start in the device's time zone and the place (v3). Later appointments stay Center-only on creation. The Push inherits the reminder setting, respects Quiet Hours and opens the Plan. A Plan whose date or time has moved no longer sends the original notice. |
| Plan time/place changes | An actual schedule/place change affects an appointment within 48 hours | Immediate partner notice naming the title and the new time and place (v3; the previous values are not recorded, so it does not say which one changed), expiring with the relevant source appointment. Pure prose, cover and unchanged schedule writes stay silent. |
| Plan cancellation | Unschedule, delete or return an imminent Plan to its Wish | One expiring notice that names the Plan while it still exists (v3); open Planen when the original Plan has been removed. No copied deleted title, so a deleted Plan's notice stays without one. Completed/past Plans do not notify. |
| Wishes | Ordinary create/edit | Existing shared Activity, no individual Push. |
| Wish date proposal (#1910) | Explicitly propose a time, counter or accept on a shared Wish | One recipient-owned Center item. Push uses the existing reminder channel choice and Quiet Hours. A tap opens the active proposal on its Wish. Acceptance produces one shared Plan and the acceptance notice opens it. Decline or withdrawal leaves the Wish open. |
| Personal Wish reminder (#812) | A partner's own one-time reminder for an open Wish becomes due | Owner-only Center and Push under the reminder setting, including during Quiet Hours. Opens the Wish. The v3 device preview names the Wish title; Android's lock-screen setting decides what a locked screen shows. Replacement, removal, Wish completion, conversion, deletion or loss of access suppresses stale delivery. |
| Shared Wish selection | Deliberately publish the shared candidate round; both partners publish and result becomes available; a partner proposes, accepts or declines the random pick (#1907 J1) | One invitation and one revealed-result notice per round, each naming the feature's question (`wishSelection.notice.*`); the invitation states how many ideas are in the round. A random-pick request and its acceptance notify by Push and in-app; a decline is in-app only. No notice reveals whether there was a match or what was chosen. Individual favorites/publication, a withdrawn request and a manual choice are silent. Notices disappear when mutual publication, the open request, the stored decision or the current participant context no longer holds. The preference stays with `THINKING_OF_YOU`. Open the current selection. |
| Herzversteck (#1907 H3) | A partner hides a heart in a photo and sends it; the other partner finds it | One in-app and Push notice per event, naming the partner ("hid a heart", "found your heart"); the photo and its contents never appear in the notice. Both follow the shared-activity preference (`THINKING_OF_YOU`) and Quiet Hours; neither names a target row, because a round (and its photo) can already be gone when the notice is read. A tap opens the game. |
| Sent list (#1907 E2) | A partner deliberately sends a shared list from its menu (confirmation first) | One recipient Center item and an immediate Push naming the sender and the list title (v3; the earlier "never the list title" rule is superseded by the 2026-11-21 decision, the sender chooses to send). Its own recipient switch sits with the partner notices; Quiet Hours hold it. The list is added at the end of the recipient's pinned lists on Wir without touching their order or visibility. One notice per sender and list in 30 minutes; a repeat adds nothing and stays silent. A tap opens the list. Not offered by email. |
| Shared Notes (#1969) | A partner creates a shared note or changes its text (pinning, plan links and deletion stay silent) | One recipient Center item per new note and one coalesced item per note for changes, and an immediate Push naming the partner, the action, the note's title and a short excerpt of its text (v3; v1/v2 name only the partner and the action). Inherits the comment Push choice and Quiet Hours; not offered by email. A change adds no Push while the partner has not yet read the note's earlier notice; once it was read, the next change notifies again. A tap opens the note. |
| Garden seed (#1907 H3) | A partner sends today's seed in the shared garden (one per partner and day) | One recipient Center item and an immediate Push naming the sender and what the seed is (v3). The attached words never travel in a push: they stay a folded card the recipient opens in the garden (Product Owner 2026-11-22, #2158). A wrapped surprise names no species until its moonflower first blooms (#2158 exception c). Its own recipient switch sits with the partner notices; Quiet Hours hold it. The notice stays current only while the seed waits to be planted; a tap opens the garden. A bouquet (up to three blooms, one per partner and day) reuses this kind with the target `GARDEN_BOUQUET` and its own text (`coupleExperiences.notifications.GARDEN_BOUQUET`, "gave you a bouquet", in v3 with its flowers), current only while its card waits. At most one garden notice per person and local day; a later seed or bouquet that day stays silent. Watering, growth, unlocks, visiting animals and later garden moments send nothing. Not offered by email. |
| Recaps (#1744) | A completed month or year is retained after its grace week; late shared entries make a retained recap's newer version | One identical in-app and neutral immediate Push notice per partner, naming only the period (`recaps.notice.readyMonth`, `readyYear`, `grewMonth`, `grewYear`). December is announced with the year film. Earlier periods that appear only now and newer versions are sent at most once a day per Space, several together as one notice that opens the overview. Never for the running period, never before 09:00 or after 21:00 in the Space's time zone; recipient Quiet Hours and the own recaps switch (`notificationSettings.recaps`) apply (`RECAP_GREW` follows it). Premium only: without `relationship.passport` nothing is composed or announced. Silent recompositions of open proposals send nothing. A tap opens the recap. Not offered by email. |
| Shared Collections / checklists | Routine add/check/reorder | Update in place; no per-checkbox or small-edit alert. Explicit timed Reminders retain their existing recipient schedule. |
| Places | Shared creation/edit/link | Existing Activity/source update only. A saved Place is not a time-sensitive event. |
| People / birthdays / anniversaries / important dates | Existing scheduled occurrence becomes due | Existing source-owned planning lead/day-of reminder; one occurrence across all surfaces, localized date/time. |
| Private notes / gift ideas / private lists | Owner's deliberate manual Reminder | Owner-only reminder path; no partner notification, private count, title or existence hint. Ordinary private edits remain silent. |
| Local games | Turn, score, interrupted or finished round | In-session feedback only; no Push. |
| Daily insights | Authorized analysis becomes available | Existing insight surface; no diagnosis, partner-state warning or engagement prompt. |
| Search / Activity / Profile | Search, browsing or editing | Local result/success feedback only. Activity is not automatically a Notification. |
| Partner invitation | Invitation is accepted | One inviter-only Center item and Push leading to Wir. Inherits the Thinking of You Push setting and respects Quiet Hours. No email-address or invitation-token projection. |
| Account / connection / security | Account-critical action | Existing dedicated transactional/account workflow; never a relationship-content banner or marketing message. |
| Import / export | Validation ready, export ready, import complete or domain/terminal storage failure | Owner-only neutral outcome Notification/Push; opens the exact authenticated job in Data. Progress and retries stay in context. Expired/deleted/wrong-owner jobs are unavailable. Imported historical objects never replay relationship messages. |
| Support reply (#2189) | The operator deliberately answers a person's own support report (one reply per report) | `SUPPORT_REPLY`, projected to the reporter only: no actor, attributed to the team, never to an operator account. The Center item targets `SUPPORT_REPORT` and lives in the Space of the reporter's most recent active Membership; a reporter without one keeps the stored reply and gets no notice. The notice carries no text: the app fetches the reply from `GET /api/v1/support-reports/{id}/reply` (reporter-only, plain text, at most 500 characters) and shows it with the report's date. Neutral immediate Push only (the reply never enters a device preview); never Email. Inherits the reminder choice (`REMINDER_DUE`) and Quiet Hours, with no settings surface of its own. Not coalesced: one notice per reply. A tap only marks it read; there is no destination. |
| Pro information / app information / operator diagnostics | Viewing information or operational changes | No couple-facing promotional/diagnostic Push; existing operator/account boundaries remain. |

## Detailed device content (#2158)

Product Owner decision 2026-11-21: Android decides, and every neutral notice
gets its real content. Android FCM preview v3 is negotiated like v2 and
stays device-bound JWE ciphertext. The server reads each field from the current,
recipient-authorized source at delivery, never from notification, event, job or
log state. Free text is shortened so the envelope stays within the native and
provider bounds (UTF-8 plaintext at most 2000 bytes, JWE at most 3000).

| Kind | v3 content |
| --- | --- |
| Plan created / changed, Plan start reminder | Title, start (date or time in the device's time zone) and place |
| Plan cancelled | Title while the Plan still exists |
| Manual reminder created / due | Title, time (created) and description excerpt |
| Personal Wish reminder | Wish title |
| Comment | Target title (a heart moment's own text) and comment excerpt |
| Shared moment | Title and words (unchanged from v2) |
| Shared note created / changed | Note title and text excerpt |
| Sent list | List title |
| Photo reaction | Memory title and the reaction symbol |
| Garden seed / bouquet | What the seed is (never its attached words); a bouquet's flowers |
| Video processing failed | The Moment's title |
| Gestures, partner joined, games, recaps, transfers | Their existing complete wording (the action is the whole event) |

Exceptions (surprise and technical protections, proposed for Product Owner confirmation):

- **a. One-time message:** the content is encrypted on the sender's device; the server cannot read it, so no
  notice can carry it. The device receives only a neutral reference.
- **b. Discreet Plan:** the partner the surprise is hidden from is the recipient. The notice shows only the
  creator's preview title (the real title only when the creator chose "original title"), with its date like the
  overviews, never the real title, place, description or comments. Without a preview title the wording is
  neutral ("scheduled a plan").
- **c. Garden seed:** a wrapped moonflower names no species until it first blooms, and a seed's attached words never show in a push; they stay a folded card opened in the garden (confirmed by the Product Owner 2026-11-22).
- **d. Game reveals:** no notice names answers, guesses, wishes in a round, a Wish selection's favourites or
  result, a random pick's choice, the hidden heart's photo or position, or the picture. These reveals happen in
  the app.
- **e. Support reply (#2189):** the reply is operator text about the person's own report. The notice, the push
  and every device preview stay neutral and carry no reply text, whatever preview version is negotiated; the
  app fetches the text from the reporter-only reply endpoint when the notice is shown.

iOS APNs and browser Web Push keep neutral system copy: they have no device-bound preview key today, and the
Wish date exception stays their only content. UnifiedPush keeps its negotiated Wish date preview.

## Wish date exchange presentation (#1910)

The Product Owner approved showing the sender, shared Wish title and appointment
directly in the system notification for a deliberate proposal, counter or
acceptance. The recipient's app and OS notification settings continue to govern
delivery and visibility. This is Free/Core shared Wish and Plan behavior with
one current proposal per Wish. A partner can accept only the proposal received.
Confirmation uses the existing Wish-to-Plan conversion, preserving the wish
link and context. Rejecting or withdrawing a proposal does not complete the Wish.

The event and notification store canonical references and the expiry time.
Delivery authorizes the intended recipient against current participants and
source, verifies that the notice still represents the active proposal or its
confirmed Plan, and projects the agreed fields from the source. Actor, title
and appointment stay out of logs and plaintext provider fields. Replaced,
declined, withdrawn, rescheduled, deleted or inaccessible sources cannot send
a stale proposal. A discreet Plan remains concealed.

| Transport | System presentation |
| --- | --- |
| Android FCM with a current v2 device binding | Existing device-bound JWE carries the details. A valid proposal payload lets Android present the full notification on the lock screen using the normal OS notification settings. |
| Compatible Android UnifiedPush and browser Web Push | Current endpoints negotiate the Wish date preview and protect it with the existing recipient subscription's RFC 8291 encryption. |
| Native iOS APNs and older registrations | Neutral system copy. A supported reference opens the Wish or Plan through the existing authorized resolver. Legacy reference-free Android wakes open the Center. |

The existing device setup negotiates the preview. The recipient's device time
zone is used consistently for the local date and time in the preview and in the
app. The Wish date exchange adds no separate private-preview setting and no Email.

The in-app receipt uses the shared foreground banner
[#1912](design/partner-gesture-receipt.md) at the top of the current screen. Its
avatar, soft breath and calendar badge follow the calm receipt from
#455. The receipt uses a stable authorized entry, leaves focus and active tasks
alone and shows the settled state immediately with reduced motion. Timeout or
dismissal leaves the proposal and the Center's read state alone.

## Bounds, privacy and business model

Three questions is a suggestion-display bound, not an authored-history quota.
Each module has a 24-question pool, retaining all twelve approved original
prompts from PR #1568 alongside newly authored inspirations. The original
object/keepsake prompt belongs to Zeitreise; present appreciation, music, pauses,
laughter and anticipation belong to Glucksmomente. Existing `?prompt=` links and
saved drafts remain readable. A deterministic Space offset
and consecutive three-item daily batches exhaust the pool before repetition.
Use the existing shared daily-context timezone/founder fallback on the server,
with a DST-aware next-midnight refresh interval. Both partners see the same set
regardless of their device/account timezones. A selected question becomes the
canonical protected Memory title, so existing drafts, saved-source reading,
editing and export preserve the question/answer together across midnight.

Notification quality is Free/Core and equal across Cloud/Self-Hosted.
Experience creation retains the existing Space `games.couple` entitlement;
retained source access/export and recipient visibility remain Core. No new
provider, SKU, infrastructure setting, entitlement, media quota or tracker.

Technical sources: `games/questions.py`, `api/v1/games.py`, `domain/events.py`,
`engagement/{service,notification_policy,notification_preferences}.py`,
`plans/service.py`, `wish_selections/service.py`, `transfer/jobs.py` and the
existing native UnifiedPush bridge/foreground guard. Migration 0098 is additive;
downgrade drops only derived new notification state, not authored content.

Rule catalog v3 supplies one preparation reminder and one day-of reminder:
important dates/related-person birthdays at 7 and 0 days, partner birthdays at
14 and 0 days, relationship anniversaries at 30 and 0 days, at 09:00 in the
existing recipient calendar. Explicit stored schedules and disabled rules stay
effective; only the fallback changes. The existing birthday/anniversary editor
can represent day 0 without another settings surface. A scheduled Plan keeps its
date precision. Standard start reminders currently apply to timed Plans. On the
same device, the creation Push and generated start reminders for that exact
start coalesce within 24 hours of creation. An attempted provider handoff is
enough to coalesce, since an ambiguous provider response may have delivered the
first Push. Both notices open the Plan where reference routing is supported.
The start reminder's v3 device preview names the Plan, its start and its place (v1/v2 stay generic). In-app reminder records and
notifications still follow their schedules.

A personal Wish reminder uses the same 24-hour catch-up limit as scheduled
reminders. This temporary scheduling state stays with the account in the
current Space. The portable shared Wish contains its original data only.

Reference routing is negotiated by both backend configuration and the native
connector. A new app on an older backend and an older app on a new backend both
retain the one-field wake. An explicit external open may resolve a recipient's
hidden Center record without enabling ambient in-app notices; current recipient,
source privacy, mutual reveal and expiry still apply. Already read notifications
do not produce a later queued Push.

The generated preflight and evidence are recorded in
[daily questions](design/references/daily-couple-prompts/README.md).


## 2026-11-03 delivery audit (#1626)

All 18 persisted Notification kinds were checked against event admission,
recipient resolution, channel policy/preferences, Quiet Hours, target opening,
source privacy and account/membership retirement. The current inventory above
remains the complete module contract. Happiness and Time Travel already have an
immediate deliberate-share path; their separately authored answers now share one
Journal/Discover projection and one comment thread. Question selection, derived
views and imports must not generate additional partner messages.

Two concrete defects were corrected: comment events formerly existed only when
the commenter differed from the parent owner, so the original author's reply was
missing from both Activity and Center; and comment Push had only a separately
opted-in hourly digest. Recipients now come from the other active enabled member,
including parent-author replies. Push uses the existing immediate delivery path;
Email deliberately retains the old digest policy. Stored false channel choices,
neutral public presentation, authorization at delivery/open time and Quiet Hours
remain binding. The Push preference UI explains immediate comments accurately.
There is no new preference group, provider, global banner or background tracker.

At the time of this audit, photo reactions and newly scheduled Plans were
Center-only. Policy v10 added Push for photo reactions under the existing
comment preference. Policy v11 covers short-term new Plans, accepted partner
invitations and personal Wish reminders. Ordinary Diary/HeartMoment creation
and unscheduled ideas retain their Activity-only delivery.
No claim of a new physical-device FCM receipt is made by the source/queue audit.
