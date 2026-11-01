# Android test.37 source integration

The Product Owner explicitly requested an Android test APK containing the accepted
PR #1568 and #1573 changes. The separately published backend/Web test channel does
not update bundled Android code and does not satisfy that request.

Integrate accepted main `a56b84af07f3cfbda9b48cf2747c543aff9cf3be` into the existing
test.36 source/foundation. Retain the sideload updater, native calendar, encrypted
session persistence, package `de.sidebyside.app`, original test certificate,
persistent `https://demo.eimir.ur-cloud.de` origin and disabled Demo/reset behavior.
The sole merge conflict combines the existing App Updates and new journal browser
registrations; neither coverage set is removed. No product runtime conflict or
new UI composition is introduced.

Product design, generated reference, mobile interaction contract, reuse,
business/freemium and cross-cutting decisions remain those of the accepted
product PRs and the existing #1331 foundation. The daily-question/notification
implementation retains all approved original prompts, unlimited free writing,
canonical drafts/history and recipient/privacy boundaries. Packaging changes no
entitlement, quota, retention or Cloud/Self-Hosted behavior.

Keep the existing protected publisher and all exact-source gates. First validate
this combined clean source through PR #1443 without merging the sideload
foundation into main. Only then select the immutable source in a separate
plan-only commit for versionName `0.2.0-test.37`, versionCode 37, above test.36.
Verify the predecessor and original certificate, actual signed APK identity,
complete draft assets and anonymous updater-visible publication. Existing assets
remain immutable; signing material stays within the protected environment.

Device installation/session/data continuity remains the testers' acceptance;
the automated release does not claim those observations.
