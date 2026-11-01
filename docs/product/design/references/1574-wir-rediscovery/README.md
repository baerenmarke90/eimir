# Independent Wir rediscovery and borderless inputs (#1574)

Baseline main: `a56b84af07f3cfbda9b48cf2747c543aff9cf3be`.
The [owning issue](https://github.com/baerenmarke90/eimir/issues/1574) records
the Product Owner request, Mobile Interaction Contract, reuse, business and
cross-cutting review before implementation.

[Generated composition reference](preflight.png), generated using the built-in
Imagegen tool after inspecting current main, TodayPage/todayComposition,
DashboardSettingsPanel/catalog/preferences, WishProductPage and shared form
styles/tokens. Actual baseline browser captures of Wir and Wish continuation
were supplied as visual references. This board is guidance, not runtime proof;
its sample partner prose, device chrome and small decorative details do not
authorize new product features or changes to existing content.

## Composition and interaction contract

R4 Today, R3 Wish/Plan and R5 Settings apply. The daily retrospective has its
own `retrospective` module with the existing localized heading. It uses the
normal independent visibility/order controls and appears beside the contextual
module by default. Existing personal order and unrelated visibility choices
remain. No eligible source means no empty frame. Actual source content and
dates lead, the shared blue action opens the canonical source and retains task
return, and the existing account/Space/day dismissal only hides rediscovery.
The source must not repeat in focal, contextual, monthly or activity content.
A newly shared experience keeps priority if it references the same source.
`button-link-primary` consumes canonical blue action aliases so the warm Wir
color world cannot recolor the action or its readable foreground.

Standard text, select, date/time and multiline fields use the shared borderless
filled treatment. Persistent labels, native affordances, validation and visible
keyboard focus remain. System high-contrast boundaries remain available. This
explicit follow-up supersedes the earlier outlined-input visual expectation.
No new provider, entitlement, API field, storage or migration is needed.

Validate 320/360/390/430 px, Expanded, both themes, 200% text, reduced motion,
independent hide/reorder persistence, source-open/Back, day dismissal and Wish
completion/conversion. Retain existing loading, no-source, partial error,
authorized offline cache, sensitive media and Account/Space boundaries.

## Generation prompt

Use case: ui-mockup. Create a compact product design reference board for the
existing eimir private couple app. Inputs are actual baseline Wir Dark and
Wish continuation Light screenshots, supplied as references rather than edit
targets. Show two complete smartphone compositions using the current fonts,
palettes, headerless shell and Wir/Momente/plus/Planen/Mehr navigation.

Wir retains the relationship context and upcoming plan. Give “Weißt du noch?”
its own section heading outside the content surface, historical source/date,
existing daily dismissal and ordinary filled blue “Erinnerung ansehen” action.
Show “Gerade bei euch” separately with a genuine partner interaction. Omit the
transient quote error only from the illustrative composition; retain it at
runtime. No duplicate heading or retrospective, equal widget grid or frame.

Wish retains the read-first detail, back/edit actions and expanded “Wunsch
weiterführen”, including fulfillment and Plan conversion with optional title,
description, place, date and time. All ordinary fields are borderless with
tonal filled backgrounds and persistent labels; native affordances and actual
keyboard focus remain. Retain current blue actions. No new features, fictional
photos, branding, inset outline shadows, wireframes or generic SaaS layout.

## Implementation evidence

[Implementation evidence and validation](../../evidence/1574-wir-rediscovery/README.md)
record the production-UI journeys and captured states. The generated board is
not evidence of runtime behavior or physical-device installation.
