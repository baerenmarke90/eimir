# Daily Check-in ownership across return — acceptance

Scope: Web/Mobile Web, Energy and Vibe reliability slice of #508. Baseline
`main@f19eb5b38b2321c01f8f19ced2eb5ce12a3771d5` after #1305. The
[published preflight](preflight.md), its 21-point Mobile Interaction Contract
and [generated Compact reference](pending-390-light.png) preceded runtime
implementation in commit `5c1a4bf966dbd41b2daa668ebf57ee7c9d8327ee` and the
owning issue comment. Android/native and final #946 acceptance are outside
this bounded result; #508 remains open.

## Result and ownership

On baseline, the last Today consumer could disappear while its write remained
pending: the own Energy choice or Vibe card vanished on return, and another
writer could compete for the same full-owner ETag. Three new component
regressions reproduced these failures before implementation.

Both components now use a small DailyCheckIn-domain owner built on the installed
TanStack mutation cache/subscription. One synchronous Account/Space/server-day
admission covers both dimensions, including multiple DOM events in the same
task. The owner captures the admitted validator, server `checkedOn` and
`dailyContextTimezone`. The device clock does not define ownership.

Only own submitted input and request metadata survive a route interruption.
Energy's pending battery and read-only slider agree after return; Vibe retains
its pending card. Existing controls and localized polite status identify which
other dimension is saving. Failure removes the preview, restores only the own
choice/note, and offers deliberate retry with the newly authorized validator.
A failed Vibe clear retries `{ vibe: null }`, rather than resaving the displayed
choice. A conflict refreshes current data without replaying the stale write.
The Energy slider also adopts that refreshed own value; ordinary failed-input
preservation does not suppress conflict/context recovery. The retained conflict
regression verifies slider/battery agreement and a new deliberate choice with
the refreshed validator. Its added assertion failed on the first runtime commit
before this correction.

The server projection retains `gcTime: 0`, private/no-store transport and its
persistent-cache exclusion. Mutation variables/context/results contain no raw
server or partner projection; results return void. Query identity uses a weak
reference, so an evicted query and its private projection are not held alive by
the guard. The pending owner cannot recreate removed reads. A replacement
consumer obtains its own authorized read instead of receiving the earlier
consumer's response; the original query accepts confirmation only while the
captured day and validator still agree. Session cache clearing retires late
callbacks, and Account/Space/day/timezone changes cannot receive old results.
Feedback is consumed once by an active, matching consumer.

The own attempt uses the existing framework's five-minute inactive mutation
lifetime within the same in-process authenticated session. There is no durable
storage, cross-session retention, history, offline queue or automatic reconnect
PATCH. An offline admission race fails explicitly and requires deliberate retry.

## Product and interaction review

Product Reference v1 R4/Today, the existing couple hero, avatar Energy popover
and shared ShortTaskSheet remain the authority. Couple identity stays the focal
point, with the bounded personal ritual beneath it and the quote/upcoming
content and navigation intact. No field, route, gesture or dashboard panel was
added. Existing semantic tokens, six Vibe choices, optional note, slider, clear
and retry controls are reused. No new assets or visual-system exception.

Compact comes first at 360/390/430px; Expanded adapts the same interaction.
The 320px/200% flow preserves scrolling, wrapping and actionable errors.
The held Energy journey exposed an intrinsic grid/flex sizing defect when
saving status and the existing Remove action shared the narrow popover.
Its single track now permits shrinking and its action row wraps; no clipping,
smaller type, new visual token or desktop-specific pattern is used.
Pending inspection, Escape dismissal, focus restoration, pressed states,
native disabled controls and polite status retain their existing semantics.
Vibe error recovery focuses a choice, without opening a text keyboard.
Motion remains the existing own pending treatment and server-confirmed reveal;
reduced motion preserves state and focus. Partner values/notes are never
speculatively revealed or kept as the pending preview.

Warmth, optional typing and relationship microcopy remain the established
personal choices and couple composition. Additional decoration or a love
message would obscure a quiet reliability repair. Tables/master-detail and
administrative patterns are not part of this surface.

## Behavioral and visual evidence

The retained PR-critical Vibe spec now exercises both dimensions at five
viewport/theme/motion settings. Each journey opens an own task, holds PATCH,
leaves Today through the shell, returns, verifies the own pending choice,
attempts a competing writer, verifies hidden partner values, fails the held
request, inspects the preserved own draft, explicitly retries and observes
server-confirmed state. It checks overflow and axe while pending and failed,
and verifies Energy focus restoration. Current server-day synthetic fixtures
enable both dimensions and preserve the actual Today composition.

| Evidence | Review |
| --- | --- |
| [Energy, 390px Light, return](energy-390-light-return.png) | Own 80% remains pending; inspected slider is read-only and matches the battery. |
| [Energy, 390px Light, error](energy-390-light-error.png) | Rollback and preserved own 80% retry remain actionable. |
| [Vibe, 390px Light, return](vibe-390-light-return.png) | Own pending card remains; partner content stays hidden and Energy cannot submit. |
| [Vibe, 390px Light, error](vibe-390-light-error.png) | Own choice/note survive; choice focus and explicit retry use the shared sheet. |
| [Vibe, 390px Light, confirmed](vibe-390-light-confirmed.png) | Only server confirmation allows partner reveal. |
| [Energy, 430px Dark, return](energy-430-dark-return.png) | Dark, reduced-motion pending inspection preserves hierarchy. |
| [Vibe, 320px Dark, error](vibe-320-dark-error.png) | 200% type wraps and the sheet scrolls without horizontal overflow. |
| [Energy, 320px Dark, error](energy-320-dark-error.png) | The intrinsic grid/flex correction keeps the preserved choice, status and retry inside the viewport. |
| [Energy, 1280px Dark, return](energy-1280-dark-return.png) | Expanded preserves the bounded contextual task and existing shell. |

Functional and visual run totals are recorded in the PR's Validation section.
Exploratory fixture failures are excluded from acceptance totals. Zero retries,
unchanged timeouts and pinned Chromium 151.0.7922.34 are used locally; CI keeps
its existing browser/axe gate. The inventory includes all ten new browser
journeys in the existing PR-critical spec.

## Cross-cutting and business review

The server remains responsible for authorization, module admission, current-day
resolution, dimension-specific Mutual Reveal and full-owner ETag admission.
There is no API/schema, persistence, migration, deployment or provider change.
No raw choice, note or partner content is added to logs, telemetry or URLs.
Localized feedback uses the existing i18n boundary. Weak query identity's other
consumers are covered by the full Web unit suite and PR-critical browser group.

Reuse remains installed TanStack, the generated API, normalized problems,
query-identity guard and existing UI primitives; no new dependency, provider,
license/ToS, cost or hoster setup. A component ref would lose ownership on
remount; a singleton/outbox would expand privacy and persistence boundaries;
the Plan completion abstraction has different domain semantics.

**No business/freemium impact:** the Vibe/Energy matrix rows remain Mixed;
current-day reliability is Free/Core, while `daily.insights` remains the
longitudinal entitlement boundary. Modules do not grant visibility. Ownership,
Cloud/Self-Hosted parity, managed cost, quotas, retention/export, downgrade and
existing-data behavior remain unchanged. No documentation matrix change is
needed. Clean-Room and all existing quality gates remain intact.
