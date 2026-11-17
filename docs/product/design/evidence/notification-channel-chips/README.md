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

## Follow-up captures (same pull request)

The notification captures above were refreshed after the device switch moved
into a card with its own icon and one hint line. Additional captures:

- `settings-index-live-dark-390.webp`, `settings-index-live-light-390.webp`,
  `settings-index-live-dark-1280.webp`: the Settings overview with live row
  statuses (for example "1 von 4 aktiv", "System · Deutsch"). Rows whose data is
  not available keep their static line (the calendar row in this fixture).
- `settings-wir-grip-dark-390.webp`: the Wir settings list with the dotted
  drag handle.

The device push banner of the approved reference is realised as a card around
the existing device switch (icon, switch, one hint line) instead of a separate
"set up" button: a second control for the same action would duplicate the
switch and break its on/off/connecting identity that the push onboarding flows
rely on.
