# eimir. Content and Privacy Guidelines

**Status:** Mandatory UX-writing and privacy foundation  
**Version:** 1.0  
**As of:** August 24, 2026

eimir. communicates calmly, warmly, and unambiguously. The language supports closeness without pressure, judgment, or therapeutic promises. Privacy statements describe only technically verifiable properties.

## 1. Voice

eimir. is:

- **approachable:** human, respectful, and not bureaucratic,
- **calm:** short sentences, few exclamation marks, no artificial urgency,
- **clear:** concrete consequences and next steps,
- **equal:** both partners are treated equally in language and presentation,
- **privacy-first:** visibility and data impact are understandable before an action,
- **non-judgmental:** no relationship is evaluated based on usage, frequency, or mood.

eimir. is not:

- kitschy or infantilizing,
- lecturing or moralizing,
- a therapy, diagnosis, or safety promise,
- optimized for engagement at any cost,
- artificially personalized through sensitive content.

## 2. Forms of address and terminology

- German product copy uses **„ihr/euch“** by default for the shared space and **„du/dein“** for personal actions.
- **„Partner“** is the neutral German product term; names may replace it in a concrete context.
- **„Space“** may appear in the product as an established proper term but is explained on first use as **„euer privater gemeinsamer Raum“**.
- `OWNER_ONLY` is labeled **„Nur für mich“** in de-DE product copy.
- `SPACE_SHARED` is labeled **„Für uns beide“** or **„Mit Partner teilen“** depending on context.
- **„Öffentlich“** is not used because there is no public privacy class.
- Technical terms such as tenant, payload, entity, 409, or UUID stay out of normal end-user copy.

## 3. Basic rules for UI copy

- Button labels start with a verb and name the result, for example de-DE **„Erinnerung speichern“**.
- Titles describe a location or task, for example de-DE **„Neue Erinnerung“**.
- Help text explains only what is not already clear from label and context.
- A sentence should contain one statement where possible.
- A critical consequence is stated before confirmation, not only afterward.
- Generic de-DE labels such as **„OK“**, **„Ja“**, and **„Weiter“** are avoided when a more specific verb is possible.
- Ellipses are used only when an action opens another dialog.

## 4. Privacy language

### Allowed statements

The following are de-DE product-copy examples and are allowed only when the stated technical condition is true:

- **„Nur für mich“** — when the resource is server-side `OWNER_ONLY`.
- **„Mit Partner geteilt“** — when both active Space members may access it.
- **„Private Inhalte werden nicht für Produkt-Analytics verwendet.“** — when telemetry and operations demonstrably comply.
- **„Medien sind nicht öffentlich zugänglich.“** — when retrieval is authorized or uses short-lived signed access.
- **„eimir. ist privacy-first gestaltet.“** — as a design principle, not as an absolute security guarantee.

### Statements not allowed in the MVP

The following de-DE product claims must not be used:

- **„Ende-zu-Ende verschlüsselt“** or **„Nur ihr könnt das lesen“**.
- **„Vollständig anonym“**.
- **„Kann niemals verloren gehen“**.
- **„100 % sicher“**.
- **„Niemand außer dir erfährt davon“** when metadata is processed operationally.
- **„Offline gespeichert und wird später synchronisiert“**.

Real E2EE is not implemented in the MVP. `cryptoVersion = 0` or technical E2EE readiness must not be marketed as an existing encryption feature.

## 5. Visibility copy

### Display state

| Privacy class | de-DE label | de-DE explanation when needed |
|---|---|---|
| `OWNER_ONLY` | Nur für mich | Dein Partner sieht diesen Inhalt nicht. |
| `SPACE_SHARED` | Für uns beide | Für euch beide im gemeinsamen Space sichtbar. |
| `TEMPORARY_SHARED` | Zeitlich geteilt | Erst verwenden, wenn Ablauf und Empfänger fachlich implementiert sind. |

### HeartMoment selection state

The following is intentional de-DE product copy:

```text
Wer kann diesen Moment sehen?

( ) Nur für mich
    Dein Partner sieht diesen Moment nicht.

( ) Mit Partner teilen
    Der Moment erscheint in eurem gemeinsamen Bereich.
```

- A selection is mandatory.
- The client does not invent a privacy choice for domains that support only `SPACE_SHARED`.
- Switching to shared is consciously confirmed; switching to private explains the limits of retracting previously shared information.

## 6. Status and system copy

The table below contains intentional de-DE product copy:

| State | Preferred text |
|---|---|
| Saving | Wird gespeichert … |
| Success | Gespeichert |
| Uploading | Foto wird hochgeladen … |
| Offline cache | Offline · Stand von {Zeit} |
| Offline write attempt | Noch nicht gespeichert. Verbinde dich mit dem Internet und versuche es erneut. |
| Conflict | Dieser Inhalt wurde inzwischen geändert. |
| Unavailable | Dieser Inhalt ist nicht verfügbar. |
| Session expired | Deine Sitzung ist abgelaufen. Melde dich erneut an. |
| Rate limit | Das waren viele Versuche. Probiere es in {Dauer} erneut. |

- **„Etwas ist schiefgelaufen“** may be used only as a final fallback and requires a next step.
- Success copy names the result, not the technical processing.
- Error copy does not blame the user.

## 7. Error patterns

Good error copy answers:

1. What did not succeed?
2. What happened to the user's input?
3. What can the person do now?

### Examples

The following examples are intentional de-DE product copy.

**Validation**

```text
Titel fehlt
Gib der Erinnerung einen kurzen Titel.
```

**Network**

```text
Noch nicht gespeichert
Dein Entwurf bleibt hier erhalten. Verbinde dich mit dem Internet und versuche es erneut.
```

**Conflict**

```text
Inzwischen geändert
Dein Partner hat diesen Inhalt bearbeitet. Sieh dir die aktuelle Version an, bevor du erneut speicherst.
```

**Privacy-safe 404**

```text
Inhalt nicht verfügbar
Er wurde möglicherweise entfernt oder du kannst ihn nicht öffnen.
```

## 8. Empty states

Empty states distinguish between:

- **first use:** explain the benefit and create the first content,
- **everything completed:** show a positive completion state without creating an artificial task,
- **search/filter:** do not repeat the search term if it could be sensitive; offer filter reset,
- **missing permission:** explain the benefit and an alternative,
- **feature not enabled:** name the activation path or reason.

Intentional de-DE Story example:

```text
Eure Story beginnt hier
Haltet einen gemeinsamen Moment fest, wenn es für euch passt.
[Erinnerung hinzufügen]
```

## 9. Permission requests

Before the system permission prompt, product copy explains benefit, scope, and alternative.

### Photos

Intentional de-DE product copy:

```text
Foto hinzufügen
Wähle ein Foto für diese Erinnerung aus. Ohne Zugriff kannst du die Erinnerung weiterhin ohne Bild speichern.
```

### Notifications

Intentional de-DE product copy:

```text
Gemeinsame Momente nicht verpassen
eimir. kann dich an ausgewählte Termine erinnern. Sensible Inhalte bleiben in der Vorschau standardmäßig verborgen.
```

- No permission is requested at app startup without context.
- Denial is respected; another request occurs only after a new deliberate action.
- If a permission is permanently blocked, a relevant action leads specifically to system settings.

## 10. Notifications

### Default preview

- No Memory titles, HeartMoment text, private notes, preference values, or precise locations.
- Use neutral de-DE wording such as **„In eimir. gibt es etwas Neues“**.
- The partner's name appears only if the person deliberately allows it and the system lock-screen context has been considered.

### In-app

- May be more specific after successful authentication.
- Always leads to an authorized destination.
- `OWNER_ONLY` does not generate a partner notification.

## 11. Destructive actions

- The title names the concrete object, for example de-DE **„Erinnerung löschen?“**.
- The text explains effect and recoverability.
- The confirmation button repeats the action, for example de-DE **„Erinnerung löschen“**.
- de-DE **„Abbrechen“** is the safe alternative.
- Delete account, delete Space, revoke session, and sign out use separate copy.
- Partner removal is not described while it is not part of the MVP.

## 12. Analytics allowlist

Allowed categories:

- app/schema version and platform,
- screen opened,
- feature started/completed/failed,
- technical error codes,
- account created,
- partner invited/joined,
- first Memory created,
- coarse activity cohorts such as D7/D30,
- subscription/entitlement status without payment details.

Forbidden:

- free text from any domain,
- search terms,
- email, name, or invitation token,
- Memory/HeartMoment/Question/PrivateNote/GiftIdea content,
- sensitive preference values,
- exact dates from private content,
- filenames, media content, or image analysis,
- precise locations,
- direct resource IDs or Space content as event parameters.

Every new event requires an owner, purpose, retention, properties, and privacy review. Undocumented properties are not sent.

## 13. Logs and support

Logs may contain technical values such as `requestId`, pseudonymized account/Space reference, route, duration, status, and error code where permitted by security documentation and operations.

- Support never asks for passwords, tokens, or complete private content.
- The copyable diagnostic code is `requestId`, not a resource URL containing a token.
- Crash reporting is sanitized before transmission.
- Screenshots containing private content are not attached automatically.

## 14. Localization

- UI structure supports text that is at least 30% longer.
- Do not assemble sentences from separate variable fragments.
- Plurals, dates, and relative time use locale functions.
- A domain date remains a date and is not shifted by time zones.
- Names are not shortened if doing so could confuse people.
- Gender and relationship form are not inferred from names or profile pictures.

## 15. Content review

Before a flow is released, verify:

- identical terminology on Web and Android,
- clear primary action and clear consequences,
- correct privacy class and no exaggerated promise,
- offline copy without a false synchronization claim,
- errors with a next step,
- neutral notification preview,
- no sensitive analytics properties,
- understandable with large text and screen reader/TalkBack,
- Cloud and Self-Hosted differences described correctly.

## Related documents

- [Security](./SECURITY.md)
- [User Flows](./USER-FLOWS.md)
- [API/UI Contracts](./API-UI-CONTRACTS.md)
- [Accessibility and QA Matrix](./ACCESSIBILITY-QA-MATRIX.md)
