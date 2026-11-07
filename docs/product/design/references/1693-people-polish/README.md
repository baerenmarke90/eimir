# People and tag action polish

## Preflight

Product Owner follow-up [#1693](https://github.com/baerenmarke90/eimir/issues/1693),
2026-11-07. Reviewed main `72cad78823337f32293bb0041b05e748824b7f51` before
implementation: RelatedPeoplePage, RelatedPersonEditorSheet, ContextTagEditor,
ImportantDatesPanel, PeopleProfiles and shared button/token contracts. The full
Mobile Interaction Contract, reuse, business and privacy decisions are in the
owning issue.

The [generated Compact reference](generated-reference.png) was created with
OpenAI's built-in image-generation tool before UI implementation. The input was
the Product Owner's empty person editor screenshot: no personal photos or names
are included. The reference uses synthetic initials and authored text.

Preserve the actual shell icons, profile-row navigation, photo/source picker,
optional birthday/year/dashboard control, safe task Back and Save lifecycle.
The image guides the circular blue add-action treatment and optional note
placement; its simplified navigation glyphs and birthday summaries do not
replace existing product behavior. Expanded retains the same bounded reader and
editor. Product Reference v1, the existing People reference and accessibility
govern actual implementation.

## Intended behavior

- One shared circular blue plus action for person creation and authored tags,
  with native link/button semantics, localized name/tooltip and 48 px target.
- Concrete localized relationship options; legacy values remain readable and
  editable without invented relationship changes.
- Optional bounded notes in the person's ProtectedPayload and saved reader;
  the same shared authorization, concurrency, portability and deletion apply.
- Failed saves, source cancellation and dirty Back retain the entire draft.

Runtime evidence and exact-source validation will be recorded in the owning PR.
