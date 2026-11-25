# Google Play Billing: owner setup and operations (#1525)

The Android purchase sheet, backend verification and real-time notification
handler are covered by tests with simulated Play responses. The last operator
update (2026-11-16) confirms the verified developer account, payments profile
and app entry `de.eimir.app`. The owner paused the remaining billing setup at
that point pending end-to-end encryption and a production environment with S3
storage. There is no recorded purchase on a Play-installed build. Section 5 covers the
checks to complete when setup resumes.

Only the account owner can perform these steps. No password, two-factor code,
bank/tax detail or private key belongs in an issue, a pull request or a chat.

## 1. Play Console (owner)

1. Select the verified developer account and its existing **payments profile**.
2. Open the app entry for `de.eimir.app`, verify the release build uses that
   package and upload a signed build to the **internal testing** track.
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
| On hold, paused, expired | `EXPIRED` (Free). Feature-specific access and cleanup apply as described below. |
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
- The app passes Play an opaque reference for the sponsor Account and Space,
  and the chosen subscription offer. The backend uses the Play purchase token
  to verify and acknowledge the subscription. It records a hash of the token,
  product, plan, status and validity. The checkout uses the purchaser's Google
  account and payment method. eimir. sends no names or relationship content
  with the reference and its billing logs omit purchase tokens.
- When Pro expires, existing memories and authorized videos remain readable.
  The garden stays stored but requires Pro to open again. Partner location
  sharing ends and its stored positions are cleared.
  [Feature matrix](../FREEMIUM-FEATURE-MATRIX.md) · [Partner location](../m9/PARTNER-LOCATION.md)

## 5. Check the listing, checkout and subscription lifecycle

Use the release candidate installed from the internal Play track with a
licensed test account, a disposable eimir. Space and a **Play test payment
method**. Complete actions on test accounts only. Record the version code,
test market, plan, date and observed outcomes in the release record. Redact
account identifiers, order numbers and tokens. [Play Billing tests](https://developer.android.com/google/play/billing/test)

| Check | Evidence to collect |
| --- | --- |
| Public listing links | Open [privacy](https://app.eimir.de/legal/privacy) and the [deletion request](https://eimir.de/konto-loeschen/) while signed out. The privacy notice must show the released text. The deletion resource must identify eimir., offer a working request without reinstalling the app, and explain deletion and retention. Test that the operator receives a request from a disposable account, verifies ownership and completes deletion. Check the in-app deletion path separately. Enter the verified URLs in Play Console. [Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111) |
| Data safety | Reconcile the signed build, enabled services, shipped SDKs and current privacy notice with the whole form. Include account identifiers, user content, optional [location](play-data-safety-location.md), device/diagnostic data and the purchase history used to provide Pro. Distinguish the checkout's payment details held by Play from the purchase data eimir. processes. Apply Play's collection, sharing and exemption definitions to each flow. Check the displayed listing after publication. [Google's Data safety definitions](https://support.google.com/googleplay/android-developer/answer/10787469) |
| Offer and purchase | Inspect the actual monthly and annual offers in the release market. Check seller, final price and tax, renewal and cancellation terms, and eligibility, duration and post-trial charge if a trial is offered. Compare the listing, eimir. paywall, Play sheet and purchase confirmation with the released terms. Complete a test purchase and confirm that both partners gain Pro and the purchaser receives the Play confirmation. |
| Withdrawal and cancellation | For a German offer, check access to the withdrawal information and model form before the order, then the electronic withdrawal and receipt route during the withdrawal period. Record what the signed-in customer can actually do. Exercise ordinary cancellation separately through Play subscription management and verify the effective end date. An informational help page or an admin refund alone does not establish the customer withdrawal flow. [Google Play terms](https://play.google.com/intl/ALL_de/about/play-terms/) · [§ 356a BGB](https://www.gesetze-im-internet.de/bgb/__356a.html) |
| Restore, payment failure and expiry | Restore an active test purchase with the sponsor account. Reproduce a failed renewal and compare the grace and hold periods with the actual Play configuration and Space access. After expiry, verify Free access to memories, the gated garden and stopped location sharing. |
| Refund and revocation | Use a separate test purchase for a voided refund or revocation in Play. Confirm delivery of the authenticated notification and the resulting loss of Pro in the Space without a new purchase submission. Keep evidence of the store and app states. |

## 6. Still open (Product Owner)

- Sections 1–3 except the verified account, the payments profile and the app
  entry. Next step when work resumes: create the Android **upload key** and
  store it in the protected `production-release` GitHub environment. Confirm
  the signed build with the Billing permission is available on the internal track.
- Complete the store and device checks in section 5 against the release candidate.
- The base plans the 7-day trial applies to.
- Review of regional prices and tax presentation Google derives.
- Store listing, data-safety form and subscription terms text.
- Self-Hosted Pro delivery (signed license issuance), defined later.
- App Store (iOS) adapter at the iOS launch.
