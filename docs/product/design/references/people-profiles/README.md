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
