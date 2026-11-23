# Why an upload failed (#2158 A)

Evidence for slice A of #2158: the draft inspector names the real reason an
attachment upload failed instead of the generic text, and adds a short neutral
reference for testers where the couple cannot act on the cause themselves.

## Baseline

`main` at `d477e9c46` (issue baseline), built on #2159 (`249cd42`), which adds the
plain "storage full" message. Screen reviewed: the Memory composer's draft gallery
with its failure note (`memory.photoFailures` with `memory.photoReviewFailure`) and the
failed-upload inspector. The tile and status label `memory.photoFailed` stay;
only the inspector's reason line changes.

## Screens

Captured with Playwright (Chromium) against a local stack of this branch (API,
job runner, Vite, demo Space), in German, signed in as the demo partner Lea.
Failures are injected with request routing; the format refusal is the real
server answer.

| File | State |
| --- | --- |
| `2158-upload-connection-390-light.png`, `-360-light`, `-430-light`, `-390-dark-reduced` | The photo's bytes lose the connection: `uploadFailure.connection` with reference `put-network-web` |
| `2158-upload-connection-1280-light.png` | The same, Expanded (1280 px) |
| `2158-upload-connection-320-text200-light.png` | The same at 320 px with 200 % text |
| `2158-upload-connection-retried-390-light.png` | After the connection is back, `common.retry` sends the same photo; it validates and the entry saves |
| `2158-upload-refused-finalize-390-light.png` | The server refuses a later step (502 at finalize): warm fallback with reference `finalize-502-web` |
| `2158-upload-type-390-light.png` | A GIF the server does not accept (415 `ATTACHMENT_TYPE_NOT_ALLOWED`): the accepted formats, no reference |

The full storage (413 `STORAGE_QUOTA_EXCEEDED`) keeps the #2159 message and
screens in `../2141-storage/`.

## Checks

- No horizontal overflow at 320 (200 % text), 360, 390, 430 and 1280 px.
- Open → interact → result → return: fail, read the reason, retry the same
  photo, save; the entry opens at its new address.
- Reduced motion and Dark: no motion is added; the inspector text uses the
  existing error tokens.
