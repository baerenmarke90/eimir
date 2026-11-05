# WIR wording delivery evidence

Owner: #1663. Baseline: main `c37d427f2b7b914b3dbc86cbe218c92df0bb7d56`.
Direction: the accepted [wording mapping](../../1661-wir-wording-proposal.md),
Product Reference v1 R4/R5 and the existing Today/Settings templates.

## Scope and source binding

These are actual React/Vite browser renders with repository-owned demo media
and synthetic authenticated API fixtures. They are not generated compositions
or live customer data. [Source hashes](runtime-source-sha256.json) identify the
changed runtime files; they must match the delivered implementation. WIR and
Settings were recaptured after the final Settings limit-label correction;
incoming/feeling source and visible output were unchanged by that correction.

This is copy and redundant-kicker cleanup within the existing composition.
The module stack, authored content, availability, saved preferences and task
owners are retained. No new provider, native feature, entitlement or interface
pattern was introduced. A generated composition preflight is not applicable to
this bounded copy scope; the owning issue records the pre-implementation review.

## Visual review

| Artifact | State and review |
| --- | --- |
| [wir-390-light.webp](wir-390-light.webp), [wir-390-dark.webp](wir-390-dark.webp) | Compact WIR: new upcoming, rediscovery, month and activity headings; personal names/content remain dominant. Existing fixture image placeholders are not new media behavior. |
| [wir-1440-dark.webp](wir-1440-dark.webp) | Expanded retains the same hierarchy and mature copy. |
| [wir-1280-large.webp](wir-1280-large.webp) | Existing 200% layout-zoom journey; headings remain readable. |
| [incoming-390-dark.webp](incoming-390-dark.webp) | Named sender heading, separate content type, original prompt/answer/date and canonical action. |
| [incoming-320-large.webp](incoming-320-large.webp) | Time-travel invitation at 320px/200% text, with the same sender/content distinction. |
| [settings-390-light.webp](settings-390-light.webp), [settings-320-large.webp](settings-320-large.webp) | Matching module labels, original visibility/reorder controls and the corrected upcoming-limit label; long labels wrap at 320px/200% text. |
| [feelings-1280-light.webp](feelings-1280-light.webp), [feelings-320-large.webp](feelings-320-large.webp) | Existing feeling selection and notes use clear localized wording at Expanded and large-text Compact sizes. |
| [statistics-390-light.webp](statistics-390-light.webp) | The voluntary Pro statistics module uses the same title as Settings and retains the actual count/link contract. |

Full-page captures preserve the browser's fixed navigation at its capture
position; that is not a new navigation/layout change. Modal captures include
their underlying page. The existing large-text journeys exercise the scrollable
sheet and reachable actions instead of inferring reachability from one image.

## Behavioral acceptance

- 27 distinct local browser journeys pass: 16 initial WIR/incoming/quote
  journeys, nine quote/feeling journeys, and two independent Pro/Core statistics
  journeys. Final targeted recapture also reruns the Settings visibility flow,
  Compact Light/Dark composition, Expanded and layout-zoom journeys successfully.
- Shared invitations cover both content kinds at 320/360/390/430/1280,
  author-to-partner sharing, original words/context, explicit Save, canonical
  detail, Back and receipt consumption. Existing axe/reflow/motion checks remain.
- Settings visibility persists across Settings → WIR → Settings → WIR, including
  the new labels at normal and 200% text. Statistics remain off until opted in,
  Pro-gated, reversible and independent of retained content.
- Five current feelings, legacy values, protected partner notes, pending/error
  recovery and the separate battery value retain their existing coverage.
- Component coverage verifies a localized neutral heading for missing or
  whitespace-only authorized sender names, with the original content retained.
- Full local Web tests: 2,694 pass, two existing skips. The final Settings copy
  adjustment is additionally covered by 41 passing targeted component tests and
  a fresh Settings browser journey. Hosted final-head results belong in the PR.

Local browser: temporary Chromium 153.0.8010.0 using the repository's Playwright
tests. No repository dependency version changed. Hosted checks use the locked
repository browser. This evidence does not claim native-device or live-provider
acceptance; neither is changed by the wording scope.
