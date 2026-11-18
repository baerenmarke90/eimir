# Calendar sync: operator setup, data flow and acceptance status

Owner: [#1895](https://github.com/baerenmarke90/eimir/issues/1895). Product
design: [calendar-integration.md](../design/calendar-integration.md).

## What runs where

- One-way **eimir. → calendar** sync of Plans into one shared target calendar
  per Space. Providers: CalDAV (PR B1) and Google Calendar (PR B2).
- Worker: the existing `python -m eimir.jobs.runner` (`worker` /
  `cloud-worker` services). No new service, queue or client polling.
- Pro capability `integration.external_sync` (Space-wide, both partners).
- Requires `EIMIR_ENCRYPTION_AT_REST=required`: credentials and refresh tokens
  are stored in encrypted payloads; without encryption the feature is hidden.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `EIMIR_CALENDAR_SYNC_ENABLED` | `true` | Master switch for both providers. |
| `EIMIR_CALENDAR_CALDAV_PRIVATE_HOSTS` | `[]` | Self-Hosted only: JSON list of exact host names of CalDAV servers in a LAN/VPN that may resolve to private addresses. Loopback, link-local and unspecified addresses stay blocked. Startup fails if set on Cloud. |
| `EIMIR_GOOGLE_CALENDAR_CLIENT_ID` | empty | Operator-owned Google OAuth **Web application** client. Google is offered only when ID, secret and an `https` `EIMIR_PUBLIC_BASE_URL` are present. |
| `EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET` | empty | Secret of that client (inject as a secret, never commit). |

CalDAV needs no operator setup.

## Google Cloud setup (operator)

1. In the Google Cloud project that owns eimir.'s OAuth consent screen, enable
   **Google Calendar API**.
2. OAuth consent screen: add the scopes
   `https://www.googleapis.com/auth/calendar.calendarlist.readonly` and
   `https://www.googleapis.com/auth/calendar.events`. Both are *sensitive*
   scopes: production use for arbitrary Google accounts requires Google's
   OAuth app verification; until then only listed test users can consent.
3. Create (or reuse) a **Web application** OAuth client and add the exact
   authorized redirect URI:
   `https://<public host>/api/v1/calendar-sync/google/callback`
   (`EIMIR_PUBLIC_BASE_URL` + `/api/v1/calendar-sync/google/callback`). The
   Google Photos client can be reused if both redirect URIs are listed.
4. Set `EIMIR_GOOGLE_CALENDAR_CLIENT_ID` and `EIMIR_GOOGLE_CALENDAR_CLIENT_SECRET`
   and restart API and worker. Rotating the client invalidates existing
   refresh tokens (their client binding no longer matches); affected couples
   see the broken-connection state (`calendarSync.status.broken`) and reconnect.

## Consent binding

The consent may finish in a different browser than the eimir. session (the
Android app uses the system browser), so no browser-binding cookie is used.
The start request names the return (`returnTo`: `web` same tab, `app` the
app link `de.eimir.app://calendar/google`, `page` the localized return page
for older app builds); every return carries only the fixed outcome. Another
app claiming the custom scheme could at most learn that outcome: the pending
connection still needs the signed-in person's confirmation inside eimir.
State + PKCE bind the code to the started transaction (10 minutes, single
use, encrypted verifier). A returned consent only creates a **pending**
connection for the starting Account; it is listed to that Account only and
must be confirmed in eimir. with the shown Google account address before it
can list calendars or become a target. Unconfirmed connections expire after
24 hours and are purged only when the same Account starts another consent,
never by opening the settings. A forwarded or injected consent therefore
cannot silently attach a foreign calendar. The callback logs only a fixed
outcome and reason code (`calendar google consent`), never state, code,
token or provider text.

## Data flow and privacy

- Sent to the chosen calendar: Plan title, description, place name, schedule
  and a link to the Plan. Discreet Plans send only the list title and schedule.
- Stored by eimir.: encrypted credentials/refresh token, the target calendar
  reference and name, and per Plan the event reference, UID and ETag. No
  calendar contents are read or stored.
- Removing a connection revokes the Google grant (best effort) and deletes
  credentials; events in the calendar stay. Account deletion removes
  connections and open consents; a sponsor leaving the Space ends its target.

## Opening the Plan from a calendar event

- The first line of a regular synced event's description is a localized
  “Open in eimir.” link, even when the Plan has no description. In Google
  Calendar it uses the event's HTML description. CalDAV clients can use the
  iCalendar HTML alternative (`ALTREP`), the plain-text first line with the
  short address, or the standard `URL` property, depending on the client.
- The short address uses `EIMIR_PUBLIC_BASE_URL` and a compact Plan ID. It
  opens the existing Plan detail route with the same sign-in and Space access
  checks. The address does not grant access or contain a credential.
- On the next full sync (including “Sync now”), active events written before
  this format update get the link through the existing event mapping. The
  provider version check still protects externally edited appointments.

## Acceptance status

| Item | Status |
| --- | --- |
| Adapter behaviour against CalDAV response styles (relative/absolute hrefs, missing ETag, missing privilege set, well-known redirect) | Automated (fixtures) |
| Google Calendar API behaviour (ids, ETags, cancelled ids, rate limits, refresh, revoke) | Automated (API double) |
| Live CalDAV server | Radicale 3.5.4: protocol check passed locally (discovery, listing, conditional create/update/delete, 412 semantics, full-URL fallback; transport shimmed for loopback). Nextcloud/Sabre, SOGo, Baïkal: **not yet verified** |
| Live Google account with the operator's OAuth client | **Not yet verified**; requires the Google setup above |
| Android app consent via system browser and app return link | Not verified on a device |
