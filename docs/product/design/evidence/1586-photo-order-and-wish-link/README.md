# Photo ordering and late Wish linking: runtime evidence

Owner: [#1586](https://github.com/baerenmarke90/eimir/issues/1586), delivery [#1588](https://github.com/baerenmarke90/eimir/pull/1588). Explicit base: [#1582](https://github.com/baerenmarke90/eimir/pull/1582), `c9ba6d62c0cd8a008a8024dd908b68124ec2f3be`.

Tested runtime source: `7b3fdc6a99993d54b38d1240eedbe6b0c54ab3f1`, source tree `0f81cbcc506bf84f6fff1e5abcdb0b82876c795a`. The following evidence commit changes only browser-test formatting/capture framing and these artifacts, not the product implementation. The generated pre-implementation composition and its interpretation are in [the preflight](../../references/1586-photo-order-and-wish-link/README.md), linked before UI work.

## Actual Compact / Expanded captures

| Journey | Light / Compact | Dark / Compact or Expanded |
| --- | --- | --- |
| Ten selected photos, six initial previews, selected identity moved to the lead | [390px](compact-photos-390.webp), [430px](compact-photos-430.webp) | [360px](compact-photos-360.webp), [1280px](compact-photos-1280.webp) |
| Saved and new photos interleaved in the Memory editor | [390px](mixed-photo-edit-390.webp) | [1280px](mixed-photo-edit-1280.webp) |
| Existing Plan, deliberate Wish selection and confirmation | [390px](wish-link-390.webp), [430px](wish-link-430.webp) | [360px](wish-link-360.webp), [1280px](wish-link-1280.webp) |
| 320px / 200% text, dense selection retained | [large text](compact-photos-320-large.webp) | Same control/order contract |

These are actual Chromium captures of production components with synthetic HTTP fixtures and authorized repository demo images. Photos are intentionally repeated to isolate ordering/identity; no new stock imagery or real user content is shipped. Full-page composition framing begins at the task heading so off-viewport fixed shell helpers do not project into the screenshot clip. This is capture framing only, not a runtime scroll workaround or an interaction assertion change.

## Behavioral acceptance

The final focused matrix passed **10/10**: four dense capture variants (360/390/430/1280), two saved/new editing variants (390/1280), and four Wish-link variants. Capture asserts six initial previews, explicit all-photos disclosure, selected-photo order/identity, bounded dense height, no horizontal overflow, 320px/200% text, axe and unchanged upload count. Save checks the exact ordered attachment IDs, one created Memory, canonical reading and return to Discover. Editing checks that a new photo can move between saved photos, persist that exact order, keep the original Memory and avoid re-uploading saved photos.

Wish linking asserts no eager list request, server-filtered open choices, no write on selection/Cancel, focus return, exact Wish/Plan versions, one POST, unchanged Plan prose/identity, canonical source link, focus on that link after sheet exit, reload and source/Back. Reduced motion is active across the matrix. Two representative gallery journeys were additionally repeated after the final fieldset semantics, followed by final composition recaptures. A capture-only heading selector initially matched both h1 and the visually hidden h2; it now names the h1 explicitly. No production assertion, timeout or retry was relaxed.

Component/client coverage includes an offscreen failed photo in a collapsed ten-photo selection, selected-photo retry, stable sensitivity/selection through moves, duplicate Wish confirmation, stale/read-revoked responses, localized known/unknown failure codes, and pending-photo resource changes within one Space. Complete saves block failed selected media until explicit retry/removal. Existing retained-draft and authorization lifecycles remain in use.

## Technical validation and limits

- Full Web suite: **2,472 passed**, two pre-existing skips, followed by **57 focused tests** after scope/error refinements and **5 gallery/Wish tests** after the final semantic adjustment.
- Backend focused image/schema tests: **48 passed**. New PostgreSQL/HTTP/race/rollback/foreign/stale-version tests are committed. Local PostgreSQL cannot start as an unprivileged user in this executor; hosted integration CI is required before merge.
- TypeScript, production bundle/tokens/PWA, full Web lint/format, scoped Ruff, strict mypy, canonical v7.24 client, actual ASGI OpenAPI drift, browser inventory and the English engineering-language audit pass. Existing non-fatal lint warnings are unchanged.
- A valid two-frame MPO JPEG rejection was reproduced before the fix. Both metadata modes now sanitize the primary pixels to ordinary JPEG; thumbnail, actual MIME mismatch, pixel limits and truncated-primary checks remain covered. The supplied screenshot contains only generic FAILED, not the original file or server failure code. It does not establish which exact rejection affected that file.
- No physical-device, live deployed upload, real Immich, native-wrapper, merge or release acceptance is claimed. No entitlement, author/private permission, quota or retention boundary changed.

## CI follow-up

The first hosted Web S8 run on `7b3fdc6a` failed only its format gate in the newly added browser test. The exact diagnostic was inspected; the canonical formatter output is committed with this evidence. Fresh checks must validate the new commit. No failed-job rerun, empty commit, timeout increase or gate bypass was used. Backend unit and canonical API-client hosted jobs already passed on the runtime source; PostgreSQL shards and complete browser gates remain required on the final head.
