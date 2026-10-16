# eimir. Reference Experiences

**Status:** Authoritative composition and interaction references for [Product Reference v1](product-reference-v1.md)<br/>
**Approved:** September 15, 2026, by [Product Owner decision #955](https://github.com/baerenmarke90/eimir/issues/955)

These five experiences define the intended hierarchy, composition, interaction model, content priority, surface usage, rhythm and mobile behavior. They are **not pixel locks** or claims that the target is already implemented. Implementation may become richer while preserving content dominance, predictable mobile interaction, accessibility and the Design DNA. Calm compositions must not become empty or sterile implementations.

Product Reference v1 takes precedence over conflicting older screenshots, Product References, issue wording and existing implementation details unless a later explicit Product Owner decision supersedes it. Security, privacy, accessibility and domain/business contracts remain binding. In particular, older near-1:1 requirements for Planning and Timeline are superseded where they conflict; useful existing behavior remains.

The German names and phrases below are intentional de-DE product labels/examples, not a new domain rename or hardcoded product copy. Production text uses localization. Shared visual/input rules are in [Design System Direction](design-system-direction.md); delivery order is in the [implementation roadmap](implementation-roadmap.md).

## Shared acceptance and mobile contract

The following contract applies to every reference, together with its specific contract below. Before UI implementation, the owning issue must apply it to its bounded slice and record the [Mobile Interaction Contract](../../PARTNER-APP-EXPERIENCE-STANDARD.md#10-mandatory-mobile-interaction-contract); this reference does not replace that preflight.

| Concern | Binding result |
| --- | --- |
| Compact is normative | Design one human task and one dominant action first. At 360/390/430 px preserve the same hierarchy and body size, with wrapping labels and content-driven heights |
| D7 gutters | Approximately 16 px below approximately 390 px; 20 px at/above approximately 390 px through Compact, except a deliberate edge-to-edge composition |
| Navigation | Stable labeled destinations: Wir, Momente, Planen, Mehr. The central plus is an action, not a fifth destination. Games remains under Mehr; Story/Chapter details belong to Momente even where a legacy URL uses another path |
| Thumb reach / keyboard | Important actions remain reachable with one hand; Web targets at least 44 × 44 CSS px, Android at least 48 × 48 dp. Reserve measured navigation height and safe-area clearance. A completion footer never obscures focused input or content |
| Task boundary | Browsing/reading, capture/edit and confirmation are distinct. Focused capture replaces competing root chrome. Visible Back/Close and platform Back agree on task ownership |
| Reading before editing | Personal content opens its canonical read detail; editing and destructive operations are deliberate contextual actions. Full-surface navigation has proper semantics and no nested interactive targets |
| Return | Restore originating mode, applied scope, loaded range and content/scroll position. Deep links without trustworthy same-app origin fall back to the canonical home. Never persist sensitive drafts/search text in public URLs |
| Draft / save | Protect in-session dirty and pending work across picker cancellation, resize and controlled exits. Confirmed persistence precedes success/dismissal. Prevent duplicate activation; stale responses must not clear newer input. Durable offline drafts are not implied |
| Loading / error / offline | Distinguish them from empty. Keep safe loaded content during refresh/failure; retry the affected region. Expose only supported authorized cache; offline writes remain explicitly unsaved |
| Privacy / relationship | Show true audience and connection state at the point of consequence. Memory/Wish/Plan retain fixed shared semantics; no invented private toggle. Owner-only content never decorates shared surfaces |
| Accessibility / localization | Logical heading and focus order, named controls, native semantics, visible focus, readable contrast, 200% text, long localized labels and 320 px reflow. No essential gesture-only action; no color/motion-only state |
| Motion | Restrained causal feedback using existing motion roles. Reduced motion preserves all state, focus and recovery information without movement. No transition blocks the next action |
| Expanded | Preserve the Compact task; add meaningful context or larger media without obligatory management panes, permanent controls or equal-card grids. Keep drafts/selection during resize |
| Evidence | On the exact build, verify Light/Dark, 360/390/430 px, 320 px reflow, large text, sparse/dense and photo/text/mixed content, plus relevant keyboard/Back/pending/error/offline/success states. Device evidence (IME, system Back, TalkBack) is required only where the Capacitor wrapper or a native platform capability is affected; ordinary Web changes reach Android through packaging |

For every reference, QA must exercise **open → interact → save/complete → observe result → return**. On a read-only path, complete the content/navigation task and verify return; where editing exists, test its actual save result. Evidence must show behavior as well as appearance. These are acceptance requirements, not user-study findings or existing implementation acceptance.

## R1 — Neuer Moment

### Human outcome and hierarchy

**Capture → optionally enrich → done.** A person can keep a photo, a sentence or both while the moment is still present. The main narrative is immediately visible. Capture must not begin as a database record form.

**Owning templates:** Create/Edit, Detail View and System states in [Screen Templates](../../SCREEN-TEMPLATES.md). **Dominant action:** save the memory from one safe completion area. Photo selection and typing are equally discoverable entry paths; neither requires an extra mode-choice screen.

| Order | Compact composition | Behavior |
| --- | --- | --- |
| 1 | Compact task header with Close and localized memory-create title | Root navigation and plus temporarily recede; retain parent context |
| 2 | Photo action, replaced in prominence by actual selected media | Use system picker; show real count, per-file progress, removal and retry |
| 3 | Visible labeled narrative field, initially short and able to grow | Actual content dominates; placeholder supplements the persistent label |
| 4 | Optional title entry | Title-only capture remains possible; title is not newly required |
| 5 | Visible local date summary and a discoverable change action | Current supported local date default; no silent EXIF or timezone substitution |
| 6 | Explicit fixed shared audience | Text and icon; do not invent a private Memory choice |
| 7 | Other supported optional details | Disclosure may hide enrichment, never the narrative, audience or consequences |
| 8 | One filled save action with pending/result status | Safe-area and keyboard-aware; normal flow if a sticky footer cannot fit |

The page itself is the composer; do not wrap a form card around an upload card. A selected photo is the focal image. Text-only entry grows into reading space without a photo-shaped gap. Mixed content remains one memory with bounded previews and access to every selected file.

### Mobile interaction contract and lifecycle

- Enter from the stable plus menu or a local capture action. Do not autofocus a field on neutral photo-or-text entry. Tapping the narrative starts typing; tapping photos opens the native picker.
- Picker cancellation, optional-detail disclosure and resizing preserve the same draft. Avoid additional metadata typing unless needed by the supported task.
- Save uses the existing title-only, image-only, text-only or mixed domain contract. Snapshot intended content/media; prevent duplicate submission and preserve errors with the affected input/file.
- Validation, upload and server failure keep the editor and its work. A late response for an earlier submission must not overwrite newer input.
- Announce success only after confirmation. Open the actual canonical memory detail with a concise accessible saved status and valid return origin. The result must remain findable in its proper home; an unrelated Discover landing is not a save result.
- Back, Close and in-app navigation share dirty/pending rules. A dirty exit offers continued editing or deliberate discard. Use supported platform unload protection; do not promise browser-restart persistence or an offline outbox.
- An uncertain network outcome requires reconciliation before blind create retry. Offer saving without a failed photo only when the attachment contract can actually exclude it.
- At 360 px, date/audience can occupy separate lines. At 390/430 px the same anatomy gains image width, not extra fields. Large text and the IME must not hide save or the focused field.
- Expanded may show a helpful preview alongside the same focused task, with bounded reading/input width. It must not expose all optional fields just because they fit.

### States, appearance and accessibility

| State | Required result |
| --- | --- |
| Initial empty | Photo action, visible narrative and optional title entry; no giant generic empty-state illustration |
| Photo-only / text-only / mixed | Chosen content determines the composition; no invented required metadata |
| Loading / saving | Stable preview/control sizes; labeled pending and per-file progress; completion cannot duplicate the request |
| Error / offline | Clear unsaved state, precise correction/retry and retained content; no implied queued write |
| Success | Actual saved object is visible, announced and reachable again; Back restores origin |
| Interrupted / conflict | Preserve work and explain the choice; never silently replace a newer draft |

Light uses a neutral writing ground and restrained controls. Dark uses neutral aubergine, unchanged photo exposure and a contrast-safe strong primary action. Persistent labels, associated per-file errors, keyboard-reachable completion, concise live status and correct dialog focus are required. Discard confirmation contains focus and restores it appropriately. Adding media may reveal a stable preview; reduced motion retains the same upload/result feedback.

**Implementation implications:** reuse the attachment picker/draft hook, existing date/API helpers, error/snackbar/gallery primitives and canonical memory detail. Existing planning editor/history helpers are candidates to evaluate, not proof that full-route capture is safe. Add only a small shared task/completion contract where needed. Native uses its current editor/ViewModel and system picker; prevent reset-before-result and handle IME insets.

**Acceptance journey:** capture each supported content shape; cancel the picker; delay/fail a save or file; attempt dirty Close/Back; retry safely; open the confirmed result; return to the original filtered/scroll context. One successful save creates one intended object and failures retain work.

## R2 — Momente / Timeline

### Human outcome and hierarchy

**Browse and rediscover shared history.** A person recognizes memories by photos and words and can find an older event without reconstructing a lost browsing trail.

**Owning templates:** Story Timeline, Discovery inside Momente and Detail View. **Dominant content action:** open the chosen memory/event. A chronological vertical feed is appropriate because experiencing ordered history is the task; a uniform card feed is not required by that choice.

| Order | Timeline composition | Behavior |
| --- | --- | --- |
| 1 | One Momente context header | No duplicate page introduction before content |
| 2 | Discover / Timeline peer modes | Proper tabs and visible selected mode |
| 3 | Current scope and Filter action | Applied year/type/order remain recognizable outside the sheet |
| 4 | Actual month heading | Month groups derive from chronology; no surrounding card |
| 5 | Content in its natural shape | Photo with caption; short thought with editorial emphasis; long prose as body excerpt; compact milestone event |
| 6 | Further real month groups and pagination | Preserve loaded range and order; never invent empty month placeholders |
| 7 | Stable root navigation | Momente remains selected in its content/details |

Discover retains the existing varied, month-banded grid/tapestry and available-year structure: one featured item, early year/chapter entrances, a bounded month selection and an explicit Timeline continuation. Exclude the feature from the same curated sequence. A partial loaded page must not be labeled an all-history retrospective.

### Mobile interaction contract and continuity

- Filter opens a short contextual sheet with draft year/type/order selections and explicit Apply. Cancel discards only those filter edits. Applied chips/summary and reset remain visible when relevant.
- Discover uses its independent unfiltered context. Returning to Timeline restores Timeline's separate applied scope; do not silently carry a hidden filter into Discover or clear Timeline history.
- A content item has one canonical detail destination. Detail reads before editing: actual media/prose, title/context, then conversation and contextual editing/deletion.
- Back restores mode, filters, loaded pages/range and item position; preserve a search-result origin as well. Creation uses R1's save/result contract and must return to a recognizable home even if the new item falls outside the previous filter.
- At 360 px, scope wraps and Filter retains its target; any decorative spine consumes minimal indentation. At 390/430 px keep one chronological column and let images grow. Do not shrink body text or add a second feed column.
- Short thoughts may have editorial emphasis; longer thoughts use readable excerpts and full detail. Additional images have an honest count and gallery access. Mixed media is one timeline item.
- Expanded may add a useful scope or detail preview while keeping readable content and correct focus/history. It does not mandate the old three-pane administration frame.

### States, appearance and accessibility

| State | Required result |
| --- | --- |
| First-use empty | One warm explanation and capture action; no fabricated photo |
| Sparse / older history | Actual entries and available-year access; omit empty months and guilt messages |
| Dense | Real date groups, efficient paging, shorter honest previews where useful and restored loaded range |
| Filter no-match | Visible applied scope and reset; do not masquerade as first use or demand new content |
| Loading | Stable media proportions and local loading region; retain known scope and already loaded items |
| Read/paging/image error | Affected-region retry, preserving content and history; never an empty-year claim |
| Offline / unavailable | Only authorized cached data with truthful availability; private/foreign content and counts never leak |
| Save success / return | Canonical result, then restored origin; no jump to an unrelated landing or lost filter |

Light and Dark both retain clear dates, scope and readable prose. Dark photos keep their original exposure; subtle reading surfaces and spine remain visible. Use semantic month headings and ordered content; the spine is decorative. Tabs expose selected state/panels and expected keyboard navigation. Sheet focus enters intentionally, stays contained and returns to Filter. Whole-item links must not contain competing nested buttons. Short filter/gallery transitions may explain change; reduced motion must still preserve scroll restoration and scope announcements.

**Implementation implications:** reuse Story components, existing preview/tapestry/month helpers, gallery, authors/visibility, route builders and read cache. Rework wrappers, filter disclosure, tab semantics and return ownership; no new album backend. Apply equivalent content variants and canonical destinations in native Story.

**Acceptance journey:** choose a year/type in Timeline, load/open an older text/photo item and return to the same scope/position; switch to unfiltered Discover and back to restored Timeline; create, observe and find a result; test no-match, paging error, long text and private exclusion.

## R3 — Planen

### Human outcome and hierarchy

**“Darauf freuen wir uns.”** Planning makes a shared intention tangible, with useful operational depth available when needed. It must not present the relationship as a project to manage.

**Owning templates:** Plan Hub, Detail View and Create/Edit. **Dominant content action:** open the upcoming intention; a labeled local create entry remains reachable before a long list. In an editor or completion state, its one completion action takes precedence.

| Order | Compact composition | Behavior |
| --- | --- | --- |
| 1 | Planen and Plans / Wishes peer modes | Keep two actual areas and supported capabilities |
| 2 | Clear local add action | Enter a focused composer, never hash-scroll to fields after a long list |
| 3 | Nearest dated shared intention | One focal date/title/schedule composition; no invented stock cover/photo field |
| 4 | Later dated plans | Compact naturally separated agenda rows, with readable ranges |
| 5 | Undated intentions | A plan can start without a date and remains a plan |
| 6 | Past/completed access | Supported scope/disclosure; operational state controls do not dominate the overview |

Wishes use readable independent desire units, with supported media/link/context only where available. They do not receive a deadline by default or become copied photo-memory cards. Compact agenda rows are appropriate for seeing what is next; permanent status forms, urgency badges and Kanban columns are not.

### Mobile interaction contract and retained #952 behavior

- Open a plan to read its intention, actual schedule, description and supported relationships. Edit/schedule/cancel/completion are explicit contextual actions; do not make browsing an editing session.
- Preserve the delivered [#952 schedule improvements](https://github.com/baerenmarke90/eimir/pull/952): localized human-readable ranges, optional date, time dependent on date, end time dependent on start, and progressive cross-day details. Reuse the existing schedule fields/presentation and clearing semantics. Do not reopen #951 as an unresolved defect.
- Creating an undated plan is valid. Give intention priority and disclose scheduling/enrichment as appropriate; existing domain validation remains.
- Completing an eligible plan confirms its actual completed state. Offer optional memory capture or a quiet later/skip path. Capture uses the canonical R1 task and its draft/result contract.
- A failed memory capture cannot silently undo confirmed plan completion. Each operation reports its own outcome. Preserve supported milestone alternatives as secondary; do not maintain a duplicate generic memory form.
- Wish-to-plan conversion and direct Wish completion remain distinct choices with clear results.
- Back from a Wish restores Wishes, and Back from a Plan restores Plans plus its browsing context. Creation/edit cancellation protects dirty work; a success returns through the actual result to that context.
- At 360 px, dates and ranges wrap above/below titles; no compressed three-column row. At 390/430 px retain one focal intention and compact successors. Expanded may add useful read context while keeping management controls contextual.

### States, appearance and accessibility

| State | Required result |
| --- | --- |
| Empty plans | Warm invitation to name an intention, explicitly allowing the date later, and one add action |
| Empty wishes | Wish-specific invitation/action; Plans remains available |
| Sparse | One actual intention is a complete composition; no fake calendar or filler plan |
| Dense | Real date groups and undated section; completed history recedes but stays findable |
| Loading / refresh error | Retain segment and loaded plans; indicate and retry the affected region |
| Pending / save error / offline | Truthful operation state, preserved draft and explicit unsaved write; no false completion |
| Completion success | Confirmed plan state with optional capture; skipped or failed capture leaves that state truthful |

Use a restrained focal tint and neutral agenda surfaces in Light/Dark. Dates, ranges and practical numbers remain high contrast; no luminous status-pill landscape. Tabs have complete semantics, actions reflect actual capability, and errors sit beside date inputs. Schedule meaning must be accessible as text. Destructive confirmation retains consequences and focus. Completion may have one brief acknowledgment; reduced motion keeps the confirmed result and optional continuation.

**Implementation implications:** reuse current planning overview/detail/Wish components, schedule fields/presentation, mutation/lifecycle helpers and plan-story continuation semantics. Change rhythm, focused entry, read/edit separation and segment restoration. Native preserves the same schedule and outcome ownership; do not assume Web behavior already propagated.

**Acceptance journey:** add an undated plan, save and read it, later set a date/range and return; verify date-only, same-day and cross-day summaries; open Wishes and return to Wishes; complete without capture and complete with failed capture; confirm original data/capability semantics remain.

## R4 — Wir / Today

### Human outcome and hierarchy

**The emotional entry point to the relationship right now.** People understand what matters now, what is next and what is worth rediscovering through their own content.

**Owning template:** Today, governed by the [orchestration invariant](../../PARTNER-APP-EXPERIENCE-STANDARD.md#3-today--wir-orchestration-invariant). **Dominant content action:** open the focal memory/current meaningful item. Global capture and relationship impulses remain contextual rather than repeated toolbars. The order below is the default when no personal module order is saved; the accepted #1189 composition places the focal item before the practical upcoming horizon.

| Order | Compact composition | Behavior |
| --- | --- | --- |
| 1 | Quiet shared root header | Search and notifications remain recognizable utilities |
| 2 | Personal relationship context | Actual avatar pair/names and optional duration; no ceremonial frame or decorative technical state |
| 3 | Contextual relationship impulse | Existing intentional action with honest pending/result feedback; never auto-send |
| 4 | One real keepsake | Large photo with caption or actual readable thought; this is the visual focal point |
| 5 | Compact upcoming item(s) | Preserve the person's supported 1–3 item preference and real near-future selection |
| 6 | Eligible current/recent context | Pinned shared list, bounded useful signal, month strip or activity trace only when present/relevant |
| 7 | Grouped story summary | Quiet closing reflection with truthful counts and correct destinations |

Preserve the accepted Today orchestration and selection/preferences. A feature does not earn a permanent slot because it exists. Irrelevant modules disappear. Current, next and rediscovery have different shapes and weights; no equal widgets, dashboard builder or placeholder grid. The existing Account-and-Space-scoped Settings preference may reorder or hide supported modules without changing the partner's view; hidden modules keep their place and new modules receive a stable default place. This does not turn the Today reading surface into a widget editor. Optional Vibe/Energy and Daily Quote follow their own configuration and entitlement contracts; they do not change the default order of the supported modules.

### Mobile interaction contract and continuity

- Use one vertical flow. The focal keepsake precedes the practical near-future context by default; a saved personal order may place supported modules differently. A populated default 390 × 844 reference should make personal context and meaningful focal content recognizable without a large introductory block, with the first upcoming item close behind. This is not a fixed-height demand when optional content, text scale or device chrome differ.
- Label a true anniversary memory as such only when the selection actually matches. Latest/sample content uses an honest label. Keep de-duplication, server selection and per-person visibility behavior.
- Opening a memory, plan or activity leads to its real canonical destination. Back restores Today position. All-items actions enter the appropriate area with understandable context.
- Contextual capture uses R1; relationship impulses show pending and confirmed outcome without premature success. Interruption protections apply to any editor reached from Today; the read surface itself has no invented draft.
- A game invitation requires an existing meaningful API/capability destination and does not become a permanent engagement tile. Games remains discoverable under More.
- Module configuration lives in settings. Keep supported summary eligibility: at least two nonzero categories and at least five combined items. Counts reflect their actual scope and link to it.
- At 360 px, names and upcoming details can wrap; the impulse can take its own line. At 430 px images gain width, not larger ceremonial headings or extra widgets. Expanded offers larger media and useful supporting context while preserving orchestration and sequence.

### States, appearance and accessibility

| State | Required result |
| --- | --- |
| First use | Personal context, one truthful invitation to keep a photo/sentence, and existing connection path if relevant |
| Sparse / hidden module | Collapse absent/disabled regions; one real item or meaningful next step forms a finished composition |
| Dense | Still one focal item, bounded current/next/recent content and direct all-items destinations |
| Photo / text focus | Real image dominates when available; short thought may be editorial, long prose uses body type; no camera placeholder |
| Partial loading / error | Keep loaded content; stable skeleton and retry only in the affected region |
| Offline | Supported authorized cache with truthful availability; neither an empty relationship claim nor silent write queue |
| Success / return | Actual result for an intentional action; restore Today position after detail/edit/capture |

Light/Dark use neutral photo captions, restrained surface contrast and unchanged photographs; avoid a pink illuminated masthead. Names and avatar descriptions must not be redundantly announced. Preserve an accessible page heading when relationship presentation is hidden. Memory links identify the content; summary links identify count and category. Refresh does not repeatedly announce the greeting. Contextual feedback may briefly acknowledge a meaningful action; reduced motion leaves the same visible result.

**Implementation implications:** reuse existing Today orchestration, identity/impulse/agenda, memory preview and story summary components. Reduce framing and duplicate explanations; improve sparse rhythm and content dominance. Keep #850's valid orchestration and #809's meaningful grouping. Native callbacks and parent destinations must be correct before visual parity is accepted.

**Acceptance journey:** identify the next plan, open the focal memory and return without losing place; exercise a real contextual action and its confirmed result; verify 1–3 upcoming preference, hidden modules, sparse/text/photo states, summary eligibility and privacy-safe content selection.

## R5 — Mehr / Profil / Einstellungen

### Human outcome and hierarchy

**Clear, calm and unmistakably eimir.** A person can find practical destinations, recognize their profile and understand what belongs to them versus both partners. Utility screens express identity through typography, rhythm, surfaces and behavior; they do not need forced romantic decoration.

**Owning templates:** Settings and Privacy, Detail View and short Create/Edit. **Dominant action:** open the intended named destination; inside a settings task, complete its one explicit action or observe its immediate result. A grouped utility list is appropriate because predictable navigation is the task.

| Surface | Compact hierarchy and behavior |
| --- | --- |
| More | Compact person/profile entry → clearly private area → grouped shared destinations → named Settings, Notifications and Activity destinations → appropriately placed product-account entry |
| Profile | Actual identity/relationship context → authored personal preferences → partner identity/shared preferences → separate explicitly private partner-note entry |
| Profile editing | One deliberate Edit entry reveals supported name/photo operations; personal content is not a permanent field stack |
| Preference | Read category/value first; contextual short edit only for the authorized owner; no forbidden partner-edit controls |
| Private partner notes | Explicit owner-only context before sensitive content, readable preview and dedicated writing task; never mixed into the shared profile |
| Settings index | Predictable categories leading to focused pages, including existing relationship, notifications, Today visibility, appearance, transfer and account functions |
| Settings category | Back to index, precise title, existing controls and visible state; one local Save for staged submission or clear immediate feedback for immediate controls |
| Data/account action | Explicit scope, validation, authentication and consequences; offboarding, sign-out and account deletion remain distinct |

The avatar remains a shortcut. Named Profile and Settings links under More remove dependence on discovering an avatar menu (D6). Personal preferences precede commercial information. A compact eimir. Pro entry must reflect actual availability without invented price, entitlement or account-management capability. Games keeps its current Premium boundary.

### Mobile interaction contract and continuity

- Category navigation replaces the long settings document with anchor jumps. Back follows category → settings index → More; preserve explicit compatibility for old entry links.
- Open a profile/preference to read. Short explicit preference edits can use a proper sheet; longer private writing uses a focused page. Protect dirty/pending content when closing or navigating.
- Successful staged edits show the actual updated content/value and return to the intended context. Immediate switches expose checked/pending/error state and announce the real outcome; do not mix immediate and staged semantics ambiguously.
- Existing import/export validation, recent authentication, authorization, offboarding/deletion safeguards and data scopes survive navigation changes. Technical precision is appropriate where it informs a consequential decision.
- Categories show implemented controls only. A notification category does not invent a general channel center; retain actual anniversary reminder settings and inbox access.
- At 360 px, long person/category names wrap and rows grow. At 390/430 px keep a grouped list, not a grid or larger ceremonial identity hero. No avoidable typing or early keyboard for navigation.
- Expanded may show categories beside the selected task while retaining the same task/save/Back model and bounded reading width. More width does not justify showing all category forms together.

### States, appearance and accessibility

| State | Required result |
| --- | --- |
| Sparse profile | A short invitation and supported preference-add action; no invented partner values |
| Dense preferences | Meaningful categories and readable authored values; long content opens its reading context |
| No partner | Truthful personal context and existing connection/invitation path; no fake second avatar |
| Private empty | Explicit owner-only context and a clear note action; no shared-looking placeholder content |
| Loading / read error | Retain safe identity/navigation; retry failed values; unknown capability does not expose edit actions |
| Pending / write error / offline | Preserve draft and task context; reflect actual value and unsaved status; private cache follows authorization/lifecycle rules |
| Success | Visible actual updated value/result with appropriate concise feedback and intentional Back |
| Sensitive confirmation | Plain-language object/scope/consequence and required authentication; cancel and focus remain usable |

Light/Dark use neutral rows, clear grouping and restrained privacy indication; account deletion does not need emotional decoration. Headings structure categories; row names state destinations; switches expose actual state; privacy uses text and icon. Permission derives from authoritative capability, not client guesses. Dialogs retain keyboard/focus behavior. Short page/sheet transitions establish hierarchy; reduced motion preserves all navigation and result information.

**Implementation implications:** reuse current More/profile/identity/preference components, visibility primitives and existing settings panels/mutations. Add named entry points, separate read/edit, protect preference-dialog lifecycle and map old settings links to category routes. This is not a settings data migration or entitlement change. Native uses standard category/list/sheet behavior, not a pixel copy of Web.

**Acceptance journey:** find profile and appearance settings through More without the avatar shortcut; edit and save a real supported value; return category → index → More; identify which note is private; verify delayed/failing edits preserve work, legacy entry links resolve, and dangerous-operation safeguards remain intact.

## Review and propagation boundary

Each reference's composition must remain complete with sparse content and understandable without a tutorial. Reviewers must reject metadata-led, permanent-edit, card-wall or desktop-first interpretations even if functionally correct. Equally, they must not remove useful depth or replace personal richness with empty space.

These references preserve existing product entities, authorization, Free/Core/Premium boundaries, data ownership and Cloud/Self-Hosted behavior. Privacy, accessibility, recovery and essential export remain non-paywallable. Durable drafts, new media types/derivatives, new reminder channels and unsupported native features need separate owning scope and resource/privacy review.

After F1/F2, the accepted sequence is R1 → R2 → R3 → R4 → R5, followed by bounded propagation and retirement in the [roadmap](implementation-roadmap.md). Historical audit trust findings remain gates until resolved; approving these references does not declare runtime compliance or complete final product audit #946.
