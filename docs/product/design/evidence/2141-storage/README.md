# Storage section and refused uploads (#2141 Q5)

Evidence for the last step of #2141, after the Product Owner approved the UI
preflight on 2026-11-21: states 1–4 (the storage section in Settings › Data)
and state 12 (an upload the full storage refuses). Decisions P1, P3, P4 and P6
apply: the storage endpoint from #2155, the media overview as the way to free
up space, 80 % as the "almost full" threshold, and one message on every media
path.

## Baseline

`main` at `d088a3211`. Screens reviewed:

- More › Settings › Data, with export, import and skipped videos from #2157;
- the Memory composer with its draft gallery and failed-upload inspector.

## Screens

The screenshots come from `web/e2e/tests/transfer-import-storage.spec.ts` and
`web/e2e/tests/storage-upload-refusal.spec.ts` with the API mocked, in German.

| File | State |
| --- | --- |
| `2141-storage-roomy-390-light.png`, `-390-dark-reduced`, `-1280-light` | Enough room: figure, meter, what counts (state 1) |
| `2141-storage-almost-full-390-light.png`, `-390-dark-reduced`, `-1280-light` | From 80 %: free room, warm note, media overview and Pro links (state 2) |
| `2141-storage-full-390-light.png`, `-390-dark-reduced`, `-1280-light` | Full: nothing is lost, Pro as the action, media overview (state 3) |
| `2141-storage-pro-390-light.png` | A Pro couple: 50 GB said in words, no Pro offer (state 4) |
| `2141-upload-refused-360-light.png`, `-390-light`, `-430-light`, `-390-dark-reduced` | A photo the full storage refuses, in the composer (state 12) |

Self-Hosted shows no storage section; the spec checks that it is absent.

## Journeys

The specs check open → interact → complete → observe result → return:

- Each storage state at 360, 390 and 430 px has no horizontal overflow, and
  neither does 320 px with 200 % text. axe passes in Light and Dark.
- From the full storage, the media overview link (`storageQuota.viewMedia`) opens it,
  and Back returns to Settings › Data.
- In the composer, one of two photos is refused. The words and the other photo
  stay, and the refused photo says why. After removing it, as with every failed
  upload, the Memory saves with the other photo.

## Deviations from the mock-up

- **State 4:** the mock-up showed the Pro mark next to the section heading. In the app
  the Pro mark is an upgrade hint that Pro couples never see
  (`proPresentation`), so a Pro couple reads its 50 GB in words instead
  (`storageQuota.proIncluded`).
- **State 12:** the mock-up showed a Pro link inside the composer. It is left
  out so that nobody leaves an unsaved draft; the message itself names freeing
  up space and Pro.
- **Saving:** the composer saves once the refused photo is removed. A failed
  upload blocks saving on every path today, and this PR keeps that behavior.

## Limits

- The API is mocked; the server behavior is covered by the #2141 server PRs.
- The screenshots come from Chromium on Windows. The Android app ships the same
  UI through Capacitor, and no device run was made.
