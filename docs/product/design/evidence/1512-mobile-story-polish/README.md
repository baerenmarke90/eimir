# Wir quote and Moments presentation correction (#1512)

Baseline: `e5eb55069239ee238aa786b36d6943212012b752` (main, 2026-10-29).

This bounded R2/R4 correction follows Product Reference v1 and the coherent-section decision #1508. The PO supplied the three defect screenshots. No new feature, route or materially different composition is introduced, so the new-feature generated-composition preflight does not apply. The existing Today, Timeline and Discovery templates, navigation, cards and interaction contracts remain the basis.

## Result

- DailyQuoteCard owns the heading-outside/content-inside anatomy in every Wir variant. Removed competing variant framing and protected wrapping beside the independent settings target.
- The existing sticky month-group owner uses the page background and compact semantic typography. Removed the competing unified-page override; the Year archive retains its own editorial treatment.
- Short localized copy removes repeated Moments labels and uses a direct next-plan heading.
- Discover renders the complete existing authorized server selection (bounded to eight), excludes its lead and any separate retrospective duplicate, and retains canonical detail/return and lazy media loading. The reveal revision includes retrospective identity to observe an entry remounted after that candidate changes.

## Mobile interaction and product checks

Photo/words remain the focal point; tapping an entry opens its existing canonical detail. Month context remains sticky without a contrasting block. Quote settings remain independently keyboard/touch operable. No new inputs, save flow, persistence, domain permissions, filters, entitlement or reduced-motion contract. Loading/empty/error/offline states are reused. The diary remains a chronological feed because browsing by date is the task. This is ordinary Web UI; no wrapper/native capability changed.

## Evidence and limits

Screenshots use synthetic authorized API fixtures, not a signed-in production account. Source screenshots from the PO remain the defect reference. Chromium 149 was run with the repository Playwright 1.62.1 suite using the available local browser executable. This is Web evidence, not a native-device or deployed-release claim.

- `quote-{warm,modern,classic}-{light,dark}.png`: heading and one content surface, including the supplied long quote. All variants also passed 360/390/430 px and 320 px with 200% text and axe checks.
- `moments-390-light-1.png`, `moments-430-dark-1.png`, `moments-1280-light-1.png`, `moments-320-dark-2.png`: complete rediscovery selection above Diary, Light/Dark and Expanded/large-text evidence. The associated journeys open a memory, add an existing Place, observe the saved relation, and return to the Diary.
- `09-month-heading-pinned-at-viewport-edge-390.png`: compact sticky month context. The test checks page-colored backing, Instrument Sans and the reduced scale.
- `972-browse-1440-light.png` and `story-601-*.png`: complete canonical order, mixed content, real retrospective and large-text evidence.

## Validation

- 122 component/hook tests passed across StoryProductPage, DailyQuoteCard, TodayPageR4, TodayPage and useTimelineProgressiveLoading.
- 17 selected browser scenarios passed across the targeted runs (six quote variants/themes, default quote layout, four integrated rediscovery/detail/Place/return journeys, five tapestry scenarios, one sticky-month scenario).
- Typecheck, production build, semantic-token/PWA checks, engineering-language audit, changed-file lint/format and diff whitespace checks passed. The German quote fixture uses the existing localized E2E fixture module; all six quote variant/theme scenarios passed again after moving it.
- No business/freemium impact: quote remains Pro; the existing authorized Discover/Diary contract remains unchanged. No provider, dependency, API, storage/quota, migration or Cloud/Self-Hosted change.
