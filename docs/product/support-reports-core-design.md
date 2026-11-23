# Support reports in the Core (design, part 1 of 3)

**Status:** Approved by the Product Owner, 2026-11-23. Updated after implementation: see [Implementation notes](#implementation-notes-2026-11-23) for the deliberate deviations and open points.
**Baseline:** `main` at `28ebc7080`, Alembic head `0171`.
**Owning issue:** #2189 (extended from "report a problem" to "report a problem or send feedback").
**Related:** Decision 0017 (plugin seam), Decision 0018 (Cloud first, Self-Hosted later), #2158 / PR #2163 (tester reference), #2182 (Pro split, still running). API and service reference: [support-reports-service-interface.md](support-reports-service-interface.md).

This is part 1 of three agreed parts:

1. **Support reports in the Core** (this document): the person-facing sheet, the receiving endpoint, storage, and the one-way reply notification.
2. **Multi-plugin seam** (later, its own decision): Decision 0017 deliberately allows at most one plugin. It starts after #2182 finishes so both changes do not overlap.
3. **`eimir-admin` plugin** (later): private triage routes, an issue-tracker adapter (GitHub first, Forgejo later) and the admin screen. The screen question stays open until the client question in Decision 0017 is settled.

Parts 2 and 3 are out of scope here. Part 1 must be useful and testable without them.

## Intent and why

When something goes wrong in the app, or a person has a thought about it, they should be able to say so from inside the app in one or two taps, without describing it from memory in another tool. The operator (today the Product Owner and testers) should receive enough technical context to find the cause, without any private content leaving the phone.

The Product Owner's answers shaping this design (2026-11-23):

- Reports go to an **own receiving endpoint** (not a mail hand-over, not an error tracker).
- The operator answers **only when they choose to**, through the admin portal. The person receives a **simple notification** with that text. There is no support system, no thread, no inbox, no reply from the person.
- The admin side is **not public**; it ships later as a private plugin (parts 2 and 3).
- **Approach A:** the Core owns the data and the reply notification; the later plugin only reads and writes through a small service interface.

## Goals

- A signed-in person can send a report of type **problem** or **feedback** from the error state and from "Help & feedback" on the More page.
- The sheet shows in plain words what will be sent. Nothing is sent without that confirmation.
- A report works offline: the note is kept and sent later; a failed send is shown honestly.
- The Core stores the report, protected at rest, with limits and with deletion on account deletion.
- The Core exposes a service interface (`list_reports`, `get_report`, `set_state`, `send_reply` and the helpers listed under "Service interface") that the later plugin uses. The Core never imports the plugin.
- A reply creates one notification for the reporter with the operator's text.

## Non-goals

- No admin screen or admin API in this part (part 3).
- No support chat, threads, history, read receipts or "your reports" list for the person.
- No automatic crash reporting, analytics or telemetry without a user action.
- No attachments or screenshots in this first slice (a later, separately reviewed addition).
- No tracker forwarding (GitHub or Forgejo): part 3.
- No changes to the plugin seam: part 2.

## Anti-goals (a failure even if it technically works)

- Private content (memories, notes, plans, lists, messages, media, file names, location, contact data, other people's data) leaves the phone inside a report.
- A person is told "we will answer" or "received by the team" when nothing reads the reports. See the availability switch below.
- Self-Hosted gets a worse reporting path than Cloud for commercial reasons.
- A generic CRUD/admin-looking sheet; the sheet must feel like the rest of the partner app.

## Constraints

- Smartphone/Compact first; Mobile Interaction Contract and Product Design Preflight before UI code (`AGENTS.md`, `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` sections 10 and 15).
- English identifiers and docs; all user-facing text through the localization layer (German and English).
- Semantic design tokens only; shared button contract (one filled primary action).
- Free text is protected content: stored through `ProtectedPayloadJSON` (`docs/ENCRYPTION-AT-REST.md`).
- Business/freemium: support path, no entitlement, not paywallable. `docs/FREEMIUM-FEATURE-MATRIX.md` gets a row classifying it as non-paywallable.
- The OpenAPI contract changes (one endpoint, one `/instance` boolean); the generated clients are regenerated.

## Approaches considered

**Where the report goes** (decided with the Product Owner):

| Route | Verdict |
| --- | --- |
| Mail hand-over (`mailto:` / share sheet) | Rejected: needs a configured mail app, no delivery confirmation, no way to correlate reports. |
| Error tracker (GlitchTip / Sentry-compatible) | Rejected for this purpose: it is automatic crash tracking (excluded in #2189), needs a separate service, and a SDK with strict scrubbing. May return later for crashes. |
| Own authenticated endpoint and table | **Chosen.** |

**Who owns the data** (decided with the Product Owner):

- **A, chosen:** the Core owns table, endpoint, deletion and the reply notification; the plugin calls a service interface. A Core-only instance still accepts reports; no plugin changes privacy or deletion semantics.
- B, rejected: the plugin owns everything. A Core-only instance would have no reporting path and the plugin would have to re-implement account deletion.
- C, rejected: Core forwards via outbox and stores nothing. Reports are lost when the plugin is missing or failing, which contradicts honest failure handling.

## Design

### Data model

New Core table `support_reports` (Alembic revision `0175`, after `0174`):

| Column | Notes |
| --- | --- |
| `id` | UUID primary key. |
| `account_id` | Reporter. Not Space-scoped: reports are about the app, not a relationship. Deleted with the account. |
| `client_request_id` | UUID from the client; unique per account, makes offline retry idempotent. |
| `kind` | `PROBLEM` or `FEEDBACK`. |
| `state` | `NEW`, `IN_PROGRESS`, `CLOSED`. Written only through the service interface. |
| `created_at`, `closed_at` | |
| `payload` | `ProtectedPayloadJSON`, crypto context per payload class (`SupportReportPayload`), as for the other protected tables. Holds the fields listed below. |
| reply | Stored in a child table `support_report_replies` (an `id` primary key plus a unique `report_id` foreign key with `ON DELETE CASCADE`, and its own protected `payload` with `text` of at most 500 characters and `replied_at`). The encryption tooling supports exactly one protected `payload` column per table and reads protected rows by `id` (`security/lifecycle.py`), so the reply cannot be a second protected column and the table needs an `id` primary key. The unique `report_id` enforces one reply per report (see "Reply semantics"). |

**Allowed payload fields (allow-list, pinned by a unit test on both client and server):**

- `note`: free text, at most 2,000 characters; required for `FEEDBACK`, optional for `PROBLEM`.
- `failure`: the generalized tester reference (method class, route template without ids, HTTP status or transport outcome, problem `code`, app or web), and the `x-request-id` of the failing response.
- `client`: app version and build, platform (`app` or `web`), OS and browser or WebView version, locale, theme, online state, local time and time zone.

**Never included:** tokens, URLs with ids or query strings, file names, memory/plan/list/message text, location, contact data, device identifiers beyond the app version, other people's data. The server rejects unknown payload fields (strict schema) so a future client cannot leak by accident.

Retention (my call, see handover list): a closed report is deleted 90 days after closing; any report is deleted at most 365 days after creation; account deletion removes the person's reports and replies immediately. The security retention maintenance job does the time-based deletion (`prune_expired`); account deletion removes the person's reports through `PERSONAL_ACCOUNT_ROWS` in `identity.deletion`, and the replies follow through the foreign key cascade.

### API

- `POST /api/v1/support-reports`: authenticated, strict schema, body size cap, `client_request_id` idempotency (replay returns the existing report without a second row). Rate limited per account through `eimir.auth.rate_limit` (database-backed; 5 per hour and 20 per day). A replay is answered before the rate limit is spent.
- `/api/v1/instance` gains `supportReportsAvailable` (Boolean). It is true only when the operator enabled reports (see below).
- `GET /api/v1/support-reports/{id}/reply`: returns the reply text, the reply time and the report's date (`reportedAt`), only to the reporter (404 for anyone else or when there is no reply yet). It is not gated by the availability switch, so a reply already sent stays readable. The notification list item uses it to show the reply. There is no list or reopen endpoint for reports.

### Availability switch (honesty)

Without a reader, a "thanks, received" would mislead. A new operator setting `EIMIR_SUPPORT_REPORTS_ENABLED` (default `false`) controls `supportReportsAvailable`, and the endpoint refuses with 404 when it is off. The client shows the entry points only when it is true. It is turned on for Cloud and the private test channel once part 3 can read reports. This is operator configuration, not couple configuration (`AGENTS.md`, user rule).

The Core cannot know whether someone reads the reports, so the guard is documentation plus a signal: `docs/SELF-HOSTING.md` states "enable only if you read the reports", and the existing ServerAdmin overview gains one aggregate count of `NEW` reports and a warning code when `NEW` reports older than 14 days exist (counts only, no content). While the switch is off the count is 0 and the warning does not appear. Whether Self-Hosted operators receive the admin plugin at all is a question for part 3 and Decision 0018 (Self-Hosted is not offered at launch); part 1 introduces no Self-Hosted reader.

### Service interface for the later plugin

`eimir.support_reports.service`: `list_reports(state, limit, cursor)`, `get_report(report_id)`, `set_state(report_id, state)`, `send_reply(report_id, text, operator_id)`, plus `create_report`, `find_replay`, `get_reply`, `count_new`, `oldest_new_at` and `prune_expired`. The reference is [support-reports-service-interface.md](support-reports-service-interface.md). Return types carry the opaque `account_id` only, never an email address or display name. The operator finds the person through the existing ServerAdmin account directory, which already restricts what is shown (`docs/SERVER-ADMIN.md`). `send_reply` stores the reply and records the notification event in the same transaction (below). No Core module imports a plugin; the plugin imports this service. The interface is covered by tests in the Core so part 3 cannot silently break it.

### Reply semantics

- A report receives **at most one reply**. A second `send_reply` for the same report is rejected with a conflict (code `SUPPORT_REPORT_ALREADY_REPLIED`); the operator can close the report and, if more is needed, the person sends a new report. This matches "no thread, no inbox".
- Replying does **not** change `state`. `state` is the operator's own triage marker and is set only through `set_state`. A closed report can still be replied to, once.
- One reply per report means one notice per report; the notice keeps the existing source-event uniqueness of the notification pipeline, so a replayed event cannot create a second one.

### Reply notification

A new `NotificationKind.SUPPORT_REPLY` in `engagement`, following `docs/product/notification-workflow.md`: one canonical recipient Notification with source-event uniqueness, Push through the existing pipeline, quiet hours and recipient consent inherited from the reminder group (`REMINDER_DUE`; no new settings UI). The notification shows the operator's text as plain text (never HTML or links rendered). A person can opt out of it with the existing reminder controls.

**Presentation without an inbox:** the notification list item shows the neutral context line "Reply to your report of <date>" and the full reply text (at most 500 characters, so nothing is truncated). It does not quote the person's own note. Tapping it only marks it read; there is no destination screen. The push preview is neutral and never carries the reply text (see the implementation notes). The Notification model is Space-bound, so the notice lives in the Space of the reporter's most recent active Membership; a reporter without one keeps the stored reply and gets no notice.

### Client

- **Entry points:** an optional quiet (tertiary) action "Report a problem" on `ProblemState` (shared component, behavior unchanged without the new prop) and a "Help & feedback" row in the utility group of the More page. Both open the same sheet. Visible only when `supportReportsAvailable` is true. Not browser-only, so no native hiding is needed. Both ask for the sheet through a small launcher store (`openSupportReport`); one shell-level host renders it.
- **No X in the sheet (Product Owner, 2026-11-23):** the sheet shows no close "X". It closes by pulling down, tapping the backdrop, or Back/Escape. `docs/COMPONENT-CONTRACTS.md` sections 8.2 and 8.4 say a sheet has a *visible* Close; this sheet is a deliberate exception that the implementation PR must name. The existing header button of `ShortTaskSheet` (drag handle) stays as the labeled close target for keyboard and screen-reader users, and only its X icon is hidden through a new `showCloseIcon` prop.
- **Signed-in only (my call):** the endpoint is authenticated and the action is shown only for the error kinds `server`, `unknown`, `validation` and `conflict`, and is hidden where the problem is a lost session or sign-in (`unauthorized`), a missing permission or resource, an unreachable instance (`offline`) or a rate limit. An anonymous report path would need its own abuse model and is out of scope; it can be revisited as a separate decision.
- **What is attached:** the failure reference is attached only when the sheet is opened from `ProblemState`, and only for the failure shown there. From the More page, and for `FEEDBACK`, no failure reference is attached. The "what is sent" list always matches the actual payload, including "your account, so the team can answer".
- **Sheet** (reusing the existing sheet pattern, `ShortTaskSheet`): choice between "Something is not working" and "Feedback / idea", one text field, a plain-language list of what is sent, one filled primary "Send" button, a calm success state that promises no answer. Compact first; on Expanded the existing dialog form of the sheet.
- **Payload builder:** `web/src/client/supportReport.ts` builds exactly the allowed fields. A generalized failure reference (the #2163 token for any request failure) is kept in memory for the last failed request only.
- **Offline and failure:** the draft and its `client_request_id` are kept locally; send is retried when online while the sheet is open; a failed send says so and offers a retry. No retry loop on repeated failure.
- **States:** Loading (sending), Empty (feedback needs text), Error, Offline (draft kept), Success. Reduced motion respected; Light/Dark; about 360, 390, 430 px; large text.

### Visual reference

[`design/references/support-reports/mockup.html`](design/references/support-reports/mockup.html) shows seven Compact states in Light and Dark: problem state entry, More row, problem sheet, feedback sheet, offline, success and the reply notification. Captures of the implemented sheet are in [`design/evidence/2189/`](design/evidence/2189/README.md). It is a rendered sketch, not a generated image (Product Owner decision 2026-11-21). Expanded (the existing centered dialog form of the sheet) is not drawn. The dark primary action color in the sketch is approximate and must be checked against `--color-action-primary` during implementation. The Product Owner accepted this design on 2026-11-23.

## Cross-cutting review (summary)

- **Security and abuse:** authenticated only, strict schema, size cap, DB-backed rate limit, reply text rendered as plain text, no HTML.
- **Privacy and lifecycle:** payload protected at rest, allow-listed, purged on account deletion (`identity.deletion.apply_core_cleanup`), time-based retention job, and not part of the personal export (see "What is left to the builder").
- **i18n and accessibility:** all texts localized; sheet focus management, labels, large text.
- **Resilience:** idempotent create, offline draft, honest failure.
- **Observability:** the `x-request-id` in the report correlates with server logs without storing content.
- **Operations:** one setting; Self-Hosted documentation in `docs/SELF-HOSTING.md` says where reports land (the instance's own database; read-side tooling is not part of the Core and arrives with the admin plugin in part 3).
- **Contract:** OpenAPI and generated clients change; migrations are additive.
- **Testing:** allow-list tests, negative cases (offline, 413, 429, 5xx, replay), account-deletion test, notification test.

## Business/freemium

Business/freemium impact reviewed: a support path, available to every tier, not paywallable. No entitlement, quota or downgrade change. Managed cost (storage, handling) is small and bounded by the limits above. A row is added to `docs/FREEMIUM-FEATURE-MATRIX.md` classifying support reports as non-paywallable in Cloud and Self-Hosted alike.

## Reuse review

Reused: the existing notification pipeline, `auth.rate_limit`, `ProtectedPayloadJSON`, the sheet pattern, the shared problem state, the #2163 reference token, `x-request-id`. Custom code is justified only for the report schema, the service interface and the sheet content. An error tracker and a mail hand-over were considered and rejected (see Approaches).

## What is left to the builder

- Verify the Notification model supports a recipient without a Space; if it does not, choose the least invasive option (for example the reporter's active Space) and record it in the PR. *Resolved:* the model is Space-bound, so the notice uses the Space of the reporter's most recent active Membership.
- Final rate-limit numbers and the exact wording of all texts. *Resolved:* 5 per hour and 20 per day; texts are in the localization layer (German and English).
- Whether `state` needs more values for the admin portal; start with the three above. *Resolved:* the three values stay.
- Where the personal export includes reports (my call: not included, because reports are about the app and operator-held; the builder confirms against `docs/ACCOUNT-DELETION-SELF-HOSTED.md` and the export contract). *Resolved in code:* the export code does not read reports; the export contract documents were not changed.
- The Mobile Interaction Contract and visual evidence (baseline `main` `28ebc7080`; screens to review: `ProblemState` and the More page).

## Acceptance criteria

- [ ] A person can send a problem or a feedback from the problem state or the More page in at most two taps plus an optional note, one-handed on Compact.
- [ ] The sheet lists in words what will be sent; nothing is sent before the confirmation.
- [ ] The stored and sent payload contains only the allow-listed fields; a unit test pins the list on client and server; unknown fields are rejected.
- [ ] A report sent offline is delivered once after reconnect (idempotent); a failed send is reported honestly.
- [ ] The note and reply are protected at rest and deleted with the account.
- [ ] `supportReportsAvailable` is false by default; with it off, the entry points are hidden and the endpoint refuses.
- [ ] `send_reply` creates exactly one notification for the reporter, shown as plain text; a second reply for the same report is rejected; replying does not change `state`.
- [ ] The failure reference is attached only from `ProblemState` and never for feedback; the action is hidden for lost-session states.
- [ ] The ServerAdmin overview shows the count of `NEW` reports and warns on reports older than 14 days.
- [ ] The Core imports no plugin; the service interface has Core tests.
- [ ] Visual evidence, reduced motion, Light/Dark, i18n and accessibility checks in the implementation PR.

## Implementation notes (2026-11-23)

The design was implemented as specified except for the deliberate deviations below. The open points need a decision or a confirmation that only the Product Owner or CI can give.

### Deliberate deviations

- **Reply table keys.** The reply is stored in `support_report_replies` with an `id` primary key plus a unique `report_id`, not with `report_id` as the primary key. The encryption tooling reads and rewrites protected rows by `id`. The unique `report_id` still enforces one reply per report, and a concurrent second reply is refused through `INSERT ... ON CONFLICT DO NOTHING`.
- **Crypto context.** Report and reply payloads use the per-payload-class context pattern of the other protected tables (`SupportReportPayload`, `SupportReportReply`), not a context bound to one report id.
- **`SUPPORT_REPLY` notice.** The notice has no actor, so no operator identity reaches the reporter; the notice is attributed to the team and `send_reply` accepts `operator_id` but does not use it. The kind is in `NEUTRAL_ONLY_KINDS`: the push preview is neutral and never carries the reply text, whatever preview version is negotiated. The design allowed text where the preview policy permits it. Email is excluded. The notice inherits the reminder group (`REMINDER_DUE`), is not coalesced and is bound to the Space of the reporter's most recent active Membership.
- **Reply read.** `GET /api/v1/support-reports/{id}/reply` also returns `reportedAt`, so the notice can say which report it answers ("Your report of <date>"), and it is not gated by the availability switch, so a reply already sent stays readable.
- **Sheet host.** The sheet is opened through a launcher store (`supportReportLauncher.ts`) and one shell-level host (`SupportReportHost`, mounted in the signed-in shell). The sheet and its draft therefore outlive the screen that opened it, for example an error state that a background refetch replaces. The sheet, its draft hook, client, failure display and styles live in a lazy chunk, and so does the reply body of a `SUPPORT_REPLY` notice: importing them statically put the Web entry bundle over its 800,000-byte gzip budget (794,947 before the feature, 803,645 with it). The background prefetch loads both chunks after the shell appeared (skipped under Save-Data), so a tap normally opens the sheet at once. A failed load is harmless: the host never suspends or throws into the shell and renders nothing, tries once more and otherwise closes the request, so the next tap loads again; the notice shows its title alone. Only load failures are handled this way; render errors of the loaded sheet still reach the error boundary. The failure recorder, the draft cleanup on sign-out, the launcher, the availability check and the localized strings stay in the entry because startup, sign-out and the entry points need them.
- **Failure reference and request id classes.** The failure reference allows `A-Za-z0-9_./{}:-` (1 to 200 characters) and never a URL (`://` is rejected). The request id allows `A-Za-z0-9._-` (1 to 128 characters). The classes exclude whitespace, `?`, `#` and `=`, so a query string or fragment cannot be stored.
- **Closing keeps the original time.** `set_state(CLOSED)` on an already closed report keeps the original `closed_at`, so retention is not extended by a repeated call. Leaving and re-entering `CLOSED` sets a fresh time.
- **Account deletion.** The cleanup is the entry `SupportReport` in `PERSONAL_ACCOUNT_ROWS` of `identity.deletion`; the replies follow through the foreign key cascade. There is no separate purge function.
- **Retention constants.** `CLOSED_RETENTION` is 90 days after `closed_at`, `MAX_RETENTION` is 365 days after `created_at`, and a report exactly at a cutoff is kept. `UNREAD_WARNING_AGE` is 14 days; a report exactly at the threshold does not warn yet.
- **ServerAdmin count.** The overview count is 0 while the feature is off, even when `NEW` reports from an earlier enabled period exist; the warning does not appear either.
- **No close icon.** The sheet shows no X icon, as decided on 2026-11-23. The labeled drag-handle header button stays as the close target for keyboard and screen-reader users. This is a named exception to `docs/COMPONENT-CONTRACTS.md` sections 8.2 and 8.4, implemented through the `showCloseIcon` prop of `ShortTaskSheet`.
- **Short error code on the sheet (Product Owner, 2026-11-23).** The report still sends the full generalized failure reference (method, route template, status or transport outcome, problem code, app or web), unchanged on the wire, in storage and in validation. The sheet's "what we send" list no longer shows that route template, because `AGENTS.md` keeps API terminology off couple-facing surfaces. It shows a short code built by `formatFailureForDisplay` in `web/src/client/failureReference.ts`: `<METHOD> · <status or transport outcome> · [<problem code> · ]<app|web>`, for example `GET · 500 · web`. A reference that does not parse falls back to its first 24 characters without `/` segments. The label reads "Error code and affected feature" (German `supportReport.items.failureLabel`), so the list still says that the affected feature is sent.
- **Entry point.** The feedback row is on the More page (utility group) instead of Settings, matching the mock-up.

### Open points for the Product Owner

- **(b) Offline message shifts the sheet.** On Compact the sheet grows from the bottom, so the offline message raises its top edge by about 77 px at 390 px width. Nothing moves inside the sheet. Keeping the viewport still would mean reserving the space while the sheet is idle, which leaves an empty block.
- **(c) App version and build are `unknown`.** The client reads `VITE_EIMIR_APP_VERSION` and `VITE_EIMIR_BUILD`; nothing sets them yet, so reports say `unknown` until the build does.
- **(d) Generated client.** The generated TypeScript client for the new endpoints was written by hand because the generator was not available. CI must confirm it with `tools/openapi/generate.sh --check` and commit any drift.
- **(e) PostgreSQL-backed checks.** The integration tests, the migration test and the hand-edited `backend/tests/fixtures/schema_fingerprint.json` have never run against PostgreSQL on the development host. CI must confirm them, including `python -m scripts.schema_fingerprint check`.
- **(f) Privacy notice.** *Resolved:* the draft privacy notice (`legal/de/privacy-policy.md`, version `2026-11-23.draft-10`) describes support reports in § 19 (what is sent, purpose, operator-only reading, encryption, rate limit, the single reply, retention, deletion with the account, no export, access on request) and the unsent draft in §§ 15 and 22; `legal/privacy-policy-review.md` maps each statement to the code and lists the open legal points as decision 18. Reports are not part of the personal export; adding them is a possible follow-up. The notice is still a draft with legal review pending, so `EIMIR_SUPPORT_REPORTS_ENABLED` stays off on eimir. Cloud until that version is published.
- **(g) Follow-ups.** (1) The Android push text for `SUPPORT_REPLY` is the generic "You have new messages": `PushPreview.java` `isNeutralReference()` knows only `ONCE_MESSAGE_RECEIVED`; a dedicated string and a `bodyResource()` case come later. (2) Hidden `SUPPORT_REPLY` notification rows are not deleted by `prune_expired`; the notice disappears with its report, the row stays. (3) The Web entry bundle has about 7.7 KB headroom (792,310 of 800,000 gzip bytes, measured on `b7346f8bd`). (4) `AppShell.tsx` is a shared foundation in the browser-impact planner, which is why the sheet host mount is not listed as a separate impact root.
