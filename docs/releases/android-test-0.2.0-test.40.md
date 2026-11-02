# Android test.40 integration

The Product Owner requested completion and merge of #1604 followed by a new
published test APK on 2026-11-02. Integrate its reviewed product source and the
landed #1601 App Links and post-login Push setup into the existing test foundation.
Publication must follow the #1604 merge and successful exact-source checks.
The foundation remains a draft and must not merge into main.

Reuse the existing protected publisher, canonical package `de.eimir.app`,
certificate `1d403a18b4d3694f8e5fd9853906a60c012644d23e5a3a1ef40819b119cb1da9`,
FCM project `eimir-production`, persistent API origin and normal registration.
Test.39 is the same-package/same-key predecessor. Keep its published immutable
bytes, the protected environment and branch allowlist, strict dependency
verification, source checks, native policy tests and draft-first/marker-last
publication. The plan stays on test.39 until the candidate is checked and #1604
has merged; select test.40 in a separate plan-only commit afterward.

Product design and collaborative-content/privacy acceptance belong to #1603 and
#1604. Their Compact/Expanded, Light/Dark, large-text, reduced-motion and complete
interaction evidence applies to the identical packaged Web UI. Preserve the
existing updater-only UI and mobile interaction contract from #1331. The merge
does not add a new screen, provider, dependency, entitlement, storage quota or
schema migration. Free/Core classification and Cloud/Self-Hosted parity remain
unchanged. No signing credential enters source, logs or public release assets.

Verify the signed APK's version/code, signer, SDK, FCM resources, embedded source
and predecessor continuity before publication. Independently verify all four
published assets and provide the APK in the conversation. Matching Web/API
deployment, actual Android installation, OS App Links, login/session continuity
and real Push delivery remain separately observed acceptance boundaries.
