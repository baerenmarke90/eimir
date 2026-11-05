# Planning, media and More corrections — runtime evidence

Owner: [#1661](https://github.com/baerenmarke90/eimir/issues/1661).
Baseline: `91a12b2eb87d9e95c9a7f4ff57bc7cb410ea4714`.
Product preflight and acceptance are recorded in the issue before implementation.
This is a bounded repair of existing controls; the supplied screenshots define
the regressions. No new feature or materially new composition is introduced.
Product Reference v1 R1/R2/R3/R5 and the existing task/source primitives apply.

## Actual product renders

These are unmodified real React/Vite browser captures, encoded as WebP for
repository size. They use synthetic accounts/content and approved repository
demo photos. They are not generated design references or live personal data.
The [runtime source hashes](runtime-source-sha256.json) bind the captures to the
changed production files, independently of later documentation/test edits.

| Surface | Evidence |
| --- | --- |
| Compact search, Light and Dark | [360 Light](planning-360-light.webp), [390 Dark](planning-390-dark.webp) |
| Expanded search | [1280 Dark](planning-1280-dark.webp) |
| 320 px, 200% text | [Search](planning-320-large.webp) |
| Wishes with retained shared selection | [390 Dark](wishes-390-dark.webp) |
| Centered media actions and tag editor | [390 Light](heart-390-light.webp), [390 Dark](heart-390-dark.webp) |
| Expanded photo browsing | [1280 Light](photos-1280-light.webp) |
| Viewer without duplicate blue footer arrows | [390 px, 200% text](photos-viewer-390-large.webp) |

The retained gallery controls stay keyboard/screen-reader reachable, including
when touch browsing hides them visually. Removing the duplicate footer pair
does not remove swipe/arrow-key navigation or the source-Moment action.

## Behavioral acceptance

- Planning search preserves its full authorized scope, localized matching,
  independent Plan/Wish query, clear/focus behavior and return context. Existing
  reference journeys cover 360/390/430/1280 px and 320 px with 200% text; search
  inputs have one background and a compact control height.
- HeartMoment composition exercises device-picker cancel, source availability,
  a deliberate gap and centered media labels in Light/Dark, alongside existing
  privacy, date, save/result and accessibility checks. The shared tag editor
  removes only the redundant visible sublabel; authored tags and accessible
  input names remain supported.
- More navigation exercises Photos, Chapters and empty Years with both visible
  Back and browser Back, then populated Years -> one year -> Years -> More at
  390 and 1280 px. Direct Photos entry still falls back to Moments. Year empty
  states no longer replace the common Back owner.
- Shared Photos exercises gallery keyboard activation, closing/return focus,
  lazy authorized image reads and canonical source-Moment return. The footer
  retains its one source action, without a second previous/next pair.
- The shared-Wish journey starts from Wishes and returns to that selected tab
  after private selection, shared intersection, Plan save and result return.

## Scope and limits

The local browser is Chromium 153.0.8010.0 from a temporary test runtime. The
pinned Playwright Chromium download produced an invalid archive locally; no
repository dependency or CI browser version was changed. Hosted final-head CI
must validate with the repository-pinned browser. Synthetic API tests do not
establish live provider acceptance or physical-device certification. No native
wrapper or capability changed, so this Web correction adds no native release
requirement.

WIR wording and Google Photos are documented proposals only. Their translations,
OAuth behavior, availability and native platform flow are not implemented by
this PR. No new privacy/entitlement/storage/API/migration contract is shipped.
