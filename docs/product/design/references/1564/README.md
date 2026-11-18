# Quieter, aligned Wir settings (#1564)

## Scope and preflight

Baseline main: `cd929f65336b38b70924a0ac2f36596aa8f9e55e`.
The Product Owner requested shorter explanations and aligned visibility checkboxes.
The pre-implementation Mobile Interaction Contract is recorded in #1564, following
Product Reference v1 R5, the Settings and Privacy template and #1562. This is a
bounded copy/alignment correction to the same screen composition; existing
capabilities, preference owners, source controls and navigation remain in place.
It does not introduce a new or materially changed feature composition.

## Implementation and reuse

The original mixed raw-input and custom-label layout offsets checkbox centers by
8.5 CSS pixels. Use one grid with the existing 44px native-label target and a
separate reorder track. Custom controls participate in the same grid; their
error/retry content spans the available row width. Native input margins are reset
at this existing layout boundary. Keep the existing reorder/mutation lifecycle.

Remove the category introduction, duplicate section explanation and visible
repetition of the fieldset title. Retain one short localized selection/sort hint.
The fieldset name and full keyboard-reorder instructions remain available to
assistive technology. Reorder live announcements no longer create an empty visual
row. The sources-only quote panel omits the obsolete on/off explanation.

At narrow effective text widths, a local size-container query gives the label its
own full-width line while retaining the common checkbox/handle columns below it.
Pro text stays together; large text does not overlap controls or clip content.
The existing row feedback, keyboard focus and reduced-motion behavior remain.

## Business/freemium and cross-cutting result

Free/Core visibility, daily.quote Pro and relationship.passport Pro keep their
current eligibility and personal preference ownership. Cloud/Self-Hosted,
existing data, downgrade, export, quota and cost contracts remain unchanged.
No provider, dependency, API, schema, native bridge, persistence or authorization
change. Reuse native labels, CSS Grid, existing tokens and useListItemReorder.
No additional request or client JavaScript lifecycle is introduced.

## Verification and evidence

- 37 focused component tests passed across DashboardSettingsPanel,
  DailyQuoteSettingsPanel, SettingsPage and WirDesignSettings.
- TypeScript, production build, token/PWA checks, changed-source lint/format,
  browser inventory and git diff whitespace checks passed. The existing browser
  non-null-assertion lint warning is unchanged.
- Two existing browser journeys pass with stronger actual-geometry checks:
  all checkbox centers agree within one CSS pixel, every label target is at least
  44px square, and control targets never overlap their visible labels.
- Pointer reorder, keyboard reorder, statistics opt-in, reload and real Wir result
  remain covered. Pro/Free state, quote 503 recovery and successful retry remain
  covered; actionable recovery occupies the full row width. Axe finds no
  violations in the checked settings error state.
- Actual reflow/geometry evidence covers Pro 360/390 Light, 430/1280 Dark, Free
  320 Light and Free 320 with 200% root text. Fixed columns remain aligned when
  large text puts labels on their own line.
- The strengthened browser test fails on the unchanged main product files with
  an 8.5px center difference, then passes on the corrected product source. No
  assertion, timeout, retry, dependency or workflow gate was weakened.

[390px Light](evidence/settings-order-390-light.webp),
[360px Light](evidence/settings-aligned-360-light.webp),
[430px Dark](evidence/settings-aligned-430-dark.webp),
[1280px Dark](evidence/settings-aligned-1280-dark.webp),
[Free 320px](evidence/settings-free-320-light.webp),
[Free 320px with 200% text](evidence/settings-free-320-large.webp),
[full-width quote recovery](evidence/settings-quote-error-1280-dark.webp).
Screenshots use synthetic fixtures, not the user's account or screenshot.

The pinned Playwright browser download returned an invalid archive locally.
These local browser checks use isolated Chromium 153.0.8010.0 with the repository
Playwright runner and zero retries; no runtime/browser pin is changed. Initial
local headless startup/context limitations were corrected in the temporary
harness before acceptance. CI retains the repository-pinned browser and its
normal independent gates. No native-wrapper change or physical-device acceptance
is claimed. CI status is recorded in the pull request.
