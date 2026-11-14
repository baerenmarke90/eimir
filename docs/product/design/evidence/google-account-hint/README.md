# Remembered Google account (Settings > Media sources)

Evidence for the "Google account" section in Settings > Media sources (#1467). A person enters the
address of their Google account once so Google skips its account chooser. The section appears only
for accounts the Google import is open for and can be changed or removed at any time.

Baseline: `origin/main` at `c4dff7604`. Captured by `web/e2e/tests/settings-google-account.spec.ts`
against a mocked API (no real Google, no real device).

| File | State |
| --- | --- |
| `google-account-empty-390-light.png` | Compact, Light: address entered, not yet saved |
| `google-account-saved-390-light.png` | Compact, Light: saved, with Change and Remove |
| `google-account-empty-390-dark.png` | Compact, Dark |
| `google-account-saved-390-dark.png` | Compact, Dark: saved |
| `google-account-empty-1280-light.png` | Expanded: the form keeps a readable width |
| `google-account-saved-1280-light.png` | Expanded: saved |

Behavior covered by the browser spec: save with the exact `If-Match` token and `consent: true`,
change, remove, a stale write that is reloaded instead of overwritten, hidden when the import is
unavailable, accessibility scan and no horizontal overflow at 390 and 1280 px.
