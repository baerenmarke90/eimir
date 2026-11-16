# Google Play Billing: owner setup and operations (#1525)

Status: **code ready, store not configured.** The backend adapter, the
notification endpoint and the Android purchase sheet exist and are tested with
mocked Google responses. Nothing below has been set up yet; no real or test
purchase has been made. As of 2026-11-16 (Product Owner) the Play developer
account is verified, the payments profile is set up and the app `eimir.`
(`de.eimir.app`) exists in Play Console. Everything else is **paused on
purpose** until end-to-end encryption and the eimir. production environment
with S3 storage are in place: the upload key, the first signed bundle, the
subscription, the license testers, Google Cloud and the server configuration.

Only the account owner can perform these steps. No password, two-factor code,
bank/tax detail or private key belongs in an issue, a pull request or a chat.

## 1. Play Console (owner)

1. Create a **payments profile** (merchant account) in Play Console. The
   developer account itself is verified.
2. Create the app with package name `de.eimir.app` (or the package used for the
   release build) and upload a signed build to the **internal testing** track.
   A build that includes the Billing Library declares the
   `com.android.vending.BILLING` permission automatically.
3. Monetize → Products → Subscriptions → create **one subscription** with the
   product ID `eimir_pro` and two auto-renewing base plans:
   - `monthly`: 1 month, EUR 7.99 (Product Owner target price);
   - `yearly`: 1 year, EUR 59.99.

   Play derives other countries' prices; review them before activating.
4. Free trial (Product Owner decision 2026-11-16: **7 days**): add an offer
   with a 7-day free-trial phase to the base plan(s) that should have one,
   eligibility "new customers". The app shows a trial only when Google offers
   it to the signed-in customer, so the duration is configured in Play Console
   only and needs no code change.
5. Settings → License testing: add the testers' Google accounts. Test track
   installation alone does not make purchases free.
6. Monetization setup → set the grace period / account hold you want. The app
   follows whatever Google reports; it adds no extra paid-access window.

## 2. Google Cloud (owner or delegated admin)

1. In the Google Cloud project linked to Play Console, enable the
   **Google Play Android Developer API** and **Cloud Pub/Sub**.
2. Create a service account for purchase verification. In Play Console →
   Users and permissions, invite it with app-level permissions
   "View financial data, orders, and cancellation survey responses" and
   "Manage orders and subscriptions". Download its JSON key **once** and give
   it to the server operator through the secret store (never by mail or chat).
3. Real-time developer notifications:
   - create a Pub/Sub topic (for example `play-billing`) and grant
     `google-play-developer-notifications@system.gserviceaccount.com` the
     *Pub/Sub Publisher* role on it;
   - create a **push** subscription to
     `https://<cloud host>/api/v1/billing/google-play/notifications` with
     authentication enabled, a dedicated push service account and the audience
     set to the same URL;
   - in Play Console → Monetization setup, enter the topic name and send a
     test notification (the backend accepts and ignores it).

## 3. Server configuration (operator)

eimir. Cloud only (`EIMIR_DEPLOYMENT=cloud`); a Self-Hosted instance rejects
these settings and keeps the signed offline license.

| Variable | Value |
| --- | --- |
| `EIMIR_BILLING_GOOGLE_PLAY_PACKAGE` | the Play package name |
| `EIMIR_BILLING_GOOGLE_PLAY_CREDENTIALS_FILE` | absolute path of the mounted service-account JSON |
| `EIMIR_BILLING_GOOGLE_PLAY_PRODUCT_ID` | `eimir_pro` (default) |
| `EIMIR_BILLING_GOOGLE_PLAY_MONTHLY_BASE_PLAN` | `monthly` (default) |
| `EIMIR_BILLING_GOOGLE_PLAY_YEARLY_BASE_PLAN` | `yearly` (default) |
| `EIMIR_BILLING_GOOGLE_PLAY_RTDN_AUDIENCE` | the push subscription audience URL |
| `EIMIR_BILLING_GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT` | e-mail of the push service account |

Without the package and credential file the app shows no purchase button.
Without both notification values the endpoint rejects every request with 401;
renewals, refunds and expiry then reach the Space only when the app submits the
purchase again, so notifications are required for production.

## 4. Behavior reference

| Google state | Space entitlement |
| --- | --- |
| Pending payment | nothing granted; Pro follows the later notification |
| Active (also cancelled-but-paid) | `ACTIVE` until Google's expiry |
| Active with a free-trial phase | `TRIAL` until Google's expiry |
| In grace period | `GRACE_PERIOD` until Google's (grace-extended) expiry |
| On hold, paused, expired | `EXPIRED` (Free); content stays intact |
| Refunded (voided) or revoked | `REVOKED`, terminal for that purchase |

- One subscription per Space: a second purchase is refused while the Space has
  Pro (`BILLING_SPACE_ALREADY_PREMIUM`). Two partners buying in the same second
  is not prevented by the store; such a duplicate must be refunded in Play
  Console.
- The backend acknowledges each purchase after recording it. If acknowledging
  fails, the next submission or notification retries; Google refunds purchases
  that stay unacknowledged for three days.
- Restore: only the sponsor Account can submit its purchase. The grant stays
  with the Space it was bought for while the sponsor is still a member there;
  after the sponsor left, restore moves the paid grant to the sponsor's current
  Space.
- Google receives only the opaque purchase reference (UUID) and the selected
  plan, never names, e-mail addresses or relationship content. Logs record
  fixed codes, never purchase tokens.

## 5. Still open (Product Owner)

- Sections 1–3 except the verified account, the payments profile and the app
  entry. Next step when work resumes: create the Android **upload key** and
  store it in the protected `production-release` GitHub environment (it is
  empty today); Play Console only accepts subscriptions after a build with the
  Billing permission is uploaded.
- First real test purchase with a license tester on a Play-installed build,
  including cancel, restore, refund and expiry (device evidence).
- The base plans the 7-day trial applies to.
- Review of regional prices and tax presentation Google derives.
- Store listing, data-safety form and subscription terms text.
- Self-Hosted Pro delivery (signed license issuance), defined later.
- App Store (iOS) adapter at the iOS launch.
