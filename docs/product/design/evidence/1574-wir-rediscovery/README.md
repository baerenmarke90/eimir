# Wir rediscovery and borderless controls: implementation evidence

Owning issue: [#1574](https://github.com/baerenmarke90/eimir/issues/1574).
[Generated preflight and interaction contract](../../references/1574-wir-rediscovery/README.md)
were recorded before implementation against main `a56b84af`.

These are actual Playwright captures of the production React UI with synthetic,
authorized API fixtures, committed with the corresponding implementation.
They are not generated mockups or physical-device installation evidence.

## Representative captures

- [360 Light](today-r4-independent-rediscovery-360-light.png),
  [390 Dark](today-r4-independent-rediscovery-390-dark.png),
  [430 Light](today-r4-independent-rediscovery-430-light.png),
  [1280 Dark](today-r4-independent-rediscovery-1280-dark.png),
  [320 Dark / 200% text](today-r4-independent-rediscovery-320-dark.png).
- [Independent partner signal and rediscovery](today-r4-rediscovery-beside-partner-390-light.png)
  and [personal visibility/order settings](today-r4-rediscovery-settings-390-light.png).
- [Actual source photo, Light](today-r4-nostalgia-390-light.png),
  [Dark](today-r4-nostalgia-390-dark.png),
  [Expanded](today-r4-nostalgia-1440-expanded-dark.png).
- Wish continuation: [Light](wish-borderless-controls-390-light.png),
  [Dark](wish-borderless-controls-390-dark.png),
  [320 / 200% text](wish-borderless-controls-320-reflow.png),
  [Expanded](wish-borderless-controls-1440-expanded-light.png).
  The visible outline on the focused description is keyboard focus; ordinary
  fields have zero surrounding border. Native date/time/select affordances and
  system high-contrast boundaries remain.

The isolated Today precedence fixture retains its pre-existing unavailable
quote state; it does not claim an operational quote service. The richer Today
fixture provides the explicit disabled-quote response and verifies the full
eligible composition, source image and partner signal.

## Behavior and validation

- All 60 cases in `today-keepsake-precedence.spec.ts`,
  `today-living-home.spec.ts` and `planning-wish-completion-continuation.spec.ts`
  passed. They cover the independent module, real canonical source and Back,
  per-day dismissal/remount, persisted independent visibility/reorder,
  no-source collapse, actual photo loading, sensitive content, Light/Dark,
  reflow, reduced motion, axe checks, Wish fulfillment, conversion input,
  pending/concurrent writes, conflicts, failed requests, offline/reconnect and
  keyboard focus. Old full-composition fixtures were updated to actually
  contain a retrospective; the independent contextual slot remains singular.
- 53 backend catalog/preference cases passed with real PostgreSQL, including
  older complete order payloads, visibility, unsupported facets, Account/Space
  isolation, atomic ordering and preserved partner preferences.
- The complete local Web suite passed 2,437 tests with 2 existing skips before
  the final source-collision guard; final focused Today/settings/Wish checks
  include that additional regression. Final-source CI remains the merge gate.
- TypeScript, production build, generated-token checks, lint, formatting,
  backend Ruff/mypy and the scoped engineering-language audit passed. Existing
  lint/bundler warnings remain; no gate, assertion or security check is bypassed.

The warm-color review caught inherited rose actions and an insufficient dark
foreground. Canonical action aliases and the explicit primary-link variant now
retain the ordinary blue/white pair; browser checks compare the action against
the root palette and axe verifies contrast. This supersedes the earlier input
outline expectation explicitly rejected by the Product Owner.

Native-wrapper behavior is unchanged. Android distribution retains the existing
signer, package and update path; no physical-device upgrade observation is
claimed by these browser checks.
