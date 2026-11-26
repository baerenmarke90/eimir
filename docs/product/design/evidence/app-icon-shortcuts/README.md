# App icon quick actions

The owner requested three native icon-menu entries for Android and iOS:
Capture a moment (`Moment festhalten`), Add a wish (`Wunsch hinzufügen`), and
Create a plan (`Plan erstellen`). This change opens the existing Memory, Wish
and Plan composers; it never creates content before their existing Save action.

## Baseline and product contract

Reviewed main `f54181f0fa2f0f1bda64b1b85a29dd80935e9f7a` before implementation.
Product Reference v1 R1/R3, Screen Templates section 9 and the shared focused
task/Back contract govern the unchanged destination pages. The native menu is
owned and styled by the OS; no new page, form, token, motion or keyboard behavior
is introduced. Selection is one deliberate task entry. The existing composers
retain content/visibility, enrichment, Save, errors, offline and return behavior.
Dirty/submitting work defers a different action with the existing accessible
snackbar. Reselecting the current editor leaves its draft and history key intact.
Compact is primary; Expanded and reduced motion use the same task semantics.
No romantic microcopy or decorative motion is appropriate in this OS utility.

The menu uses the OS app language (German/English). It has generic labels only:
no partner names, private titles, Account/Space IDs or authored content. The
shortcut keys are a closed list; the current authorized Space owns the composer.
The bridge holds only one latest request and an opaque ID in process memory.
It waits across bridge readiness, sign-in and Space selection, then acknowledges
that exact ID. An older acknowledgement cannot remove a newer tap. Android
removes the accepted intent extra so Activity recreation cannot replay it.
The pending request is not promised across process death.

Android registers the same static resource on all eleven launcher aliases and
targets an affinity-free, invisible AppShortcutActivity with the variant's actual
package ID. Android adds CLEAR_TASK to static-shortcut intents; the disposable
entry uses literal package names in main/debug resource overlays, because the
OS shortcut parser does not resolve targetPackage string references. The
entry forwards only the closed action to the permanent singleTask LauncherActivity
with a fresh intent and no CLEAR_TASK. This prevents a warm shortcut from destroying
the existing WebView/draft. The instrumented regression launches the actual entry
with the OS-supplied flags and asserts the same shell instance survives.
iOS registers static plist items, localized InfoPlist strings, and handles both
cold Scene connection options and warm UIWindowScene quick-action callbacks.

## Reuse and business review

Selected Android static App Shortcuts and UIKit Home Screen Quick Actions with
the established local Capacitor-plugin pattern. Reviewed Capacitor App API,
Capawesome capacitor-app-shortcuts (Capacitor 8, runtime set/get/clear/click),
capacitor-app-actions (recommends Capawesome), and Capgo capacitor-app-intents
(broader Siri/Spotlight integration). The narrow local bridge supplies the
pending peek/conditional acknowledgement contract and preserves eimir's aliases
and debug package without introducing a plugin dependency or external service.
No third-party source was copied. Original Android symbols are in PROVENANCE.md;
iOS uses system symbols.

No business/freemium impact: these are Free/Core entry points to existing
Memory/Wish/Plan authoring. Existing upload/feature entitlements, membership,
Cloud/Self-Hosted, quotas, costs, retention and downgrade behavior are unchanged.
No backend/API/migration, network request, permission or durable data is added.

## Validation and evidence

The eight `app-shortcuts.spec.ts` browser journeys run the real App and composers
with native bridge simulation: all three cold actions wait through sign-in,
open the right editor without the keyboard, save explicitly and show the result;
both warm journeys preserve the current draft and defer Wish entry until Save.
Hook regressions cover StrictMode, stale peek results, latest-wins, acknowledgement,
browser/older-build fallback and listener cleanup. Packaging tests check every
Android alias and German/English parity. Android unit tests cover the delivery
queue; the existing instrumented LauncherIconsTest additionally exercises parsed
debug-package shortcut intents and the cold/warm registered native bridge.

The PNGs are browser evidence, **not screenshots of an OS icon menu**:

| Simulated bridge | Compact 390 px | Expanded 1024 px |
| --- | --- | --- |
| Android / Light | [Moment](android-moment-390.png), [Wish](android-wish-390.png), [Plan](android-plan-390.png) | [Protected draft and waiting feedback](android-waiting-1024.png) |
| iOS / Dark + reduced motion (Compact) | [Moment](ios-moment-390.png), [Wish](ios-wish-390.png), [Plan](ios-plan-390.png) | [Protected draft and waiting feedback, Light](ios-waiting-1024.png) |

The native build/device status and exact tested revision are recorded in the
owning PR. Local host: Windows, Node/npm/Chromium available; no Android SDK/JDK
or macOS/Xcode. Android's existing labelled CI compiles and runs the native tests.
The iOS native workflow builds the complete app for the simulator on macOS,
without signing, for labelled ready PRs and the shared nightly regression.
Its result and the Android native result are recorded in the owning PR. Actual
iPhone menu/cold/warm acceptance remains a device/release check; no physical-device
pass or store publication is claimed here.
