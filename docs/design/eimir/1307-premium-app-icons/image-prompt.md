# Generated full-catalog reference prompts

Tool: built-in Imagegen, `ui-mockup`; updated 2026-10-12.

The first pass expands the earlier three-choice proposal to the full owner-requested poster catalog. The second pass corrects the Dark sheet surface. `candidates/` and the deterministic [catalog sheet](poster-icon-catalog.png) remain the artwork authority; generated thumbnails are illustrative. German strings below are localized product copy.

## Catalog expansion

```text
Use case: ui-mockup
Asset type: updated eimir. Appearance product reference for issue #1307.
Primary request: Edit the prior UI reference to support the complete poster catalog: Original plus ten additional Pro choices. Keep two adjacent full mobile compositions, Light/Free on the left and Dark/Pro on the right. Use flat screen views without phone hardware.
Input images: Image 1 is the prior generated UI and the edit target. Image 2 is the authoritative exact-source catalog sheet with all eleven names and artworks. Images 3 and 4 are actual current-main Light/Dark Appearance screens; preserve their shell, existing capabilities, typography and colors. Image 5 is the original owner poster; do not invent extra icon designs.
Keep the top-left original brand icon, search, notification and AN avatar. Preserve Back to Settings, the small SETTINGS eyebrow, the Darstellung title, existing explanation and the existing Farbmodus control with System selected. Keep root navigation Wir, Momente, plus, Planen, Mehr on the underlying page.
LEFT Light/Free: replace the old inline three-choice gallery with a compact current-choice summary under App-Icon. Show the exact Original thumbnail, label Original and Standard. Add a clear 44px or larger action "Alle Icons ansehen". Below it show "10 zusätzliche Icons mit eimir. Pro." and a quiet action "eimir. Pro ansehen". The free theme setting remains fully visible.
RIGHT Dark/Pro: show an open tall bottom-sheet choice task above the existing Dark Appearance page, with a dim inactive background. The sheet has a centered grab handle, title "App-Icon", and subtitle "Ein kleines Detail, das zu dir passt." Use a three-column grid with four rows. Put exactly these eleven source icons in this exact order:
row 1: Original, Abendrot, Salbei;
row 2: Sonnentag, Lavendel, Sand;
row 3: Mitternacht, Perlmutt, Dunkel;
row 4: Monochrom, Minimal (the third position remains empty).
Each icon has its own correct artwork from Image 2 and its name below. Show a small Pro badge on every one of the ten choices except Original. Original has a small Standard label instead. Salbei is preview-selected with a visible blue check and outline. Make thumbnails about 64 CSS px and label/touch areas readable; use no tiny dense cards. The grid can scroll inside the sheet on smaller heights, while the footer remains reachable.
At the bottom of the sheet show one primary action "Salbei auswählen" and the helper "Dein Browser kann eine weitere Bestätigung verlangen." Do not show a save success or claim the installed launcher changed. The underlying root navigation is covered/inactive while the sheet is open.
Preserve the poster's e-loop, circles, gradients and dot in all icon thumbnails. Do not substitute color-swapped approximations or omit duplicate-looking but independently illustrated Perlmutt/Dunkel/Monochrom treatments. Every extra icon is Pro even when its name describes a light/dark finish; normal theme switching remains Free.
Outside screen labels: "Light · Free" and "Dark · Pro". Match the existing soft blue Light and navy Dark consumer app style. No stock photos, hearts, admin tables, added checkout dialog or extra icon choices.
```

## Dark surface correction

```text
Use case: ui-mockup
Primary request: Make one focused correction to the referenced full-catalog mobile UI proposal: the open sheet in the RIGHT Dark/Pro screen must use the app's navy DARK theme, not a pale Light surface.
Preserve the LEFT Light screen, all eleven icon artworks, their names and order, ten Pro badges plus Original Standard, Salbei selection, exact button text, underlying page and outside labels.
On the RIGHT sheet change the background to the same dark elevated navy used by the actual Dark settings reference, heading/labels to warm near-white, muted text to accessible pale blue, and Pro pills to dark/lilac accents with readable white labels. Maintain the current blue selection outline and main action. Make the platform helper readable at an equivalent of 14 CSS px.
Keep a full-height bounded sheet with scrollable catalog and a reachable action/footer, a centered grab handle and an inactive dimmed Appearance page behind. Do not alter icon colors or substitute variants. Preserve exactly eleven icons: Original, Abendrot, Salbei, Sonnentag, Lavendel, Sand, Mitternacht, Perlmutt, Dunkel, Monochrom, Minimal. All ten except Original are Pro.
This is a theme correction to the same composition, not a new layout or branding direction.
```
