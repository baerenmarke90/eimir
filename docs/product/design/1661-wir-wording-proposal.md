# WIR module wording proposal

Status: **accepted for implementation in #1663**, 2026-11-05. Proposed under
#1661; the Product Owner subsequently requested delivery. The mapping records
the agreed copy direction; #1663 owns implementation and validation evidence.
Module ordering, visibility, entitlements and notification wording are unchanged.

Inspected baseline: `91a12b2eb87d9e95c9a7f4ff57bc7cb410ea4714`.
Sources: `TodayPage.tsx`, `dashboardModules.ts`, `DailyVibeCheckIn.tsx`,
`SharedExperienceReveal.tsx` and their German locale resources. Product Reference
v1 R4 remains authoritative. German phrases below are intentional product-copy
candidates, not engineering identifiers.

## Direction

Use short, recognizable headings that describe what the couple finds there.
Warmth comes from their content and a personal address, without slogans or
relationship judgments. Use **euer/eure** for shared content, **dein/deine** for
personal input and the equivalent of **for you** only for something actually
addressed to that person. Avoid mixing English feature slang, internal module names and German
editorial headings on the same screen.

The WIR heading and its Settings module label should use the same name. A short
Settings explanation can clarify the feature; a second visible kicker normally
adds no value. The couple's names and an authored list title remain content,
not system labels to replace.

## Recommended mapping

| Module / role | Current visible or Settings wording | Recommended wording | Reason |
| --- | --- | --- | --- |
| Couple identity | Couple names; Settings: „Paar-Präsenz“ | Names remain; Settings: **„Ihr beide“** | Recognizable, human module name without an internal design term. |
| Today's feeling | „Vibecheck“, „Wie geht es euch heute?“ | **„Wie geht es euch heute?“** | Use the existing clear question as the heading; omit the English kicker. |
| Personal energy | „Wie voll ist dein Akku heute?“ | **Keep it** | Clear personal metaphor, separate from the couple's feelings; never a relationship score. |
| Incoming shared experience | „Für dich“; „Ein Glücksmoment für dich“ / „Eine kleine Zeitreise für dich“ | **„Von {{name}} für dich“**; content type **„Glücksmoment“ / „Zeitreise“** | Makes the sender and personal destination explicit; use „Für dich“ if the name is unavailable. |
| Daily quote | „Euer Impuls“, „Zitat des Tages“ | **„Ein Gedanke für heute“** | Calm editorial invitation. Keep quote typography, author and source; preserve “Zitat” in descriptive/accessibility copy. |
| Featured memory | „Euer Moment“ | **Keep „Euer Moment“** | Already short, warm and suitable for photo or text content. |
| Upcoming dates / Plans / reminders | „Demnächst“, „Euer Ausblick“ | **„Was bei euch ansteht“** | Covers Plans, birthdays and practical reminders without assuming every event is joyful. |
| Pinned list | Authored list title; Settings: „Angeheftete Liste“ | Title remains; Settings: **„Eure Liste“** | The personal title leads. Explain pinning in Settings rather than adding chrome on WIR. |
| Rediscovery | „Weißt du noch?“ | **„Erinnert ihr euch?“** | Consistent shared address for a shared memory; keep the clear memory detail action. |
| Contextual Wish / Plan / milestone | „Gerade bei euch“; older keys also contain „Bei euch passiert“ / „Neues von euch“ | **„Gerade bei euch“** | Retain the actual current section name; it is broader than an activity feed. Remove competing synonyms when this proposal is implemented. |
| Monthly content | „Diesen Monat“ | **„Euer Monat“** | A recognizable shared snapshot. The filter/period still identifies which month is meant. |
| Recent activity | „Zuletzt bei euch“, „Aktivitäten“ | **„Neues bei euch“** | Distinguishes actual new activity from the contextual Wish/Plan module. Use „Aktivitäten“ in its destination. |
| Shared counts | „Eure Geschichte“; Settings: „Beziehungsstatistik“ | **„Eure Geschichte in Zahlen“** | Describes the real counts without evaluating the relationship or duplicating the Moments heading. |

These are editorial alternatives, not permission to expose a sender, feeling,
note or private content before its existing authorization/reveal boundary.
Use plural/localized fallback copy when a name is unavailable; do not construct
possessives by concatenation. Keep domain names **Erinnerung, Herzmoment,
Glücksmoment, Zeitreise, Wunsch, Plan, Kapitel** stable outside these headings.

## Actions and state copy

Prefer destination-specific actions such as **„Erinnerung ansehen“**,
**„Plan ansehen“**, **„Wunsch ansehen“**, **„Liste öffnen“** and
**„Alle Aktivitäten“**. “Ansehen” alone is sufficient only when the accessible
name and immediate context already identify the content. Personal actions stay
personal: **„Gefühl teilen“**, **„Deine Antwort bearbeiten“**. Keep statuses
precise: **„Wird gespeichert …“**, **„Noch nicht geteilt“** and an actionable
error, rather than emotional pressure or promises of a mutual response.

## Implementation and acceptance

Apply the copy through the active locale resources, reconcile the Settings
catalog labels and accessible names, and remove obsolete visible synonyms after
checking all consumers. The current Web client registers German only; the earlier
suggestion to update German and English together does not require introducing an
unsupported locale. Future locales must preserve the same meaning.
No feature keys, route names or saved preferences need renaming. Check actual
WIR and Settings at 360/390/430 px, Expanded, Light/Dark and 200% text, including
long names, a single partner, hidden modules and protected reveal states.
The existing Product Reference visual preflight applies to any material
composition change; the accepted scope is copy and redundant-kicker cleanup
within the existing composition, rather than a redesign.

Business/freemium: no proposed tier or ownership change. Existing optional Pro
modules remain Pro; wording must never imply new Free functionality or a
relationship-quality score.
