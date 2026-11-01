# Module notification workflow

**Product Owner decision:** 2026-11-01, approved implementation on PR #1568.
**Runtime policy:** v5 in `engagement/notification_policy.py`.

This is the product's event-to-attention contract, not a settings specification.
It supersedes the older deferral of wider Activity admission in the #515 delivery
foundation. It does not introduce the previously rejected daily summary.

## Shared delivery sequence

1. Commit the authoritative domain change and a reference-only Outbox event in
   the same transaction. Routine edits, automated rediscovery and private work
   do not become partner messages.
2. Resolve the intended recipient from current domain membership/ownership,
   suppress self notices except an owner's own background-job outcome, and
   recheck accounts, membership, module and target authorization.
3. Create one canonical recipient Notification, with source-event uniqueness.
   Reactions and Wish-round invitations/results coalesce by recipient and target.
   A replay cannot clear a later read state. No second unread ledger exists.
4. Intersect event class, existing recipient consent, quiet hours and transport
   readiness. Comments retain the existing separately opted-in hourly digest;
   no individual comment Push or daily engagement Push is introduced. New kinds
   inherit the relevant existing recipient group rather than another settings UI.
5. The public lock-screen version stays neutral; Android's sensitive-content
   preference remains user-controlled. The Product Owner's 2026-11-01 follow-up
   authorizes named event/title previews on the device. Negotiated FCM preview v1
   carries standard JWE ciphertext bound to the current activation. Names, kinds,
   titles and the canonical notification ID stay inside that envelope; the key
   is registered over authenticated HTTPS and stored through the protected-payload
   boundary. The key is bound to the registering device-session family. Delivery
   locks and rechecks that family for revocation, inactivity and absolute expiry;
   a short-lived access-token expiry alone does not interrupt background previews.
   Token rotation preserves the binding; a fresh authenticated registration can
   rebind the same endpoint after sign-in. Invalid families retain only the legacy
   generic wake. Legacy registrations keep their generic wake. The UnifiedPush wake may carry
   only a canonical Notification ID, never actor, category, title, body, photo,
   private choice, filename or an arbitrary route. Legacy wakes open the Center.
6. A tap resolves current authenticated recipient state and opens its canonical
   destination. An unavailable target falls back to the Center. Account/Space
   changes invalidate pending navigation, and an active editor defers navigation
   through the existing document-leave guard. Dismissing/receiving is not reading.
7. Reconciliation and unread-count polling remain silent. No transient global
   foreground banner, replayed backlog animation, inactivity nudge, streak or
   response-pressure message is introduced. Existing content updates in place.

## Complete module inventory

| Module / surface | Meaningful occasion | App behavior / external delivery |
| --- | --- | --- |
| Glucksmomente | Deliberately share an authored present joy/appreciation | One partner Notification and neutral immediate Push; latest incoming source on Wir; canonical Memory read/history. |
| Zeitreise | Deliberately share a recollection | Same authored-source workflow, optional past date. |
| Daily writing questions | Three optional inspirations per module/Space day | Fetch only; no Outbox, Notification, Push or completion obligation. Free writing is unlimited. |
| Thinking of you / kiss / check-in gesture | Deliberate paced partner signal | Existing neutral immediate delivery and quiet-hours behavior. No request to reciprocate. |
| Vibe / energy check-in | Enter/update own dimension; permitted mutual reveal | Refresh current module only; no submission/status/mood/presence notification. |
| Relationship duration / presence | Clock/day or presence changes | Display only; no online/offline, absence or daily counter notice. |
| Daily quote | New quote | Display on opening; no notice. |
| Retrospective / keepsake / daily rediscovery | New authorized selection | Quiet source card; no Push or unread item. PR #1568's daily eligibility remains. |
| Upcoming / anticipation | A selected source reminder becomes due | Existing recipient-specific occurrence, idempotency and schedule; no duplicate reminder from the dashboard projection or countdown. |
| Monthly highlights / recaps / relationship summary | A new authorized edition is available | Existing invitation/edition in Wir/recaps; no repeated external prompt. Source deletion/privacy still controls content. |
| Recently shared / pinned Collection | Source content changes | Refresh the derived module; no second notice for its underlying event. |
| Memories / diary / HeartMoments | Create ordinary shared content | Activity and source refresh; explicit experience sharing uses the deliberate message workflow. Owner-only HeartMoments stay private. |
| Milestones / chapters | Shared creation; important date approaches | Existing Activity; the date's existing reminder occurrence owns timed attention. |
| Shared photos / saved map | Upload, gallery or place relation changes | Refresh/progress in context; no per-photo, GPS, map or import-history Push. |
| Comments | Partner comments on accessible content | Existing Center and separately opted-in bounded digests; open thread updates without an extra foreground surface. |
| Manual shared reminders | A partner deliberately creates a shared reminder | One recipient-owned creation notice, with current creator/title and an authorized reminder read action; inherits existing reminder choices and respects Quiet Hours. Generated/private-source rules and imports remain silent. |
| Photo reactions | Partner adds/changes a preset reaction | One coalesced Center item per recipient/Memory, no external delivery. Removing the last incoming reaction removes its derived notice. |
| Plans | A new binding scheduled Plan, including scheduling an existing idea | Center only, expiry at the relevant appointment boundary; an undated idea is Activity only. |
| Plan time/place changes | An actual schedule/place change affects an appointment within 48 hours | Neutral immediate partner notice, expiring with the relevant source appointment. Pure prose, cover and unchanged schedule writes stay silent. |
| Plan cancellation | Unschedule, delete or return an imminent Plan to its Wish | One expiring neutral notice; open Planen when the original Plan has been removed. No copied deleted title. Completed/past Plans do not notify. |
| Wishes | Ordinary create/edit | Existing shared Activity, no individual Push. |
| Shared Wish selection | Deliberately publish the shared candidate round; both partners publish and result becomes available | One invitation and one revealed-result notice per round. Individual favorites/publication are silent. Results disappear from notifications if mutual publication or current participant context no longer holds. Open the current selection. |
| Shared Collections / checklists | Routine add/check/reorder | Update in place; no per-checkbox or small-edit alert. Explicit timed Reminders retain their existing recipient schedule. |
| Places | Shared creation/edit/link | Existing Activity/source update only. A saved Place is not a time-sensitive event. |
| People / birthdays / anniversaries / important dates | Existing scheduled occurrence becomes due | Existing source-owned planning lead/day-of reminder; one occurrence across all surfaces, localized date/time. |
| Private notes / gift ideas / private lists | Owner's deliberate manual Reminder | Owner-only reminder path; no partner notification, private count, title or existence hint. Ordinary private edits remain silent. |
| Local games | Turn, score, interrupted or finished round | In-session feedback only; no Push. |
| Daily insights | Authorized analysis becomes available | Existing insight surface; no diagnosis, partner-state warning or engagement prompt. |
| Search / Activity / Profile | Search, browsing or editing | Local result/success feedback only. Activity is not automatically a Notification. |
| Partner invitation | Invitation is accepted | One inviter-only Center item leading to Wir. No email-address or invitation-token projection. |
| Account / connection / security | Account-critical action | Existing dedicated transactional/account workflow; never a relationship-content banner or marketing message. |
| Import / export | Validation ready, export ready, import complete or domain/terminal storage failure | Owner-only neutral outcome Notification/Push; opens the exact authenticated job in Data. Progress and retries stay in context. Expired/deleted/wrong-owner jobs are unavailable. Imported historical objects never replay relationship messages. |
| Pro information / app information / operator diagnostics | Viewing information or operational changes | No couple-facing promotional/diagnostic Push; existing operator/account boundaries remain. |

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
can represent day 0 without another settings surface. Timed/date-only Plans keep
their existing source-specific schedule and date precision.

Reference routing is negotiated by both backend configuration and the native
connector. A new app on an older backend and an older app on a new backend both
retain the one-field wake. An explicit external open may resolve a recipient's
hidden Center record without enabling ambient in-app notices; current recipient,
source privacy, mutual reveal and expiry still apply. Already read notifications
do not produce a later queued Push.

The generated preflight and evidence are recorded in
[daily questions](design/references/daily-couple-prompts/README.md).
