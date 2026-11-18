# Personal Wish reminder design (#812)

The [generated Compact reference](compact-reference.webp) uses the Wish journey
evidence at current main `69c72af5`. The text, progress indicators, existing
completion and planning actions, and bottom navigation stay in their current
order. The generated date is illustrative. The actual sheet follows locale and
device time.

R3 and the Detail and Short Task Sheet patterns govern the feature. Only an
open Wish has the personal reminder action, below the journey, above existing
operations. The Wish remains the focal content. Compact and Expanded use the
same ShortTaskSheet with native date and time controls and the shared focus,
Back, name, and reduced-motion behavior. Offer tomorrow and one week as
shortcuts, and keep custom scheduling in the same sheet. Confirm only after a
server response and return focus to the reminder trigger. An existing reminder
has edit and remove actions. Loading, offline and failure keep the underlying
Wish readable and preserve input while the sheet stays open.

One personal, one-time reminder per Account and open Wish is Free/Core in
Cloud and Self-Hosted. An Account can schedule, replace or clear only its own
reminder. The other partner sees the same Wish without the reminder metadata.
The reminder never changes a Wish into a Plan. Conversion, completion,
deletion, and leaving the Space cancel pending delivery. No new provider or
framework is needed. The existing authenticated API, PostgreSQL job queue,
Outbox, notification center, and transports own delivery. A device-local timer
would miss account and Wish changes, while a shared Reminder would expose
personal intent. This uses bounded technical scheduling data without copying
Wish titles or notes.

The [360 px light](evidence/wish-reminder-360-light.webp),
[430 px dark](evidence/wish-reminder-430-dark.webp), and
[1280 px light](evidence/wish-reminder-1280-light.webp) Chromium captures show
the implemented sheet. `wish-journey.spec.ts` exercises the next-week preset,
the screen after saving, focus restoration, persistence on reload, and removal
at each width. It also runs the accessibility scan with reduced motion on.
