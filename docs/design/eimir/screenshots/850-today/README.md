**Reference status: HISTORICAL.** Captured implementation evidence for the stated issue/baseline. Terms such as "normative" or "authoritative" below apply only to that historical review; they do not lock current composition. [Product Reference v1](../../../../product/design/product-reference-v1.md) governs current design and interaction.

# `/today` visual evidence — #850

Rendered evidence for the #850 Today recomposition ("the living home of a
relationship"). Every image is a real browser render of the Web client at the
stated viewport, against a canonical couple Space whose photographs are the
repository's own `backend/demo_assets/images` — no mockups, no placeholder
imagery, no hand-composed screens.

`BEFORE` refers to `main@fd966028291e9fea320270d61b4331cac5d45cf2`, the Product
Owner's baseline for this issue.

## Before / after

| File | What it shows |
| :--- | :--- |
| [`850-today-before-after-first-viewport.jpg`](./850-today-before-after-first-viewport.jpg) | 390×844, first viewport, no scroll. The measured recovery of the vertical band above the hero and the arrival of `Euer Moment` inside the first screen. |
| [`850-today-before-after-full-page.jpg`](./850-today-before-after-full-page.jpg) | 390 CSS px, whole page. Four sections become the six-section normative composition. |

## Compact (normative)

| File | Viewport / state |
| :--- | :--- |
| [`850-today-390-light-viewport.jpg`](./850-today-390-light-viewport.jpg) | 390×844, Light, first viewport |
| [`850-today-390-dark-viewport.jpg`](./850-today-390-dark-viewport.jpg) | 390×844, Dark, first viewport |
| [`850-today-390-light-full.jpg`](./850-today-390-light-full.jpg) | 390 CSS px, Light, full page |
| [`850-today-390-dark-full.jpg`](./850-today-390-dark-full.jpg) | 390 CSS px, Dark, full page |
| [`850-today-320-reflow-full.jpg`](./850-today-320-reflow-full.jpg) | 320 CSS px reflow, full page |
| [`850-today-390x640-small-height.jpg`](./850-today-390x640-small-height.jpg) | 390×640 small-height phone, first viewport |

## Expanded

| File | Viewport |
| :--- | :--- |
| [`850-today-1440-light-full.jpg`](./850-today-1440-light-full.jpg) | 1440, Light, full page |
| [`850-today-1440-dark-full.jpg`](./850-today-1440-dark-full.jpg) | 1440, Dark, full page |

## Real-data variability

| File | Space state |
| :--- | :--- |
| [`850-today-390-no-upcoming.jpg`](./850-today-390-no-upcoming.jpg) | Nothing upcoming: `Demnächst` is omitted and `Euer Moment` leads. |
| [`850-today-390-sparse-no-photo.jpg`](./850-today-390-sparse-no-photo.jpg) | No shared photo: `Euer Moment` falls back to its compact state, `Diesen Monat` is omitted, and the contextual slot finds a shared wish. |
| [`850-today-390-new-space.jpg`](./850-today-390-new-space.jpg) | A genuinely empty Space: the existing new-space composition, hero intact. |
