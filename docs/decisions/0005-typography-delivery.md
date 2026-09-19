# 5. Deliver Literata for Display and Instrument Sans for UI

- **Status:** accepted
- **Date:** 2026-09-01 (updated 2026-09-03)
- **Issue:** #361, #616

## Context

`design/tokens.json` originally specified Fraunces for display and platform/Inter
for UI. Through iterative human review, the product voice required a warmer,
more intimate, and more cohesive typographic identity:

1. **Literata** serves as the emotional, editorial display face. It provides
   the warm, personal voice needed for relationship milestones, memories,
   the Today hero greeting, and editorial drop caps.
2. **Instrument Sans** serves as the primary UI face across both Web and Android.
   Rather than falling back to disparate OS system fonts, Instrument Sans provides
   a clean, contemporary, and unified visual rhythm for navigation, buttons,
   forms, metadata, planning cards, and controls.

## Decision

Deliver **both Literata and Instrument Sans**, self-hosted, as variable font
files bundled directly with each client.

- **Web:** Self-hosted woff2 files located in `web/public/fonts/` loaded via
  standard `@font-face` rules.
- **Android:** Self-hosted TTF resources located in `android/app/src/main/res/font/` (removed in #1009 with the Compose client; the Capacitor wrapper renders the Web bundle's self-hosted fonts from `web/public/fonts/`)
  mapped onto semantic `eimir.DisplayFamily` and `eimir.UiFamily`
  Compose `FontFamily` definitions.

Literata is used selectively for relationship and storytelling moments (Today
greeting, memory titles, quotes, drop cap). Instrument Sans is used for UI,
navigation, metadata, planning cards, and controls.

## Consequences

**Nothing is fetched at runtime.** No third-party font host or external CDN is
contacted on either platform. Self-hosted installations function completely
offline. The CSP `font-src 'self'` remains strictly enforced.

**Licensing.** Both Literata and Instrument Sans are licensed under the SIL Open
Font License 1.1 (OFL-1.1). Authoritative license files travel alongside the
font files on both Web (`web/public/fonts/OFL-Literata.txt`,
`web/public/fonts/OFL-InstrumentSans.txt`) and Android
(`assets/OFL-Literata.txt`, `assets/OFL-InstrumentSans.txt`).

**Variable fonts.** A single variable file per family covers all required weights
without bundling multiple static cuts.

## Alternatives considered

- **Platform grotesque fallback.** Previously accepted to avoid bundle size, but
  created inconsistent typographic quality across Android and diverse Web
  browsers.
- **Third-party font host.** Rejected on privacy, self-hosting, and CSP grounds.
- **Fraunces display font.** Superseded by Literata for superior editorial warmth,
  cleaner x-height, and more harmonious partnership with Instrument Sans.
