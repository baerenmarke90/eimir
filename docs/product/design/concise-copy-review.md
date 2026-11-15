# Concise copy review — #1516

Baseline: `44cd3d59bd33a47472b320025efd6bc9ab22a26d` (main).

The Product Owner requests less repeated copy throughout the existing app and a quotation symbol in place of the visible daily-quote heading. This is an editorial correction to the existing R1–R5 surfaces, not a new interaction or feature. The current Compact screenshot supplied with the request is the concrete correction reference. The preflight and Mobile Interaction Contract were recorded in #1516 before implementation.

## Editorial decisions

- A section gets one useful heading. A kicker or introduction must supply a different fact, not restate that heading.
- Prefer concrete labels and verbs. Remove implementation explanations from ordinary successful read/edit surfaces.
- Keep type labels when they distinguish a user-authored title. Keep private/shared scope, pending and failed saves, offline limits and destructive consequences.
- Keep localization at the existing resource boundary. No global string suppression: repeated user content and privacy labels can be meaningful.
- Retain the existing navigation, data, entitlement, draft, return, mutation and motion contracts.

## Reviewed surfaces and result

| Surface | Result |
| --- | --- |
| Today / all three designs | Accessible quote heading is visually hidden; the existing icon grammar gains an inert quotation symbol. The keepsake and recent-activity sections each keep one heading. Vibe retains its question without another category line. |
| Moments / discovery / years / photos | Remove repetitive page and retrospective introductions. Shorten chapter/milestone labels; photo guidance explains the actual source rather than repeating the gallery title. Keep chronology, dates, filters, content kinds and canonical destinations. |
| Memory / HeartMoment / milestone / chapter capture and edit | Remove repeated task eyebrows and unnecessary field inventories. Keep meaningful visibility instructions, date, draft safety, validation and save outcome. |
| Planning / wishes / places / lists | Shorter next/history headings. Plain capture titles and optional-detail guidance. Retain the wish/plan distinction and place/list guidance that adds useful information. The follow-up PO screenshot removes the creator attribution and notes heading in Plan detail: retain the location link and authored description in one prose surface, without an empty metadata line or nested section wrapper. Creator data and edit fields remain unchanged. |
| Search / activity / notifications | One recognizable destination title. Search keeps private/shared scope; result states and actions remain. |
| Profile / settings / people | Remove repeated profile/task labels and repeated Pro badge. Shorten introductions; preserve sharing controls and category context inside Settings. Standardize Pro branding and HeartMoment terminology. |
| Pro insights | Remove the decorative header slogan; the title, period, chart labels and meaningful supporting copy carry context. Replace synonymous recap/month sublines with explicit data context. No score, diagnostic, causality or hidden-state distinction is introduced. |
| Private notes / gift ideas / private lists | Retain audience labels: these distinguish private content from shared content and are not decorative repetition. |
| Authentication / partner connection / account deletion / offboarding | Retain identity, audience and consequence explanations. Removing them would make security and destructive choices less understandable. |
| Photo sources / reactions / sensitive media / places | Retain consent, storage lifetime, audience, reveal controls, provider requirements and partial-failure guidance. No provider flow or external asset is added. |
| Daily quote/energy preferences / notifications / reminders / important dates / transfer | Retain persistence, visibility, delivery, time and import/export scope explanations. These supply consequences beyond their headings. |
| Games / onboarding / product tour / operators | Shorten the games overview introduction. Keep bounded game rules, guided-tour instructions and operational diagnostics where they explain the task. |

## Icon provenance and reuse

The quotation mark is new repository-authored SVG geometry in `EimirIcon.tsx`, using the existing 24-unit grid, rounded outline, semantic color and sizing. It has no external asset, dependency, runtime request, license/attribution obligation or provider cost. It is decorative and not focusable. The localized semantic heading and independently named settings button remain available to assistive technology.

## Validation and limits

The quote browser suite retains its containment, large-text, all-design/theme, accessibility, preferences, error and account-isolation checks. It now asserts the visually hidden semantic heading and visible symbol, and absence of the duplicate keepsake kicker. Existing component expectations follow the same accepted editorial result; behavioral assertions are retained.

Local browser verification could not start: no Chromium executable is installed, and the advertised Playwright browser download returns a 195-byte HTML document with HTTP 200 instead of an archive. This is an environment limitation, not visual acceptance. The PR must record actual CI/browser results and representative visual evidence before being considered merge-ready. No native capability changed. The Plan-detail follow-up passes all 48 focused Plan reading/editing/completion/continuation/reflection tests, TypeScript checking and changed-file lint; authored prose and its edit lifecycle remain intact.

No business/freemium impact: the current feature matrix remains authoritative. Quote and insight capabilities stay Pro; ownership, entitlement checks, Self-Hosted/Cloud parity, quotas, costs, retention and non-destructive downgrade/export remain unchanged.


## Cloud verification follow-up — #1517

The initial browser-download limitation above was resolved with the available
Chromium runtime. The complete quote browser collection now passes, including
all-design Light/Dark containment, large text, preferences under More, caller
isolation and return/focus. The complete Web suite passes 2,275 tests with two
existing skips; see the [combined acceptance evidence](evidence/1517-app-composition/README.md).
