# Authored moment tags Web evidence (#1290)

Preflight: [generated Compact reference and interaction contract](../../references/1290/custom-tags-preflight.md), recorded in #1290 before UI implementation.

## Result

The Product Owner supersedes #509's closed tag catalog. Memory and HeartMoment
create/edit forms now let people add their own words with Add or Enter, remove
selected chips and optionally select legacy categories from a closed native
disclosure. Legacy keys retain localized labels; custom labels render as escaped
text in the editor and canonical detail. Photos and narrative stay primary,
followed by context and the existing save action. R1/F2 Create/Edit templates,
semantic tokens, current emotion/date/audience controls and task return behavior
remain authoritative. Warmth comes from authored personal vocabulary and short
relationship copy; no additional decorative motion or animation is introduced.

One common editor and validation contract serve both domains. Labels normalize
whitespace and NFC, reject blank/duplicate input and are bounded to eight labels
of forty Unicode codepoints. A valid pending label commits when focus leaves
for Save. Enter adds a label without submitting the parent. Invalid non-empty
drafts remain visible and block native form submission. Removal returns focus
to the new-label field. The optional blank field never makes a moment invalid.

Memory capture includes an unfinished label in its existing dirty/unload guard;
uncertain creation replays the exact submitted tag snapshot. Other parent
editor lifecycle behavior is preserved. This slice does not claim a new
universal discard guard for existing edit/HeartMoment forms.

Tags remain in the existing protected parent payload, using its author/Space
authorization and private/shared visibility. There is no global vocabulary,
cross-record autocomplete, plaintext tag index, public event/log metadata,
durable local draft, provider or migration. Empty legacy payloads still default
to an empty list, omitted update tags preserve stored labels, and old catalog
keys remain valid. Free/Core classification is explicit in the feature matrix;
Cloud/Selfhost behavior and commercial limits remain the same.

## Visual review

Actual running Web screenshots use mocked HTTP records, distinct from the
generated reference. Local Chromium 153 was used because the pinned Playwright
download was unavailable locally; CI uses the repository browser runtime.

- [390 light](context-tags-compact-light.png), [390 dark](context-tags-compact-dark.png)
- [1280 Expanded](context-tags-expanded-light.png)
- [320 reflow](context-tags-reflow-320.png), [200% text](context-tags-large-text.png)
- [HeartMoment custom tag selected](shell-heart-tags-selected-390.png), [canonical result](shell-heart-tags-detail-390.png)

Reviewed: coherent visual hierarchy in both themes, minimum 44px controls,
wrapped entry/action at 320px, readable selected chips and reachable save
controls at 200% text. Five Memory theme/reflow variants have no Axe WCAG A/AA
violations. Reduced motion was enabled for those captures; other existing
motion remains owned by the parent. No Android device claim is made.

## Behavioral validation

- Two browser journeys cover custom labels in both domains: create, direct Save
  after typing, canonical detail, reload, edit, removal and second reload.
  The existing 29-case capture/reference regression passed before these added
  journeys; legacy suggestion selections remain covered.
- Full Web unit suite: 1,327 passed, one existing skip. Subsequent focused tests
  include the new pending-draft guard and custom-label exact replay (25 passed).
  Production build, typecheck and formatting passed; lint has existing warnings
  and no errors.
- Focused backend unit tests: 23 passed. Ruff, strict mypy (291 source files),
  current ASGI OpenAPI contract and pinned 7.24.0 generated client passed.
  Engineering and documentation language audits passed.
- PostgreSQL/HTTP cases extend shared edit/clear/unrelated-edit behavior,
  private partner denial and idempotent create with custom labels. The shared
  Transfer Bundle round trip now asserts both Memory and HeartMoment custom
  labels survive import. Local database tests skip because PostgreSQL is
  unavailable; successful CI database acceptance is required before merge.

Search, filters and an automatic inference feature are outside this slice.
