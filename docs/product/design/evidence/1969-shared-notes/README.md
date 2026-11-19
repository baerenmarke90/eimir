# Shared Notes (#1969): visual evidence

Evidence for the first implementation of shared notes. It is produced by the
feature-owned browser spec `web/e2e/tests/shared-notes.spec.ts` against the
real client with mocked API responses (notes live in memory inside the spec).
Reproduce the images with:

```bash
cd web/e2e
SCREENSHOT_EXPORT_DIR=../../docs/product/design/evidence/1969-shared-notes \
  EIMIR_E2E_PORT=<free port> node node_modules/@playwright/test/cli.js test tests/shared-notes.spec.ts --workers=1
```

Do not run the whole browser suite with the export directory set: other specs
export their own evidence into the same place conventions.

## Baseline

- Branch `feat/1969-shared-notes`, merged with `origin/main` at `06af723f2`.
- Compact reference width 390 px; Expanded 1280 px.
- Sample text is English on purpose; all UI labels come from the shipped locale
  resources.

## Images

| File | State |
| --- | --- |
| `shared-notes-overview-compact-light.png` | Overview with a pinned note and a recent note, scope tabs, search, floating create action |
| `shared-notes-overview-compact-dark.png` | Same overview in the dark theme |
| `shared-notes-overview-expanded-light.png` | Overview on a wide screen (single reading column, create action in the heading) |
| `shared-notes-read-compact-light.png` | Reading page: audience chip, prose with list lines, authorship, filled edit action |
| `shared-notes-editor-compact-light.png` | Full-screen editor with one authored frame and the bullet tool |
| `shared-notes-empty-compact-light.png` | First-use state |
| `shared-notes-wir-module-compact-light.png` | Wir module with one pinned note (wide tile) |
| `shared-notes-plan-create-compact-light.png` | Plan create page (follow-up): one shared note chosen in the draft, shown as a chip with its remove control, and the Notiz tool in the composer tool row |

`shared-notes-wir-compact-light.png` is an earlier full-screen capture that shows
an unrelated error banner from the incomplete mock; it is superseded by the
module capture above and is not part of the evidence.

## Journey covered by the spec

Open the overview, open a note, edit, save, observe the saved result on the
reading page (the removed list line is gone, one PATCH was sent), and the pinned
Wir tile opening the note.

Follow-up journey: create a Plan, open the Notiz tool, choose a note (no new
note is offered, because leaving would discard the unsaved Plan), save with the
link call failing (the page says the Plan is saved and the links are not),
retry, and arrive on the saved Plan with exactly one Plan created and the note
linked once.

## Not covered here (outstanding)

- ~360/~430 px widths and captures of the reduced-motion and large-text states. The spec asserts that overview, reading page and editor do not overflow horizontally at 320 px with 200% text and reduced motion (this found and fixed a header overflow in the editor), but it stores no image.
- The plan section on an existing Plan, the plan choice sheet, the conflict
  notice, the offline error and the notification and activity-feed entries have
  component or API tests but no screenshots.
- No native device or Capacitor wrapper check; the same web UI ships there.
  Partner push for notes (Product Owner decision 2026-11-17) is covered by
  backend and Android fixture tests only; it stays unverified on a device until
  the Product Owner has tested it.
- No Product Owner review of the generated visual reference required by
  `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 9A: the clickable prototype
  that guided this work lives outside the repository (`prototypes/`).
