# eimir. Screen Templates

**Status:** Binding product foundation  
**Version:** 1.4<br/>
**As of:** September 15, 2026

Screen Templates translate Information Architecture, UX Patterns, and Components into repeatable page structures. They are not finished screens, but binding layout and behavior frameworks.

Screen Templates are a starting hypothesis, not a mandate that overrides the product model. `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 0 defines Compact/smartphone as the normative reference and is authoritative whenever a Compact description below is thin or an Expanded description could be read as license to add tables, columns, boxes, widgets, or metadata merely because room exists. Where a template's wording conflicts with that standard, the standard governs.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 1. Window classes

| Class | Width | Navigation | Content |
|---|---:|---|---|
| Compact | 0–599 px | Bottom Navigation | one primary pane |
| Medium | 600–839 px | Bottom Navigation | one primary pane; optional supporting context |
| Expanded | from 840 px | Web: horizontal header · App: Bottom Navigation | primary content with optional supporting context |

The Android app renders the same Web shell (Capacitor wrapper); the retired Compose client's at-every-size Bottom Navigation is recorded in the historical
`decisions/0004-android-uses-bottom-navigation-at-every-size.md`. The class
selects the content composition.

- Switching is based on available window width, not device category.
- Content is preserved across resize; selection and input are not lost.
- Primary content is at most 1200 px wide; reading text is at most 720 px wide.
- Compact gutters follow v1 D7: approximately 16 px below ~390 px and 20 px at/above ~390 px unless a deliberate edge-to-edge composition applies; native clients use equivalent logical units. Medium/Expanded spacing follows the same hierarchy, typically 24–64 px. Values must be delivered through semantic tokens in F1.

## 2. Shared screen anatomy

A regular screen establishes these elements as appropriate to the human task:

1. App Shell and navigation context.
2. Understandable page/relationship context.
3. One primary content composition or meaningful human outcome.
4. One dominant action, placed appropriately for the window class.
5. Optional Tabs, filters, or local navigation.
6. Secondary/supporting content.
7. Persistent status surface for Offline, Sync, or errors where required.

This is a hierarchy, not a mandatory visual stack. Content-led and media-led
surfaces MAY place the primary content before secondary title/metadata treatment
when that better communicates the human meaning. Privacy, permission, and
critical system state remain visible where they affect the action.

On Compact, a Floating Action Button-like action is used only when it is unambiguous, frequent, and cannot be confused with Bottom Navigation.

## 3. Template: Today

**Purpose:** Emotional entry point to the relationship now. [R4](./product/design/reference-screens.md) owns the current composition; these template mechanics remain subordinate to it.

### Compact

- Personal/relationship focal point with meaningful imagery or text.
- What matters now, what is next, and what is worth rediscovering receive distinct priority and shapes.
- Irrelevant sections disappear; no fixed module count or repeated widget stack.
- Contextual primary action, for example the intentional de-DE label **„Moment festhalten“**.

### Expanded

- The same orchestration surface as Compact, enriched with more space — not a two-column widget dashboard and not an equal-card dashboard wall (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 3).
- Primary column: day flow and next tasks, matching the Compact hierarchy.
- Secondary column, only when it adds real value: Quick Actions, Sync/Privacy notices, or a compact summary.
- No freely configurable widget wall, and no permanent secondary column added merely because Expanded width is available.

**Required states:** first launch, everything completed, offline with local data, partial loading failure.

## 4. Template: Story Timeline

**Purpose:** Browse and rediscover shared history. [R2](./product/design/reference-screens.md) owns current content composition, scope, and return behavior.

### Compact

- Current scope and active filters remain visible; a Sheet discloses filter controls. Text-only, photo, and mixed memories use natural composition instead of one generic card shape.
- Timeline as a chronological feed. A vertically scrolling arrangement is valid here because reliving Memories in chronological order is genuinely the task, not because a list is the default rendering for multiple objects (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 16).
- Detail opens as a new page.
- Intentional de-DE primary action **„Erinnerung hinzufügen“**.

### Expanded

- Preserve Compact content dominance and chronological rhythm with richer media where useful.
- Optional filter or preview context must earn its width; a permanent three-pane layout is not required.
- Every detail retains a direct URL; Back restores scope/filter/scroll context.

**Required states:** no Memories, empty filtered result, media loading, private content, upload failure.

## 5. Template: Plan Hub

**Purpose:** Anticipation of shared experiences. [R3](./product/design/reference-screens.md) governs current hierarchy; Wishes and Plans keep their domain homes, and Shopping remains a later domain.

### Compact

- The next meaningful shared experience leads with its human value.
- Secondary plans and wishes are compact support; their destinations stay discoverable without becoming equal dashboard tiles.
- Operational controls and rich planning details open contextually.
- No nested card landscape; a Shopping entry appears only when that domain is implemented and enabled.

### Expanded

- Local navigation or segmentation for Wishes and Plans; Shopping later.
- Task-appropriate composition for the selected area: List-Detail only when browsing many comparable entries is genuinely the task; otherwise the same focused entry points as Compact, enriched with more context.
- Supporting pane only when it provides real additional value.

**Primary action:** changes with the active area, for example the intentional de-DE label **„Wunsch hinzufügen“**.

**Required states:** empty area, shared and private entries, Sync conflict, completed entries.

## 6. Template: Shopping List (later domain)

**Purpose:** Fast shared checking-off, including under poor connectivity.

### Compact

- Direct input at the top.
- Grouped Checklist with large touch targets.
- Offline state remains visible; writes are not allowed in the MVP without connectivity.
- Additional information opens a Sheet or page.

### Expanded

- Main pane: list and input.
- Optional secondary pane: selected Recipe, note, or history.
- Keyboard shortcuts for adding and focus movement.

**Required states:** Offline read cache, offline write attempt with **„Noch nicht gespeichert“**, online conflict, everything completed, undo deleted entry.

## 7. Template: Discovery inside Momente

**Availability:** Discovery is product behavior inside `Momente`; it is not a
persistent primary-navigation destination. See `docs/INFORMATION-ARCHITECTURE.md`
and `decisions/0009-games-primary-navigation-and-premium-capability.md`.

**Purpose:** Offer inspiration and rediscovery of relationship content without
creating a parallel data world or overshadowing the private core experience.

### Compact

- Discovery content follows the current Momente context and uses a feed, focused
  editorial composition, search, topic chips, or another task-appropriate mobile
  pattern.
- Filters use a Sheet when needed.
- Selecting content opens its canonical detail context or an intentional
  discovery action; discovery does not create duplicate content records.

### Expanded

- Use additional width for richer context, media, or optional preview where it
  genuinely helps discovery.
- Do not turn discovery into a generic responsive card grid merely because more
  space is available.
- Canonical content retains its own direct URL and domain home.

**Required states:** personalized and neutral recommendations, no results, recommendation failure, blocked external source, privacy-safe unavailable content.

## 8. Template: Settings and Privacy

**Purpose:** Manage relationship, Account, data, permissions, and notifications understandably. [R5](./product/design/reference-screens.md) preserves predictable Profile/Settings discovery and calm utility grouping without forced emotional decoration.

### Compact

- Categorized list; every category opens its own page.
- Critical actions appear at the end of the relevant area rather than in an isolated danger zone without context.

### Expanded

- Left pane: categories.
- Right pane: selected settings.
- Changes either apply immediately with feedback or are confirmed through one clearly visible Save action — never both patterns mixed within one form.

**Required states:** permission denied/blocked, export being generated, account action pending, relationship not connected.

## 9. Template: Create/Edit

**Purpose:** Create or modify content safely, transparently, and with the least
interaction burden consistent with the domain. [R1](./product/design/reference-screens.md) governs Memory capture: capture → optionally enrich → done. Reading, creating, and editing remain distinct states.

### Compact

- Start from the human capture intent, not from a generic database field order.
  A media-led Memory may start with a photo, a HeartMoment with a thought, and a
  Plan with the shared intention or next step.
- Dedicated page for long, branching, or media-heavy flows; short contextual
  input may use an established Sheet/Dialog pattern where appropriate.
- Request only information required for the current step. Optional metadata is
  progressively disclosed rather than placed in the initial path by default.
- Prefer native/system pickers, direct selection, media, and sensible defaults to
  avoid unnecessary typing.
- Do not summon the software keyboard before the user chooses a text-entry task.
- Sticky completion action only when it does not obscure content and remains visible with the keyboard.
- Visibility appears near the decision/completion point or earlier when it changes
  what the user is about to capture; it remains unambiguous throughout.

### Expanded

- Preserve the same human task and hierarchy as Compact rather than exposing
  extra fields merely because width is available.
- Form width at most 720 px when a form is genuinely the correct pattern.
- Optional preview or contextual information in a secondary pane.
- Sidebar is not a dumping ground for required fields.

**Sequence rule:** the owning domain defines a task-appropriate capture sequence.
Do **not** default to `title → metadata → media → save` merely because those are
persistence fields. Required privacy/security decisions remain explicit, and
completion happens only when the resulting state is understandable.

**Required states:** validation error, upload running/missing, unsaved changes, offline write attempt with **„Noch nicht gespeichert“**, save failure.

## 10. Template: Authentication and Invitation

**Purpose:** Secure, understandable entry and connection with a partner.

### All sizes

- One focused flow without regular primary navigation.
- Value and Privacy context before sensitive input.
- Progress indicator only when the flow is genuinely multi-step.
- Invitation can be deferred or resent.
- Individual use remains possible where the product concept allows it.

### Expanded

- Form remains in a narrow reading column.
- Optional illustration may support atmosphere but carries no required information.

**Required states:** link expired, Account exists, wrong person, Invitation pending, connection successful.

## 11. Template: Detail View

**Purpose:** Read, experience, edit, share, or manage one object.

### Compact

- Human content and primary meaning lead the composition. For a media-led Memory
  this may be the photo; for a text-led HeartMoment it may be the message; for a
  Plan it may be the shared activity and next relevant step.
- Title, visibility, date, status, and other metadata are positioned according to
  task and risk. Privacy/visibility MUST remain discoverable and unambiguous but
  does not automatically need to visually precede the content.
- The main content surface is the natural primary interaction target where safe
  and expected; avoid redundant `Open`/`Details` controls.
- Secondary actions live in Overflow; Edit remains visible only when it is a
  frequent, context-appropriate action.
- Back returns to the prior product context with selection/filter/scroll state preserved.

### Expanded

- May appear as second or third pane when that composition genuinely supports
  the task.
- Direct URL and Browser Back remain correct.
- Very extensive or immersive content switches to a full page.
- Additional width may add context or richer media, not a wall of metadata or
  permanent controls.

**Required states:** not found, no permission, stale, conflict, deleted.

## 12. Template: System states

### Empty

- Title names the state.
- One sentence explains value or cause.
- One primary action leads to the next meaningful step.
- Illustration is optional and purely supportive.

### Error

- Existing content remains visible where possible.
- Error message explains impact and next step.
- Retry appears only when technically meaningful.
- Support/diagnostic code is copyable but visually secondary.

### Offline

- Global status appears compactly in the Shell.
- Affected write actions explain that they were not saved. A safe form draft may be retained but is not a domain object.
- Reconnecting refreshes the read cache; another write attempt in the MVP happens deliberately and not through a local Outbox.

### No Permission

- Explains the missing permission and alternative.
- If a system permission is permanently blocked, links to the appropriate system settings.
- No repeated automatic reopening of the system permission prompt.

## 13. Responsive behavior

- A template describes the task-appropriate default, not a mandatory visual formula; the actual pattern follows the user's task (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 16).
- Order follows meaning, not desktop position or storage-field order.
- Two panes become two navigable pages on Compact.
- Supporting content follows the main content on Compact or opens contextually.
- Tables become Lists/Details when horizontal scrolling would obstruct the core task.
- Actions keep the same semantic naming at all sizes.
- Layout changes do not move focus unexpectedly.
- Draft, selection, and scroll context remain across orientation or window changes.

## 14. Acceptance checklist per screen

- Page/navigation/relationship context is unambiguous.
- At most one visually dominant action exists.
- The human content or outcome is more prominent than the persistence/data model.
- Compact, Medium, and Expanded behavior are defined.
- An established platform/mobile interaction pattern is used or the deviation is documented.
- Unnecessary typing and keyboard activation are avoided on Compact.
- Browser Back, App Back, and Deep Link behavior work.
- Loading, Empty, Error, Offline, and Success are designed.
- Privacy, Permission, and Sync states are visible.
- Keyboard, focus, screen reader, and 200% text zoom are verified.
- Touch targets and contrast meet the shared requirements.
- Analytics capture only necessary non-sensitive events.

## Related documents

- [Design Principles](./DESIGN-PRINCIPLES.md)
- [Information Architecture](./INFORMATION-ARCHITECTURE.md)
- [UX Patterns](./UX-PATTERNS.md)
- [Component Contracts](./COMPONENT-CONTRACTS.md)
- [Design Tokens](../design/tokens.json)
- [Critical User Flows](./USER-FLOWS.md)
- [Accessibility and QA Matrix](./ACCESSIBILITY-QA-MATRIX.md)
