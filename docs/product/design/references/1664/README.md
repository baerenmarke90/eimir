# Personal language and multilingual product preflight

Owning issue: [#1664](https://github.com/baerenmarke90/eimir/issues/1664).

## Reviewed baseline and composition

Reviewed main `a9c5fb46b8c46781c77b27487f07b876b531ec8e`, including
#1663/#1665 WIR wording, and dependent #1668 head
`3972f5ab856370836f431ea900d92d5381d63aae` before implementation. The working
branch starts at that dependency. Merge is authorized only after #1668 is
complete and merged into main, followed by refreshed integration validation.

The actual destination is `/more/settings/appearance`, owned by `SettingsPage`,
`ProfileAppearancePanel`, `ThemeControl`, `WirDesignSettings`, and
`AppIconSettingsPanel`. Preserve the category hierarchy, shared Back behavior,
current color mode, WIR design, app-icon choices and four-destination mobile
navigation. Add one personal language control after color mode. R5, Product
Reference v1 principles 5–9/D6–D7, Settings and Privacy, and existing native
select/form/status primitives govern the change. No visual foundation changes.

![Generated Compact composition](generated-language-settings.png)

Generated before UI implementation with the built-in image-generation tool.
Prompt: create a whole-task 390px eimir Settings > Appearance composition against
the reviewed sources, preserving color mode, WIR design, app icon, Back and bottom
navigation; insert Language after color mode with Automatic (device language),
Deutsch and English, no flags; use existing semantic palette, 44px targets,
wrapping utility text and calm spacing. No paywall, time-zone input or new feature.
The enlarged chooser is an explanatory callout, not a new custom popup. The
runtime keeps the existing native select and actual WIR preview/icon assets;
generated decorative preview details are not implementation instructions.

## Mobile Interaction Contract

- **Human outcome:** use eimir in a personally understandable language while
  retaining the couple's actual words and the current task. Each partner chooses
  independently; no participation from the other partner is required.
- **Primary Compact state/action:** the existing Appearance category, with one
  labeled native Language select. Choosing a language applies immediately and
  reports authoritative persistence; no second Save action or keyboard input.
  Automatic, Deutsch and English use language names rather than flags. Language
  names come from the central locale registry, allowing additional languages
  without rewriting feature components.
- **Hierarchy/disclosure:** category context, color mode, language and its
  personal-scope explanation, existing WIR design and app-icon functions. Utility
  clarity supplies warmth; no romantic decoration, promotional copy or animation
  is appropriate for this setting.
- **Loading/empty:** retain navigation and the known account preference while
  resolving current state. New accounts and absent preferences use Automatic;
  never substitute an earlier account's explicit choice.
- **Error/conflict:** show localized actionable inline feedback, retain the
  attempted choice for retry and distinguish unsaved presentation from saved
  preference. Versioned writes must not silently overwrite concurrent edits.
- **Offline:** bundled resources remain usable. Retain the authenticated
  account's last confirmed preference for offline reading; an unconfirmed
  selection is not queued or described as synchronized. Retry is deliberate.
- **Success:** translated text, accessible names, document language and locale
  formats update in place. Keep authentication, route, scroll, selections,
  unsaved authored input and mounted task identity. Persist the confirmed choice
  to the Account and its existing session snapshot.
- **Back/focus:** native select keyboard interaction, ordinary browser/system
  Back and current category → settings → More navigation. Keep focus on the
  select; announce save/error state without remounting the page.
- **Privacy/ownership:** preference is personal account metadata. Logout clears
  account scope and uses device detection; late responses cannot change another
  account's language. Language never changes stored dates/time zones/schedules,
  privacy, reveal, entitlement or authored content. No translation service.
- **Motion:** reuse native selection/press feedback and existing status roles;
  no global page animation or remount on language change. Reduced motion keeps
  the identical result and focus.
- **Narrow/large text:** 360/390/430px, 320px reflow and 200% text use normal
  wrapping and existing 44px targets. Expanded retains the same bounded personal
  settings task; no second configuration dashboard or extra fields.
- **Acceptance:** open Appearance → choose English → observe text/save state →
  reload → return to Automatic → return to More. Verify the same account's
  offline snapshot, conflict/error recovery, independent account choices and
  switch-and-continue with an unsaved Memory. Capture Compact and Expanded,
  German/English, Light/Dark, long text and reduced motion.

## Reuse, business model and cross-cutting decisions

Extend existing i18next/react-i18next and native Intl. Reviewed current primary
documentation for [fallback](https://www.i18next.com/principles/fallback),
[plural rules](https://www.i18next.com/translation-function/plurals) and
[React subscriptions](https://react.i18next.com/latest/usetranslation-hook).
FormatJS and a custom context/translation engine remain unnecessary. Existing
libraries are MIT; bundled dictionaries add no provider, translation request,
secret, subscription, hoster configuration or Cloud/Self-Hosted difference.

Business/freemium impact reviewed: Accessibility essentials & i18n localization
is Non-paywallable. Existing feature tiers, data/export/downgrade rights, quotas
and Space entitlements are unchanged. Additional static resources add bounded
bundle size; no recurring infrastructure cost or retained-data restriction.

Reuse the existing Account locale write boundary and optimistic concurrency.
Automatic mode records the latest supported device language for background
recipient delivery; explicit choice has priority. Background jobs resolve the
recipient's current effective language, never the actor's UI language. Stable
API error codes and privacy-minimized notification payloads remain unchanged.
Editorial/provider and legal content keep their owning identity, provenance and
language contracts. Unsupported content languages require explicit fallback;
never machine-translate quotations, canonical legal documents or authored text.

Technical validation covers resolver ordering/variants/fallback, account scope,
resource/interpolation/plural parity, migration/API concurrency, recipient mail
and Push, relevant component behavior and conservative browser impact selection.
Actual runtime evidence and final tested revision are recorded in the PR.
