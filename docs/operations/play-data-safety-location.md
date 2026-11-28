# Google Play: location declaration for partner distance (#1792)

What the owner of the Google Play listing enters for eimir.'s location features before an Android
build with the precise choice (PO 2026-11-17) is released. The Play Console is a Google account
resource; nothing here can be changed from the repository. The facts below are the source for the
form; the Play form itself wording may change, so compare it with the current form when entering.

Sources of the facts: [`docs/m9/PARTNER-LOCATION.md`](../m9/PARTNER-LOCATION.md),
[`docs/CAPACITOR-ANDROID-FOUNDATION.md`](../CAPACITOR-ANDROID-FOUNDATION.md),
[`legal/de/privacy-policy.md`](../../legal/de/privacy-policy.md) section 9.

## 1. Permissions the build declares

| Permission | Used for | When it is asked |
| --- | --- | --- |
| `ACCESS_COARSE_LOCATION` | Approximate partner distance (default) | Only after the person turns sharing on or looks at the distance |
| `ACCESS_FINE_LOCATION` | Precise foreground measurement and eligible passive fixes if background sharing is also enabled | Together with the coarse permission, only after that choice; Android 12+ lets the person keep "Approximate" |
| `ACCESS_BACKGROUND_LOCATION` | Optional background update (second opt-in), passive provider only | Only when the person switches the background toggle on |

Nothing is requested at install or first launch. A person who never turns the feature on is never
asked. With background sharing enabled separately, eimir. can publish a precise, rounded passive fix
if the person chose precise sharing, granted the fine permission and the received fix qualifies.
The app starts measurements only in the foreground. [Android background policy](../../android/app/src/main/java/de/eimir/app/PresenceBackground.java)

If the listing already carries the background location declaration, the use case and the in-app
disclosure screen are unchanged. The new fine permission needs no separate Play permission form;
it is covered by the Data safety answers below.

## 2. Data safety form

| Data type | Collected | Purpose | Optional | Shared with third parties |
| --- | --- | --- | --- | --- |
| Approximate location (Play category) | Declare if the shipped app collects fixes covering at least 3 km², including OS-provided coarse fixes | App functionality (distance to the partner) | Yes, off by default | No third party; the partner sees only a distance band or a map area (see note) |
| Precise location (Play category) | Yes. Even the default 0.01° grid can locate a device within less than 3 km² when the source fix allows it. | App functionality (distance to the partner, optional map area) | Yes, off by default | No third party; same as above |

- **Processing:** the position is rounded on the device (about 1.1 km, or about 111 m for precise),
  sent over TLS, kept as one replaceable snapshot per person for at most 24 hours, deleted at once
  when sharing stops, stored encrypted at rest and never part of an export. No history, no
  advertising, no analytics, no sale.
- **Data deletion:** the person can stop sharing at any time in the app, which deletes the
  snapshot; deleting the account removes the rest. Both are available in the app and described in
  the privacy policy.
- **Note on "shared":** the partner is another user of the same service chosen by the person, not a
  third party that receives data from us. Decide with the legal review whether the form treats this
  as a user-initiated transfer; the privacy policy describes it either way.
- **Encryption in transit:** yes. **Users can request deletion:** yes.

## 3. Before the release is published

1. Verify the [public privacy notice](https://app.eimir.de/legal/privacy) describes foreground and
   passive background use, both precision settings and withdrawal in section 9. Use the effective
   published version in the listing and check the [app-wide Data safety and deletion details](google-play-billing.md#5-check-the-listing-checkout-and-subscription-lifecycle).
2. Align the release build's device permissions, location disclosure and actual transmitted fixes
   with [Play's definitions](https://support.google.com/googleplay/android-developer/answer/10787469)
   for approximate (at least 3 km²) and precise location (less than 3 km²). Include eligible
   passive background updates. The in-app setting names alone do not establish the Play category.
3. Run the open device check on a real phone (fix quality and rounding, the Android permission
   dialog including a later downgrade to "Approximate", 24 hours of battery use).
