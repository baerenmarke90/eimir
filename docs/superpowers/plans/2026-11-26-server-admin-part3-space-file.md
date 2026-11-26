# ServerAdmin part 3: People and the Space file Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One search over Accounts and Spaces, a Space file with member accounts (email-level), plan, storage and timeline, the Account's Spaces, a Premium gift UI on the existing API, and an individual per-Space Cloud storage quota.

**Architecture:** Two new read endpoints (search, Space file) next to the existing ServerAdmin routes; the Space file call writes a privileged audit event. The quota override lives in its own table and is read through `attachments/quota.space_quota`, so uploads, pressure lists and alerts respect it. The web People area gets a search page and a Space file view; Situation links open it.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, React + TanStack Query, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-26-server-admin-part3-space-file-design.md`.

## Global Constraints

- Shown per member: primary email, verification, sign-in methods, membership status and since; never display names, Space names/profile, relationship dates or content. Support reports never link here.
- Every `GET …/spaces/{id}/file` writes `space_file_viewed` (actor, target Space) to the privileged audit; no bulk endpoint returns the Account–Space link (search returns at most 20 Accounts).
- Quota override: Cloud only (`settings.deployment is Deployment.CLOUD`, else 404/absent UI); `quota_bytes` 1–1024 GB in whole GB; optional `effective_until` in the future; override replaces the tier value while active; set/clear audited as `space_storage_quota_set` / `space_storage_quota_cleared`; nothing is deleted over quota.
- Freemium matrix: Cloud storage quota row gains the override; version 1.52 → 1.53 with a revision line dated 2026-11-26.
- Migration after `main`'s head; bump `TESTED_ALEMBIC_REVISION`; classify the new table in `portability/allowlist.py` (`EXCLUDED_TABLES`, operator state); refresh `schema_fingerprint.json`.
- Before every push: mypy on touched backend files, ruff, pro guards, openapi/schema checks, Biome errors, tsc, vitest, language audits. `ci:full`, Auto-fix on, then check PR state every turn.

## Review Focus

1. A Space file request by a non-admin → 403; by an admin → audit row written even when the Space has no members.
2. An expired override no longer applies (tier value back) without any job running.
3. Setting a quota below current usage refuses new uploads but deletes nothing; the Situation/alerts show the pressure.
4. Search with a very short or odd query (`@`, `%`, `_`) does not match everything or error (escape LIKE wildcards).
5. Self-Hosted never shows the quota action and the endpoint refuses it.

---

### Task 1: Quota override storage and enforcement

**Files:** migration `backend/alembic/versions/0182_space_storage_quota_overrides.py` (number after `main`'s head at execution time), `backend/src/eimir/attachments/models.py` or new `attachments/quota_override.py` model `SpaceStorageQuotaOverride(space_id PK FK spaces ON DELETE CASCADE, quota_bytes BigInteger, effective_until timestamptz NULL, set_by_account_id FK accounts ON DELETE SET NULL, set_at)`, `attachments/quota.py` (`space_quota` reads an active override first), administration action enum + constraint (`space_storage_quota_set`, `space_storage_quota_cleared`, `space_file_viewed`), registry, portability allowlist + tested revision, schema fingerprint; tests `test_storage_quota.py` additions.

- [ ] RED: `test_override_replaces_tier_quota_while_active`, `test_expired_override_falls_back_to_tier`, `test_override_is_ignored_on_self_hosted`, `test_override_can_be_lower_than_usage_and_refuses_new_bytes` → GREEN; migration up/down/up on a fresh DB.

### Task 2: Quota API

**Files:** `backend/src/eimir/api/v1/server_admin.py`: `PUT /server-admin/spaces/{space_id}/storage-quota` body `{quotaGb: int, effectiveUntil: datetime | null}` → `ServerAdminSpaceStorage`; `DELETE` same path → 204; both audited; tests in `test_server_admin.py` (or new `test_server_admin_space_file.py`), endpoint matrix.

- [ ] RED: set/clear audited; 0 or 2000 GB → 422; past `effectiveUntil` → 422; Self-Hosted → 404; non-admin → 403 → GREEN.

### Task 3: Search and Space file API

**Files:** `server_admin.py` (or new `server_admin_people.py` router): `GET /server-admin/search?q=` → `{accounts: [ServerAdminAccountSummary], spaces: [ServerAdminSpaceSummary]}`; `GET /server-admin/spaces/{space_id}/file` → `ServerAdminSpaceFile {space: ServerAdminSpaceDetail, members: [{accountId, primaryEmail, emailVerified, authMethods, membershipStatus, since}], storage: {usedBytes, quotaBytes|null, tierQuotaBytes|null, override: {quotaBytes, effectiveUntil}|null, byMediaType: [{mediaType, bytes}]}, entitlement: ServerAdminSpaceEntitlementView, timeline: [{at, kind, detail}]}` (timeline = grants created/revoked + privileged action events with this target Space, newest 20); `ServerAdminAccountDetail.spaces: [{spaceId, membershipStatus, since}]`; regenerate OpenAPI/TS; `docs/SERVER-ADMIN.md` contract; tests.

- [ ] RED: search by email part and by id; wildcards escaped; limit 20; Space file returns members without names and writes `space_file_viewed`; storage split by media type; Account detail lists Spaces → GREEN.

### Task 4: Web People search and Space file

**Files:** `web/src/components/ServerAdminPeopleSearch.tsx`, `ServerAdminSpaceFile.tsx`, `ServerAdminStorageQuotaSheet.tsx`, `ServerAdminPremiumGiftSheet.tsx` (grant: duration in months + reason; revoke), `serverAdminAreas.ts` (People: `search` first, then `accounts`, `spaces`), `ServerAdminPage.tsx` (render; `?section=spaces&space=` opens the Space file), `ServerAdminAccountsPanel.tsx` (Account's Spaces linking to the file), i18n, CSS; vitest per component.

- [ ] RED: search renders accounts and spaces and links; Space file shows emails and never a display name field; storage bar with "individual … until …"; quota sheet validates 1–1024 GB, warns below usage, saves via PUT, clears via DELETE, hidden when `quotaBytes` is null on Self-Hosted; gift sheet posts a grant with `effectiveUntil`; Situation link opens the file → GREEN.

### Task 5: Docs, matrix, browser spec, PR

- `docs/FREEMIUM-FEATURE-MATRIX.md` (row + 1.53 + revision line), `docs/SERVER-ADMIN.md` (search, Space file, audit, quota override).
- Browser spec `server-admin-people.spec.ts`: search → Space file → set quota → clear; layout 360/390/430/1280 Light/Dark, axe, 200 % text reflow; registry + impact roots.
- Gates, merge `main`, PR closing the part 3 sub-issue, `ci:full`, Auto-fix; independent whole-branch review before the PR.
