# G5 Launch Accessibility Acceptance Evidence Delta — v0.1.0 (#916)

**Owner:** #916  
**Consumed by:** `docs/m6/G5-EVIDENCE.md` (G5-15), #525  
**Release source:** `main` at `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`  
**Release version:** `v0.1.0`  
**Historical evidence retained unchanged:** `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md`, `docs/m6/G5-EVIDENCE-DELTA-914-2026-09-20.md`. This document is additive; it does not rewrite what earlier records said about accessibility acceptance at their own dates.

---

## 1. Result

- **Web (Desktop & Mobile 320px):** `PASS` for the release-state manual and spot accessibility acceptance of **v0.1.0**. All 10 acceptance specs passed against the running release container runtime, verifying keyboard navigation, visible focus indicators, landmark semantics, skip links, overlay escape and focus restoration, games entitlement shelf, unauthorized server-admin gate, authorized maintenance toggle, maintenance mode presentation, and 320px responsive touch targets. Automated Axe WCAG 2.0/2.1/2.2 AA scans across all states identified zero critical and zero serious accessibility violations.
- **Android:** `NOT_APPLICABLE` for `v0.1.0` (see §7). The launch scope is strictly Web-/Self-Hosted-first; Android artifacts are excluded from the `v0.1.0` publication manifest (`android.included=false`).

This document provides the evidence to close criterion **G5-15**; final gate decision remains with #525.

---

## 2. Release & Environment Identity

| Item | Value |
|---|---|
| Release version | `v0.1.0` |
| Git Source SHA | `8bb0c1eadbeb4864788d277a25a3673c79f5e46f` |
| Web Docker Image | `ghcr.io/baerenmarke90/eimir-web:v0.1.0@sha256:edd2f5f88bafe8fde5a2dd6223507b3fb71d14474d0c5f7162d2696324be12f1` |
| Backend Docker Image | `ghcr.io/baerenmarke90/eimir-backend:v0.1.0@sha256:f3b5f7ea23aad99844ed558dd4a148d4196cb1b52c6ceed3a0d8636a9715ddd1` |
| Database Engine | PostgreSQL 17-alpine (migrated through Alembic `head`) |
| Seeded Test Fixture | Canonical Demo Space (`scripts.demo_space create`, personas Lea Sommer & Alex Winter) |
| Admin Test Fixture | Primary ServerAdmin `admin@eimir.test` (verified email, `serverAdmin: true`) |
| Runtime Test URLs | Web: `http://127.0.0.1:38080`, API: `http://127.0.0.1:38000` |
| Test Runner & Tools | Playwright 1.57.0 (Chromium), `@axe-core/playwright` 4.10.1, macOS Darwin arm64 |
| Test Execution Date | 2026-09-20 |

---

## 3. Scope & Verification Strategy

Following the G5 matrix requirements (§5 "Manual client evidence"), M6 does not rerun the entire G4 client regression program. The scope of #916 is a focused acceptance check on the genuine published `v0.1.0` release containers for:
1. Release runtime identity markers.
2. Demo Entry keyboard flow, visible focus, responsive 320px shell, 200% zoom.
3. Standard Entry form labels, error announcements, keyboard flow.
4. Authenticated Shell, skip link activation, landmark semantics, profile dropdown keyboard flow.
5. Primary Actions: Quick Create menu keyboard operation, overlay Escape dismissal, focus restoration.
6. Launch-Specific State: Games Entitlement shelf semantics and keyboard behavior.
7. Launch-Specific State: ServerAdmin Access Gate (negative unauthorized user flow).
8. Launch-Specific State: ServerAdmin Authorized view, settings navigation, maintenance toggle keyboard accessibility (`aria-pressed`, `aria-describedby`).
9. Launch-Specific State: Maintenance Mode presentation, status announcements, and keyboard navigability.
10. Mobile Web & Compact 320px shell, bottom navigation visibility, and interactive touch targets (>= 40px).

---

## 4. Test Results by Scenario

| # | Scenario | Surface / View | Verified Behavior | Axe WCAG AA Result | Status |
|---|---|---|---|---|---|
| 01 | Release Identity | `/.well-known/eimir-revision`, `/healthz`, `/api/v1/health/ready` | Source SHA matches `8bb0c1eadbeb4864788d277a25a3673c79f5e46f`, health endpoints report `ok` and `x-eimir-revision` header. | N/A (API) | `PASS` |
| 02 | Demo Entry | `/?demo=true` | `h1#demo-welcome-heading` present; visible focus outlines on Tab sequence; Tab / Shift+Tab between personas; no horizontal overflow at 320px and at 200% zoom (640px). | 0 critical / 0 serious | `PASS` |
| 03 | Standard Entry | `/` | Accessible `<label for="email">` and `<input id="email">`; Tab key lands directly on form input; submit button has accessible name. | 0 critical / 0 serious | `PASS` |
| 04 | Authenticated Shell | `/?demo=true` → Shell | Skip Link (`a.skip-link[href="#main-content"]`) attached, focusable, and moves focus to `#main-content`; primary navigation links ("Wir", "Momente", "Planen", "Mehr") present; `aria-current="page"` indicator active; profile popover opens on Enter and dismisses on Escape. | 0 critical / 0 serious | `PASS` |
| 05 | Primary Actions | Quick Create (+) Overlay | Quick Create trigger (`button.quick-create-trigger`, "Neu festhalten") focusable and operable with Enter; menu rendered as `div.quick-create-menu[role="menu"]`; menu items have accessible names and sublines; pressing Escape closes menu and restores focus to trigger button. | 0 critical / 0 serious | `PASS` |
| 06 | Games Entitlement | `/games` | Heading and `.games-shelf` present; playable games rendered as semantic interactive elements (`<a>` / `<button>`) with status "Spielen"; upcoming games rendered as informative `<article>` cards with status "Bald verfügbar"; status communicated via text; no focus traps. | 0 critical / 0 serious | `PASS` |
| 07 | ServerAdmin Access Gate | `/server-admin` (non-admin) | Gated shell rendered (`.server-admin-gate-shell`); status announced via `div.ui-state-permission[role="status"]` ("Kein Zugriff auf die Serververwaltung"); accessible recovery link ("Zur Übersicht" to `/today`) keyboard reachable and operable. | 0 critical / 0 serious | `PASS` |
| 08 | ServerAdmin Authorized | `/server-admin?section=settings` (admin) | Heading present ("Server-Administration"); maintenance toggle (`button.server-admin-toggle`) keyboard focusable; `aria-pressed="false"`; associated help text `#server-maintenance-help` linked via `aria-describedby`. | 0 critical / 0 serious | `PASS` |
| 09 | Maintenance Mode | `/` during active maintenance | Admin toggled `PUT /api/v1/server-admin/settings/maintenance {"enabled": true}`; `/api/v1/instance/status` reports `maintenanceMode: true`; entry page renders maintenance notification without breaking keyboard flow; clean toggle restoration back to `false`. | 0 critical / 0 serious | `PASS` |
| 10 | Mobile Web Compact | 320px viewport | No horizontal overflow; `.mobile-bottom-nav` visible and operable; floating action button target dimensions meet touch target guidelines (>= 40px). | 0 critical / 0 serious | `PASS` |

---

## 5. Automated Accessibility Audit Summary (Axe-Core)

Scans executed via `@axe-core/playwright` using rulesets `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa`:

- **Demo Entry:** 0 violations (critical/serious)
- **Standard Login Entry:** 0 violations (critical/serious)
- **Authenticated Shell & Navigation:** 0 violations (critical/serious)
- **Quick Create Overlay:** 0 violations (critical/serious)
- **Games Entitlement Shelf:** 0 violations (critical/serious)
- **Unauthorized ServerAdmin Gate:** 0 violations (critical/serious)
- **Authorized ServerAdmin & Settings:** 0 violations (critical/serious)
- **Maintenance State Presentation:** 0 violations (critical/serious)
- **Mobile 320px Compact Shell:** 0 violations (critical/serious)

---

## 6. Accessibility Findings & Observations

1. **Focus Outline Visibility:** Focus states use prominent CSS outline / border styles that maintain contrast in both light and dark themes.
2. **Keyboard Trapping & Escape Dismissal:** Both popovers (`HeaderProfileMenu` and `QuickCreateMenu`) listen for `Escape`, properly dismiss their floating panels, and restore focus to their respective trigger buttons.
3. **Semantics of Entitlement Boundaries:** In the Games product area, playable entries are interactive links or buttons, whereas locked/upcoming entries are rendered as informative `<article>` cards rather than dead or misleading links. Status is explicitly conveyed in textual copy ("Spielen", "Bald verfügbar", "Premium"), not just color coding.
4. **Touch Target Sizing:** On 320px mobile viewports, bottom navigation actions and the Quick Create floating trigger provide interactive bounding boxes conforming to minimum touch target requirements.

---

## 7. Android Exclusion Rationale (`NOT_APPLICABLE`)

Android testing is formally documented as `NOT_APPLICABLE` for `v0.1.0` in accordance with the declared launch scope:
- As documented in `docs/m6/G5-EVIDENCE-DELTA-914-2026-09-20.md` §7 and `eimir-release-manifest.json`, the `v0.1.0` launch is strictly Web- and Self-Hosted-first.
- `android.included=false` was configured for the release-candidate and publish workflows.
- No Android release artifacts (APK/AAB) were published for `v0.1.0` (`signing=not-applicable`).
- In accordance with project governance, no simulated or speculative Android testing was substituted.
- TalkBack and mobile Android accessibility acceptance will be exercised when Android is included in a future release candidate scope.

---

## 8. Conclusion for G5-15 and Issue #916

Issue **#916** is complete:
- Manual launch-state accessibility acceptance for Web (`v0.1.0`) is **PASS**.
- Android is documented with explicit launch-scope rationale as **NOT_APPLICABLE**.
- Criterion **G5-15** in `docs/m6/G5-EVIDENCE.md` can be advanced by #525 without repeating the historical G4 automation suite.
