# eimir. Brand Guidelines

**Status:** Binding brand identity guidance under Product Reference v1<br/>
**Version:** 2.2<br/>
**Effective Date:** September 23, 2026<br/>
**Claim:** „Euer gemeinsamer Ort.“

---

[Product Reference v1](./product/design/product-reference-v1.md), approved by [#955](https://github.com/baerenmarke90/eimir/issues/955), remains the normative product-design direction. The later Product Owner decision in [#1225](https://github.com/baerenmarke90/eimir/issues/1225#issuecomment-5797850494) replaces its former mark and extends its palette with the selected icon, logo and color-world system. The complete identity contract and original owner images are in [#1225 Corporate Identity](design/eimir/1225-identity-system/CI.md). Composition, interaction, self-hosted font families, privacy, security, accessibility, business-model and technical contracts remain binding.

## 1. Brand Identity & Philosophy

`eimir.` is the digital home for two people in a relationship. It is not a social network, not an administrative productivity dashboard, and not a dating app.

### Core Character
- **Warm & Tactile:** Feels like a real, physical place of trust, warmth, and shared memories—not a sterile SaaS CRUD interface.
- **Calm & Protected:** Prioritizes calm togetherness over stimulation, dopamine loops, and artificial urgency.
- **Authentic & Mature:** Celebrates genuine shared life and quiet everyday rituals without falling into kitsch, pink heart clichés, or superficial pastel decoration.
- **Equal & Balanced:** Designed for two equal partners. Neither profile nor person takes precedence over the shared space.

---

## 2. Brand Name & Wordmark

### Canonical Name: `eimir.`
- **Strictly lowercase with terminal dot:** The public consumer brand name is always written as `eimir.` (lowercase "e", followed by "imir", terminated with a period/dot).
- **The Terminal Dot:** In display and brand lockups, the terminal dot is accented with the primary brand color (`Brand Strong` / `Brand Coral`). The dot symbolizes a deliberate pause, an anchor, and the grounding center of a shared space.
- **Code & Namespaces:** Machine-safe identifiers use `eimir` without the
  terminal dot, including `eimir.*` on the backend and `de.eimir.app.*` on
  Android. Only public, user-facing touchpoints use `eimir.`. Narrow legacy
  identifiers retained for upgrade continuity are documented in
  [Project Identity Migration](PROJECT-IDENTITY-MIGRATION.md). Trademark-class
  candidates, evaluated alternatives (`Lomu`), and the external clearance /
  launch checklist are documented in [Brand & Launch Verification](BRAND-AND-LEGAL-CHECKS.md).

### Wordmark Usage
- In headers and navigation, the wordmark uses `Instrument Sans` with bold weight and tight letter spacing (`-0.045em`).
- In inverse presentation, the dot uses the appropriate on-accent token only when the actual background pairing is legible. The wordmark accent is decorative brand identity; it does not replace the semantic keyboard-focus role or convey essential action state.

---

## 3. The selected brand symbol

The app mark is the owner's selected pair of overlapping warm/cool filled circles with a white lowercase `e` loop, navy finishing shape and separate lower-right dot. Its Light, Dark, monochrome, Natürlich and Warm assets share one editable geometry. The simpler two-circle motif is reserved for the small **Wir** navigation icon. The exact visual references, permitted uses, source assets, safe area and delivery points are defined in the [corporate identity document](design/eimir/1225-identity-system/CI.md).

Web uses the SVG mark and generated favicon/PWA/touch assets from that source. The Capacitor wrapper packages the same Web interface; native store packaging remains governed by its separate delivery scope.

---

## 4. Color Architecture & Token Authority

`design/tokens.json` is the sole source of truth for all color, typography, spacing, radius, and motion tokens across Web and the Android wrapper.

`identity.colorWorlds` defines Original, Natürlich and Warm with explicit Light and Dark semantic roles. Original is the default. The two additional worlds are controlled contextual palettes, not user-selectable themes. The older `color.scheme` and `color.semantic` entries remain compatibility roles and do not override the selected identity. Consume the generated platform adapter; do not copy values from screenshots or this document.

| Role family | Meaning and use |
| --- | --- |
| `brandStrong`, `onAccent` | established filled primary-action pairing in both schemes; validate foreground/background contrast |
| `brand` | signature accent, wordmark dot, and appropriate selected/link emphasis; bright Dark coral is not a substitute behind white normal text |
| `brandSurface`, `brandGlow` | restrained contextual highlight; neither is a mandatory tint/aura for every surface |
| `shared`, `sharedSurface`, `success` | shared relationship context or confirmed outcomes with explicit text/icon meaning |
| `private`, `privateSurface` | owner-only context with understandable text/icon; privacy is not an error |
| `discovery` and supporting brand hues | purposeful inspiration or emotional emphasis where it supports the content |
| `background` | warm page ground from the current scheme; personal imagery and readable content remain dominant |
| `surface`, `surfaceSubtle` | reading or meaningful content grouping where a surface is needed; no automatic card wall |
| `surfaceRaised`, overlay roles | actual elevated interaction layers, sheets, and menus |
| `textPrimary`, `textSecondary` | authored content and readable supporting dates, help, labels, and status |
| `textMuted` | only when the rendered pair meets its applicable contrast requirement; not a default for essential small copy |
| `border`, `borderSubtle` | purposeful separation rather than outlines around every section |
| `focus`, `error`, `warning` | distinct keyboard-focus and consequence states; never substituted by the decorative wordmark accent |

Disabled controls use their own semantic state roles. Check actual rendered pairs in all relevant Light/Dark worlds; a token name does not prove accessibility. Normal text requires at least 4.5:1, qualifying large text and essential UI graphics at least 3:1, with visible keyboard focus and no color-only state meaning. The [corporate identity contract](design/eimir/1225-identity-system/CI.md) identifies the delivered palette roles and the scope of their current contrast checks.

---

## 5. Typography

Typography is self-hosted with zero runtime CDN dependencies.

1. **Editorial & Emotion — Literata:**
   - Used for emotional milestones, Today hero moments, story titles, memory quotes.
   - Conveys intimacy, permanence, and editorial warmth.
2. **UI & Structure — Instrument Sans:**
   - Used for navigation, controls, forms, planning cards, list items, and settings.
   - Modern, human, grotesque typeface with high legibility at all densities.

---

## 6. Voice & Tone

- **Perspective:** Speak directly to the couple (*„ihr“*, *„euer“*, *„gemeinsam“*).
- **Tone:** Empathetic, calm, respectful, unhurried.
- **Clarity over cleverness:** Explain actions concretely and empathetically rather than with abstract system terminology.
- **No artificial pressure:** Never use streaks, guilt mechanics (e.g. "You haven't sent Lea anything today!"), or manipulative push notifications.

---

## 7. Do's and Don'ts

### Do:
- Always write `eimir.` with lowercase "e" and the terminal dot in consumer copy.
- Use the active scheme's `background` role for the warm page ground; D1 retains the palette direction without freezing older fallback hex values.
- Highlight the terminal dot in the brand lockup with the active identity accent token.
- Maintain WCAG 2.2 AA contrast ratios (at least 4.5:1 for body text, 3:1 for UI controls).
- Keep design tokens in sync between `design/tokens.json` and Web CSS (the Android wrapper packages the Web bundle).

### Don't:
- Never capitalize as "Eimir" or "EIMIR" in marketing copy, app titles, or UI strings.
- Do not draw the symbol as an infinity loop or continuous ribbon.
- Do not overload views with pink hearts, glitter, or kitschy romance graphics.
- Do not design dense data tables, KPI cards, or admin grids that look like a corporate SaaS product.
- Never hardcode color hex values in feature components—always consume semantic tokens.
