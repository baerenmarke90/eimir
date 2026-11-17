# Settings regrouping and switch contrast: visual evidence

Compact (390 px) and Expanded (1280 px) captures of the affected Settings pages from the API-mocked
Playwright fixture, Dark and Light. The fixture renders the default design;
the screenshots are full-page captures, so the fixed bottom navigation appears
over the middle of the page.

| Page | Dark | Light |
| --- | --- | --- |
| Settings overview (grouped) | `settings-index-dark-390.webp` | `settings-index-light-390.webp` |
| Shared features (own page) | `settings-shared-dark-390.webp` | `settings-shared-light-390.webp` |
| Wir settings (switches, scope note) | `settings-today-dark-390.webp` | `settings-today-light-390.webp` |
| Notifications (shared switch fix) | `settings-notifications-dark-390.webp` | `settings-notifications-light-390.webp` |
| App and account (single destructive blocks) | `settings-account-dark-390.webp` | `settings-account-light-390.webp` |

Expanded (1280 px, same fixture, Dark and Light) is in the same folder as
`settings-{index,shared,today,account}-{dark,light}-1280.webp`. The page keeps
its single 48 rem column; nothing turns into a desktop table.

Behavioural acceptance is covered by the Playwright specs named in the pull
request, not by these images alone.
