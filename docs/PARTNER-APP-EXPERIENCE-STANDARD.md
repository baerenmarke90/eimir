# eimir. Partner-App Experience Standard

**Status:** Mandatory product UI standard  
**Version:** 2.3<br/>
**Effective from:** September 21, 2026

This document is binding for every user-facing Web change (which reaches Android through the Capacitor wrapper) and for any wrapper or native-capability change that affects what couples see. It complements `DESIGN-PRINCIPLES.md`, `UX-PATTERNS.md`, `SCREEN-TEMPLATES.md`, `COMPONENT-CONTRACTS.md`, and `DESIGN-SYSTEM-DELIVERY.md`. Where any of those documents can be read as permitting a desktop-first, table-first, or "design desktop then shrink" interpretation, section 0 of this document governs and the conflicting wording must be corrected or explicitly documented as a conflict rather than followed literally.

eimir. is not a generic productivity tool, admin console, CRM, spreadsheet, or CRUD frontend. It is a private digital place for two people. Functional correctness is necessary but not sufficient: a client feature is incomplete when it feels like database administration with nicer colors.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 0. Smartphone is the normative product reference

> **Product Owner decision:** eimir. is primarily a smartphone partner app. The smartphone/Compact experience is the normative product reference for normal couple-facing functionality. Web is a fully supported adaptation of the same product experience, not the source from which mobile interaction is derived.

This supersedes any prior interpretation, in this document or elsewhere, that treats desktop/Expanded composition as the starting point and mobile as a later reduction. A feature is **not** mobile-first merely because a desktop layout eventually reflows to a 390 px viewport.

### What this means in practice

1. The **Compact/smartphone interaction model is designed first** — see the Mandatory Mobile Interaction Contract in section 10.
2. The human task, content hierarchy, and one-handed interaction determine the pattern before any layout decision is made.
3. Medium/Expanded/Web **may**:
   - use more space;
   - add context;
   - show media larger;
   - add meaningful secondary content;
   - use additional preview surfaces;
   - show parallel information where it brings genuine benefit.
4. Medium/Expanded/Web **must not**, merely because room exists:
   - add more tables, columns, boxes, widgets, or metadata;
   - add more permanent actions;
   - introduce administrative master/detail structures.
5. Responsive design means **recomposition according to the same product model**, not density expansion. A wider viewport is an opportunity to add context, not an invitation to add controls.
6. Spreadsheet/admin/CRM/desktop-management patterns are exceptions, not defaults (section 2, section 14).
7. `Functionality first, design later` remains prohibited for user-facing product work.
8. Established smartphone/platform interaction conventions are the default mechanics; eimir. creates product distinctiveness through relationship meaning, content, composition, language, imagery, typography, and brand treatment rather than by needlessly reinventing familiar mobile behavior.

### Precedence for conflicting product-UI requirements

When requirements conflict, product UI decisions resolve in this order:

1. privacy / security
2. accessibility
3. comprehensibility / usability
4. **smartphone-first partner-app invariant** (this section)
5. **Product Reference v1** and compatible domain-specific product decisions
6. shared design-system consistency
7. generic Screen Template default
8. visual novelty

A generic Screen Template default (`SCREEN-TEMPLATES.md`) never outranks this invariant. When a template's literal wording conflicts with it, the invariant wins; the template must be corrected, or the conflict must be documented in the owning issue/PR until it is corrected. See `docs/DESIGN-PRINCIPLES.md` section 2 for how this precedence integrates with the broader design priority order.

## 1. Product character

Every couple-facing surface MUST feel:

- warm, private, calm, and personal;
- lively and modern without becoming noisy, trendy for its own sake, or visually cold;
- beautiful and intentionally crafted rather than assembled from generic boxes;
- emotionally aware without becoming kitschy;
- gently playful where the relationship context allows it;
- content-led rather than metadata-led;
- alive through restrained motion, feedback, and small moments of delight;
- safe and understandable when privacy or relationship data is involved.

Product Reference v1 makes **warm editorial intimacy** concrete as a personal, living relationship album with familiar mobile interaction. Warmth comes from personal content, varied composition, imagery, typography, purposeful color, and restrained motion. Layers, gradients, glow, and illustrations are optional supporting treatment, never a substitute for meaningful content or a reason to wrap every section in a card.

Modern does **not** mean sterile. Clean layouts must retain warmth through typography, spacing, imagery, surface treatment, microcopy, relationship context, and subtle movement.

## 2. The anti-admin rule

Couple-facing product surfaces MUST NOT default to admin-console or spreadsheet composition.

The following are prohibited as the primary presentation of normal relationship content unless a specific product decision justifies them:

- dense data tables;
- repeated bordered rows containing mostly labels and metadata;
- equal-sized dashboard tiles used only because data can be grouped into boxes;
- deeply nested cards;
- forms presented as uncomposed field stacks with no hierarchy or context;
- large blank grids of generic white rectangles;
- persistent technical identifiers, raw enum values, API terminology, or operational metadata;
- a screen whose dominant visual structure could be reused unchanged for invoices, inventory, or server administration.

Tables remain valid for genuinely tabular administration surfaces such as ServerAdmin when comparison across columns is the task. They are not the default for couple-facing content.

## 2A. Intuitive mobile interaction rules

The absence of admin-style composition is not sufficient by itself. Normal eimir. journeys MUST also be immediately understandable to a smartphone user who has not read documentation or learned product-specific interaction tricks.

### Conventional mobile patterns first

For common smartphone interactions, eimir. MUST prefer established platform/mobile patterns unless the owning Mobile Interaction Contract documents why the conventional pattern fails the human task.

Examples include:

- system/App Back and Browser Back with their normal meanings;
- Bottom Navigation for stable primary destinations;
- native/system date, time, media, share, permission, and other appropriate pickers/surfaces;
- Bottom Sheets for short contextual mobile selection/actions;
- Overflow/context menus for secondary actions;
- platform-standard dialogs for high-risk confirmation;
- familiar focus, keyboard, IME, safe-area, and system-bar behavior.

A custom visual treatment MAY sit on top of these mechanics. A custom mechanic MUST NOT exist merely to make eimir. look distinctive.

### Recognition over recall

Normal tasks MUST NOT depend on the user remembering hidden gestures, modes, locations, internal terminology, or unexplained icons.

- Important state and actions are discoverable in context.
- Essential actions are never gesture-only; swipe, drag, or long-press may accelerate a task but do not become the only route.
- Uncommon, critical, privacy-relevant, or destructive icon actions include understandable text/context.
- Stable tasks use stable terminology and predictable placement.
- A disabled or unavailable action explains the relevant prerequisite instead of forcing the user to infer it.

### Minimize typing and keyboard friction

Typing is a meaningful cost on smartphones. Free text SHOULD be required only when the user's actual content is textual or no lower-friction equivalent exists.

- Prefer appropriate native/system pickers, direct selection, chips/segmented choices, media, and sensible defaults where the domain permits them.
- Do not require a title or metadata field merely because it exists in storage/API models.
- Optional metadata is progressively disclosed and must not delay the primary capture without a product reason.
- Do not summon the software keyboard automatically before the user chooses a text-entry task.
- Primary completion/cancel/back behavior remains reachable and understandable while the IME is visible.

### Direct interaction before redundant utility controls

Where safe and understandable, the content itself SHOULD be the primary interaction target.

- A Memory/card/list item with one obvious destination opens from the content surface; an additional `Open` or `Details` button is normally redundant.
- Secondary, destructive, or ambiguous actions remain separately named and accessible.
- Direct interaction must preserve keyboard, screen-reader, focus, touch-target, and alternative-input accessibility.

These rules do not prohibit forms, lists, buttons, or explicit controls. They prohibit exposing the implementation/data model as the interaction model when a simpler established mobile interaction better serves the human task.

## 3. Today / Wir orchestration invariant

> `Wir` / Today is an orchestration surface, not a widget dashboard.

`Wir` composes a small number of currently relevant:
- relationship signals;
- contextual actions;
- shared content;
- retrospective/discovery content;

from **existing** eimir. domains. A feature does NOT receive a permanent Today card merely because the feature exists.

### Orchestration rules:
- **Irrelevant modules disappear:** Presence is strictly event- or state-driven.
- **Differentiated visual weight:** Modules take shapes and weights that fit their role, not equal-sized boxes.
- **Context decides visibility:** Relevance to the couple right now determines what surfaces.
- **Privacy and consent override relevance:** Protected or unrevealed data is never exposed for visual decoration.
- **No equal-weight widget grid:** Avoid SaaS-style dashboard layouts.
- **No draggable dashboard builder or widget catalogue on Today:** The reading surface is intentionally curated, not an admin workspace. The personal visibility and order controls in Settings (#1194) arrange supported modules without introducing on-page editing or arbitrary widgets.
- **No speculative placeholder modules:** Never show empty widgets just to hold a grid coordinate.
- **Deterministic product rules:** Orchestration relies on simple, predictable rules rather than black-box AI engagement ranking.
- **Above the fold restraint:** At most roughly three dominant elements/interactions above the fold.

### Future module contract:
Any future feature seeking to present content on `Wir` MUST define:
1. **TRIGGER:** When is this relevant to the couple?
2. **PRIORITY:** What may it displace when screen attention is constrained?
3. **ROLE:** Does it act as a *primary contextual action*, a *relationship signal*, *shared content*, or an *editorial highlight*?
4. **EXIT:** When does it disappear from `Wir`?
5. **PRIVACY:** What data may safely be presented without consent leaks?

Features must never simply request to "add another widget to Today".

## 4. Required emotional focal point

Every primary couple-facing screen MUST have one recognizable focal point. Depending on the feature this can be:

- a memory or photo;
- the partner/relationship context;
- a meaningful next action;
- a highlighted wish, plan, question, note, or milestone;
- a small relationship message or shared moment;
- a calm empty-state composition that explains why the feature matters.

A page title followed by a uniform grid of records is not a sufficient focal point.

The first viewport SHOULD communicate the human value of the screen before secondary metadata.

## 5. Warmth, beauty, and gentle playfulness

eimir. SHOULD feel noticeably warmer and more alive than a neutral productivity application while remaining mature and usable.

### Required characteristics

- Surfaces use soft contrast and layered depth instead of hard separators everywhere.
- Rounded shapes, spacing, media, typography, and accent surfaces SHOULD make important relationship content feel tactile and inviting.
- Small decorative details MAY appear around emotionally meaningful content when they do not compete with the task.
- Illustrations, icons, gradients, glow, confetti-like particles, floating hearts, sparkles, handwritten accents, or similar playful devices MAY be used selectively for delight moments.
- Playfulness must remain **lightweight and contextual**. It is not a permanent visual layer across every screen.
- Dense settings, privacy, consent, conflict, error, and destructive flows become calmer and more restrained rather than playful.

### Avoid

- corporate dashboard aesthetics as the default product language;
- cold monochrome layouts with no relationship context;
- exaggerated pink/red romance branding across all surfaces;
- childish illustrations or game-like decoration where intimacy, privacy, or seriousness is required;
- visual clutter created only to make a screen look less empty.

The target is **adult, affectionate, modern, warm, and lightly playful**.

## 6. Surface hierarchy

Use no more surface layers than needed. A typical screen should read as:

1. ambient canvas/background;
2. relationship or page context;
3. one primary content composition;
4. secondary/supporting content;
5. actions and transient feedback.

Prefer spacing, typography, grouping, image treatment, and subtle tonal surfaces over borders around everything.

Cards are reserved for meaningful content units. A section does not need a card merely because it has a heading.

## 7. Typography and content presentation

- Editorial/display typography is used selectively for emotionally meaningful moments, Story, memories, invitations, recaps, milestones, and other relationship-led surfaces.
- Standard UI typography remains the default for forms, settings, navigation, and dense controls.
- Content titles and user-created text outrank timestamps, statuses, IDs, and technical metadata.
- Metadata is visually quiet and grouped instead of repeated as separate rows.
- Empty states contain a human explanation and one meaningful action; they are not bare `No items` panels.
- Copy may be affectionate, warm, and lightly playful where context allows, but it must never assume a specific relationship style, gender role, sexuality, mood, or level of intimacy.

## 8. Love messages and relationship microcopy

Small relationship-oriented messages are a first-class product device. They help eimir. feel like a shared place instead of a record-management tool.

Suitable surfaces include:

- Today/home;
- invitations and partner connection;
- HeartMoments and love notes;
- shared achievements;
- recaps and anniversaries;
- successful completion of a shared plan;
- meaningful empty states;
- occasional non-intrusive return moments.

Examples of the **type** of message, not mandatory literal copy:

- a short reminder that something belongs to both partners;
- a small thank-you or appreciation prompt;
- a celebratory line after a shared milestone;
- a gentle invitation to leave the partner a note;
- a small contextual message such as “Für euch”, “Ein kleiner Moment für euch” or equivalent localized language.

Rules:

- Love messages MUST be localization-driven and context-sensitive.
- They SHOULD be short enough to feel spontaneous rather than like marketing copy.
- They MUST NOT guilt users into engagement or imply relationship problems.
- They MUST NOT become repetitive banners on every screen.
- Sensitive features must not expose private content through decorative previews or notifications.
- User-created messages outrank generated/system relationship copy whenever both compete for attention.

## 9. Motion is part of the feature

Motion is a product behavior, not optional polish added after implementation.

Every new or materially changed client feature MUST define the relevant motion/feedback behavior and reduced-motion fallback.

### Standard motion language

- **Micro feedback:** use the `fast` duration role (currently 120 ms) for press, selection, icon, and compact state feedback.
- **Component transition:** use `standard` (currently 180 ms) for expansion, filtering, reordering, and local changes.
- **Context transition:** use `emphasized` (currently 280 ms) when a sheet/page transition needs stronger continuity; `maximum` (320 ms) is the normal upper bound. All values come from semantic tokens, not per-component ranges.
- Use calm ease-out/ease-in-out curves from design tokens. Avoid aggressive bounce, elastic motion, or constant animation.
- Elements may use subtle opacity, translation, or scale only when this clarifies causality. Reduced motion removes movement and preserves the same focus, status, and result through instant or safe reduced feedback.
- Drag-and-drop MUST visibly lift, move, settle, and confirm state; disappearing and reappearing in another list is insufficient.
- Hover, press, selection, successful save, completed actions, and newly revealed relationship content SHOULD feel responsive rather than switching abruptly.

### Emotional micro-interactions

Features such as `Thinking of you`, invitations, love notes, HeartMoments, shared achievements, recaps, and relationship milestones MAY use a short one-shot delight animation. It MUST:

- be non-blocking;
- end automatically;
- preserve the visible result after the animation;
- avoid repeated attention-seeking loops;
- respect reduced-motion settings;
- never communicate essential information through motion alone.

Appropriate examples include a subtle heart pulse, tiny particles, soft glow, short card lift, gentle reveal, or restrained celebratory motion. These effects SHOULD feel charming and intentional, not like a mobile game reward loop.

Haptics may supplement visible feedback on supported mobile devices but never replace it.

## 9A. Generated visual product reference before implementation

Before implementation starts, every new or materially changed user-facing feature MUST have at least one generated visual product reference attached or linked in the owning issue.

This is a product-composition preflight. The image MUST be generated only after reviewing the current repository state and the real destination surface. At minimum:

1. inspect current `main` and record the baseline SHA;
2. inspect the destination screen/route and the existing functions already visible or reachable there;
3. identify the current shell/navigation, content hierarchy, interaction primitives, components, tokens, and relevant states that constrain the composition;
4. generate the Compact/smartphone reference first;
5. show existing functionality that remains in scope as part of the same composition, represented consistently with the current product;
6. integrate the new feature into that composition rather than depicting it in isolation;
7. add an Expanded/Web visual only when the adaptation materially changes the composition;
8. record assumptions and any intentional departure from the current screen.

The following do **not** satisfy the requirement:

- an isolated new card/component with no surrounding product context;
- a blank replacement screen that omits existing functions without an explicit product decision;
- generic SaaS, dashboard, admin, or moodboard imagery detached from current eimir.;
- an image generated from stale issue text while ignoring newer repository behavior;
- a textual description without an actual visual artifact.

If the destination screen changes materially after the image was created but before implementation starts, the visual reference MUST be regenerated or updated against the new baseline.

The requirement to generate and attach the image is binding. The image is a composition reference, not automatically an immutable pixel specification. Product Reference v1, this standard, accessibility, privacy, security, business/domain constraints, real data behavior, and later explicit Product Owner decisions remain authoritative. An issue may make specific visual choices binding, but it must identify them explicitly.

For older feature issues that do not yet contain such an image, the Product Design Preflight in section 15 MUST add one before UI implementation begins or continues.

[#1151](https://github.com/baerenmarke90/eimir/issues/1151) is a **non-binding example only**. It may illustrate the desired preflight discipline, but its images, layouts, content, and Pro-specific treatment do not create design precedence for other features.

## 10. Mandatory Mobile Interaction Contract

Before implementation starts, every new or materially changed user-facing Web feature (or native capability) MUST document a Mobile Interaction Contract in the owning issue (or, for an existing issue that lacks one, in a Product Design Preflight performed before UI code is written; see section 15).

The Contract MUST cover at least:

1. user goal / human outcome;
2. relationship / emotional value, where relevant;
3. primary Compact screen/state;
4. single dominant action;
5. content hierarchy (section 4);
6. what is visible immediately vs. progressively disclosed;
7. interaction pattern — page, Bottom Sheet, menu, inline, dialog, gesture, etc.;
8. Loading state;
9. Empty state;
10. Error state;
11. Offline state, where relevant;
12. Success state;
13. privacy / relationship state;
14. large-text and narrow-viewport behavior;
15. motion / interaction feedback and reduced-motion behavior;
16. Expanded/Web adaptation (how it enriches without changing product meaning, per section 0/11);
17. why a conventional table/list/master-detail is appropriate, if one is used (section 2, section 16);
18. which established platform/mobile interaction patterns are reused and why any deviation is necessary (section 2A);
19. how unnecessary typing, early keyboard activation, and recall-dependent interaction are avoided on Compact (section 2A);
20. generated visual product reference, including baseline SHA and the existing screen/functions represented (section 9A);
21. visual acceptance plan (section 12).

The Contract also implicitly identifies, and the issue/PR MUST still record:

- the relevant Product Reference v1 rules and calibrated reference experience, followed by the owning Screen Template or why no existing template fits;
- the existing design-system components/patterns that will be reused, or a documented gap (section 16);
- how the feature stays warm, modern, lively, and appropriate to a partner app;
- whether relationship microcopy, playful detail, or a delight moment is appropriate.

`Functionality first, design later` is not an acceptable delivery strategy for product UI. The first mergeable implementation must already use the shared product language and satisfy the Contract, or document deviations.

## 11. Responsive composition

Responsive behavior is composition, not shrinking.

### Compact

- one dominant task at a time;
- strong content focus;
- bottom sheets/pages instead of dense multi-column controls;
- important actions remain reachable with one hand;
- horizontal scrolling is not used to hide primary navigation or core content.

### Expanded

- use width to add context, richer media, list-detail behavior, or supporting content;
- do not fill available width with more equal boxes merely because space exists;
- reading text stays bounded;
- side rails contain supporting information, not required form fields dumped out of the main flow.

## 12. Visual evidence is required

The pre-implementation generated visual product reference from section 9A does not replace implementation evidence. It defines the composition to review before code exists; this section verifies the real implemented result.

A PR that changes couple-facing Web UI MUST include visual evidence for review; a PR that changes the Android wrapper or a native capability adds device evidence for the affected behavior.

Minimum evidence:

- at least one representative Compact state;
- at least one representative Expanded/Web state when the feature exists on Web;
- Light and Dark when theme-sensitive styling changed;
- any important interaction state that cannot be understood from a static default screenshot;
- the complete **Open → interact → save/complete → observe result → return** journey, including draft/interruption safety and restored scope/filter/scroll context where relevant;
- relevant empty, sparse, dense, loading, error/retry, success, reduced-motion, and ~360/~390/~430 px states. Existing 320 CSS px reflow checks remain cumulative; device checks apply where the Capacitor wrapper or a native capability is affected.

A screenshot alone cannot establish Product Reference v1 acceptance. Record behavioral continuity as well as visual evidence; the references define hierarchy and interaction, not immutable pixel locks.

Evidence may be screenshots, a short recording, or stable visual-test output. A textual statement that the UI was reviewed is not sufficient by itself.

## 13. Review questions

A couple-facing surface is not merge-ready if any answer below is `no`:

- Does this look and feel like a private partner app rather than generic business software?
- Does it feel warm, modern, beautiful, and alive rather than cold or sterile?
- Is the human content more prominent than the data model?
- Is there one clear focal point and one dominant next action?
- Does the interaction use an established platform/mobile pattern, or is the deviation explicitly justified by the human task?
- Can a first-time smartphone user recognize important actions and state without memorizing hidden gestures, modes, or product-specific tricks?
- Is avoidable typing and keyboard activation minimized on Compact?
- Is content itself the natural primary interaction target where that is safe and understandable, without redundant utility controls?
- Is there an appropriate amount of gentle playfulness or relationship personality for this context?
- If a small love message or delight moment would improve the experience, has it been considered deliberately?
- Could at least one generic box/border be removed without losing hierarchy?
- Are privacy and shared context visible where they matter?
- Does the layout intentionally adapt between Compact and Expanded?
- Does interaction have appropriate subtle motion or feedback?
- Does reduced motion remain fully understandable?
- Are design-system tokens/components reused instead of local visual inventions?
- Is visual evidence available for review?

## 14. Exceptions

Administration, diagnostics, migration, and operational tools may legitimately use denser information design. An exception MUST be explicit in the PR and MUST not leak that visual language into couple-facing product surfaces.

A couple-facing surface exception (a genuine comparison-heavy structured-data task that needs table/admin-like density) MUST additionally be:

- explicitly justified in the owning issue;
- re-checked, not merely re-copied, in the PR's Product Design / UX section (`.github/pull_request_template.md`).

Accessibility, privacy, security, comprehensibility, and platform conventions always take precedence over decorative treatment.

## 15. Existing issues without a Mobile Interaction Contract

An issue opened before this standard, or otherwise missing a Mobile Interaction Contract (section 10), MUST NOT proceed straight to UI implementation. Perform and document a **Product Design Preflight** first:

1. write the missing Mobile Interaction Contract against the current issue scope;
2. identify whether the originally planned composition still satisfies section 0 and section 2;
3. record the Preflight result in the issue before UI code is written.

Implementation may then proceed against the completed Contract.

## 16. Lists are not automatically list UI

Multiple domain objects do not automatically mean "render a list of rows." For domains such as Memories, Heart Moments, Milestones, Wishes, Plans, People, Places, Collections, and Chapters, first determine the human task — remembering, discovering, planning, dreaming, deciding together, browsing, storytelling, or understanding relationship context. Only then choose the presentation pattern.

A conventional list remains a legitimate choice when it is genuinely the best mobile interaction for that task (section 10, item 17). It must never be the default that follows automatically from the shape of the data model.

## 17. Reuse before build: the correct pattern, not merely an existing one

`Reuse before build` (`docs/REUSE-BEFORE-BUILD.md`) remains mandatory. It does not authorize reusing a wrong pattern merely because it already exists.

When an existing generic row, card, table, settings list, or form component would produce the wrong UX for a couple-facing task:

1. recognize and document the design-system gap;
2. create, or reuse, the smallest correct pattern for the task;
3. reuse that pattern going forward.

"I reused the existing table/list component" is not, by itself, a valid design justification. Reuse is not a shield for the wrong product pattern.

## 18. Anti-CRM sanity question

Every couple-facing surface review MUST be able to answer this question:

> Could this normal couple-facing surface be reused almost unchanged for CRM, invoicing, inventory, project management, or server administration?

If the answer is **yes**, the design requires either a revision or an explicit, documented Product Owner exception (section 14). This question targets normal couple-facing product surfaces; it must not be misapplied to genuine ServerAdmin/diagnostics scope, which is an explicit exception by design.

## 19. Relationship to the retrospective surface audit

This standard governs new and materially changed features going forward, and the issue/PR requirements that enforce it (`AGENTS.md`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/pull_request_template.md`, `.github/workflows/product-design-review.yml`).

The earlier retrospective audit #825 and its dated classifications remain historical evidence for their stated baselines. The accepted 2026-09-15 direction and controlled remediation now belong to [#955](https://github.com/baerenmarke90/eimir/issues/955) and the [implementation roadmap](./product/design/implementation-roadmap.md); earlier PASS classifications do not prove v1 acceptance. This governance update does not run another audit or implement those slices.

The final product audit [#946](https://github.com/baerenmarke90/eimir/issues/946) must use Product Reference v1, any later explicit Product Owner decisions, and this standard together. Its activation rule, complete runtime journeys, required auditor routing, and explicit final Product Owner acceptance remain unchanged. Documentation adoption or green CI does not close #955 or #946.

## Related documents

- [Design Principles](./DESIGN-PRINCIPLES.md)
- [UX Patterns](./UX-PATTERNS.md)
- [Screen Templates](./SCREEN-TEMPLATES.md)
- [Component Contracts](./COMPONENT-CONTRACTS.md)
- [Design System Delivery](./DESIGN-SYSTEM-DELIVERY.md)
- [Design Tokens](../design/tokens.json)
