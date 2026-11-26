# ServerAdmin part 1: area shell and Situation page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nine flat ServerAdmin sections with five areas (Compact bottom navigation, Expanded side list) and turn the overview into a Situation page with a service summary and a "Needs you" queue.

**Architecture:** The existing `?section=` ids stay the routing key, so every deep link keeps working; a pure mapping groups sections into areas and drives both navigations and a per-area sub-navigation. The backend overview gains two privacy-safe attention lists (Spaces near their Cloud storage quota, operator grants about to expire); the web composes the "Needs you" queue from overview data in one pure function.

**Tech Stack:** FastAPI + SQLAlchemy (backend), OpenAPI → generated TS client (`tools/openapi/generate.sh`), React + TanStack Query + react-router, vitest, Playwright, Biome.

**Spec:** `docs/superpowers/specs/2026-11-26-server-admin-redesign-design.md` (sections 3, 5.0, 5.1). Visual reference: <https://claude.ai/artifact/B8CZFqV4zyACMQCzRdTxTU> boards 1 (Situation, Compact) and 6 (Expanded).

## Global Constraints

- Baseline `main` = `ffedd5729`; branch from current `main` at execution time and re-check `alembic heads`/OpenAPI after every `main` merge.
- English for code, comments, tests, docs; German and English product copy only in `web/src/i18n/locales/serverAdmin.ts` and `web/src/i18n/locales/en.json`.
- Overview privacy contract (`docs/SERVER-ADMIN.md`, Operational overview) holds: new fields are Space ids, byte counts and timestamps only, never names, emails or content.
- No fabricated health: `worker_status="no_heartbeat_signal"` and `media_status="not_probed"` render as "no signal yet", never as ok.
- Thresholds: storage pressure at `used >= 0.85 * quota`; expiring grants = `source_type == ADMIN_GRANT`, `status == ACTIVE`, `now < effective_until <= now + 7 days`; at most 5 items per list, plus a total count.
- Storage pressure only when `settings.deployment is Deployment.CLOUD`; Self-Hosted returns an empty list and 0.
- The Pro area is **not** shown in part 1 (it has no content yet; part 5 adds it, Cloud + Pro plugin only). Help shows only when `supportReportsOperatorAvailable`.
- Compact breakpoint = the app shell's: bottom navigation below 840 px, side list from 840 px.
- Semantic tokens only (`design/tokens.json` adapters already in CSS); chips/pills without borders; touch targets ≥ 44 px; Light/Dark; reduced motion.
- Do not add browser-only controls; ServerAdmin also runs in the Capacitor app.
- Biome `--write` only on touched files; `biome lint . --diagnostic-level=error` before push; run `tools/ci/documentation_language_audit.py` and `tools/ci/engineering_language_audit.py` last.
- PR needs the `ci:full` label, the Product Design / Reuse / Business sections of the PR template; Auto-fix on after opening.

## Review Focus

1. Old bookmarks and in-app links (`?section=activity&category=accounts`, `?section=reports&state=NEW`) must land on the same page inside its new area, with the right area marked current.
2. An overview without the operator plugin must not show a Help entry or a reports item, even if `supportReportsNew > 0` from an earlier period.
3. Self-Hosted (unmetered) must never show a storage-pressure item; a Space with `quota=None` is skipped, not divided by.
4. An empty queue must read as a calm success state, not as an empty box; an overview error must keep the navigation usable.
5. At 360 px with 200 % text the five-entry bottom bar (four in part 1) must not overflow or hide the badge.

---

### Task 0: Owning issue and visual preflight (no code)

**Files:** none in the repo.

- [ ] **Step 1:** Create the umbrella issue "ServerAdmin redesign" (body: link to the spec, the five parts, the agreed order) and the sub-issue "ServerAdmin part 1: area shell and Situation".
- [ ] **Step 2:** In the sub-issue record: baseline `main` SHA, the reviewed current screens (`/server-admin` overview, the nine sections), the generated visual reference (export of canvas boards 1 and 6 as PNG, attached), and the Mobile Interaction Contract:
  - focal point: the status summary line; primary action: open the first "Needs you" item;
  - Compact: fixed bottom bar (Situation, People, Help*, System), sub-pills under the heading; Expanded: side list, same order;
  - states: loading (UiState loading), error (UiState error + refresh, navigation stays), empty queue (success line), offline (existing query error path);
  - motion: none new; active-indicator transition reused from the shell, removed under `prefers-reduced-motion`.
- [ ] **Step 3:** Record "Business/freemium impact reviewed: Free/Core admin surface, no tier or entitlement change" and the reuse result (reuses shell bottom-nav styles, `EimirIcon`, `UiState`; no new dependency).

### Task 1: Backend attention lists in the overview

**Files:**
- Modify: `backend/src/eimir/api/v1/server_admin.py` (models near `ServerAdminOverview`, builder `get_server_admin_overview`)
- Modify: `backend/src/eimir/attachments/quota.py` (new helper)
- Test: `backend/tests/integration/test_server_admin.py`
- Modify: `backend/openapi.json`, `web/src/api/generated/**` (regenerated)
- Modify: `docs/SERVER-ADMIN.md` (Operational overview list)

**Interfaces:**
- Produces (Python):
  - `quota.spaces_near_quota(session: Session, *, ratio: float, limit: int, settings: Settings | None = None) -> tuple[int, list[tuple[UUID, int, int]]]` → `(total, [(space_id, used, quota), ...])`, highest `used/quota` first. Pre-filter in SQL on `sum >= ratio * lowest` where `lowest` is the smaller non-`None` of `storage_quota_free_bytes` and `storage_quota_premium_bytes` (both `None` → return `(0, [])`), then resolve each candidate with `space_quota` and drop candidates whose quota is `None` or not reached.
  - `ServerAdminStoragePressureItem(ApiModel)`: `space_id: UUID`, `used_bytes: int`, `quota_bytes: int`.
  - `ServerAdminExpiringGrantItem(ApiModel)`: `space_id: UUID`, `grant_id: UUID`, `effective_until: datetime`.
  - New `ServerAdminOverview` fields: `storage_pressure_count: int`, `storage_pressure: list[ServerAdminStoragePressureItem]`, `expiring_admin_grant_count: int`, `expiring_admin_grants: list[ServerAdminExpiringGrantItem]`.
  - New warning codes `storage_quota_pressure` and `admin_grants_expiring`, appended when the counts are > 0.
- Produces (TS, generated): `ServerAdminOverview.storagePressure`, `storagePressureCount`, `expiringAdminGrants`, `expiringAdminGrantCount`.

- [ ] **Step 1: Write the failing tests** in `test_server_admin.py`:
  - `test_overview_lists_spaces_near_cloud_quota`: Cloud settings, free quota 100 bytes; Space A with READY attachments of 90 bytes, Space B 50 bytes → `storagePressureCount == 1`, item `{spaceId: A, usedBytes: 90, quotaBytes: 100}`, `"storage_quota_pressure" in warningCodes`.
  - `test_overview_storage_pressure_respects_premium_quota`: Space with 90 bytes and an active `storage.cloud_quota_50gb` grant (premium quota 1000) → count 0.
  - `test_overview_storage_pressure_is_empty_on_self_hosted`: Self-Hosted settings, same data → count 0, list `[]`, no warning code.
  - `test_overview_lists_admin_grants_expiring_within_seven_days`: ADMIN_GRANT ACTIVE until now+3 d → listed; until now+8 d, already expired, REVOKED, and GOOGLE_PLAY until now+3 d → not listed; `"admin_grants_expiring" in warningCodes`.
  - `test_overview_attention_lists_are_capped_at_five`: 7 qualifying Spaces → list length 5, count 7.
- [ ] **Step 2: Run** `pytest backend/tests/integration/test_server_admin.py -k "storage_pressure or near_cloud_quota or expiring or capped" -v` → FAIL (fields missing).
- [ ] **Step 3: Implement** the helper, the two models, the four fields and the two warning codes; constants `_STORAGE_PRESSURE_RATIO = 0.85`, `_EXPIRING_GRANT_WINDOW = timedelta(days=7)`, `_ATTENTION_LIMIT = 5` in `server_admin.py`.
- [ ] **Step 4: Run** the same command → PASS; then `pytest backend/tests/integration/test_server_admin.py backend/tests/integration/test_endpoint_matrix.py -k "server_admin" -q` → PASS.
- [ ] **Step 5:** Regenerate the contract and client: `python -m scripts.openapi_contract write` (from `backend/`, PYTHONPATH incl. `admin/src;pro/src`), then `tools/openapi/generate.sh`; `python -m scripts.openapi_contract check` → OK.
- [ ] **Step 6:** Add the two lists and codes to `docs/SERVER-ADMIN.md` (Operational overview bullet list; state "Space ids, bytes and timestamps only; Cloud only for storage").
- [ ] **Step 7: Commit** `feat(server-admin): list Spaces near quota and expiring grants in the overview`.

### Task 2: Area model and section mapping

**Files:**
- Create: `web/src/components/serverAdminAreas.ts`
- Test: `web/src/components/serverAdminAreas.test.ts`

**Interfaces:**
- Consumes: `ServerAdminSection` and `SERVER_ADMIN_SECTIONS` from `ServerAdminPage.tsx` (move both into `serverAdminAreas.ts` and re-export from `ServerAdminPage.tsx` so existing imports keep working).
- Produces:
  - `type ServerAdminArea = 'situation' | 'people' | 'help' | 'system'`
  - `AREA_SECTIONS: Record<ServerAdminArea, readonly ServerAdminSection[]>` = situation `['overview']`, people `['accounts','spaces']`, help `['reports']`, system `['jobs','storage','security','activity','settings']`.
  - `areaForSection(section: ServerAdminSection): ServerAdminArea`
  - `visibleAreas({ supportReportsAvailable }: { supportReportsAvailable: boolean }): ServerAdminArea[]` → order situation, people, help (only if available), system.
  - `sectionHref(section: ServerAdminSection, params?: Record<string, string>): string` (moved; `overview` → `/server-admin`).

- [ ] **Step 1: Write the failing tests:** every section maps to exactly one area; `areaForSection('activity') === 'system'`; `visibleAreas({supportReportsAvailable:false})` equals `['situation','people','system']`; with `true` help is third; `sectionHref('spaces', { space: 'x' }) === '/server-admin?section=spaces&space=x'`; `resolveServerAdminSection` unchanged (existing cases in `ServerAdminNavigation.test.tsx` still pass).
- [ ] **Step 2: Run** `npx vitest run src/components/serverAdminAreas.test.ts` (from `web/`) → FAIL.
- [ ] **Step 3: Implement** the module.
- [ ] **Step 4: Run** the test plus `src/components/ServerAdminNavigation.test.tsx` → PASS.
- [ ] **Step 5: Commit** `refactor(web): group ServerAdmin sections into areas`.

### Task 3: Area navigation (Compact bottom bar, Expanded side list) and sub-navigation

**Files:**
- Modify: `web/src/components/ServerAdminPage.tsx` (replace `ServerAdminSectionNavigation` usage; keep the export name as a thin wrapper only if other code imports it, otherwise remove)
- Create: `web/src/components/ServerAdminAreaNavigation.tsx`
- Modify: `web/src/components/ServerAdminPage.css`
- Modify: `web/src/i18n/locales/serverAdmin.ts`, `web/src/i18n/locales/en.json`
- Test: `web/src/components/ServerAdminNavigation.test.tsx` (rewrite)

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `ServerAdminAreaNavigation({ activeSection, supportReportsAvailable, supportReportsNew, confirmLeave }: { activeSection: ServerAdminSection; supportReportsAvailable: boolean; supportReportsNew: number; confirmLeave?: () => boolean })` renders two `<nav>`: Compact `div.mobile-bottom-shell > nav.mobile-bottom-nav.server-admin-area-nav-compact` with `Link.shell-nav-link` items (`EimirIcon` names: situation `statistiken`, people `gemeinsam`, help `hilfe`, system `einstellungen`), and Expanded `nav.server-admin-area-nav-side`. Each area links to its first section. Help shows `supportReportsNew` as a badge with an accessible label.
  - `ServerAdminSubNavigation({ activeSection, confirmLeave })` renders pill links for the active area's sections when the area has more than one (people, system); none for situation/help.
- i18n keys with English copy (German as in the mockup, only in `serverAdmin.ts`): `serverAdmin.areas.aria` ("Areas"), `serverAdmin.areas.situation` ("Situation"), `.people` ("People"), `.help` ("Help"), `.system` ("System"), `.helpUnread` ("Help, {{count}} new reports"), `serverAdmin.subNavigation.aria` ("Pages"). Existing `serverAdmin.navigation.*` labels stay for the sub-pills.

- [ ] **Step 1: Write the failing tests** (rewrite `ServerAdminNavigation.test.tsx`):
  - `renders four areas without the plugin and marks People for spaces`: render with `activeSection="spaces"` → both navs contain hrefs `/server-admin`, `/server-admin?section=accounts`, `/server-admin?section=jobs`; no `section=reports`; the People links carry `aria-current="page"`.
  - `adds Help with the unread badge when the plugin is available`: `supportReportsAvailable`, `supportReportsNew=3` → a link named by `serverAdmin.areas.helpUnread` with count 3.
  - `keeps deep links: activity opens inside System`: `activeSection="activity"` → sub-pills contain `section=activity` with `aria-current="page"` and the System area is current.
  - `asks before leaving` (port the existing confirmLeave test): `confirmLeave` returning false keeps the location.
- [ ] **Step 2: Run** `npx vitest run src/components/ServerAdminNavigation.test.tsx` → FAIL.
- [ ] **Step 3: Implement** the component and CSS: `.server-admin-area-nav-compact` visible below 840 px, `.server-admin-area-nav-side` from 840 px; `.server-admin-main` gets bottom padding `var(--shell-floating-nav-height)` plus safe area below 840 px; sub-pills use `--color-surface-subtle` fill, active `--color-brand-strong` with `--color-on-accent`, no border, min-height 44 px. Wire into `ServerAdminPage` in place of the old side navigation.
- [ ] **Step 4: Run** the test file and `ServerAdminControls.test.tsx`, `ServerAdminSettingsConvergence.test.tsx`, `ServerAdminSupportReportsSignal.test.tsx` → PASS (update their navigation assertions only where they counted the old links).
- [ ] **Step 5: Commit** `feat(web): ServerAdmin areas with Compact bottom bar and Expanded side list`.

### Task 4: Situation page with "Needs you" queue

**Files:**
- Create: `web/src/components/ServerAdminSituation.tsx`
- Create: `web/src/components/serverAdminNeedsYou.ts`
- Modify: `web/src/components/ServerAdminPage.tsx` (overview branch of `OverviewContent` renders `ServerAdminSituation`; the usage metrics panel stays below it unchanged)
- Modify: `web/src/components/ServerAdminPage.css`, i18n files
- Test: `web/src/components/serverAdminNeedsYou.test.ts`, `web/src/components/ServerAdminSituation.test.tsx`

**Interfaces:**
- Consumes: Task 1 overview fields, Task 2 `sectionHref`.
- Produces:
  - `type NeedsYouItem = { id: string; kind: 'reports' | 'failedJobs' | 'storage' | 'expiringGrant' | 'warning'; tone: 'danger' | 'warning' | 'info'; href: string; titleKey: string; titleValues?: Record<string, string | number>; detailKey?: string; detailValues?: Record<string, string | number> }`
  - `buildNeedsYouItems(overview: ServerAdminOverview): NeedsYouItem[]` in this order: reports (only if `supportReportsOperatorAvailable && supportReportsNew > 0`, href `sectionHref('reports', { state: 'NEW' })`), failed jobs (`jobsFailed > 0`, href `sectionHref('jobs')`), one item per `storagePressure` entry (href `sectionHref('spaces', { space: id })`, percent = `Math.floor(used*100/quota)`), one per `expiringAdminGrants` entry (same href shape, days left), then remaining actionable warning codes `maintenance_mode_enabled`, `registration_disabled` → `settings`; `server_admin_allowlist_empty`, `server_admin_allowlist_unmatched`, `mail_disabled_with_unverified_accounts` → `security`. Codes already represented (`failed_jobs_present`, `support_reports_unread`, `storage_quota_pressure`, `admin_grants_expiring`) are not repeated.
  - `summaryTone(overview): 'ok' | 'attention'` → `attention` when any item has tone danger/warning or application/database status is not `ok`.
  - `ServerAdminSituation({ overview }: { overview: ServerAdminOverview })`.
- i18n keys with their English copy (the German copy follows the mockup's wording and the writing guideline, written only in `serverAdmin.ts`): `serverAdmin.situation.allGood` ("Everything is running"), `.attention` ("{{count}} thing needs you" / "{{count}} things need you"), `.needsYouTitle` ("Needs you"), `.nothingNeedsYou` ("Nothing needs you right now."), `.servicesTitle` ("Services"), `.noSignalYet` ("no signal yet"), `.reports` ("{{count}} new reports"), `.failedJobs` ("{{count}} failed jobs"), `.storage` ("A Space is at {{percent}} %"), `.storageDetail` ("{{used}} of {{quota}}", bytes via `formatBytes`), `.expiringGrant` ("A Premium gift ends in {{days}} days", `days = Math.max(1, Math.ceil((effectiveUntil - now) / 86_400_000))`), `.registrations` ("New accounts"). Use i18next plural keys for counts. Tests read copy from the locale modules, never as literals.
  - `buildNeedsYouItems(overview: ServerAdminOverview, now: Date = new Date())` (the `now` parameter makes the days value testable).

- [ ] **Step 1: Write the failing unit tests** (`serverAdminNeedsYou.test.ts`), one per rule: reports item only with the plugin flag; order reports → jobs → storage → grants → warnings; storage percent `floor(90*100/100) === 90`; no duplicate item for `failed_jobs_present`; maintenance links to `?section=settings`; empty overview → `[]` and `summaryTone === 'ok'`; `applicationStatus: 'unavailable'` → `attention`.
- [ ] **Step 2: Write the failing component test** (`ServerAdminSituation.test.tsx`): with items → heading `serverAdmin.situation.needsYouTitle`, first link href `/server-admin?section=reports&state=NEW`; with none → `serverAdmin.situation.nothingNeedsYou`; worker `no_heartbeat_signal` → tile shows `serverAdmin.situation.noSignalYet` and never `serverAdmin.health.ok`.
- [ ] **Step 3: Run** `npx vitest run src/components/serverAdminNeedsYou.test.ts src/components/ServerAdminSituation.test.tsx` → FAIL.
- [ ] **Step 4: Implement** both files and the CSS (summary banner with `--color-success-surface` / `--color-warning-surface`, service tiles in a 2-column grid on Compact and auto-fit on Expanded, queue rows ≥ 56 px tall with chevron, registrations card 24 h / 7 d / 30 d numbers via `Intl.NumberFormat`; no sparkline in part 1, history arrives in part 2).
- [ ] **Step 5: Run** the two test files → PASS.
- [ ] **Step 6: Commit** `feat(web): ServerAdmin Situation page with a Needs you queue`.

### Task 5: Spaces deep link by id

**Files:**
- Modify: `web/src/components/ServerAdminSpacesPanel.tsx` (prop `initialSpaceId?: string | null`)
- Modify: `web/src/components/ServerAdminPage.tsx` (pass `searchParams.get('space')`)
- Test: `web/src/components/ServerAdminObservabilityPanels.test.tsx` or a new `ServerAdminSpacesPanel.test.tsx`

**Interfaces:**
- Consumes: Task 4 hrefs `?section=spaces&space=<uuid>`.
- Produces: the panel opens that Space's detail on mount when the id is a valid UUID; an invalid id is ignored (list stays).

- [ ] **Step 1: Write the failing tests:** `opens the Space detail from the link` (mock detail API called with that id, detail region visible); `ignores an invalid space id` (detail API not called).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`useState(() => validUuid(initialSpaceId) ? initialSpaceId : null)`). **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(web): open a ServerAdmin Space from a link`.

### Task 6: Browser journey, evidence and registry

**Files:**
- Create: `web/e2e/tests/server-admin-situation.spec.ts`
- Modify: `web/e2e/test-groups.json`, `web/e2e/test-impact.json` (roots: `ServerAdminPage.tsx`, `ServerAdminAreaNavigation.tsx`, `ServerAdminSituation.tsx`, `serverAdminNeedsYou.ts`, `serverAdminAreas.ts`, `ServerAdminSpacesPanel.tsx`, `ServerAdminPage.css`, `web/src/i18n/locales/serverAdmin.ts`, `web/src/api/generated/apis/ServerAdminApi.ts`)
- Modify: `web/e2e/tests/server-admin-support-reports.spec.ts` (navigation selectors only; also drop the stale "step-up" wording from its `test-groups.json` reason)
- Create: `docs/product/design/evidence/server-admin-part1/` PNGs + `README.md`

- [ ] **Step 1: Write the spec** (mocks like `server-admin-support-reports.spec.ts`): 
  - `the operator sees what needs them and opens it`: 390 px; overview with 2 failed jobs, one storage item, plugin on with 3 new reports → summary `serverAdmin.situation.attention` with count 3 (one item each), tap the failed-jobs row → URL `?section=jobs`, System current in the bottom bar; Back → Situation.
  - `old links land in their area`: goto `/server-admin?section=activity&category=accounts` → System current, Activity pill current.
  - `nothing needs you and no plugin`: overview with no items, plugin off → success line, bottom bar has 3 entries.
  - `layout`: 360/390/430 Compact and 1280 Expanded, Light/Dark, reduced motion, 200 % text without horizontal overflow; axe on `main` and both navs; captures into the evidence folder.
- [ ] **Step 2: Run** from `web/e2e`: `npx playwright test tests/server-admin-situation.spec.ts tests/server-admin-support-reports.spec.ts --workers=1` → PASS (if Playwright is unavailable locally, note it and rely on CI with `ci:full`).
- [ ] **Step 3:** Register the spec (`disposition: "PR_CRITICAL"`, `baselineTests` = collected count, reason naming the journeys above), run the browser selection planning regressions named in `CONTRIBUTING.md#web-browser-test-selection` and record collection counts.
- [ ] **Step 4: Commit** `test(web): ServerAdmin Situation journey and evidence`.

### Task 7: Pre-push gates and PR

- [ ] **Step 1:** `npx biome check --write` on touched web files only; `npx biome lint . --diagnostic-level=error`; `npx tsc -p tsconfig.app.json --noEmit`; vitest for all `ServerAdmin*` and `serverAdmin*` tests; backend ruff on touched files; both language audits.
- [ ] **Step 2:** Merge current `main`, re-run `scripts.openapi_contract check`.
- [ ] **Step 3:** Push, open the PR (closing the part 1 sub-issue only), label `ci:full`, fill Product Design (Compact/Expanded evidence links, Light/Dark, reduced motion, states), Business ("reviewed: Free/Core admin surface, no tier change"), Reuse ("relevant": shell nav styles, EimirIcon, UiState reused; no dependency), Cross-cutting (privacy of new overview fields, i18n plurals, a11y of badge/nav). Turn Auto-fix on.
