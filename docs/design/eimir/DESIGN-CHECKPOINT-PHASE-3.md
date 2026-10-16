**Reference status: HISTORICAL.** This dated baseline and its classifications or selected visual direction are evidence, not current product-design authority. The historical body below is preserved; a prior PASS or selected composition does not establish v1 acceptance. [Product Reference v1](../../product/design/product-reference-v1.md) governs conflicts unless a later explicit Product Owner decision supersedes it. See the [reference register](../../product/design/README.md).

# Visual Design Checkpoint — Phase 3: Web Signature Surfaces

**Brand:** `eimir.`  
**Claim:** „Euer gemeinsamer Ort.“  
**Target Pull Request:** baerenmarke90/eimir#773
**Reference Issues:** #639, #501, #492, #430, #455, #771  
**Date:** 2026-09-07  

---

## 1. Executive Summary & Goal

Before locking the first `eimir.` signature surfaces into `main` via PR #773, this visual design checkpoint validates the actual brand and user experience identity. 

The objective is to ensure that the transition from eimir. into `eimir.` is **not a cosmetic tweak or superficial reskin**, but a profound evolution from a sterile CRUD/dashboard tool into a **warm, personal, unmistakable digital sanctuary for two people**.

This checkpoint explores two meaningfully different visual directions across three signature surfaces:
1. `/today` / **Wir** (the shared couple home)
2. **Momente / Entdecken** (`/story` — the living couple chronicle)
3. **Creation Flow** (`/memories/new` — preserving shared moments)

Both directions were built using real design tokens (`design/tokens.json`), real CSS custom properties, self-hosted Literata/Instrument Sans typography, and authentic photo assets (`backend/demo_assets/images/`). Visual evidence was captured via headless Chromium across mobile (390 px) and desktop (1440 px) viewports in both Light Mode and Dark Mode.

---

## 2. Visual Directions Explored

### Direction A: The Structured Couple Dashboard (Current #773)

- **Philosophy:** Evolution of the established dashboard architecture. It consolidates couple identity into a bounded top hero card (`CouplePresence`), integrates the `ThinkingOfYouButton` as a secondary action, and organizes content into clean, modular cards below.
- **Composition:**
  - *Header / Hero:* Enclosed container card with radial brand gradient, 24 px rounded corners, overlapping avatar pair, connection status dot, duration link ("★ 1 Jahr, 2 Monate"), and "Ich denk an dich" button.
  - *Context Area:* Distinct boxed cards for "Demnächst" (upcoming plan), "Kürzlich geteilt" (photo preview + heart moment quote), and "Erinnerung des Tages" (retrospective at bottom with 100 px thumbnail).
  - *Momente / Entdecken:* Pill tabs in a container bar, two top sub-cards ("Meilensteine", "Kapitel"), and a uniform vertical card stream with 3 square photo thumbnails per memory.
  - *Creation Flow:* Standard modal/form layout with rectangular input fields and heart-icon button.

### Direction B: The Living Sanctuary & Keepsake Tapestry (Alternative Concept)

- **Philosophy:** Complete departure from the "dashboard" metaphor. The interface is treated as a shared private living room or keepsake album ("Zuhause / Unser Archiv") where couplehood is the overarching atmosphere rather than a modular status card.
- **Composition:**
  - *Masthead:* An unboxed, breathing sanctuary masthead. Features glowing overlapping avatars (62 px), an expressive Literata greeting (*"Lea & Philipp"*), an intimate subtitle (*"Gemeinsamer Ort · Zusammen seit 400 Tagen"*), and an elevated, tactile "Ich denk an dich" hearth action floating as the primary impulse.
  - *Heroic Keepsake Focal Point:* On `/today`, the retrospective memory ("Vor genau einem Jahr") is elevated to the top focal point right after the greeting as a 50/50 editorial magazine spread with rich photography (`cabin-lake.jpg`) and a Literata quote.
  - *Organic Agenda:* Upcoming events flow as warm calendar date blocks ("12 SEP", "24 SEP") with breathing whitespace instead of heavy grey-bordered boxes.
  - *Momente / Entdecken:* An asymmetric keepsake tapestry. Featured memories receive sweeping wide-aspect photography (16:10), personalized author signature lines, and warm narrative typography. Heart Moments are styled as tactile keepsake love notes with soft brand gradients.
  - *Creation Canvas:* An intimate, distraction-free sanctuary. A prominent privacy toggle (`VisibilityBadge` icons for "Mit Lea geteilt" vs. "Nur für mich") sits at the top for immediate emotional safety, followed by an elegant display title line and album-like photo dropzone.

---

## 3. Reviewable Visual Evidence

All visual assets are persisted under `docs/design/eimir/screenshots/` and were captured at full resolution (2x device scale factor) using Playwright Chromium:

| Surface | Direction | Viewport | Mode | File Path |
| :--- | :--- | :--- | :--- | :--- |
| **`/today` (Wir)** | **Direction A** | Desktop (1440 px) | Light | [`direction-a-today-desktop.png`](./screenshots/direction-a-today-desktop.png) |
| **`/today` (Wir)** | **Direction A** | Mobile (390 px) | Light | [`direction-a-today-mobile.png`](./screenshots/direction-a-today-mobile.png) |
| **`/today` (Wir)** | **Direction B** | Desktop (1440 px) | Light | [`direction-b-today-desktop.png`](./screenshots/direction-b-today-desktop.png) |
| **`/today` (Wir)** | **Direction B** | Mobile (390 px) | Light | [`direction-b-today-mobile.png`](./screenshots/direction-b-today-mobile.png) |
| **`/today` (Wir)** | **Direction B** | Desktop (1440 px) | Dark | [`direction-b-today-desktop-dark.png`](./screenshots/direction-b-today-desktop-dark.png) |
| **`/today` (Wir)** | **Direction B** | Mobile (390 px) | Dark | [`direction-b-today-mobile-dark.png`](./screenshots/direction-b-today-mobile-dark.png) |
| **Momente (`/story`)** | **Direction A** | Desktop (1440 px) | Light | [`direction-a-story-desktop.png`](./screenshots/direction-a-story-desktop.png) |
| **Momente (`/story`)** | **Direction A** | Mobile (390 px) | Light | [`direction-a-story-mobile.png`](./screenshots/direction-a-story-mobile.png) |
| **Momente (`/story`)** | **Direction B** | Desktop (1440 px) | Light | [`direction-b-story-desktop.png`](./screenshots/direction-b-story-desktop.png) |
| **Momente (`/story`)** | **Direction B** | Mobile (390 px) | Light | [`direction-b-story-mobile.png`](./screenshots/direction-b-story-mobile.png) |
| **Creation Flow** | **Direction A** | Desktop (1440 px) | Light | [`direction-a-create-desktop.png`](./screenshots/direction-a-create-desktop.png) |
| **Creation Flow** | **Direction A** | Mobile (390 px) | Light | [`direction-a-create-mobile.png`](./screenshots/direction-a-create-mobile.png) |
| **Creation Flow** | **Direction B** | Desktop (1440 px) | Light | [`direction-b-create-desktop.png`](./screenshots/direction-b-create-desktop.png) |
| **Creation Flow** | **Direction B** | Mobile (390 px) | Light | [`direction-b-create-mobile.png`](./screenshots/direction-b-create-mobile.png) |

---

## 4. Evaluation Against Criteria & Litmus Test

### 4.1. What is the primary visual/emotional focal point?
- **Direction A:** The bounded top card with avatars and "Ich denk an dich" button. However, the subsequent sections quickly dilute this into generic list items.
- **Direction B:** The emotional focal point is dual and harmonious:
  1. The expansive couple greeting (*"Lea & Philipp · Gemeinsamer Ort"*) with glowing presence aura and prominent impulse button.
  2. The **Heroic Keepsake Focal Point** (*"Vor genau einem Jahr"*): It immediately draws the eye to a shared life memory with rich, warm photography and Literata prose.

### 4.2. Is the couple immediately recognizable as the subject?
- **Direction A:** Yes, but framed like a user profile header inside a tool.
- **Direction B:** Unmistakably. The couple is not just an item in a card; they are the masthead of the entire space. The aura, avatar presence, and prominent duration subtitle establish them as the sole reason the app exists.

### 4.3. Does the screen feel like a private shared place for two people?
- **Direction A:** It feels like a well-designed personal dashboard. However, the stacked rectangular cards still echo productivity tools.
- **Direction B:** It feels genuinely like a digital home, scrapbook, and sanctuary. Generous whitespace, organic calendar date blocks, letter-style love notes, and warm editorial typography evoke an intimate personal space.

### 4.4. Does content / memory imagery receive enough visual weight?
- **Direction A:** No. Photos are confined to small square thumbnails (160 px height or 100 px square thumbnails in retrospective).
- **Direction B:** Yes. Memories receive 16:10 heroic imagery with gentle shadows and rounded corners, allowing photos to breathe and evoke emotion.

### 4.5. Does it still resemble a generic dashboard or SaaS product?
- **Direction A:** Partially yes. The rhythm of `[Card] -> [Card] -> [Card]` carries residual dashboard DNA.
- **Direction B:** No. The rigid card grid is dissolved into an organic rhythm of masthead, heroic memory vignette, tactile agenda, and stationery notes.

### 4.6. What are the main trade-offs?
- **Direction A:** High information density and zero risk of layout shifts, but emotionally cooler and visually less memorable.
- **Direction B:** Requires slightly more vertical breathing room, but delivers immense warmth, emotional resonance, and brand distinction.

### 4.7. The Litmus Test
> *„Would someone who had never read the product description understand from these screens that `eimir.` is a private shared place for a couple?“*

- **Direction A Result:** A stranger might identify it as a couple's task planner or shared organizer.
- **Direction B Result:** A stranger immediately understands: *„This is a private, warm sanctuary for two partners in love to celebrate their relationship, keep their memories alive, and connect spontaneously.“*

---

## 5. Decision & Selected Direction

**Selected:** **Direction B (The Living Sanctuary & Keepsake Tapestry)**.

Direction B achieves the true design intent of issues #639 and #501. It transforms `eimir.` from a sterile CRUD tool into an authentic, beautiful, and emotionally grounded relationship home.

### Implementation Plan for PR #773:
1. **Preserve PR #773 Foundation:** Keep all core relationship primitives (`PartnerAvatarPair`, `CouplePresence`, `ThinkingOfYouButton`, `VisibilityBadge`), API integrations, test hooks, and contracts.
2. **Elevate `/today` CSS & Layout:**
   - Update `TodayPage.css` to allow the couple presence masthead to breathe with an unboxed, warm layout on wider screens while retaining responsive compact behavior.
   - Refactor `VisualMemoryCard` when rendering the retrospective: elevate it to an editorial keepsake hero card with wide photography and Literata quote styling.
   - Style upcoming plans with warm calendar-date badges.
3. **Elevate Momente (`/story`) Styling:**
   - Apply the keepsake tapestry styling in `StoryProductPages.css` (wide-aspect photography for featured memories, distinct letter-card styling for Heart Moments).
4. **Dark Mode Verification:** Ensure all elevated surfaces maintain perfect contrast and mood in dark mode using `--color-brand-surface`, `--color-brand-glow`, and `--color-surface-raised`.
5. **Full Test & CI Gate Verification:** Run all 436 web tests, lint, typecheck, format, and language audits to ensure 100% green status.
