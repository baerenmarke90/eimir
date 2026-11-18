# #1618 runtime acceptance evidence

The images in this directory are real Chromium runtime captures from
`web/e2e/tests/memory-experiences.spec.ts`, using only the existing repository
cabin image fixture and strict mocked API responses. They are not generated
concept images or proof of a deployed backend/provider/native build.

Each case opens the diary composer, authors a weekend crossing New Year, chooses
three media (20 for dense 390px Dark), independently chooses a cover, arranges
media, finishes the draft subtask, explicitly saves and observes the canonical
period/gallery result and one short Back control. The 390px Light journey also
uses actual pointer hold/drag and keyboard movement, then cancels that local
order before checking the persisted single-pointer journey. Axe runs on each
arrangement task. Widths 320/360/390/430 and 1280, Light/Dark, reduced motion and
320px Dark with 200% root text are covered; horizontal overflow is rejected.

`arrange-{width}-{theme}.png` shows the local task. `saved-{width}-{theme}.png`
shows its saved result, with a nonfirst cover still selected and original gallery
positions retained. Exact runtime source fingerprints are in `sources.json`.

`places-edit-actions-390-light.png` and `places-edit-actions-390-dark.png`
show the restored contextual Place actions inside the ordered Memory editor.
The strict `photo-places.spec.ts` journeys cover map-link identity, canonical
Place correction and return, dirty Keep/Discard, staged removal, explicit Save
and reopening without a removed Place reappearing. These pass at 360/390/430
and 1280 in both themes. Source fingerprints also cover the shared action menu,
editor lifecycle and gallery/source contract regression tests.

Complementary unit/component tests cover cancellation/Finish, cover retention and
scope teardown, partial/idempotent media association and the map-picked zero
coordinate request while technical details stay collapsed. PostgreSQL/HTTP
acceptance in `backend/tests/integration/test_memory_experiences.py` covers
inclusive year overlap, recap eligibility, persisted zero coordinates, ordered
places and concurrent membership changes, cover reset and private supplemental
media. Hosted execution remains required; local root-only runtime cannot launch
PostgreSQL under its required unprivileged account.
