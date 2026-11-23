# Support reports in the Core (design, part 1 of 3)

**Status:** Draft for Product Owner approval, 2026-11-23.
**Baseline:** `main` at `28ebc7080`, Alembic head `0171`.
**Owning issue:** #2189 (extended from "report a problem" to "report a problem or send feedback").
**Related:** Decision 0017 (plugin seam), Decision 0018 (Cloud first, Self-Hosted later), #2158 / PR #2163 (tester reference), #2182 (Pro split, still running).

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

- A signed-in person can send a report of type **problem** or **feedback** from the error state and from "Help & feedback" in Settings.
- The sheet shows in plain words what will be sent. Nothing is sent without that confirmation.
- A report works offline: the note is kept and sent later; a failed send is shown honestly.
- The Core stores the report, protected at rest, with limits and with deletion on account deletion.
- The Core exposes a service interface (`list`, `get`, `set_state`, `send_reply`) that the later plugin uses. The Core never imports the plugin.
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

New Core table `support_reports` (Alembic revision after `0171`):

| Column | Notes |
| --- | --- |
| `id` | UUID primary key. |
| `account_id` | Reporter. Not Space-scoped: reports are about the app, not a relationship. Deleted with the account. |
| `client_request_id` | UUID from the client; unique per account, makes offline retry idempotent. |
| `kind` | `PROBLEM` or `FEEDBACK`. |
| `state` | `NEW`, `IN_PROGRESS`, `CLOSED`. Written only through the service interface. |
| `created_at`, `closed_at` | |
| `payload` | `ProtectedPayloadJSON`, crypto context bound to the report id. Holds the fields listed below. |
| `reply` | Protected payload with `text` (at most 500 characters) and `replied_at`, empty until answered. One reply per report (see "Reply semantics"). |

**Allowed payload fields (allow-list, pinned by a unit test on both client and server):**

- `note`: free text, at most 2,000 characters; required for `FEEDBACK`, optional for `PROBLEM`.
- `failure`: the generalized tester reference (method class, route template without ids, HTTP status or transport outcome, problem `code`, app or web), and the `x-request-id` of the failing response.
- `client`: app version and build, platform (`app` or `web`), OS and browser or WebView version, locale, theme, online state, local time and time zone.

**Never included:** tokens, URLs with ids or query strings, file names, memory/plan/list/message text, location, contact data, device identifiers beyond the app version, other people's data. The server rejects unknown payload fields (strict schema) so a future client cannot leak by accident.

Retention (my call, see handover list): a closed report is deleted 90 days after closing; any report is deleted at most 365 days after creation; account deletion removes the person's reports and replies immediately. A scheduled maintenance job does the time-based deletion.

### API

- `POST /api/v1/support-reports`: authenticated, strict schema, body size cap, `client_request_id` idempotency (replay returns the existing report without a second row). Rate limited per account through `eimir.auth.rate_limit` (database-backed; proposed 5 per hour and 20 per day; the builder confirms the numbers against the existing limits).
- `/api/v1/instance` gains `supportReportsAvailable` (Boolean). It is true only when the operator enabled reports (see below).
- `GET /api/v1/support-reports/{id}/reply`: returns the reply text and time, only to the reporter (404 for anyone else or when there is no reply yet). The notification list item uses it to show the reply. There is no list or reopen endpoint for reports.

### Availability switch (honesty)

Without a reader, a "thanks, received" would mislead. A new operator setting `EIMIR_SUPPORT_REPORTS_ENABLED` (default `false`) controls `supportReportsAvailable`, and the endpoint refuses when it is off. The client shows the entry points only when it is true. It is turned on for Cloud and the private test channel once part 3 can read reports. This is operator configuration, not couple configuration (`AGENTS.md`, user rule).

The Core cannot know whether someone reads the reports, so the guard is documentation plus a signal: `docs/SELF-HOSTING.md` states "enable only if you read the reports", and the existing ServerAdmin overview gains one aggregate count of `NEW` reports and a warning code when `NEW` reports older than 14 days exist (counts only, no content). Whether Self-Hosted operators receive the admin plugin at all is a question for part 3 and Decision 0018 (Self-Hosted is not offered at launch); part 1 introduces no Self-Hosted reader.

### Service interface for the later plugin

`eimir.support_reports.service`: `list_reports(filter, page)`, `get_report(id)`, `set_state(id, state)`, `send_reply(id, text)`. Return types carry the opaque `account_id` only, never an email address or display name. The operator finds the person through the existing ServerAdmin account directory, which already restricts what is shown (`docs/SERVER-ADMIN.md`). `send_reply` stores the reply and creates the notification (below). No Core module imports a plugin; the plugin imports this service. The interface is covered by tests in the Core so part 3 cannot silently break it.

### Reply semantics

- A report receives **at most one reply**. A second `send_reply` for the same report is rejected with a conflict; the operator can close the report and, if more is needed, the person sends a new report. This matches "no thread, no inbox" and keeps one column instead of a child table.
- Replying does **not** change `state`. `state` is the operator's own triage marker and is set only through `set_state`. A closed report can still be replied to, once.
- The notification's source-event key is the report id, so a replay cannot create a second notice.

### Reply notification

A new `NotificationKind.SUPPORT_REPLY` in `engagement`, following `docs/product/notification-workflow.md`: one canonical recipient Notification with source-event uniqueness, Push through the existing pipeline, quiet hours and recipient consent inherited from the closest existing group (no new settings UI). The notification shows the operator's text as plain text (never HTML or links rendered). A person can opt out of it with the existing notification controls.

**Presentation without an inbox:** the notification list item shows the neutral context line "Reply to your report of <date>" and the full reply text (at most 500 characters, so nothing is truncated). It does not quote the person's own note. Tapping it only marks it read; there is no destination screen. The push preview follows the existing negotiated preview policy for the title and shows the start of the text only where that policy already allows content previews. The builder's first task is to check that the Notification model supports a non-Space target (see "What is left to the builder").

### Client

- **Entry points:** an optional secondary action "Report a problem" on `ProblemState` (shared component, behavior unchanged without the new prop) and a "Help & feedback" row in Settings. Both open the same sheet. Visible only when `supportReportsAvailable` is true. Not browser-only, so no native hiding is needed.
- **No X in the sheet (Product Owner, 2026-11-23):** the sheet shows no close "X". It closes by pulling down, tapping the backdrop, or Back/Escape. `docs/COMPONENT-CONTRACTS.md` sections 8.2 and 8.4 say a sheet has a *visible* Close; this sheet is a deliberate exception that the implementation PR must name. The existing header button of `ShortTaskSheet` (drag handle) stays as the labeled close target for keyboard and screen-reader users, and only its X icon is hidden through a new `showCloseIcon` prop.
- **Signed-in only (my call):** the endpoint is authenticated and the action is hidden where the problem is a lost session or sign-in (`unauthorized`) or an unreachable instance (`offline` with no session). An anonymous report path would need its own abuse model and is out of scope; it can be revisited as a separate decision.
- **What is attached:** the failure reference is attached only when the sheet is opened from `ProblemState`, and only for the failure shown there. From Settings, and for `FEEDBACK`, no failure reference is attached. The "what is sent" list always matches the actual payload, including "your account, so the team can answer".
- **Sheet** (reusing the existing sheet pattern, `ShortTaskSheet`): choice between "Something is not working" and "Feedback / idea", one text field, a plain-language list of what is sent, one filled primary "Send" button, a calm success state that promises no answer. Compact first; on Expanded the existing dialog form of the sheet.
- **Payload builder:** `web/src/client/supportReport.ts` builds exactly the allowed fields. A generalized failure reference (the #2163 token for any request failure) is kept in memory for the last failed request only.
- **Offline and failure:** the draft and its `client_request_id` are kept locally; send is retried when online; a failed send says so and offers a retry. No retry loop on repeated failure.
- **States:** Loading (sending), Empty (feedback needs text), Error, Offline (draft kept), Success. Reduced motion respected; Light/Dark; about 360, 390, 430 px; large text.

### Visual reference

[`design/references/support-reports/mockup.html`](design/references/support-reports/mockup.html) shows seven Compact states in Light and Dark: problem state entry, More row, problem sheet, feedback sheet, offline, success and the reply notification. It is a rendered sketch, not a generated image (Product Owner decision 2026-11-21). Expanded (the existing centered dialog form of the sheet) is not drawn. The dark primary action color in the sketch is approximate and must be checked against `--color-action-primary` during implementation. The Product Owner accepted this design on 2026-11-23.

## Cross-cutting review (summary)

- **Security and abuse:** authenticated only, strict schema, size cap, DB-backed rate limit, reply text rendered as plain text, no HTML.
- **Privacy and lifecycle:** payload protected at rest, allow-listed, purged on account deletion (`identity.deletion.apply_core_cleanup`), time-based retention job, included in the personal export decision below.
- **i18n and accessibility:** all texts localized; sheet focus management, labels, large text.
- **Resilience:** idempotent create, offline draft, honest failure.
- **Observability:** the `x-request-id` in the report correlates with server logs without storing content.
- **Operations:** one setting; Self-Hosted documentation in `docs/SELF-HOSTING.md` says where reports land (the instance's own database, read through the admin plugin in part 3).
- **Contract:** OpenAPI and generated clients change; migrations are additive.
- **Testing:** allow-list tests, negative cases (offline, 413, 429, 5xx, replay), account-deletion test, notification test.

## Business/freemium

Business/freemium impact reviewed: a support path, available to every tier, not paywallable. No entitlement, quota or downgrade change. Managed cost (storage, handling) is small and bounded by the limits above. A row is added to `docs/FREEMIUM-FEATURE-MATRIX.md` classifying support reports as non-paywallable in Cloud and Self-Hosted alike.

## Reuse review

Reused: the existing notification pipeline, `auth.rate_limit`, `ProtectedPayloadJSON`, the sheet pattern, the shared problem state, the #2163 reference token, `x-request-id`. Custom code is justified only for the report schema, the service interface and the sheet content. An error tracker and a mail hand-over were considered and rejected (see Approaches).

## What is left to the builder

- Verify the Notification model supports a recipient without a Space; if it does not, choose the least invasive option (for example the reporter's active Space) and record it in the PR.
- Final rate-limit numbers and the exact wording of all texts.
- Whether `state` needs more values for the admin portal; start with the three above.
- Where the personal export includes reports (my call: not included, because reports are about the app and operator-held; the builder confirms against `docs/ACCOUNT-DELETION-SELF-HOSTED.md` and the export contract).
- The Mobile Interaction Contract and visual evidence (baseline `main` `28ebc7080`; screens to review: `ProblemState`, Settings, and the More page).

## Acceptance criteria

- [ ] A person can send a problem or a feedback from the problem state or Settings in at most two taps plus an optional note, one-handed on Compact.
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
