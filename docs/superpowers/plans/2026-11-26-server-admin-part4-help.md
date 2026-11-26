# ServerAdmin part 4 (Help) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Help shows a note preview and state counts in the report list, and the operator can keep reply templates and insert them into a reply.

**Architecture:** Everything backend lives in the operator plugin `eimir-admin` (`backend/admin/src/eimir_admin`): list additions in the existing router, a new table in the plugin's own migration chain (revision `0002`) and CRUD routes on the same router. The Web client gets a template helper module, a restyled list, a reordered detail with template chips, and a second Help page `replyTemplates`.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic (plugin chain `alembic_version_admin`), pytest; React, TanStack Query, Vitest, Playwright (CI only), i18next.

**Spec:** `docs/superpowers/specs/2026-11-26-server-admin-part4-help-design.md` (approved 2026-11-26). Issue #2327, umbrella #2314.

## Global Constraints

- Note preview: first **160** code points, whitespace runs collapsed to one space, trimmed, `…` appended when cut; `null` for a missing or blank note.
- Template name **1–40**, text **1–500** characters after trimming; at most **30** templates; names unique case-insensitively; sorted by `lower(name)`.
- Error codes: `SUPPORT_TEMPLATE_LIMIT` (409), `SUPPORT_TEMPLATE_NAME_TAKEN` (409), `SUPPORT_TEMPLATE_NOT_FOUND` (404); validation `422`.
- Template routes: ServerAdmin guard, operator switch (404 while `EIMIR_SUPPORT_REPORTS_ENABLED` off), `Cache-Control: private, no-store`, no step-up, no privileged audit.
- Template and note text never in logs, audit, metrics or alerts. No reporter identity added anywhere.
- No Core migration, no Core schema change. New table classified in `backend/pro/src/eimir_pro/portability/allowlist.py`.
- English in code/tests/docs; German only in `web/src/i18n/locales/serverAdmin.ts`, English copy in `web/src/i18n/locales/en.json`; tests derive copy from locale keys, never German literals.
- UI: semantic tokens only; chips tinted without border; create action is `AddActionButton`; motion only via existing `eimir-motion-*` classes (`web/scripts/check-motion-layer.mjs`); i18next: never pass `t` with a hand-written type, pass options only when defined.
- Line endings: commit LF; strip any BOM (PowerShell `Set-Content` adds one).

## Review Focus

1. A note of only whitespace/newlines → preview `null`, card shows no quote (Task 1 test `test_note_preview_blank_is_none`).
2. Exactly 160 code points → no ellipsis; 161 → 160 + `…`; an emoji is one code point (Task 1 tests).
3. Renaming a template to its own name in another case is allowed; another template's name in any case is `409` (Task 3 test `test_rename_to_own_name_other_case_is_allowed`).
4. Inserting a template that pushes the reply over 500 characters keeps all text and shows the existing too-long state (Task 4 test `insertTemplate keeps text beyond the limit`, Task 6 test).
5. A template deleted elsewhere while its edit sheet is open → save answers 404 → sheet closes with a "no longer exists" notice and the list refreshes (Task 7 test).

---

### Task 1: List additions (preview, platform/OS, state counts)

**Files:**
- Create: `backend/admin/src/eimir_admin/api/preview.py`
- Modify: `backend/admin/src/eimir_admin/api/models.py` (`SupportReportListItem`, `SupportReportListView`, module docstring)
- Modify: `backend/admin/src/eimir_admin/api/support_reports.py` (`list_item`, `list_support_reports`, module docstring: drop "need recent authentication", replace "list shows triage facts only")
- Modify: `docs/SERVER-ADMIN.md` (Routes table `GET /` row)
- Test: `backend/admin/admin_tests/test_note_preview.py`, `backend/admin/admin_tests/integration/test_support_report_routes.py`

**Interfaces:**
- Produces: `note_preview(note: str | None) -> str | None`, `NOTE_PREVIEW_MAX_CHARACTERS = 160`; list item fields `note_preview`, `platform`, `os` (wire `notePreview`, `platform`, `os`); list view field `state_counts: SupportReportStateCounts` with `new`, `in_progress`, `closed: int` (wire `stateCounts.{new,inProgress,closed}`).

- [ ] **Step 1: Failing unit tests** in `test_note_preview.py`: `note_preview(None) is None`; `test_note_preview_blank_is_none` (`" \n\t "` → `None`); `"a\n\n  b"` → `"a b"`; `"x"*160` → unchanged; `"x"*161` → `"x"*160 + "…"`; `"😀"*161` → 160 emoji + `"…"`.
- [ ] **Step 2: Run** `pytest backend/admin/admin_tests/test_note_preview.py -q` → FAIL (import error).
- [ ] **Step 3: Implement** `note_preview` (`" ".join(note.split())`, cut by code points).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Failing integration test** — rename `test_list_filters_by_state_and_never_returns_note_text` to `test_list_filters_by_state_and_returns_a_note_preview`: the item carries `notePreview == SECRET_NOTE` (short note), no `note` key, no reporter email; new `test_list_cuts_a_long_note` (200-char note → 161-char preview); new `test_list_state_counts_ignore_archived` (2 NEW, 1 IN_PROGRESS, 1 archived NEW → `{"new": 2, "inProgress": 1, "closed": 0}`); item has `platform == "app"`, `os == "Android 16"`.
- [ ] **Step 6: Run** with the integration DB (`-k "note_preview or long_note or state_counts"`) → FAIL.
- [ ] **Step 7: Implement**: fields in models; `list_item` fills them from `payload.note` and `payload.client`; counts via one `select(SupportReport.state, func.count()).where(SupportReport.archived_at.is_(None)).group_by(SupportReport.state)` in a helper `_state_counts(session)`; `newCount` unchanged.
- [ ] **Step 8: Run** → PASS; also the whole `test_support_report_routes.py` file.
- [ ] **Step 9: Docs** — `docs/SERVER-ADMIN.md` `GET /` row: "…plus a note preview of at most 160 characters (Product Owner decision 2026-11-26, #2327), `platform`, `os`, the `newCount` and `stateCounts` of unarchived reports; never the full note".
- [ ] **Step 10: Commit** `feat(server-admin): note preview and state counts in the support report list (part 4)`.

### Task 2: Template table in the plugin chain

**Files:**
- Create: `backend/admin/src/eimir_admin/reply_templates/__init__.py`, `.../reply_templates/models.py`
- Create: `backend/admin/src/eimir_admin/alembic/versions/0002_support_reply_templates.py`
- Modify: `backend/admin/src/eimir_admin/plugin.py` (`model_modules` adds `"eimir_admin.reply_templates.models"`)
- Modify: `backend/pro/src/eimir_pro/portability/allowlist.py` (`"support_reply_templates": "Operator's reply templates; operator text, not a person's content."`)
- Test: `backend/admin/admin_tests/test_ticket_migration.py` (extend: chain head is `0002`, table exists, model matches) or a sibling `test_reply_template_migration.py` following its pattern

**Interfaces:**
- Produces: `SupportReplyTemplate(IdMixin, Base)`, `__tablename__ = "support_reply_templates"`, columns `name: String(40)`, `text: String(500)`, `created_at`, `updated_at` (both `DateTime(timezone=True)`, server default `now()`; `updated_at` set by the service), functional unique index `uq_support_reply_templates_name_lower` on `lower(name)`. Constants `TEMPLATE_NAME_MAX = 40`, `TEMPLATE_TEXT_MAX = 500`, `TEMPLATE_LIMIT = 30` in `models.py`.

- [ ] **Step 1: Failing tests**: offline SQL render shows `CREATE TABLE support_reply_templates` and the `lower(name)` unique index, `down_revision == "0001"`; DB test runs the chain and `compare_metadata` reports no diff; downgrade to `0001` drops the table.
- [ ] **Step 2: Run** `pytest backend/admin/admin_tests -k migration -q` → FAIL.
- [ ] **Step 3: Implement** model, migration (`revision = "0002"`, `down_revision = "0001"`, docstring like `0001`), plugin model module, allowlist entry.
- [ ] **Step 4: Run** migration tests and the portability allowlist test (`pytest backend/pro -k allowlist -q`) → PASS.
- [ ] **Step 5: Commit** `feat(server-admin): reply template table in the operator plugin chain (part 4)`.

### Task 3: Template service and routes

**Files:**
- Create: `backend/admin/src/eimir_admin/reply_templates/service.py`
- Create: `backend/admin/src/eimir_admin/api/reply_templates.py` (router, models `SupportReplyTemplateView{id,name,text,createdAt,updatedAt}`, `SupportReplyTemplateListView{items}`, `SupportReplyTemplateWrite{name,text}` with `StringConstraints(strip_whitespace=True, min_length=1, max_length=…)`)
- Modify: `backend/admin/src/eimir_admin/plugin.py` (`routers` returns the templates router **before** `support_reports.router`)
- Modify: `backend/openapi.json` (`cd backend; python -m scripts.openapi_contract write`), `web/src/api/generated/**` (`tools/openapi/generate.sh`, Docker)
- Modify: `docs/SERVER-ADMIN.md` (new "### Reply templates" subsection after "### Reply")
- Test: `backend/admin/admin_tests/integration/test_reply_template_routes.py`, `backend/admin/admin_tests/unit/test_reply_template_service.py`; endpoint matrix entries if `backend/tests/integration/test_endpoint_matrix.py` enumerates plugin routes (check with `-k support_report`)

**Interfaces:**
- Consumes: Task 2 model and constants.
- Produces: service `list_templates(session) -> list[SupportReplyTemplate]`, `create_template(session, *, name: str, text: str) -> SupportReplyTemplate`, `update_template(session, template_id: UUID, *, name: str, text: str) -> SupportReplyTemplate`, `delete_template(session, template_id: UUID) -> None`; raises `ConflictError(…, "SUPPORT_TEMPLATE_LIMIT" | "SUPPORT_TEMPLATE_NAME_TAKEN")`, `NotFoundError(…, "SUPPORT_TEMPLATE_NOT_FOUND")`. Routes (operation ids): `GET  /server-admin/support-reports/templates` `listSupportReplyTemplates`; `POST …/templates` `createSupportReplyTemplate` (201); `PUT …/templates/{templateId}` `updateSupportReplyTemplate`; `DELETE …/templates/{templateId}` `deleteSupportReplyTemplate` (204).

- [ ] **Step 1: Failing integration tests**: create → 201 and listed; list sorted case-insensitively (`"b"`, `"A"`, `"c"` → `A, b, c`); name 41 chars / empty / text 501 → 422; whitespace-only text → 422; 31st → 409 `SUPPORT_TEMPLATE_LIMIT`; duplicate `"Danke"` vs `"danke"` → 409 `SUPPORT_TEMPLATE_NAME_TAKEN`; `test_rename_to_own_name_other_case_is_allowed`; update unknown / malformed id → 404 `SUPPORT_TEMPLATE_NOT_FOUND`; delete → 204 then 404; non-admin 403, anonymous 401, feature off 404; `no-store` header; no `InstanceAdministrationActionEvent` row written; `GET /support-reports/templates` is not parsed as a report id (returns a list, not 404).
- [ ] **Step 2: Run** `-k reply_template` → FAIL.
- [ ] **Step 3: Implement** service (name uniqueness checked with `func.lower(name) == name.lower()` excluding self, plus `IntegrityError` on the unique index mapped to `NAME_TAKEN`; limit via `count()` before insert) and router (reuse `_require_operator`/`_no_store` from `support_reports.py` by importing them).
- [ ] **Step 4: Run** → PASS; rerun `test_support_report_routes.py`.
- [ ] **Step 5: Contract** — write `backend/openapi.json`, run `tools/openapi/generate.sh`, then `tools/openapi/generate.sh --check`. Convert generated files to LF.
- [ ] **Step 6: Docs** — `### Reply templates` subsection: shared by all ServerAdmins, limits, routes, errors, plain text, not audited, removed with the plugin chain downgrade; runbook line in "Runbook: downgrades" (`0002` drops the templates).
- [ ] **Step 7: Commit** `feat(server-admin): reply template routes in the operator plugin (part 4)`.

### Task 4: Web template client and insert helper

**Files:**
- Create: `web/src/client/supportReplyTemplates.ts`
- Test: `web/src/client/supportReplyTemplates.test.ts`

**Interfaces:**
- Consumes: generated `ServerAdminSupportReportsApi` template methods (Task 3).
- Produces: `REPLY_TEMPLATE_NAME_MAX = 40`, `REPLY_TEMPLATE_TEXT_MAX = 500`, `REPLY_TEMPLATE_LIMIT = 30`; `REPLY_TEMPLATES_QUERY_KEY = ['server-admin', 'support-reports', 'templates'] as const`; `loadReplyTemplates(api)`, `createReplyTemplate(api, draft: ReplyTemplateDraft)`, `updateReplyTemplate(api, id: string, draft)`, `deleteReplyTemplate(api, id: string)` (all normalise errors through `normalizeSupportReportError`); `type ReplyTemplateDraft = { name: string; text: string }`; `insertTemplate(value: string, selection: { start: number; end: number } | null, text: string): { value: string; caret: number }`; `replyTemplateErrorKey(error: unknown): string` (maps the three codes to `serverAdmin.templates.errors.{limit,nameTaken,notFound}`, else `supportReportErrorKey`).

- [ ] **Step 1: Failing tests** for `insertTemplate`: empty value → `{value: text, caret: text.length}`; selection inside → inserted there, caret after it; selection range → replaced; `null` selection with existing text → `value + "\n" + text`; `insertTemplate keeps text beyond the limit` (480 chars + 40-char template → 520 chars, nothing cut). `replyTemplateErrorKey` for each code.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run src/client/supportReplyTemplates.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server-admin): reply template client and insert helper (part 4)`.

### Task 5: List cards and segment counts

**Files:**
- Modify: `web/src/components/ServerAdminSupportReportsPanel.tsx` (`ReportRow`, segments, anonymity footer), `ServerAdminSupportReportsPanel.css`
- Modify: `web/src/i18n/locales/serverAdmin.ts`, `web/src/i18n/locales/en.json` (`serverAdmin.reports.filter.withCount`, `serverAdmin.reports.anonymousFooter`, `serverAdmin.reports.item.meta`); run `npm run i18n:generate`
- Test: `web/src/components/ServerAdminSupportReportsPanel.test.tsx`

**Interfaces:**
- Consumes: Task 1 wire fields `notePreview`, `platform`, `os`, `stateCounts`.

- [ ] **Step 1: Failing tests**: a row shows the preview text inside a `blockquote`; a row without preview has no `blockquote`; the NEW/IN_PROGRESS/CLOSED segment buttons' names include their counts (from `t('serverAdmin.reports.filter.withCount', …)`), All/Archive have none; the footer text from the locale key is present; the kind chip text from `serverAdmin.reports.kinds.*`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** card markup (meta line: relative date · `platform`/`os` · build; kind chip; quote; flags) with tokens from `design/tokens.json` via existing CSS variables; chip without border.
- [ ] **Step 4: Run** the panel tests and `ServerAdminSupportReportsSignal.test.tsx` → PASS; `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --incremental false`.
- [ ] **Step 5: Commit** `feat(server-admin): report cards with note preview and state counts (part 4)`.

### Task 6: Detail with template chips first

**Files:**
- Modify: `web/src/components/ServerAdminSupportReportDetail.tsx` (section order; new `ReplyTemplateChips` component in `web/src/components/ServerAdminReplyTemplateChips.tsx`; ticket button as icon button with accessible name next to Reply)
- Modify: locales (`serverAdmin.templates.chipsTitle`, `.edit`, `.emptyHint`, `.emptyLink`, `.insertedStatus`)
- Test: `web/src/components/ServerAdminSupportReportDetail.test.tsx`, `web/src/components/ServerAdminReplyTemplateChips.test.tsx`

**Interfaces:**
- Consumes: Task 4 helpers; `sectionHref('replyTemplates')` (Task 7 adds the section; this task may add the section id to `SERVER_ADMIN_SECTIONS` already).
- Produces: `ServerAdminReplyTemplateChips({ api, onInsert: (text: string) => void, onEdit: () => void, disabled: boolean })`.

- [ ] **Step 1: Failing tests**: section order note → chips → reply → state → facts → manage (by heading order); tapping a chip inserts at the caret and focus stays in the textarea; inserting beyond 500 shows the too-long alert and disables send; chips hidden once a reply exists; empty templates → hint with link; "Edit" with a dirty draft asks `discardDraftConfirm` and stays when declined; ticket button keeps its accessible name and opens the dialog.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** (chips via `useQuery(REPLY_TEMPLATES_QUERY_KEY)`, `networkMode: 'always'`; insertion with `insertTemplate` and `textarea.setSelectionRange` in an effect after state update).
- [ ] **Step 4: Run** → PASS; tsc.
- [ ] **Step 5: Commit** `feat(server-admin): reply templates in the opened report (part 4)`.

### Task 7: Templates page

**Files:**
- Modify: `web/src/components/serverAdminAreas.ts` (`'replyTemplates'` in `SERVER_ADMIN_SECTIONS`, `AREA_SECTIONS.help = ['reports', 'replyTemplates']`), `serverAdminAreas.test.ts`
- Modify: `web/src/components/ServerAdminPage.tsx` (render the page for `section === 'replyTemplates'` under the same `supportReportsAvailable` gate and unavailable state as reports)
- Create: `web/src/components/ServerAdminReplyTemplatesPanel.tsx` (+ `.css` if needed), `ServerAdminReplyTemplateSheet.tsx`
- Modify: locales (`serverAdmin.navigation.replyTemplates`, `serverAdmin.templates.*`: title, body, create, limitHint, empty, nameLabel, textLabel, save, saving, delete, deleteConfirm, saved, deleted, gone, counter, errors.*)
- Test: `ServerAdminReplyTemplatesPanel.test.tsx`, `ServerAdminNavigation.test.tsx` (sub-navigation shows both Help pages)

**Interfaces:**
- Consumes: Task 4 helpers. Uses the shared `ServerAdminSheet` if #2326 is merged at this point (merge `origin/main` first), else the `server-admin-report-sheet` pattern of the ticket dialog with `useModalLifecycle`.

- [ ] **Step 1: Failing tests**: list sorted as returned; `AddActionButton` labelled from `serverAdmin.templates.create`; at 30 templates the button is absent and `limitHint` shown; create → sheet → save → list contains it and status `saved`; edit → change → save; delete asks a confirm and removes it; 409 name taken stays in the sheet with the error; 404 on save closes the sheet with `gone` and refetches; offline disables writes; Escape closes the sheet and returns focus to the opener.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS; tsc; `node web/scripts/check-motion-layer.mjs`; biome on touched files (`biome lint <files> --diagnostic-level=error`, `biome format --write <files>`).
- [ ] **Step 5: Commit** `feat(server-admin): reply templates page in Help (part 4)`.

### Task 8: Browser spec, evidence, gates

**Files:**
- Create: `web/e2e/tests/server-admin-help.spec.ts` (journey: Help list shows preview and counts → open report → insert template → send → back; templates page create/edit/delete; Compact 360/390/430 and Expanded, Light/Dark screenshots into the evidence folder used by part 3's spec)
- Modify: `web/e2e/test-groups.json`, `web/e2e/test-impact.json` (roots: the Help components, `supportReportsAdmin.ts`, `supportReplyTemplates.ts`, `serverAdminAreas.ts`)
- Modify: the e2e API mock/fixture the existing reports spec uses (find with `grep -r "support-reports" web/e2e`)

- [ ] **Step 1:** Write the spec against the existing mock layer; copy text from locale modules, not literals.
- [ ] **Step 2:** Run the browser-selection planning checks named in `docs/m5/BROWSER-IMPACT-SELECTION.md` (inventory/plan regressions) → PASS.
- [ ] **Step 3:** `python backend/tests/... test_engineering_language_audit.py` (memory: run last before push) → PASS.
- [ ] **Step 4: Commit** `test(server-admin): Help browser journey and evidence (part 4)`.
- [ ] **Step 5:** PR against `main`, label `ci:full`, body with Reuse Review, Product Design Review, Business/Freemium (row *Support report operator tooling*, Non-paywallable), Cross-Cutting; Auto-fix on; screenshots from CI artifacts into the PR.
