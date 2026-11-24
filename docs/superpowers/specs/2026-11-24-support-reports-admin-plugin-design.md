# Support reports, part 3: the operator plugin `eimir-admin`

**Status:** draft for Product Owner approval. **Owning issue:** #2189 (parts 2 and 3).
**Builds on:** [Support reports in the Core](../../product/support-reports-core-design.md) and its
[service interface](../../product/support-reports-service-interface.md) (merged), Decision 0017
(plugin seam), Decision 0020 (no Transfer Bundle self-service).

## 1. Intent and why

Couples can already send a problem report or feedback from the app. The Core stores it,
protected at rest, and can notify the sender about one optional reply. What is missing is the
operator side: the single person who runs eimir. needs a place to read the reports, mark what
is being handled, answer when they want to, and turn a real problem into a work item in the
issue tracker.

The Product Owner decided that this operator side

- is **not public code in the product sense**: it ships as its own plugin next to `eimir-pro`,
  never in a Core-only or Self-Hosted build;
- reads and answers reports **without any obligation**: a reply is optional, one per report,
  delivered as a simple notification. There is no inbox, thread or ticket system for couples;
- **hands work over to the issue tracker** (GitHub first, Forgejo later), never copying what
  the couple wrote.

## 2. Goals, non-goals, anti-goals

Goals

- A ServerAdmin can list reports (filter by state), read one, set its state, reply once, and
  create one tracker ticket from it.
- The plugin loads next to `eimir-pro`; it is absent on Core-only and Self-Hosted installs.
- The tracker is behind a small adapter interface; GitHub is the only implementation now.

Non-goals

- No Forgejo adapter now (the interface must make it a one-class addition).
- No multi-operator assignment, comments, SLAs, labels or search over report text.
- No automatic ticket creation, no analytics or reporting over reports, no export of reports
  (reports stay out of the Transfer Bundle, see ADR 0020).
- No change to what couples see: the Core endpoints and the reply notice stay as they are.

Anti-goals (a failure even if it works)

- User-written text (note, reply text, failure reference text beyond the technical reference
  value) ending up in the tracker or in logs.
- The admin part becoming a prerequisite for Core operation, or Core importing the plugin.
- Any new burden for a normal couple, or for a Self-Hosted operator who does not use it.

## 3. Constraints

- Core never imports a plugin (`tests/unit/test_core_imports_no_plugin.py`); the plugin may
  import Core modules and uses `eimir.support_reports.service` as the only access to report
  data. Every service function flushes and never commits; the caller owns the transaction.
- Decision 0017 currently assumes at most one plugin. This work includes the amendment (part 2,
  section 5.1).
- Business/freemium: operator tooling, not a couple capability. Not Premium, not paywallable,
  no entitlement row; classified in `docs/FREEMIUM-FEATURE-MATRIX.md` as non-paywallable
  operator capability when the matrix is next touched. Cloud only in effect (Self-Hosted
  operators can install it too, since it is operator tooling; it is simply not shipped by default).
- Smartphone-first still applies to the web section (the operator may read on a phone); the
  admin area may use denser information design (AGENTS.md allows it for administration).
- Engineering language is English; the operator UI follows the existing admin-area language
  handling.

## 4. Approaches considered

**Where it lives.** (a) Own plugin `eimir-admin` next to `eimir-pro` — **chosen**; (b) inside
`eimir-pro` — rejected: every Pro build would be an admin build and operator rights would mix
with Premium rights.

**Where the UI lives.** (a) A section in the existing ServerAdmin area of the web client —
**chosen** (one operator, same fresh-authentication protection, no second delivery path); the
section is visible only when the capability is advertised; (b) a separate UI shipped by the
plugin — rejected for effort; revisit only if the UI itself must not be in public source.

**What goes into a ticket.** (a) Technical data only, no user text — **chosen**; (b) copy the
original text — rejected (a public or shared tracker would leak private text); (c) optional
toggle — rejected (a switch that can be set wrongly).

**How a report is linked to its ticket.** (a) A small plugin-owned table — **chosen**;
(b) the tracker as only source with a search — rejected (slow, rate limits, no safe
duplicate guard).

## 5. Design

### 5.1 Part 2: allow more than one plugin (own change, first)

The loader already resolves a comma list from `EIMIR_PLUGINS` and merges the results; only
the allow-list (`EXPECTED_DISTRIBUTIONS`, one entry) and Decision 0017's "at most one trusted
plugin" wording stand in the way. Change:

- add `admin` → distribution `eimir-admin` to the allow-list; the loader still accepts a name
  only from its expected distribution;
- amend Decision 0017 (or add a short follow-up decision) so it says: a small, fixed number of
  trusted plugins from the same build; each is named in `EIMIR_PLUGINS` and loaded in that
  order; route collisions already fail startup; capabilities must not overlap between
  plugins (new startup check); job kinds, engagement targets and migration chains are
  per plugin;
- merging hooks that today say "first loaded plugin wins" (date ideas, push preview) stay
  as they are; the amendment states that only one plugin may provide them.

No runtime behavior changes for installs with `EIMIR_PLUGINS=pro` or empty.

### 5.2 The plugin package

- Directory `backend/admin/` as a uv workspace member, same layout and boundary rules as
  `backend/pro/` (import root `eimir_admin`, distribution `eimir-admin`, entry point `admin`).
  It can move to its own repository unchanged.
- Capability `support.operator` (name is the builder's call within the existing
  `Capability` naming scheme). Declared by the plugin; the Core account/instance
  capability view advertises it only to ServerAdmins, so the web client can show the section.
- Seam version and Core revision checks work as for Pro.

### 5.3 Operator API (plugin routers under `/api/v1/server-admin/support-reports`)

All routes require `CurrentServerAdmin` and the recent-authentication check the other
ServerAdmin routes use, answer `Cache-Control: private, no-store`, and respond `404` while
`EIMIR_SUPPORT_REPORTS_ENABLED` is off.

| Route | Purpose |
| --- | --- |
| `GET /` | list, optional `state`, keyset cursor (service `list_reports`); items show kind, state, age, reference, app version/build, whether a ticket and a reply exist; no note text in the list |
| `GET /{id}` | the full report (note, failure reference, client context), reply if any, ticket link if any; the opaque account id only, no name or email |
| `PUT /{id}/state` | set `NEW` / `IN_PROGRESS` / `CLOSED` (`set_state`) |
| `POST /{id}/reply` | one reply of at most 500 characters (`send_reply`); a second reply is `409 SUPPORT_REPORT_ALREADY_REPLIED` |
| `POST /{id}/ticket` | create one tracker ticket (5.4) |

The operator finds the person through the existing ServerAdmin account directory by
opaque account id; the plugin does not duplicate it. Writes (state, reply, ticket) are
recorded in the existing privileged audit with report id and action, never text. Reads are
not audited.

### 5.4 Tracker adapter and ticket

- Interface `IssueTracker.create_issue(title, body, labels) -> TicketRef(url, number)` in the
  plugin. `GitHubIssueTracker` is the only implementation, using GitHub's REST API over the
  HTTP client Core already depends on (no new dependency).
- Operator configuration (environment, validated at startup by the plugin's `validate`):
  `EIMIR_ADMIN_TRACKER` (`github`), the repository, and a token with issue-write scope only.
  Without it, the ticket route answers `409`/`503` with a clear code and the UI hides the
  button. Credentials never reach a client and never appear in logs.
- The operator writes the **title and body** in the UI (prefilled with a neutral template:
  kind, app version, build, platform, failure reference, report id). The body never carries
  the couple's note or the reply text; the server enforces this by composing the body from
  the technical fields plus the operator's own text and by refusing to include stored text
  fields. The operator is responsible for what they type (the UI says so).
- Linking table `support_report_tickets` (plugin chain with its own `version_table`, a row in
  the Core manifest as the seam requires): `report_id` (FK to `support_reports`, cascade,
  unique), `tracker`, `url`, `number`, `created_at`, `state` (`PENDING` / `CREATED`).
  Creation reserves the row (`PENDING`) in one transaction, calls the tracker, then
  marks it `CREATED`. A second request for the same report returns the existing link or a
  conflict. A `PENDING` row older than a few minutes is shown to the operator as "uncertain,
  check the tracker" with a way to clear it; no automatic retry creates duplicates.
- The row leaves with its report (cascade, retention, account deletion) so Core lifecycle
  stays correct without the plugin.

### 5.5 Web client

A "Reports" section in the existing ServerAdmin area, shown only when the capability is
advertised: list with state filter and unread count, detail view with state switcher, reply
form (500 characters, shows that it is one-time), and "Create ticket" with the prefilled
template. Uses existing admin-area components and tokens, loading/empty/error/offline states,
accessible labels, i18n through the localization layer. The existing overview warning
(`support_reports_unread`) links into the section.

### 5.6 Privacy and operations

- Report text is read only inside the operator routes and rendered as plain text.
- The privacy notice already covers storage and the single reply; it gains a sentence that
  the operator may create a technical ticket without the text (legal wording is reviewed
  before `EIMIR_SUPPORT_REPORTS_ENABLED` is turned on on Cloud, as already tracked).
- Cross-cutting: authorization (ServerAdmin plus recent authentication, 404 when off),
  concurrency (unique indexes serialize reply and ticket), resilience (tracker failure leaves
  the report unchanged and the ticket row `PENDING` or absent), observability (audit entries
  and metrics for ticket creation outcome, no text), negative tests (non-admin, stale
  authentication, feature off, second reply, second ticket, tracker down, text never in
  ticket body).

## 6. Delivery order

1. Part 2: multi-plugin loader, allow-list entry, Decision 0017 amendment, tests.
2. Plugin skeleton `backend/admin` (capability, entry point, build and Supply Chain wiring).
3. Operator routes, ticket table and adapter, backend tests.
4. Web section, browser-test ownership entries
   (`web/e2e/test-groups.json`, `test-impact.json`), design evidence, i18n.
5. Docs: SERVER-ADMIN.md, SELF-HOSTING.md, matrix classification.

## 7. Left to the builder

Exact capability and route names within existing conventions, the visual composition of the
admin section (reuse admin components), the exact `PENDING` timeout, the ticket label set,
the neutral title/body template wording, and test selection. Calls made without the Product
Owner: ticket-creation audit only for writes, the `PENDING` reservation scheme, rejecting
overlapping capabilities between plugins, and no read audit.

## 8. Clarifications from the builder check

Answered by the project (no decision needed)

- **Technical fields.** The failure reference is restricted to `A-Za-z0-9_./{}:-`, 1 to 200
  characters, never a URL; `requestId` is similarly restricted. Both count as technical. The
  free-text fields are exactly the report `note` and the reply `text`.
- **Recent authentication.** The web client already handles a stale session for the ServerAdmin
  area (`web/src/client/recentAuthentication.ts`); the new section reuses it.
- **Image and distribution.** The backend image is built with `uv sync --all-packages`, so
  `eimir-admin` is in the image like `eimir-pro` and is loaded only when `admin` is named in
  `EIMIR_PLUGINS`. No separate wheel and no extra image. "Absent" means unloaded, not
  uninstalled; Self-Hosted operators simply never name it.
- **Unread.** "Unread count" is the number of `NEW` reports (`count_new`), the value the
  overview warning already uses. No seen/unseen marker.

Calls made without the Product Owner

- **Text guard is by construction.** The ticket body is composed only from the technical fields
  and the operator's typed text; the stored `note` and reply are never read into the request.
  There is no substring check of what the operator types. The negative test asserts the stored
  note and reply never occur in the outgoing request unless typed by the operator.
- **Clearing a `PENDING` row** deletes the row after an explicit confirmation that warns a
  duplicate ticket may result. It is a separate route (`DELETE /{id}/ticket`) with its own
  audit action. There is no manual URL linking.
- **Transactions.** The ticket route commits the `PENDING` reservation in its own short
  transaction before calling the tracker, then commits the result; this is allowed in plugin
  route code (the "never commit" rule binds service functions that receive a session). A crash
  between the two leaves the `PENDING` row.
- **Missing tracker configuration is a runtime state.** The plugin loads; `validate` only
  rejects malformed values that are set. The report detail response carries
  `ticketAvailable: bool`, which the UI uses to show or hide the button; no second capability.
- **Part 2 checks.** The "no overlapping capabilities" rule is a new loader startup check; the
  single-provider rule for date ideas and push preview is documented, not checked. The Core
  manifest gets the new table row as for any plugin table and does not import the plugin;
  plugin migration chains already run per plugin after the Core chain. Part 2 can merge on its
  own.
- **Audit and metrics.** One privileged-audit action per write (`support_report.state_set`,
  `.reply_sent`, `.ticket_created`, `.ticket_cleared`), recorded on success only; a failed
  tracker call is counted in the existing metrics mechanism (outcome label), not audited.
