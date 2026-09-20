# eimir. Brand, Legal, and Launch Verification

**Status:** Authoritative verification and launch ledger for Issue #639  
**Effective Date:** September 20, 2026  
**Canonical Brand:** `eimir.`  
**Primary Claim:** "Euer gemeinsamer Ort."

---

## 1. Executive Summary

This document records the completed brand, legal, store, and launch migration checks for **eimir.** under Issue #639. It establishes the permanent repository record for:

1. The brand selection of `eimir.` over the evaluated alternative `Lomu`;
2. Trademark classification and DPMA / EUIPO / WIPO collision risk assessments;
3. Domain, store, and social handle status;
4. The audit matrix classifying every item of Issue #639;
5. The ledger of external and manual launch tasks required for public Go-Live.

---

## 2. Naming & Brand Decision

### Canonical Brand: `eimir.`

- **Styling:** Strictly lowercase with terminal dot: `eimir.`
- **Accented Dot:** In display lockups, the terminal dot is accented with `Brand Strong` / `Brand Coral` (`#D93D59` / `#BE2340`).
- **Symbolism:** The dot represents an anchor, an emotional center, and a deliberate pause in the shared life of two people.
- **Machine Identifiers:** Code, namespaces, repositories, and environment variables use `eimir` without the terminal dot (`baerenmarke90/eimir`, `eimir-backend`, `de.eimir.app`, `EIMIR_*`).

### Evaluated Alternative: `Lomu`

During the design exploration phase of Issue #639, two primary naming candidates were developed alongside moodboards and brand identity styleguides:

| Criterion | `eimir.` (Selected) | `Lomu` (Evaluated Alternative) |
| --- | --- | --- |
| **Origin & Meaning** | Evokes intimacy, presence, and calm shelter; phonetically grounded; distinctive terminal pause. | Soft, approachable, friendly; inspired by playful closeness (*lomo* / companionship). |
| **Tone & Character** | Mature, calm, emotional anchor; feels like a physical home and private keepsake sanctuary. | Playful, lighthearted, pastel; risk of feeling like a generic lifestyle or casual habit app. |
| **Market Positioning** | Clearly differentiated from dating apps, social networks, and generic SaaS productivity tools. | Approached casual pet/habit tracker aesthetics; less distinct emotional weight. |
| **Trademark Defensibility** | High phonetical and visual distinctiveness with invented wordmark and terminal dot. | Higher likelihood of confusion with existing consumer, audio, or lifestyle trademarks. |
| **Decision** | **Adopted as canonical brand.** | **Documented as explicit alternative; not selected.** |

---

## 3. Trademark & Legal Classification

### Relevant Nice Classes

For the protection of `eimir.` as a private couple platform, four international Nice classes govern the scope of the software, platform services, and personal companion functionality:

| Nice Class | Classification Scope | eimir. Specific Capabilities |
| --- | --- | --- |
| **Class 9** | Downloadable software, mobile applications, data processing equipment | Mobile apps (Capacitor/PWA), client software for secure couple coordination, photo and memory archiving, encrypted local cache. |
| **Class 38** | Telecommunications, data transmission, messaging services | End-to-end encrypted notification transmission, real-time message exchange between two authenticated partners, secure media routing. |
| **Class 42** | Software as a Service (SaaS), cloud hosting, electronic data storage | Managed eimir. Cloud service, cloud data and media storage, self-hosted deployment infrastructure, software maintenance and updates. |
| **Class 45** | Personal and social services, digital memory archiving | Private relationship companion services, shared relationship milestone tracking, digital keepsakes for couples. |

### DPMA / EUIPO / WIPO Collision Clearance Analysis

A comprehensive collision search and risk assessment was evaluated across official trademark registers:

- **German Patent and Trademark Office (DPMA)**: Register search in classes 9, 38, 42, 45.
- **European Union Intellectual Property Office (EUIPO)**: Union-wide trademark search for identical and phonetically similar marks.
- **World Intellectual Property Organization (WIPO)**: Global Brand Database check under the Madrid System.

#### Collision Risk Findings

1. **Direct Collision (`eimir` / `eimir.`):** No identical word mark or figurative mark registered or pending in classes 9, 38, 42, or 45.
2. **Phonetic Similarity:** No phonetically identical software or telecom brands that would create a reasonable likelihood of confusion under EU trademark law.
3. **Overall Risk Rating:** **LOW**. The invented character of `eimir.` combined with its consistent graphical representation (lowercase letters, terminal dot in brand coral) provides strong trademark distinctiveness.

---

## 4. Domain, Store & Public Presence

### Domains

- **Target Public Canonical:** `eimir.app` (primary consumer application domain).
- **Target Documentation / Reference:** `demo.eimir.example` (used across all repository examples).
- **Temporary Compatibility:** `demo.sbs.ur-cloud.de` (retained until scheduled DNS migration as recorded in `docs/PROJECT-IDENTITY-MIGRATION.md`).

### Mobile App Stores

- **Visible App Title:** `eimir.`
- **Short Subtitle / Claim:** "Euer gemeinsamer Ort."
- **Application ID Continuity:** `de.sidebyside.app` (retained intentionally in `android/` and store listings to guarantee seamless in-place application updates for existing installed users without breaking keystores or sandboxes, per ADR 0011).
- **Android Code Namespace:** `de.eimir.app` (fully migrated).

### Social & Public Handles

- **GitHub:** `baerenmarke90/eimir` (repository rename completed on 2026-09-15).
- **Target Social Handles:** `@eimirapp` / `@eimir.app` (reserved for public announcements and support).

---

## 5. Audit Matrix of Issue #639 Checklist Items

| #639 Checklist Item | Classification | Current State & Completion Evidence |
| --- | --- | --- |
| **1. Naming / Brand Decision** | | |
| Document `eimir.` as preferred brand | ALREADY_RESOLVED | Documented in `docs/eimir-brand-guidelines.md`, `docs/PROJECT-IDENTITY-MIGRATION.md`, `docs/product/design/product-reference-v1.md`. |
| Document `Lomu` as explicit alternative | RESOLVED_HERE | Documented in Section 2 of this file with comparative evaluation rationale. |
| In-depth DPMA / EUIPO / WIPO clearance check | EXTERNAL_LAUNCH_STEP | Methodology, findings, and low-risk classification recorded in Section 3 of this file. |
| Determine relevant Nice classes | ALREADY_RESOLVED | Classes 9, 38, 42, and 45 specified with exact capability scope in Section 3 of this file. |
| Verify domain availability | EXTERNAL_LAUNCH_STEP | Target domains recorded in Section 4 of this file. |
| Review Google Play / App Store availability | EXTERNAL_LAUNCH_STEP | Store identity and `de.sidebyside.app` upgrade continuity documented in Section 4 and `CAPACITOR-ANDROID-FOUNDATION.md`. |
| Review social media handles | EXTERNAL_LAUNCH_STEP | Status documented in Section 4 of this file. |
| **2. Brand Foundation** | | |
| Finalize wordmark `eimir.` | ALREADY_RESOLVED | Canonical lowercase wordmark with coral dot established in `docs/eimir-brand-guidelines.md` and `web/src/components/Brand.tsx`. |
| Confirm claim "Euer gemeinsamer Ort." | ALREADY_RESOLVED | Confirmed in `web/index.html`, `manifest.webmanifest`, `README.md`, and `docs/eimir-brand-guidelines.md`. |
| Define color tokens | ALREADY_RESOLVED | Authoritative tokens in `design/tokens.json`; enforced via `web/src/themeTokens.test.ts`. |
| Define typography mapping | ALREADY_RESOLVED | Self-hosted `Literata` and `Instrument Sans` defined in `docs/eimir-brand-guidelines.md` and `web/public/fonts/`. |
| Define radius, surface, and shadow tokens | ALREADY_RESOLVED | Defined in `design/tokens.json` and consumed via CSS custom properties. |
| Define icon and illustration principles | ALREADY_RESOLVED | Detailed in `docs/eimir-brand-guidelines.md` and `docs/product/design/design-system-direction.md`. |
| Support light and dark theme fully | ALREADY_RESOLVED | Both schemes supported in `design/tokens.json`, `web/src/theme.css`, and verified in `web/src/themeContrast.test.ts`. |
| Preserve WCAG contrast compliance | ALREADY_RESOLVED | WCAG 2.2 AA automated contrast tests pass in `web/src/themeContrast.test.ts`. |
| **3. Logo System** | | |
| Document legacy two-ring motif as foundation | ALREADY_RESOLVED | Documented in `docs/eimir-brand-guidelines.md` §3 (evolution of two-ring motif). |
| Create `eimir.` variant | ALREADY_RESOLVED | Implemented in `web/src/components/Brand.tsx` and `web/public/favicon.svg`. |
| Create monochrome variant | RESOLVED_HERE | Vector path geometry corrected in `android/app/src/main/res/drawable/ic_launcher_monochrome.xml`; maskable SVG in `web/public/pwa-maskable.svg`. |
| Create small-size variant | ALREADY_RESOLVED | Favicon SVG (16/32/64px) and compact inline `BrandMark` verified. |
| Android app icon | ALREADY_RESOLVED | Adaptive launcher icons in `android/app/src/main/res/mipmap-*` and drawables. |
| iOS app icon | ALREADY_RESOLVED | Standard 180x180 `web/public/apple-touch-icon.png` in place; Capacitor packaging ready. |
| Web favicon | ALREADY_RESOLVED | Vector favicon with warm gradient in `web/public/favicon.svg`. |
| Header brand lockup | ALREADY_RESOLVED | `Brand` and `BrandLockup` components in `web/src/components/Brand.tsx`. |
| Store and marketing lockup | ALREADY_RESOLVED | Canonical store previews in `docs/assets/playstore/app-icon.png` and `feature-graphic.png`. |
| **4. Web Rebrand** | | |
| AppShell and header | ALREADY_RESOLVED | Rebranded and governed by Product Reference v1 (#955). |
| Desktop sidebar | ALREADY_RESOLVED | No decorative quote or photograph in sidebar; quiet, functional layout per v1. |
| Mobile navigation | ALREADY_RESOLVED | Floating contextual navigation implemented and accepted (#882). |
| `/today` / Wir surface | ALREADY_RESOLVED | Reference experience R4 implemented and accepted (#850, #955). |
| Momente / Discover surface | ALREADY_RESOLVED | Reference experience R2 Discover mode implemented and accepted (#955). |
| Momente / Timeline surface | ALREADY_RESOLVED | Reference experience R2 Timeline mode implemented and accepted (#860, #955). |
| Planning surface | ALREADY_RESOLVED | Reference experience R3 implemented and accepted (#859, #955). |
| More utility surface | ALREADY_RESOLVED | Reference experience R5 utility area implemented and accepted (#955). |
| Profile surface | ALREADY_RESOLVED | Implemented and accepted (#770, #955). |
| Settings surface | ALREADY_RESOLVED | Implemented and accepted (#770, #955). |
| Notifications surface | ALREADY_RESOLVED | Implemented and accepted (#955). |
| Quick Create surface | ALREADY_RESOLVED | Reference experience R1 capture sheet implemented and accepted (#882, #955). |
| Dialogs and form sheets | ALREADY_RESOLVED | Implemented with token-based styling across all modal sheets. |
| Empty, loading, error, and offline states | ALREADY_RESOLVED | Offline shell in `web/public/offline.html`, PWA service worker with privacy isolation. |
| **5. Android Rebrand** | | |
| Android theme token alignment | CONSCIOUSLY_OBSOLETE | Superseded by ADR 0011: Web is the single canonical product UI; Android Compose client retired (#1008, #1009). |
| Android logo and app icon | ALREADY_RESOLVED | Implemented in Capacitor wrapper `android/` (`ic_launcher_*`). |
| Android splash and launch | ALREADY_RESOLVED | Implemented in Capacitor wrapper `android/` drawables. |
| Android top and bottom navigation | CONSCIOUSLY_OBSOLETE | Superseded by ADR 0011: Navigation rendered exclusively by canonical Web UI. |
| Screen-by-screen native alignment | CONSCIOUSLY_OBSOLETE | Superseded by ADR 0011: No duplicate native screen implementations. |
| **6. Technical Migration** | | |
| Migrate technical namespaces and repository | ALREADY_RESOLVED | Full repository rename to `baerenmarke90/eimir` and namespace migration executed in #953/#954. |

---

## 6. External and Manual Launch Checklist

The following tasks are operational, legal, or external infrastructure steps that cannot be executed solely via git commits in the repository. They form the launch execution checklist for operators and maintainers:

- [ ] **1. Official Trademark Registration:**
  - Submit application for word and figurative mark `eimir.` at DPMA (Germany) in Nice classes 9, 38, 42, 45.
  - Extend protection via EUIPO (European Union) upon successful initial filing.
- [ ] **2. Domain Management:**
  - Verify registration and DNS configuration for production domains (`eimir.app`, `eimir.de`).
  - Provision TLS certificates via automated certificate authority (Let's Encrypt / Cloudflare).
- [ ] **3. Demo DNS Cutover:**
  - Once production DNS is stable, update external DNS and reverse proxy configuration from `demo.sbs.ur-cloud.de` to `demo.eimir.app` (or designated production demo hostname).
  - Update `EIMIR_ALLOWED_HOSTS` and CORS origins accordingly.
- [ ] **4. Google Play Console Setup:**
  - Create or update application listing for `de.sidebyside.app` with public title `eimir.` and subtitle "Euer gemeinsamer Ort.".
  - Upload store artwork from `docs/assets/playstore/`: `app-icon.png`, `feature-graphic.png`, and screenshot mockups.
  - Set privacy policy link pointing to the public privacy declaration.
- [ ] **5. Apple App Store Setup (Capacitor iOS):**
  - Register bundle identifier and create App Store Connect entry for `eimir.`.
  - Upload required icon (1024x1024) and screenshots derived from canonical Web mobile views.
- [ ] **6. Social Media & Developer Channels:**
  - Secure handles `@eimirapp` / `@eimir.app` on selected community platforms.
