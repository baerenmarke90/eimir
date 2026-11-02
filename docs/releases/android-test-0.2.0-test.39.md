# Android test.39 integration

Integrate checked main `38bd4e6ac544e5da6adf425749621dce62773e42`
into test.38 orchestration `75a65debe39768b5380fc1d0e1ab8674e4576edc`.
The second parent contains merged #1592, #1593 and #1594 in dependency order.
Keep the plan at immutable test.38 until this exact combined source passes all
required checks. Only then select it with a separate plan-only commit.

Reuse the existing protected Android test publisher, predecessor certificate,
persistent API origin, regular mode, native updater and strict source gates.
No new provider, signing identity, infrastructure, entitlement or quota is added.
Cloud/Self-Hosted product behavior remains the accepted main behavior.

Resolve integration by retaining both updater registration and main's bounded
native push/recovery integration, both browser inventories and both Android
runbook sections. The sideload variant explicitly retains `de.sidebyside.app`;
ordinary release/debug retain main's new `de.eimir.app` identity. Do not migrate
or delete either sandbox. No FCM configuration or Play publication is introduced.

Product design, behavior and visual evidence remain those accepted in #1591,
#1592, #1593 and #1594 and linked from #1590; packaging adds no new composition.
The Product Owner's 2026-11-02 scoped decision in #1590 moves physical-device
cold-start/resume/process-loss acceptance to the test-release stage. This is
not evidence those tests passed or that the reported device crash is diagnosed.
Existing sideload upgrade/session/Space/data, App Links and accessibility device
acceptance remain pending. Signing and automated checks do not establish them.

The matching Web/API test deployment uses main's existing private-channel
publisher and `deploy/eimir-test`; verify its selected source independently.
Published Android artifacts remain immutable, draft-first and marker-last.

## Sideload identity classification

The combined source exposed the new project-identity scanner's lack of awareness
of the existing test-channel package. Keep ordinary Android application IDs and
all unclassified branding rejected. Recognize only the exact existing sideload
variant setter, test publisher package constants, bounded updater fixtures and
runbook package literals as temporary upgrade compatibility. Published test.14
through test.38 evidence remains immutable history; future releases are not
blanket-exempt. Negative cases retain rejection of ordinary manifests/default
applicationId, foreign paths, alternate package names and mixed branding.
The 17 scanner tests and classification of all 47 originally rejected
occurrences across 34 actual source files pass before fresh hosted validation.
