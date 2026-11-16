# PDF attachments on Plans

Baseline `ca807522796c6bb05e5b53cc2207ca884bc6ad4c`. Reviewed the canonical Plan create/edit composer, date and Place context, photo gallery, linked lists and tags, Plan reader and Android wrapper. The built-in ImageGen tool produced the [Compact composition](compact-reference.png) from the reviewed #1730 Plan edit and detail captures. The [generation prompt](prompt.txt) records the intended composition.

## Mobile interaction contract

- Follow Product Reference v1's Plan and content-first composer patterns. The Plan and Save remain the reading focal point and primary edit action respectively. The existing toolbar gains a labeled paperclip beside Photo. The device picker returns multiple PDFs. Rows under the description show filename, size and progress or validation state. Failed uploads can be retried or removed. Removing a saved file is staged until Save.
- Compact uses one column and existing composer targets, spacing, colors and typography. Expanded keeps the same hierarchy. Read mode shows Files only when there are attachments. File actions remain reachable at large text sizes. Status announcements are textual. Existing press feedback and reduced-motion rules apply.
- Saving publishes validated files with the Plan. Abandoning the draft leaves any unbound data for the existing cleanup. An offline connection prevents file transfer and opening and preserves the current editor. A version conflict retains pending file additions and removals. A subsequent save applies them to the latest Plan version.
- Android uses the WebView's system document chooser and a read-only system viewer handoff. The browser opens the PDF in its viewer and offers a download action. The branch is determined at runtime. Open and download failures stay local to the file action. A Plan's current audience controls access.
- The Plan shows a compact saved status with a small check. File actions sit beside the name as icon buttons with tooltips, accessible labels and 48 px touch targets.

## Reuse and business model

Reuse the Attachment API, MediaStore, upload queue, worker validation, Plan editor lifecycle, system PDF viewers, and AndroidX FileProvider already shipped in the app. The PDF container is identified using the registered format's framing, without rendering document contents on the server. One small Android bridge streams the authorized file into app-private temporary storage and grants the viewer read access. The same attachment lifecycle serves Cloud and Self-Hosted without an additional provider or account setup. [PDF media type](https://www.rfc-editor.org/rfc/rfc8118.html) and [Android FileProvider](https://developer.android.com/reference/androidx/core/content/FileProvider).

Business/freemium impact reviewed. Plan PDFs are Free/Core like Plan photos. The 25 MiB per file limit and the existing 20-item attachment safety bound protect shared resources. Cloud files use the Space storage allowance where applicable. Self-Hosted files use the operator's storage. Current Plan access, removal, and essential export/restore remain available regardless of subscription.

## Validation

- PostgreSQL migrated from an empty database and verified the `0119` to `0120` upgrade after a downgrade. The attachment and Plan suites passed 104 tests. Three PDF cases were rerun after the final transfer change and passed. Coverage includes format and size, the current Plan version, partner and cross-Space access, removal, and export/restore.
- The 42 Plan and Attachment integration tests passed after correcting an upload status request that returned 404 before binding. The regression test checks that the uploader can read `PROCESSING` and `READY` metadata and that PDF content requires a saved Plan.
- Chromium covered 42 Plan and composer scenarios. Three existing scenarios timed out in the parallel run and passed in a serial run. The two PDF journeys passed on the final fixtures. They exercise retry, browser viewing and download, removal, and Android-mode selection and viewer handoff with a simulated Capacitor bridge.
- The Android debug build assembled with Java 21 and passed 19 JVM tests. On an Android 15 emulator (API 35), the system picker returned `Reservation.pdf` and the Plan saved it. A separate PDF test viewer opened the one-page file, matched the original SHA-256, and verified read-only access. Closing the viewer returned to the same Plan and cleared its temporary copy. [System picker](evidence/plan-files-android-api35-picker.png) and [external viewer](evidence/plan-files-android-api35-viewer.png).
- Ten Chromium scenarios passed after the layout correction. The Compact browser journey verifies the saved status height, adjacent 48 px targets, and both file actions. The simulated Android journey verifies the open action and its platform handoff.
- Runtime captures show the [Android editor](evidence/plan-files-android-editor-360-light.png), [Android-mode Plan](evidence/plan-files-android-detail-360-light.png), [Compact browser](evidence/plan-files-browser-390-light.png), and [Expanded dark browser](evidence/plan-files-browser-1280-dark.png).
