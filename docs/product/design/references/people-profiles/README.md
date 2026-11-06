# People profiles and planning occasions

## Approved direction and baseline

The Product Owner approved the interactive proposal on 2026-11-06 and requested
implementation, a pull request and merge when ready. People always belong to
the couple: no visibility choice, audience badge, grouping or explanatory copy.
This explicit decision supersedes the optional person privacy class in the
historical specification section 12. Important dates retain their independent
privacy and authorization; the shared person must never expose private dates.

Reviewed main: `be9b5ec3c439f3c8711b8e59484f9b23ddd2bbc6`, including #1680.
Reviewed dependency: `feat/moments-local-create`, `7df91d6ec6b19753e48ded351143571ba2607d3a`
(#1681), including local creation and the partner one-time-message action.

The [generated Compact reference](generated-reference.png) was produced with
the built-in Imagegen tool before runtime implementation. Inputs were the
approved interactive prototype screenshots, with synthetic names and the
repository's generated lake fixture. No private user photo is committed.
The reference guides composition rather than freezing pixels or sample data.

Reviewed RelatedPeoplePage, RelatedPersonEditorSheet, ImportantDatesPanel,
SharedPlanningOverviewPage, PartnerQuickActions, MediaGallery, authorized avatar
loaders/cache, focused task/Back primitives, People authorization/model/API,
attachments, transfer, reminders, dashboard and the current semantic tokens.

## Mobile interaction contract

Authority: Product Reference v1 principles 1, 4, 5, 7 and 8; R3 planning and R5
utility; Detail View and Create/Edit templates. The scanning task justifies a
portrait list: identify a familiar person, open their profile or view their photo.
It is not a table or metadata inventory. Personal photographs, names and useful
birthdays provide warmth; decorative romance and repetitive help are unnecessary.

- People: one heading, a quiet local add action and unboxed portrait rows.
  Opening a name opens a reader. Photo activation opens the whole authorized
  image using the existing gallery, independently of opening the profile.
- Profile: photograph, name, relationship and birthday; deliberate Edit and
  contextual Remove. Birthday opens its planning context. Missing birthday has
  a concise add action. No audience state is presented for people.
- Create/edit: a focused full-page task, one photo action, name, relationship,
  optional birthday with optional year, existing dashboard opt-in and one Save.
  No automatic keyboard on reading/edit entry. Back/cancel retain dirty-draft
  safeguards. Picking/cancelling a source preserves input; explicit save owns
  attachment association and the actual resulting profile.
- Planning: retain Plans and Wishes and add the occasions mode. People birthdays
  are derived from their profiles, without a second birthday record; standalone
  dates do not require a person. Open a date before editing it. Partner-profile
  birthdays remain derived and read-only at their source. Existing standard
  reminders are reused, without another reminder or calendar store.
- Partner actions: retain existing gestures, cooldown/pending guards and the
  dependency's one-time entry. Add photo viewing without hijacking that menu.
- Compact first: safe Back, comfortable targets, keyboard-safe completion,
  320 px reflow and 200% text. Expanded uses the same bounded reader/editor and
  existing top navigation, without adding permanent management panes.
- Loading uses stable structure. Empty people has one useful add action. Read
  failure is distinct from empty and offers retry; background refresh retains
  usable data. Save/upload failure preserves input and identifies recovery.
  Offline never claims a write succeeded. Confirmed save shows the real person
  and returns to the original list/date context. Delete preserves explicit
  linked-date policy and confirmation, including privacy-safe cascade warnings.
- Reuse existing press, task, sheet/gallery and success feedback. Reduced motion
  retains the same focus, status and navigation results without translation.

## Domain, compatibility and data lifecycle

Enforce shared people server-side, not merely through hidden controls. Migrate
existing person rows to the approved shared model, retaining IDs, source owner,
photos, birthday values, links and dashboard preferences. Increment changed
versions so stale clients cannot overwrite this transition. The existing
composite foreign key updates its copied person class; linked important dates
keep their own visibility and owners. Add a database invariant and reject new
private-person requests rather than accepting a misleading private promise.
Legacy transfer imports normalize person records to shared within the validated
destination Space; unrelated private records and all tenant checks remain intact.
People use the existing collaborative Space write policy, with version checks,
safe parent locks, authorized attachment binding and explicit deletion policy.
There is no public access, member expansion or invitation capability for people.

## Reuse and business review

Reuse MediaGallery and the authorized object-URL/byte-cache lifecycle rather than
new image infrastructure; existing native/system pickers and PhotoSourcePicker
rather than another upload/provider stack; React Router/task origins and shared
Back/draft behavior rather than a parallel navigation engine. No new dependency,
provider, credential, analytics or persistent draft store. Existing selected-photo
integration eligibility, metadata exclusion and downgrade behavior remain.

Business/freemium impact reviewed: basic People CRUD, photo viewing, date tracking
and standard alerts retain the Free/Core side of the existing Mixed row. Advanced
occasion automation remains Pro. No entity quota, entitlement, cost/provider,
retention or Cloud/Self-Hosted distinction is introduced. Existing data/export
remain available. The model clarification is documented in the feature matrix.

## Validation plan

Backend: shared-only API/DB/transfer contracts, partner/outsider access, changed
versions, attachment ownership/lifecycle, linked private-date isolation, deletion
and reminder/dashboard compatibility on PostgreSQL. Regenerate OpenAPI clients.
Web: profile-before-edit, gallery/cache cleanup, create/edit/save/result/return,
unknown-year birthday and draft/media failure behavior. Complete affected browser
specs retain privacy, narrow/large-text, Light/Dark, Expanded, reduced-motion and
axe coverage. Run the impact planner/inventory and required metadata/source checks.
Hosted final-head checks must pass before the authorized merge.


## Implementation and acceptance

Main `271aaa99cd2396b3de59c364f6bfdc87b23b6a52` includes both #1680 and #1681.
The integration retains the local Moments create menu, global create destinations,
partner gestures and one-time composer. No native capability or release is changed.

The implemented [Compact overview](evidence/people-overview-390-light.png),
[saved profile](evidence/person-saved-390-light.png),
[focused editor](evidence/person-edit-390-light.png),
[whole image](evidence/people-photo-390-light.png) and
[Planning occasions](evidence/occasions-390-light.png) use synthetic data.
Additional evidence covers [Expanded Dark](evidence/person-edit-1440-dark.png),
[400% zoom](evidence/person-edit-400-dark.png),
[200% zoom](evidence/occasion-create-200-light.png), small height and both partner
photo handoffs. The generated reference above is preflight, not runtime evidence.

The browser journeys exercise explicit saves and authoritative results, clean and
dirty Back, retained input after photo-source cancellation, metadata exclusion,
whole-photo focus and history, birthday/profile/Planning return with selected-item
focus, no accidental partner send, reflow, reduced motion and axe WCAG 2.2 AA.
All 33 affected People/photo/partner cases pass; the five complete People journeys
pass again after the final presentation and return refinements. The adjacent
Moments/global-create journeys also pass (29 cases from their complete specs).

Local validation: production Web build and API/client drift checks; all 2,764 Web
tests (two existing skips); 1,348 backend non-integration tests (45 environment-
dependent skips); 114 focused PostgreSQL person/avatar/delete/race/dashboard and
transfer/encryption/reminder tests. A full empty-database upgrade through 0116 and
Alembic model/schema comparison pass. Legacy migration and real validated archive
round-trip preserve private linked dates; an inconsistent composite person class
is rejected before apply. No privacy or tenant check is bypassed for import.

The import regression exposed an existing validator that treated the class string
in a composite FK as a UUID. It now validates the complete tuple against the same
included parent; normalization still follows archive ownership validation.

All 38 browser-planner regressions and the 101-spec inventory pass. The actual PR
selection is conservatively full (74 critical / 27 additional) because App and
the bundled locales are shared foundations. Feature-owned acceptance is recorded
in both browser maps; the always-run core is unchanged. Source-inventory language,
identity, documentation/status and changed-file lint/format checks pass. Build
output is excluded from source auditing rather than exempted from language rules.
Final hosted checks and the exact tested revision are recorded in the owning PR.

Upgrade semantics: legacy private people become shared under the explicit PO
decision; changed versions invalidate stale writes. A downgrade removes the check
without inventing former privacy. Older clients submitting PRIVATE receive 422.
Independent date visibility is unchanged, including transfer and delete policy.
Native-device acceptance and APK publication are outside this Web/backend slice.

The initial hosted Backend formatting check found one wrapped expression in the
composite-FK import validation. The correction changes only whitespace and has
an identical Python syntax tree; the full 813-file Ruff format check, Ruff lint
and mypy on all 366 source files pass. Independent first-head checks finish
before the correction push; fresh final-head checks are required for merge.
