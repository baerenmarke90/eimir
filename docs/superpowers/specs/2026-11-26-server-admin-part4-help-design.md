# ServerAdmin redesign part 4: Help (support reports with reply templates)

**Status:** approved by the Product Owner on 2026-11-26. **Umbrella:** #2314, design
[2026-11-26-server-admin-redesign-design.md](2026-11-26-server-admin-redesign-design.md) section 5.4.
**Baseline:** `main` at `fbb60cf3b` (parts 1, 2, 2b merged; part 3 is PR #2326, still open).
**Visual reference:** mockup board "Hilfe > Meldungen"
(`docs/product/design/references/server-admin-redesign/05-help-compact.png`).
**Builds on:** [Support reports operator plugin](2026-11-24-support-reports-admin-plugin-design.md),
[Server Administration, Support reports](../../SERVER-ADMIN.md#support-reports).

## 1. Intent and why

The Product Owner answers support reports alone, mostly on the phone. Today every reply is typed
from scratch, the list shows only kind, time and version, so each report must be opened to know
what it is about, and only the `NEW` filter shows a count. Part 4 makes triage and answering fast:
see what a report says at a glance, answer with a tap on a saved text, keep the ticket button.

Success: the operator opens Help, sees in the list what each report is about, opens one, taps a
template, adjusts a word, sends.

## 2. Goals, non-goals, anti-goals

Goals

- The list shows the start of each report's note (decided by the Product Owner 2026-11-26) and the
  filter segments show their counts, as in the mockup.
- Reply templates: the operator creates, edits and deletes them, and inserts one into a reply.
- The opened report puts the note, templates, reply field, send and ticket button first.

Non-goals

- No change to the reply contract: one reply, plain text, at most 500 characters, not editable.
- No change to states, archive, delete or tickets (#2189 contract stays).
- No placeholders in templates, no per-language templates, no starter templates shipped.

Anti-goals

- Any link from a report to an Account, Space or Space file, or any identity in the list.
- Template text or note text in logs, audit, metrics or alert mails.
- Templates as i18n resources (they are the operator's own text).

## 3. Constraints

- Help exists only with the operator plugin `eimir-admin` (capability `support.operator`), as
  today's Reports section. Self-Hosted without the plugin sees no Help area (unchanged).
- Templates are plugin data in the plugin's own migration chain (`alembic_version_admin`),
  revision `0002`; no Core migration, no Core schema change.
- New table classified in `backend/pro/src/eimir_pro/portability/allowlist.py` (operator text,
  not a person's content).
- Product design gates of `AGENTS.md`: smartphone-first, Mobile Interaction Contract in the
  sub-issue, semantic tokens, filled-pill create action (`AddActionButton`), no borders on chips,
  Light/Dark, reduced motion, ~360/390/430 px evidence.
- Engineering language English; German copy only in i18n.

## 4. Approaches

| Way | What | Trade-off |
| --- | --- | --- |
| **A: plugin table + plugin routes (chosen)** | Table `support_reply_templates` in the admin chain, CRUD routes under the existing plugin router. | Shared by all ServerAdmins, survives devices and browsers, stays out of Core. |
| B: browser storage | Templates in `localStorage`. | One device only, lost with site data; no sharing. |
| C: Core server settings | A key-value setting in Core. | Puts plugin data into Core; Self-Hosted without the plugin carries data it never uses. |

Note preview: the server cuts the note to a preview (chosen) rather than the client clamping the
full note, so the list response never carries the full text.

## 5. The design

### 5.1 List (backend, plugin)

- `SupportReportListItem` gains `notePreview: string | null`: the note's first 160 characters
  (Unicode code points), whitespace runs collapsed to one space, an ellipsis `â€¦` appended when cut;
  `null` without a note. Built in `list_item`; the detail keeps the full `note`.
- `SupportReportListItem` gains `platform` and `os` from the client context (as the detail
  already has) for the card meta line "time Â· platform/os Â· build".
- `SupportReportListView` gains `stateCounts: {NEW, IN_PROGRESS, CLOSED}`: counts of unarchived
  reports per state (one grouped query in the plugin). `newCount` stays for existing callers.
- `docs/SERVER-ADMIN.md` changes the list row from "never the note" to "a note preview of at most
  160 characters", naming the Product Owner decision.

### 5.2 Reply templates (backend, plugin)

Table `support_reply_templates`: `id` UUID, `name` varchar(40) not null, `text` varchar(500) not
null, `created_at`, `updated_at`. Unique index on `lower(name)`. Plain text (operator text, no
personal data). At most 30 rows.

Routes under `/api/v1/server-admin/support-reports/templates` (same guard, operator switch,
`no-store`, maintenance behaviour as the report routes):

| Route | Purpose |
| --- | --- |
| `GET /templates` | All templates, sorted by name (case-insensitive) |
| `POST /templates` | Create `{name, text}` â†’ `201` |
| `PUT /templates/{templateId}` | Replace name and text |
| `DELETE /templates/{templateId}` | Delete â†’ `204` |

Template writes, like all support report routes since #2312, need the ServerAdmin role only, no
step-up re-authentication (`docs/SERVER-ADMIN.md`, Support reports > Routes; the stale module
docstring in `support_reports.py` is corrected in the same PR).

Validation: name 1â€“40 and text 1â€“500 characters after trimming (`422`); a 31st template answers
`409 SUPPORT_TEMPLATE_LIMIT`; a duplicate name (case-insensitive) `409 SUPPORT_TEMPLATE_NAME_TAKEN`;
unknown or malformed id `404 SUPPORT_TEMPLATE_NOT_FOUND`. The template routes are declared before
`/{reportId}` so `templates` is never parsed as a report id.

Audit: template writes are not privileged-audited (no person data; Core's audit action
constraint stays untouched). Sending a reply stays audited as `support_report.reply_sent`.

### 5.3 Web: Help area

- `AREA_SECTIONS.help` becomes `['reports', 'replyTemplates']`; the Help area shows the same inner
  sub-navigation System uses (Meldungen / Textbausteine). Deep link `?section=replyTemplates`.
- **List:** cards in the ServerAdmin card language: meta line (relative time Â· platform/os Â·
  build), kind chip (tinted, no border), the note preview as a quote, flags (replied, ticket,
  archived). Filter segments keep New / In progress / Done / All / Archive and show counts on the
  three states ("Neu Â· 3"). Footer line "Who reports stays anonymous here."
- **Opened report (detail):** the report keeps opening in the existing detail view (Compact:
  replaces the list with Back; Expanded: beside the list), not as an in-card accordion. The
  mockup's expanded card shows the content hierarchy; the detail also carries state, facts,
  archive and delete, which in an accordion would push the other reports far down (agent's call).
  Its order becomes note â†’ "Reply with template" chips â†’ reply field
  (counter as today) â†’ "Reply" (primary) + ticket button (icon, accessible name) â†’ state â†’
  technical facts â†’ archive/delete. A small "Edit" link next to the template heading leads to the
  templates page (asks first when a reply draft would be lost, as Back does). Without templates
  the chip row shows a hint with a link to create one. After a reply was sent, the chips are hidden.
- **Insert:** tapping a chip inserts the template text at the reply field's caret (or replaces
  the selection); into an empty field it fills it; with existing text and no caret it appends on a
  new line. Never overwrites silently. Focus returns to the field with the caret after the
  inserted text. If the result exceeds 500 characters, the existing too-long state shows (nothing
  is cut).
- **Templates page:** list of templates (name + first line of text), filled-pill
  `AddActionButton` "Create template" (hidden at 30, with a hint), each item opens an edit sheet
  (name, text with counter, Save, Delete with confirmation). Reuses the shared `ServerAdminSheet`
  from part 3 once #2326 is merged; otherwise the existing report sheet pattern.
- States: loading, empty, error, offline (writes disabled, as in the detail), success feedback
  as status lines. Motion: existing `eimir-motion-*` classes only; reduced motion respected.

## 6. Decided by the Product Owner (2026-11-26)

- Note preview in the list: yes, as in the mockup.
- Templates: shared by all ServerAdmins, name â‰¤ 40, text â‰¤ 500, at most 30, sorted
  alphabetically, no placeholders, no language assignment, no starter templates, own Help page
  "Textbausteine" plus an "Edit" link from the reply, reply area first in the opened report,
  server-side preview of â‰¤ 160 characters, no audit of template writes.

## 7. Left to the builder

- Component split and file names; the exact icon for the ticket button (reuse an existing one).
- Whether the counts reuse one request or the list response (chosen: list response).
- Test selection: unit tests for the preview cut and insert helper, plugin integration tests for
  the template routes and list additions, one browser spec `server-admin-help.spec.ts` registered
  in `web/e2e/test-groups.json` and `test-impact.json`.
