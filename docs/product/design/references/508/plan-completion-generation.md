# Plan completion generated Compact reference — generation record

- Owning issue: [#508](https://github.com/baerenmarke90/eimir/issues/508).
- Main baseline: `4aa0806523a55dfafbee94d4479c6ffe06825303`.
- Baseline/preflight source commit: `7a8d9fcdf6e63a6394b988d7bdda61292067d900`.
- Generated: 2026-10-06 with the built-in Codex Imagegen tool.
- Asset purpose: product-composition preflight only; not a runtime or accessibility acceptance screenshot.
- Inputs: `plan-completion-baseline-pending-390-dark.png` (edit target) and `plan-completion-baseline-pending-390-light.png` (supporting theme/context reference), both captured from the current eimir. UI.
- Original PNG dimensions: 724 × 2172 pixels.
- Selected output SHA-256: `e7a2341dc700a7665630608123d13a8bde7e20835aa219e7bbd8f13fac4dffdf`.
- Selected output: `plan-completion-pending-compact-dark.png`.
- Creator/provenance: AI-generated reference derived from the repository's own UI/fictional browser fixture. No external stock asset or new runtime dependency is introduced.

The initial generation was refined once to remove the outside white margins and emphasize the disabled edit affordance. Only the selected output belongs to the repository. The repository's real components, token values, typography, contrast and state contract remain authoritative; generated raster approximation is not permission to introduce gradients, new spacing constants or new controls.

## Initial prompt

```text
Use case: ui-mockup, precise screenshot-based edit.
Asset type: mandatory generated visual product reference for eimir. issue #508, Compact Plan detail during a held completion request.
Input image 1 is the actual 390 CSS px full-page DARK Plan detail and is the edit target. Input image 2 is the matching LIGHT screenshot, supporting reference only; output one DARK full-page composition.
Primary request: preserve the actual current app composition and all existing visible capabilities; add only an honest pending status above the fold and disable competing mutations while the completion request is in flight.
Baseline: main 4aa0806523a55dfafbee94d4479c6ffe06825303. This is a narrow feedback/state change, not a redesign.
Preserve: header logo, search, notification bell and AN avatar; Back link "Zurück zu Planen"; exact plan title "Picnic in the park", its edit-pencil affordance; last confirmed schedule "Noch ohne Termin"; "Idee von Anna"; notes headed "Notizen" with "Remember the blanket."; shared note "Für euch beide sichtbar" and "Dieser Plan ist automatisch für euch beide sichtbar."; existing open "Plan verwalten" disclosure; "Wo steht ihr gerade?" heading; schedule date/time controls, helper text and BOTH unschedule/reschedule actions; chosen experienced date and completion button; bottom navigation "Wir", "Momente", central plus, selected "Planen", "Mehr". Keep existing icon grammar and owner logo exactly.
Change 1: immediately below "Idee von Anna" in the plan summary area, before Notes, add ONE quiet, readable two-line plain inline status with exact localized text "Abschluss für den 11.09.2026 wird gespeichert …". Use existing Instrument Sans UI typography, dark theme secondary text, normal flow, no new card, toast, spinner, checkmark, success badge or animation. The summary status must be recognizable without opening the disclosure. The submitted calendar day is 11 September 2026; do not infer 9 November from the browser's MM/DD/YYYY input rendering.
Change 2: show the pencil, scheduling date and time inputs, "Noch ohne festen Termin", "Termin ändern", the experienced-date input and completion CTA as disabled while preserving legibility, geometry, labels and entered values. Back and root navigation remain available. Remove the artificial selected-date/focus highlight from the disabled date field. The date input still visually uses 09/11/2026 from the actual browser reference. Completion CTA retains "Wird gespeichert …" as its disabled pending label.
Remove only the temporary "Zum Inhalt springen" focus-test overlay obstructing the shared note; it is an incidental test artifact, not permanent screen content.
Exact existing theme: navy page #171B2F, neutral panel #252B43, secondary tinted surface #303F62, main text #F6F7FF, secondary/disabled text #C4CEE8, border #46506F. Keep current Literata editorial title and Instrument Sans UI type, approximately 20 CSS px Compact gutters, 44 CSS px minimum controls and current radii. Preserve current blue/navy owner identity, do not switch to pink/coral or invent photography.
Composition: a single long vertically scrollable 390 CSS px phone-width FULL-PAGE app capture, scaled uniformly if needed. Keep the header, content, entire open management section and bottom navigation visible in the composition. Do not compress it into a standard short phone frame. No device hardware, presentation background, annotations, dimension labels, watermark or developer terminology.
The plan MUST stay in the last confirmed state. No completed label, celebration, Memory/Milestone continuation, or apparent saved success before the server confirms. Preserve all neighboring functionality and hierarchy. This generated reference guides composition; it is not runtime acceptance evidence.
```

## Targeted refinement prompt

```text
Use case: ui-mockup, precise screenshot-based edit.
Input image 1 is the generated DARK eimir. Plan pending reference to refine. Input image 2 is the original current-main Dark screenshot, supporting source for flat colors and existing app styling.
Make exactly these three corrections to image 1: (1) remove the white strips outside the app so the navy app page fills the entire canvas edge to edge; (2) remove artistic gradients/light streaks, using the original screenshot's flat semantic page and panel colors; (3) render the title's edit pencil visibly disabled, with a dimmer but recognizable outline, consistent with the other locked controls. Keep the pencil present in its existing position.
Preserve every other element and all exact text from image 1: the status "Abschluss für den 11.09.2026 wird gespeichert …" under "Idee von Anna", the plan title, last-confirmed "Noch ohne Termin", Notes and body, shared note, open Plan management, both scheduling actions, entered completion date 09/11/2026, disabled pending CTA, and header/bottom navigation. Keep the long full-page Compact composition, readable 390 CSS px UI proportions, and existing Literata/Instrument Sans direction.
No success indicators, celebration, continuation, spinner, new cards, illustrations, annotation, device frame or new styling. Flat colors: page #171B2F, panel #252B43, note/shared surface #303F62, text #F6F7FF, secondary text #C4CEE8, border #46506F. This remains an honest pending state, not completed. Preserve Back and navigation as available.
```
