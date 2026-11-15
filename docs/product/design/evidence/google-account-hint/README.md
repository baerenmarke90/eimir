# Remembered Google account (Settings > Media sources)

Evidence for the "Google Fotos" section in Settings > Media sources (#1467). It follows the Immich
link: a secondary button opens a short dialog with one field (the address of the person's Google
account) so Google skips its account chooser. Once linked, the address is shown with a
"Disconnect" button. The section appears only for accounts the Google import is open for.

Baseline: `origin/main` at `c4dff7604`. Captured by `web/e2e/tests/settings-google-account.spec.ts`
against a mocked API (no real Google, no real device).

| File | State |
| --- | --- |
| `google-account-button-390-light.png` | Compact, Light: section next to Immich, not linked |
| `google-account-dialog-390-light.png` | Compact, Light: dialog with the address entered |
| `google-account-linked-390-light.png` | Compact, Light: linked, with Disconnect |
| `google-account-button-390-dark.png`, `-dialog-`, `-linked-` | Compact, Dark |
| `google-account-button-1280-light.png`, `-dialog-`, `-linked-` | Expanded |

Behavior covered by the browser spec: link with the exact `If-Match` token and `consent: true`,
disconnect with the current token, a rejected address explained in the dialog, a stale write that is
reloaded instead of overwritten, hidden when the import is unavailable, accessibility scan and no
horizontal overflow at 390 and 1280 px.
