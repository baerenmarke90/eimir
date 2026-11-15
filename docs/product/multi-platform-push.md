# Browser and iOS push

Browser Web Push and native iOS APNs are opt-in registrations for the current
Account and device session. The existing Outbox, delivery queue, recipient
preferences, Quiet Hours and authorized notification open endpoint serve both
transports. They deliver **eimir.** and **You have new messages.** (German
**Du hast neue Nachrichten.**) with an opaque notification reference. Content is
resolved after an authenticated tap. Browser push displays a user-visible system
notification when active, as required by the Web Push platform. Android and iOS
refresh the open app quietly in the foreground.

One-time messages wait for the recipient's Quiet Hours and remain subject to
their normal expiration, discard, withdrawal and claim rules. Provider
retention is capped at the remaining notification lifetime. A compatible
Android build passes a neutral encrypted reference to the same open endpoint.
Generic Android wakes from older registrations open the inbox. Opening the
sealed page does not claim the message.

## Browser Web Push

Configure `EIMIR_PUSH_VAPID_PRIVATE_KEY`, `EIMIR_PUSH_VAPID_SUBJECT` and
`EIMIR_PUSH_BROWSER_ALLOWED_ORIGINS` on both API and worker. The latter is a
JSON list of exact trusted HTTPS push-service origins. Confirm the origins for
the target browsers. Common examples include `https://fcm.googleapis.com` and
`https://updates.push.services.mozilla.com`. Apple's current deployment
documentation calls out `*.push.apple.com`; add the exact observed Apple
push-service origins to the allowlist. UnifiedPush uses its own origin list
`EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS`. Registration does not authorize arbitrary
server egress. The sender pins a checked global address and verifies TLS.

Use the Notifications settings switch in a supported secure browser. On iPhone
and iPad, add the site to the Home Screen and open that installed web app before
enabling push. On a service-worker upgrade, reopen eimir. when prompted so the
active worker can receive notifications. Use one account per browser profile for
push. Separate browser profiles or installations can opt in independently.
If a VAPID key changes, disable and re-enable browser push to create a
subscription with the new key.

## Native iOS

Build the same Web app by setting `VITE_EIMIR_API_BASE_URL` to the HTTPS
instance and running `npm run cap:build:web` from `web/`. Run
`npx cap sync ios` and open `ios/App/App.xcodeproj` in Xcode 26 or newer.
Choose the authorized signing team, provision `de.eimir.app` with Push
Notifications, and use a physical signed device. Debug uses the APNs development
environment. Release uses production. The platform's session credentials
are stored in a device-only Keychain slot per instance.

For Compose, include `deploy/push-apns.compose.yaml` after the root Compose
file on the existing stack. Configure the bundle ID, Apple Team ID, key ID,
APNs environment and private host-file path as shown in `.env.example`.
The fragment mounts the key read-only in the API and worker. With a custom
runtime, mount it directly and set `EIMIR_PUSH_APNS_KEY_FILE` to the in-container
path. Allow the service user to read the file (UID 10001 in the canonical
image) and restrict access on the host. Prepare separate development and
production installations when accepting both types of native build. The
settings switch requires a matching bundle and APNs environment.

Verify a real partner event through the worker, device delivery and tap, and
test app foreground, background, cold start, denial, disable, sign-out, and the
original account's revoked or expired session. Provider receipt and a simulator
fixture establish different evidence from delivery on a signed device.

## Product and provider decisions

Notification delivery remains Free/Core in Cloud and Self-Hosted. One-time
message sending retains its existing Pro entitlement. Standard Web Push reuses
the existing pywebpush/VAPID path and browser permission. APNs uses the standard
Apple HTTP/2 API, existing HTTPX and PyJWT, and the official Capacitor iOS
template. Apple and browser push services receive technical routing metadata
and neutral system copy where applicable. No notification SaaS subscription
is required. Operator configuration, signing and any platform-account costs
belong to the operator. The in-app inbox remains available independently.

- [W3C Push API](https://www.w3.org/TR/push-api/)
- [WebKit Home Screen web push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Apple APNs HTTP/2 requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [Capacitor iOS](https://capacitorjs.com/docs/ios)
