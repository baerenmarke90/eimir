# eimir. Component Contracts

**Status:** Binding product foundation  
**Version:** 1.2<br/>
**As of:** September 15, 2026

Component Contracts describe the behavior and meaning of shared UI building
blocks independently of the technical framework. WebApp and smartphone app may
use different implementations, but they must satisfy the same contracts.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 1. Contract structure

Every component documents:

1. **Purpose** – which problem it solves.
2. **Anatomy** – required and optional parts.
3. **Variants** – deliberately supported variants.
4. **States** – visible and interactive states.
5. **Behavior** – input, output, and transitions.
6. **Accessibility** – name, role, focus, and operation.
7. **Content** – rules for labels and error messages.
8. **Analytics** – allowed events without sensitive content data.

New visual variants are added only when they express a new meaning or
interaction.

## 2. Shared state models

```text
LoadState       = idle | loading | content | empty | error | offline
SyncState       = local_draft | submitting | synced | failed | conflict
PrivacyClass    = SPACE_SHARED | OWNER_ONLY | TEMPORARY_SHARED | EPHEMERAL_CONTEXT | SYSTEM_METADATA
PermissionState = unknown | explaining | requesting | granted | denied | blocked
ActionState     = idle | submitting | success | error
```

- `LoadState` describes loading a view.
- `SyncState` describes persistence of already visible content.
- `PrivacyClass` describes the domain access class. Presentation shortcuts such
  as `private` and `shared` are not API values.
- States are not collapsed into an ambiguous boolean such as `isLoading` when
  multiple transitions are possible.
- Error states expose a stable technical error code and a human-readable
  message.

## 3. Action components

### 3.1 Button

**Purpose:** Triggers one clearly named action.

**Variants:**

- `primary` – the single visually dominant action for the current view/state; sections do not each gain an equally dominant action.
- `secondary` – important alternative.
- `tertiary` – lightweight contextual action.
- `destructive` – potentially irreversible action.

**States:** `default`, `hover`, `focus`, `pressed`, `disabled`, `submitting`,
`success`, `error`.

**Contract:**

- The label should start with a verb where possible; de-DE example:
  **„Erinnerung speichern“**.
- A button does not change width while loading.
- `submitting` prevents duplicate activation and exposes understandable textual
  activity.
- `disabled` does not replace validation or permission explanations.
- Minimum target size: 48 dp in the app, 44 CSS px on Web.
- The accessible name matches the visible label or meaningfully extends it.
- Standalone create/add actions that start a task use a visibly filled primary
  or secondary button in both empty and populated views. An icon plus bare text
  or a transparent tertiary action is insufficient. Reuse the shared button
  surface, contrast, focus, pressed and target-size rules; do not emulate the
  button with local styling. This includes the important-date creation action
  (Product Owner correction, 2026-11-07, #1688). Contextual tertiary actions and
  inline insertion controls retain their distinct roles. Keep at most one
  visually dominant primary action in the current view/state.
- All create/add entry points, including authored tags, media and inline list
  insertion, use `AddActionLink` or `AddActionButton`: the same filled
  canonical-blue pill, shared icon and **visible localized action label**,
  with a comfortable 48 px target. The optional typed `icon` prop selects an
  `EimirIcon` motif; the plus remains the default for generic creation.
  Product Owner correction #1724 uses photo for device media, photo-library for
  other photo sources, pin for Places, list for Lists, tag for authored tags and
  video for the dedicated video action. Icons are decorative, share the same
  size and inherit the action foreground, including their accent strokes.
  Existing task-origin links, native file labels and add/edit chips can reuse
  `AddActionContent` with the same `add-action` surface without replacing their
  lifecycle. Selected values keep their existing edit/selection meaning.
  Preserve native semantics, refs, focus, pending/disabled behavior and link
  state. Labels wrap; inline rows wrap before compressing input or text. Local
  CSS may arrange the action but cannot redefine its shared presentation.
  Product Owner correction #1697 supersedes #1693's icon-only circular
  interpretation for heading and inline actions. The #1740 follow-up adds a
  shared Compact floating variant with a filled 60 px rounded square,
  16 px corners, a 32 px plus icon box, localized accessible name and room
  above the docked navigation. Lists, Places, People, Chapters and the
  Private Area use it for their overview creation action. The Private Area
  uses it for its local Personal Notes, Gift Ideas, Private Lists and Partner
  Notes creation actions as well. Expanded renders the localized label and
  the contextual icon in the existing page heading.
  Selection choices, Back, Close and overflow retain their distinct roles.
- Product Owner correction #1726 defines a narrow media-intake exception:
  its approved chat refinement uses one soft composer entry which opens the
  existing source sheet. Device/external choices live in that sheet, with Pro
  only on external choices; gallery content sits directly in the composer.
  The media section heading, nested media surface and idle format hints are
  omitted. The original grouped-row direction below is superseded for composers.
  grouped device and external photo-source choices use the shared media intake
  button with a full-width, borderless filled surface, contextual icon, visible
  localized label, optional format hint and external-source Pro mark. They live
  inside the writing composer; this selection presentation does not change
  file/source ownership or the other AddAction entry points. Idle writing fields
  are borderless; keyboard focus, errors and forced-colors remain distinguishable.
- Product Owner correction #1730 supersedes conflicting #1717/#1726
  composition for non-experience Memory, HeartMoment and Plan create/edit.
  The page itself is the writing surface. Labeled tools replace filled
  Place/Tag/List/Voice insertion pills, and selected values use quiet edit
  chips. Diary has one on-page media entry; HeartMoment and Plan use the Photo
  tool and shared source sheet. Other AddAction consumers retain their contract.
- Product Owner decision #1790 D1 makes the diary entry the only one: diary
  create and edit have no Photo tool and no separate external-source link. The
  on-page intake opens the shared source sheet when an external source is
  connected, and the device picker otherwise; a populated gallery adds through
  its add tile. HeartMoment and Plan keep the Photo tool, where media stay
  optional.
- Hover feedback must keep the control's hit target stationary. Translating a
  button away from a pointer at its edge can alternate hover state indefinitely
  and prevent both a real click and native actionability checks. Reuse color
  feedback for hover; the existing deliberate press/reduced-motion contract
  remains separate (#1693).

### 3.2 Icon Button

- Used only for established, frequent actions such as close, back, search, or
  overflow.
- Always has a tooltip on Web and an accessible name on every platform.
- Critical or uncommon actions also include text.
- Badge, icon, and status do not change the interactive target size.

### 3.3 Link

- Navigates to a destination; a button changes state or triggers an action.
- Links remain identifiable through text styling, contextual underlining, or an
  additional distinguishing characteristic.
- External destinations and downloads are announced when their behavior would
  otherwise be surprising.

## 4. Input components

### 4.1 Text Field and Text Area

**Anatomy:** label, input, optional help, character counter, status, and error
message.

- The label remains visible; a placeholder does not replace a label.
- Validation occurs no later than field exit and again on submission.
- An error explains both the problem and the correction next to the field.
- Input type, autocomplete, and virtual keyboard match the content.
- Text Area grows to a defined maximum height and then remains scrollable.
- Sensitive content is not logged or prefilled without a documented purpose.

### 4.2 Selection controls

- Checkbox: multiple independent options.
- Radio Group: exactly one option from a manageable set.
- Switch: immediately effective on/off state; not a form-submission mechanism.
- Select/Combobox: larger or searchable set of options.
- Segmented Control: two to four equivalent views or modes, not long-term
  navigation.

`ShortTaskSheet` may accept an optional `footer` for a bounded choice with a
long scrollable body. The shared footer stays outside body scrolling, protects
the bottom safe area and remains separately scrollable for large text or error
content. It does not introduce another modal, focus or dismissal lifecycle.
App-icon selection uses this contract for its explicit Save and recovery state.

### 4.3 Date, Time, and Duration

- Platform-native selection is allowed if result format and validation remain
  equivalent.
- Time zone and all-day events are handled explicitly.
- A human-readable summary appears before saving.

## 5. Navigation components

### 5.1 Navigation Item

**Anatomy:** icon, visible label, optional badge, active indicator.

- States: `default`, `hover`, `focus`, `active`, `disabled`.
- Active state is not conveyed by color alone.
- Order and naming are stable across platforms.
- An item leads to a place, not to a one-time action.

### 5.2 Tabs

- Switch between peer content within one area.
- The active tab is programmatically identifiable.
- Arrow-key behavior follows the native platform pattern.
- Tabs do not wrap across multiple rows; if space is insufficient, simplify the
  information model instead.

### 5.3 Breadcrumbs

- Web only and only from at least three understandable hierarchy levels.
- Supplement primary navigation and never replace the page title.

### 5.4 Secondary-page Back

Every authenticated secondary destination, including future routes, receives one
upper-left, rounded, icon-only chevron from `SubpageNavigation` in the AppShell.
Primary roots are derived from the shared route registry and do not receive Back.
Registry-owned peer views, including the Memory map, keep the same root boundary
and tab geometry; they are not separate secondary pages.
Use `TaskBackButton` for a guarded task exit or `TaskBackLink` for an existing
navigation link. The shell places these page-owned controls in the same slot and
removes its default; page implementations must not add textual Back chrome.
The accessible name remains localized, the target is at least 44 CSS px, and
keyboard/focus, modified links, pending/dirty guards and task-origin return remain
owned by the existing task. A direct entry falls back to its canonical parent.
The separate administration shell uses the same control at its upper left.
See [the composition and evidence](product/design/subpage-navigation-context/README.md).

### 5.5 Moment date and Place context

Memory and shared HeartMoment readers group the calendar date and all authorized
Places above media in one wrapping row. For the #1730 non-experience Memory,
HeartMoment and Plan readers, coordinates link directly through `MomentMapLink`
to the existing internal Memory map; a Place without coordinates stays text.
Map Back restores the same detail and reading position. Composer context opens
its existing Place editor instead. Out-of-scope experience readers retain their
short-sheet context. No external request occurs without an explicit action.
Private HeartMoment readers display their protected parent location snapshot and
do not request shared Place relations. Private capture may deliberately copy a
saved Place or map choice into that snapshot without creating a shared Place. A Memory's
date-only fallback heading displays its calendar date once, with Places beside
it where space permits. `MomentDate` provides the same calendar treatment to
timeline and relation previews; formatting and date-only semantics stay with
the caller. Metadata uses normal supporting text independently of heading type.

## 6. Content components

### 6.1 List Item

**Anatomy:** title, optional metadata line, leading visual, trailing status or
action.

- The whole row may open one single primary destination.
- Additional actions are separately focusable and clearly named.
- The title is limited to two lines; full content remains available in detail.
- Selection, unread, and sync states are distinguishable.

### 6.2 Content Card

- A card summarizes one meaningful bounded object or action, not decoration alone. It is not the default abstraction for photos, thoughts, plans, statistics, or every section; choose the content-type composition and surface role from Product Reference v1 first.
- Nested cards are not allowed.
- Clickable cards have visible focus and exactly one primary destination.
- Secondary actions live in a clearly separated area.
- Card radius, padding, and shadow come exclusively from tokens.

### 6.3 Timeline Item

- Leads with photo, text, or mixed content according to its meaning. Date, author, content type, visibility, and sync state remain available at the appropriate hierarchy; critical privacy or save state is never hidden. Metadata is not a required leading row on every item.
- The visual line is decorative; semantic order remains in document flow.
- Multiple events on the same day may be grouped without losing individual
  targets.

### 6.4 Checklist Row

- Checkbox and text form one understandable control.
- Completed entries remain readable and can be reopened.
- Concurrent online changes use `version`; conflicts never overwrite silently.
- Delete is available through a menu and may additionally be exposed as a
  gesture.

### 6.5 Product Reference v1 visual roles

These are additive platform adapter roles, not a universal content renderer.
The [F1 delivery and evidence](product/design/f1-visual-foundations.md) records
the concrete APIs, usage, existing consumers and validation scope.

- Personal/content headings use the existing editorial family selectively;
  utility headings, authored prose, support and actions use the UI family.
  Semantic heading levels follow reading order independently of visual size.
- Supporting text uses a compliant secondary-text role. Link text uses the
  scheme-appropriate strong/bright coral pairing; filled actions retain
  strong coral and on-accent. Existing legacy consumers are not silently
  reclassified as migrated.
- Page, readable content, meaningful tint and raised overlay retain separate
  purposes. Spacing and content order normally separate sections; an ordinary
  photo/text item does not gain a resting shadow or nested card boundary.
- Media uses the existing large radius, independent bounded content the card
  radius and sheets the sheet radius. Caption text remains readable below the
  image. A full image view exposes the complete image; absent media differs
  from loading or failed media.
  The PO-approved Wir monthly mosaic (#1736) is a bounded exception: captions
  overlay a legibility scrim, calendar dates remain in each link's accessible
  name, and sensitive photos retain concealment plus a visible localized label.
  Its one/two/three-photo layouts use the sheet radius without a swipe track.
- Compact page gutters resolve to the tokenized narrow or comfortable value
  from available width. Resizing does not reset content/selection. Insets and
  keyboard protection remain platform responsibilities.
- Fast feedback, ordinary transitions and contextual reveals use existing
  duration/easing roles. Reduced motion retains status, meaning and actions.

The internal Web fixture (the former Android debug Activity was removed in #1009) exercises photo, text,
utility, loading/error/retry and overlay roles with synthetic data. Their
detail/return and fixture-completion actions demonstrate the bounded proof;
they do not implement production capture, persistence or F2 task lifecycle.
Do not expose these fixtures as a public product destination or infer that
R1–R5 have been migrated from their presence.

## 7. Privacy and status components

### 7.1 Visibility Control

**MVP values, when supported by the domain:** `OWNER_ONLY`, `SPACE_SHARED`.

- Shows icon and text. Intentional de-DE product labels are **„Nur für mich“**
  and **„Für uns beide“**.
- Display state uses a chip/status; forms use a real selection control.
- Changing visibility explains recipients and effect.
- Pink denotes private/protected context and green denotes shared context;
  textual indication remains mandatory.
- Memory, Wish, and Plan show their status only; the current Core does not allow
  changing their privacy class. HeartMoment may offer both MVP values.

### 7.2 Status Badge

- Supported categories: `info`, `success`, `warning`, `error`, `private`,
  `shared`.
- Badges contain at most two short words or one number.
- Status is not conveyed by color alone.
- Badges are not clickable; interactive filter chips are a separate component.

### 7.3 Sync Indicator

Intentional de-DE product copy:

- **„Wird gespeichert“**
- **„Gespeichert“**
- **„Aktion nötig“**
- for a failed offline write attempt: **„Noch nicht gespeichert“**

`Synced` may visually recede after a short time. `failed` and `conflict` remain
visible until resolved or deliberately discarded.

## 8. Overlay components

### 8.1 Dialog

- Has a title, understandable content, a primary action, and an optional
  secondary action.
- Focus starts on the first meaningful element, remains trapped inside the
  dialog, and returns to the trigger afterward.
- Escape/Back closes only when no critical changes would be lost.
- Destructive confirmations name the object and consequence.

### 8.2 Bottom Sheet

- Used on Compact for short selections or contextual actions.
- Has a clear heading and a visible close option.
- Drag-to-dismiss is supplementary only; keyboard and screen reader support
  remains complete.
- On Compact, a deliberate downward pull may start anywhere on the sheet
  surface, including buttons, links and list rows; releasing a claimed pull
  never activates the control it started on. Text entry, selects, sliders,
  maps and media keep their own gestures, and a scrolled inner region first
  scrolls back to its top boundary.
- Long or complex flows move to a dedicated page.

### 8.3 Side Pane

- Used from Medium upward for details, preview, or short editing.
- Width follows layout tokens; content has its own scrollable region.
- Closing restores focus and list selection.

### 8.4 Focused task, short sheet and return

The bounded [F2 contract and consumers](product/design/f2-task-boundaries.md)
implement Product Reference v1's create/result/return promise. This does not
declare all existing editors migrated.

- A short sheet has a name, visible Close, intentional initial focus, contained
  traversal and inactive background. The innermost layer owns Escape/System/
  Browser Back. Cancel restores its trigger; deliberate navigation closes the
  layer before handing focus to the destination.
- Sustained Memory capture uses a focused page and one completion action.
  Dirty exits require deliberate discard; pending completion prevents duplicate
  submission and guards exits. Platform unload warnings supplement in-session
  protection; they do not promise process/browser restart persistence.
- Confirmed creation, attachment association and later reads have separate
  outcomes. Never retry a known-created Memory as a new create. An unconfirmed
  create response remains explicitly uncertain until it can be reconciled.
- Only the owning task/session may clear its submitted draft or open its result.
  Account/Space transitions invalidate late completions and transient origins.
- Return validates the originating context and restores supported scope,
  loaded range and position through existing navigation/query ownership.
  Untrusted, expired or absent context falls back to the canonical content home.
  History contains opaque references, never draft/media/search payloads.
- Filter selection in a contextual sheet is a draft until Apply. Cancel keeps
  applied scope; the applied summary and filtered no-match remain recognizable.
- Reduced motion preserves identical focus, state and result semantics. The
  Web/native proof exercises production consumers; broader R1/R2 composition
  and other lifecycle migrations retain their own acceptance owners.

### 8.5 Page composer

`ComposerToolRow`, `ComposerTool` and `ComposerChip` provide presentation for
#1730; existing domain owners retain authoring, permissions and persistence.
The anatomy is native header submit, wrapping date/Place context, unwrapped
writing/media, selected chips, status and a labeled tool group. HeartMoment
retains visible feeling radios and its separate visibility task.

- Tools are native buttons with localized visible labels and at least 48 px
  targets; selected edit chips have at least 44 px targets. Caller-supplied
  active, disabled, pending and error states remain truthful.
- The tool row follows the visual viewport and safe area. Content reserves its
  measured height; focused fields can scroll above it. Opening a reader or
  composer does not automatically activate the keyboard.
- The existing short sheet owns initial focus, trapping, Escape/Back and trigger
  restoration. Domain owners retain dirty/pending exit guards and native form
  values after a sheet closes. Header Save remains associated with that form.
- The later [PO review of #1735](https://github.com/baerenmarke90/eimir/pull/1735#issuecomment-6776422807)
  supersedes the Heart lead-first reference frames and the former media-management
  disclosure. Context precedes photos, then Heart voice, existing title/lead and
  prose, feeling, and chips/links. Empty media has no visible gap.
- The inline stage uses the same filling crop in all three products; fullscreen
  retains the full image. Cover choice, removal, sensitivity and count remain
  at the four stage corners. The 56 px strip never enlarges or exposes per-item
  controls: a thumbnail selects the stage only. The subsequent PO correction
  removes the composer-only Arrange, automatic-cover reset and inline Reveal
  rows. Stage activation opens the existing fullscreen, whose reveal/hide
  controls remain. No replacement arrangement entry is introduced; default
  galleries keep their existing `PhotoArrangeTask` and reset controls. Retry
  belongs on the failed stage. Native touch/focus and pending/permission guards
  remain authoritative.
- The compact Plan schedule sheet explicitly offers the existing unscheduled
  state through the native date-change path, including the owning dirty guard.
- Light/Dark, semantic typography, reduced motion and reflow use shared roles.
  No domain request, analytics payload or private content storage belongs in
  these primitives. Existing source consent, Pro and native media owners remain.

## 9. Feedback components

### 9.1 Inline Message

- Preferred for persistent errors, warnings, and blocking information.
- Appears near the affected content and offers a concrete action when needed.
- The message contains problem, impact, and next step.

### 9.2 Snackbar

- For brief, non-critical confirmation or a reversible action.
- At most one action; de-DE example: **„Rückgängig“**.
- Critical errors and required decisions are never shown only here.
- Duration accounts for reading length and assistive technologies.

### 9.3 Skeleton, Empty State, and Error State

- Skeleton matches the expected content shape and uses subtle animation.
- Empty State distinguishes first use, empty search, and missing permission.
- Error State offers de-DE **„Erneut versuchen“** when retry is meaningful.
- Existing content is not removed because of background errors.

## 10. Media components

### 10.1 Media Tile

- Shows preview, type, upload status, visibility, and alternative description.
- Failure and retry are per file.
- Crop and editing never modify the original without making that clear.
- Videos have a poster frame, duration, and subtitle status.

### 10.2 Avatar Pair

- Two people are represented equally; neither is visually dominant by default.
- Initials or neutral placeholders are available when no photo exists.
- Status or role is supplemented with text when relevant.

## 11. Relationship components

These signature building blocks represent the core relationship-first identity of `eimir.`, ensuring that partnership is woven natively into the interface rather than treated as a peripheral profile setting.

### 11.1 PartnerAvatarPair

**Purpose:** Renders the two partners of a shared space as an interconnected unit with overlapping circles and connection state.

- **Anatomy:** Primary user circle, overlapping secondary circle (partner or waiting invitation placeholder), optional active-presence pip.
- **Variants:** `active`, `recent`, `unknown`, `waiting` (partner pending/invitation slot). The pip is rendered only for `active`; `recent` is text-only and `unknown` makes no Presence claim.
- **States:** Default, hover/press on invitation slot, disabled.
- **Accessibility:** Group container provides a composite accessible description combining user and partner names or announcing pending invitation status. Interactive invitation triggers use `role="button"` and clear accessible labels.
- **Tokens:** Overlap offset derived from size (`-28%`), border uses `--color-surface` / `eimir.Theme.colors.surface` for crisp visual separation.

### 11.2 CouplePresence

**Purpose:** Anchors the top of the relationship home view (`/today`), presenting shared space identity, partner presence, and milestone duration.

- **Anatomy:** `PartnerAvatarPair`, space name heading, optional bounded Presence text, relationship duration link, and optional contextual action slot.
- **Variants:** `active` (localized active-presence text with pip), `recent` (localized recent-presence text, text-only), `unknown` (no Presence assertion), `waiting` (localized waiting/invitation text). Membership alone never selects a Presence state.
- **Behavior:** Presence is server-authoritative and ephemeral; the client never receives an exact last-active timestamp. Clicking the relationship duration navigates to the relationship milestone details.
- **Accessibility:** Headings use appropriate levels (`titleLarge`), interactive duration triggers announce their action explicitly.
- **Tokens:** Use existing semantic typography, spacing, and identity tokens. The relationship masthead does not require a bounded elevated card; a radius, border, or elevation is used only when its selected v1 surface role needs that boundary.

### 11.3 ThinkingOfYouButton

**Purpose:** A tactile, low-friction micro-interaction to send an affectionate impulse to the partner.

- **Anatomy:** Heart glyph (`♥`), state text, tactile press scaling, and confirmation checkmark (`✓`).
- **Variants:** Standard (text and icon), compact (icon-only for condensed toolbars).
- **States:** `idle`, `sending` (pulsing animation, disabled interaction), `sent` (optimistic confirmation, transitions back to idle after 2.5s).
- **Accessibility:** Explicit button role and localized action description. Reduced-motion queries disable heartbeat and spring animations.
- **Haptics:** Web has no haptic feedback today; tactile feedback on Android is a future native-capability slice (#500, #578), not part of the retired Compose implementation.

### 11.4 VisibilityBadge

**Purpose:** Communicates the exact access and privacy domain of an item (shared space vs. private draft vs. temporary shared view).

- **Anatomy:** Purpose-built vector glyph (interlocking rings, padlock, clock) and localized label.
- **Variants:** `SPACE_SHARED` / `shared`, `OWNER_ONLY` / `private`, `TEMPORARY_SHARED` / `temporary`.
- **Sizes:** `small`, `medium`.
- **Accessibility:** Uses `role="status"` with explicit aria-labels matching privacy terminology. Icons are scalable vector drawings without dependence on platform-specific emoji fonts.
- **Tokens:** Colors map strictly to semantic token roles (`--color-shared`, `--color-private`, `--color-discovery`).

## 12. Analytics contract

Allowed events include:

```text
screen_viewed
primary_action_started
primary_action_completed
primary_action_failed
permission_explained
permission_result
sync_conflict_opened
```

Free text, search text, message content, image content, exact private dates,
direct resource IDs, and other sensitive user content are not allowed.
Technical/pseudonymized references are transmitted only for a documented
purpose and never as content characteristics.

## 13. Definition of Done

A shared component is ready when:

- its contract, variants, and states are documented,
- Design Tokens are used instead of local values,
- Web keyboard operation and focus behavior are verified,
- screen-reader name, role, and status are correct,
- large text and text zoom work,
- Compact and Expanded layouts are verified,
- Error, Disabled, Loading, and Offline states are covered,
- privacy and analytics consequences are resolved,
- visual regressions are automated or reproducibly testable.

## Related documents

- [Design Principles](./DESIGN-PRINCIPLES.md)
- [Information Architecture](./INFORMATION-ARCHITECTURE.md)
- [UX Patterns](./UX-PATTERNS.md)
- [Screen Templates](./SCREEN-TEMPLATES.md)
- [Design Tokens](../design/tokens.json)
- [API/UI Contracts](./API-UI-CONTRACTS.md)
- [Design System Delivery](./DESIGN-SYSTEM-DELIVERY.md)


## Couple-facing section heading and surface (#1508)

Section anatomy is heading/action row followed by the content surface, under Product Reference v1's 2026-10-29 PO addendum. Keep the section heading outside the surface and use consistent spacing with adjacent modules. Personal content titles inside cards are a separate semantic role and remain with their content. Preserve semantic section/heading associations, reachable contextual actions, dynamic states, theme contrast, large-text wrapping and reduced motion. Decorative quote rules and extra heading/body gaps are not part of this contract.

## Personal gentle invitations

Personal gentle suggestions reuse the contextual short-sheet action pattern in
the existing Wir context region. Confirmed dismissal/exclusion removes only the
personal occasion and restores focus to readable status; it never deletes a
Memory or creates another unread state. Opens resolve current access before
the existing task-origin route; a departed surface cannot redirect another
editor. See [the bounded delivery contract](product/gentle-prompts.md).

## Contextual Place actions

`MomentPlaceActionsMenu` supplies the same named overflow trigger, pinned-map
link, canonical Place navigation and confirmed removal for saved moment Places
and an ordered editor draft. The caller owns authorization and removal
persistence; an editor callback only changes the draft until its parent Save.
The shared ShortTaskSheet owns modality, Back, focus restoration, reduced motion
and navigation handoff. Pending removal prevents duplicate submission and exit;
failure stays inline. Offline saved relations cannot be changed. A caller's
navigation guard must protect dirty/pending work before invoking the supplied
continuation. No map/provider request runs before an explicit external link.

## Selected photo gallery and direct controls (#1586, #1674)

`PhotoDraftGallery` owns presentation and local selection only. Callers own
uploads, authorized previews, sensitivity, order and persistence. Reuse it for
Memory drafts/editing, HeartMoment media and Plan galleries. Image outline
indicates selection. Independent named 44 px controls occupy three corners:
removal X at top right, sensitivity lock at bottom left (closed sensitive/open
normal), and cover check at bottom right. One position appears at top left.
Whole-image mouse drag and touch hold/drag reorder without a separate grip;
touch movement before activation remains page scrolling. Sibling controls
never start dragging. No redundant ready status or earlier/later/cover toolbar.

Show six thumbnails initially with an explicit all-media disclosure. Pending
and failed media remain recognizable; aggregate failure review reveals even an
offscreen file. The selected pending/failed file retains inline progress,
error and retry. Removing a saved Memory photo stays reversible in the draft.
A chosen cover retains identity through sorting; removal restores first-item
fallback. Callers retain removal and sensitivity authority independently.
Both partners may classify shared Memory photos under #1674, while private
HeartMoment and authored experience-answer permissions stay unchanged. Disabled
operations cannot mutate or silently omit failed media. Preserve wrapping,
Light/Dark contrast, reduced-motion feedback, upload identity and task safety.

### Product Owner correction #1740

Expanded overview creation on Moments, Planning, Places, Lists and People uses
the trailing edge of its page heading, with trailing-aligned wrapping when
needed. Eligible Compact overviews use the floating variant in the Button
contract. The Moments map keeps its labeled heading action. Planning follows the
active segment. Reuse AddAction controls and their existing task and focus
ownership.

Gallery photo sensitivity and reactions use accessible icon-only controls over
photography. A persistent sensitivity toggle keeps its target through
reveal/conceal. Where the covered photo itself reveals, hiding returns focus to
that photo. The comment shortcut shares the media action area for photos and
videos and can focus the existing inline reply. Comment textareas start at two
lines and allow vertical resizing. The gallery position marker follows the
native scroll offset. It crossfades across wrapped rows and at the ends of the
circular gallery. With reduced motion, the selected dot updates immediately.

The diary's dedicated external-source entry offers configured photo providers.
The Photo tool in the composer bar and the gallery Add action offer the device
and those same providers. Use one picker lifecycle and preserve native file
admission, consent, cancellation and focus return.

Use a thin rounded focus ring for shared title and text fields while preserving
the existing focus color and forced-colors affordance. Composer thumbnail
sorting supports pointer, held touch and keyboard interaction through the
existing sortable controls. Keep attachment and selected-cover identities stable.
Reading galleries use a taller, viewport-bounded frame and fit the complete
authorized photograph. Thumbnail and editor cover treatments follow their own
contracts.
