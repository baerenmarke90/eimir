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

- One shared circular blue plus action for person/day creation and authored tags,
  with native link/button semantics, localized name/tooltip and 48 px target.
- Concrete localized relationship options; legacy values remain readable and
  editable without invented relationship changes.
- Optional bounded notes in the person's ProtectedPayload and saved reader;
  the same shared authorization, concurrency, portability and deletion apply.
- Failed saves, source cancellation and dirty Back retain the entire draft.
- Completion stays in the page's normal flow after the optional note. It must
  not obscure textarea content at the bottom of a Compact viewport; existing
  small-height, large-text and keyboard journeys retain reachable completion.

Runtime evidence and exact-source validation will be recorded in the owning PR.

## Upgrade and compatibility

Migration 0117 expands the existing relationship check constraint without
rewriting existing people. Notes add an optional defaulted ProtectedPayload
field, requiring no new queryable column or media resource. Current API updates
that omit or send null for the note preserve it; explicit empty text clears it.
Existing pre-note payloads load with an empty note. Standard encryption-at-rest,
transfer and deletion continue to operate on the protected parent payload.

Deploy the matching backend and Web client. A schema downgrade normalizes new
relationship values to legacy categories and increments affected versions. It
deliberately retains notes: newly written payloads include the note field, even
when empty. Pre-note backend binaries use a strict payload schema and cannot
read those payloads. Use a roll-forward correction or a
complete matching backup restore instead of downgrading only the binary and
silently discarding protected content.
