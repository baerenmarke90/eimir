# Notification channel chips: visual reference

`reference-compact-390.webp` is the Compact (390 px, Dark) composition for the
notification settings page that the Product Owner approved together with the
Settings regrouping (#2024). It was composed against `main` at `eaf62301`
(the existing notification settings page: device push switch, per-group
channel switches with a "mixed" state, per-event details and quiet hours).

What the reference shows and what is implemented:

- channel chips per category (In-App, Push, E-mail) with a check for "on";
- a dashed chip for a chosen channel that cannot deliver yet;
- one note line per category instead of a description under every switch;
- per-event adjustment and quiet hours as rows with a chevron.

The device push banner with a "set up" button in the reference is not part of
this change: the existing device push switch keeps its flow and states.

The reference guides composition and acceptance. It is not a pixel lock;
accessibility, the existing group/event semantics and later Product Owner
decisions take precedence.

## Result captures

From the API-mocked Playwright fixture (not a device); full-page captures, so
the fixed bottom navigation appears over the middle of the page.

- `notifications-dark-390.webp`, `notifications-light-390.webp`: Compact.
- `notifications-dark-1280.webp`: Expanded.
