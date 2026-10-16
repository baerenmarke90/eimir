**Reference status: HISTORICAL.** Captured implementation evidence for the stated issue/baseline. Terms such as "normative" or "authoritative" below apply only to that historical review; they do not lock current composition. [Product Reference v1](../../../../product/design/product-reference-v1.md) governs current design and interaction.

# Floating Bottom Navigation visual evidence — #882

Rendered visual evidence for the #882 integration of Quick Create into a floating bottom navigation on Compact/Mobile Web. Every image is a real browser render of the Web client at the stated viewport and theme state via Playwright (`web/e2e/tests/floating-bottom-nav.spec.ts`).

## Visual Evidence Matrix

| File | Viewport / State | What it shows |
| :--- | :--- | :--- |
| [`00-quick-create-sheet-open-390.png`](./00-quick-create-sheet-open-390.png) | 390×844, Light | Quick Create floating panel opened via center trigger. Demonstrates fully rounded floating surface with both top and bottom corners rounded, clear visual separation from the floating bottom navigation, layer stacking (`z-index: 100` panel and `z-index: 95` backdrop over `z-index: 50` floating shell), and the full seven-action taxonomy (Memory, Heart Moment, Milestone, Wish, Plan, Note, and Gift Idea). |
| [`00-quick-create-sheet-open-390-dark.png`](./00-quick-create-sheet-open-390-dark.png) | 390×844, Dark | Quick Create floating panel in Dark mode. Demonstrates fully rounded floating surface, clear visual separation from the floating bottom navigation, and high-contrast dark theme readability. |
| [`01-today-390-light.png`](./01-today-390-light.png) | 390×844, Light | Today canonical view with floating bottom navigation. Pill-shaped elevated surface, exactly four primary navigation destinations and center action button. Active state on Today. |
| [`02-today-390-dark.png`](./02-today-390-dark.png) | 390×844, Dark | Today in Dark mode (`data-theme="dark"`). Pill surface, frosted backdrop, brand glow, and calm active highlight. |
| [`03-memory-create-390-light.png`](./03-memory-create-390-light.png) | 390×844, Light | Memory Create scrolled to bottom. Save and Cancel actions clear the floating navigation with safe-area padding (`--shell-content-bottom-clearance`). |
| [`04-memory-create-390-dark.png`](./04-memory-create-390-dark.png) | 390×844, Dark | Memory Create in Dark mode scrolled to bottom. Active destination indicator on Moments. |
| [`05-plan-390-light.png`](./05-plan-390-light.png) | 390×844, Light | Plan surface with active state on Planning. Symmetrical horizontal balance around center button. |
| [`06-momente-390-light.png`](./06-momente-390-light.png) | 390×844, Light | Story surface with active state on Moments. |
| [`07-reflow-320px.png`](./07-reflow-320px.png) | 320 CSS px reflow | Responsive reflow down to 320px width without horizontal scroll (`scrollWidth <= clientWidth`). Floating shell maintains legible typography and touch targets. |
| [`08-small-height-390x640.png`](./08-small-height-390x640.png) | 390×640, small height | Constrained height viewport demonstrating non-disruptive vertical footprint and clearance. |
| [`09-constrained-height-form-focus.png`](./09-constrained-height-form-focus.png) | 390×500, constrained focus | Form title focus at constrained height representing on-screen keyboard occlusion. Automated headless Playwright cannot spawn a native OS mobile IME keyboard; real mobile IME behavior is verified as a manual spot-check. |
| [`10-expanded-desktop-1280x800.png`](./10-expanded-desktop-1280x800.png) | 1280×800, Desktop | Expanded viewport regression check. Floating bottom shell is hidden (`display: none`), standard top navigation and shell elements remain authoritative. |
| [`11-zoom-200-percent.png`](./11-zoom-200-percent.png) | 390×844, 200% zoom | Large text / 200% layout zoom. Navigation remains usable without collision or horizontal scroll, with all destination labels and center action visible and functional. |
