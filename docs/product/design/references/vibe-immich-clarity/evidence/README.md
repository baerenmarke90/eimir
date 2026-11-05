# Daily Vibe and Immich — runtime acceptance

Runtime checkpoint: `4a6a24cec`. The source fingerprints in
[sources.json](sources.json) bind the captures to the actual implementation.
All content is synthetic. No user attachment pixels or personal library data
were published. The generated reference and Mobile Interaction Contract were
published in PR #1659 before UI work.

## Result and root cause

Five short feelings replace a mixed seven-choice catalogue in new selections.
Each choice has a separate check column and keeps words intact; large text uses
the sheet's own container width to omit decorative glyphs before text crowds.
Existing current-day needs values remain readable, selected and unchanged until
the owner deliberately changes/removes them. A lined-note icon marks nonblank
own/authorized partner notes. Hidden or absent partner notes have no indicator
or destination. Opening a note retains the existing reveal-aware short sheet.

Photo reads previously used POST. The enabled, pinned Capacitor 8.5.2 bridge
sends mutating Fetch requests through native HTTP without a binary response
type; its default TEXT conversion corrupts non-UTF-8 image bytes. GET uses the
existing binary-preserving local HTTP interceptor. The new regression executes
the installed bridge unchanged, reproduces POST corruption as a negative
control and verifies byte-identical GET thumbnails/originals, authentication,
abort signal and explicit no-store transport. No native adapter or SDK is copied.

The API now publishes authenticated GET and retains POST as a compatibility
alias under the same owner/Space/device, expiry, entitlement, bounds and late
revocation checks. Both methods return private/no-store/nosniff responses. Real
JPEG bytes survive the API and the existing image decoder in integration tests.
No original transfers before explicit import; no new provider or network trust.

Failed imports keep their selected IDs. Partial success transfers the accepted
files once and retries only the remaining selected IDs in the same source task.
The wider responsive preview grid keeps recovery controls reachable, including
large text. Authored diary content, normal upload validation and canonical
Memory/Plan/HeartMoment save behavior remain intact.

## Visual evidence

| State | Compact | Expanded / large text |
| --- | --- | --- |
| Visible note markers on Wir | [360 Light](vibe-notes-360-light.png), [390 Dark](vibe-notes-390-dark.png), [430 Light](vibe-notes-430-light.png) | [1280 Dark](vibe-notes-1280-dark.png), [320 Dark / 200%](vibe-notes-320-dark.png) |
| Five feeling choices and optional note | [360 Light](vibe-feelings-360-light.png), [390 Dark](vibe-feelings-390-dark.png), [430 Light](vibe-feelings-430-light.png) | [1280 Dark](vibe-feelings-1280-dark.png), [320 Dark / 200%](vibe-feelings-320-dark.png) |
| Immich import recovery | [Partial failure](immich-import-recovery-1-390-light.png), [Full failure](immich-import-recovery-2-390-light.png) | Complete capture suite also covers 320/360/390/430/1280, themes, offline and large text |

## Behavior and validation

- 78/78 cases pass across both complete affected browser specifications. They
  cover open, feeling selection, note save/reveal, actual result, route return,
  removal, keyboard/Back/focus, pending/failure/retry, Energy isolation, draft
  recovery and canonical selected-photo saves. The final note-icon captures
  repeat the five complete viewport/theme save-and-return journeys.
- All five choice labels remain on one line, with targets at least 44 CSS px,
  at 360/390/430/1280 and 320px/200% text. Axe checks pass in the reviewed states;
  reduced motion retains every action and result. Existing normal-motion sheet,
  reveal and focus journeys pass.
- Preview retry issues a fresh read, decodes the actual fixture and does not
  toggle selection. Full/partial import retries preserve authored text, avoid
  duplicate successful imports and save exactly two bound photos.
- 119 backend unit and 30 isolated PostgreSQL/API cases pass, including both
  read methods, real JPEG decoding, foreign owner/device/Space, cancel, expiry,
  Pro loss and provider security gates. Ruff and the affected strict mypy check
  pass. The database uses a task-owned local Unix socket because published TCP
  connections stalled in the execution environment.
- 59 affected Web unit/component cases pass, including Insights, the shipped native
  bridge negative control, legacy values and note privacy. Production
  TypeScript/build, design tokens and PWA checks pass. The runtime OpenAPI and
  pinned generated-client drift checks pass.
- Both browser inventories validate; 1,083 cases in 94 specs are collected.
  All 38 selection-planner regressions pass. These additions stay in existing
  feature-owned specs; the ten always-run core specs remain unchanged.
- The identity classifier preserves only the exact generated prompt's ordinary
  adjacent-card phrase, with negative tests for other wording/paths/branding.
  All 57 relevant classifier/migration/design-guard regressions pass. No
  reference prompt or product assertion was weakened.

The initial browser scan found two obsolete test assumptions (seven choices
and the unwrapped person-name text node) and a real 320px/200% sheet-width issue.
These were corrected together without increasing timeouts/retries or removing
privacy, Energy, focus, return or accessibility assertions. Existing historical
screenshots overwritten by test capture helpers were restored; only the curated
new evidence is included.

The first complete hosted run also found the old feeling label in an Insights
text expectation, canonical endpoint-matrix ownership still assigned to POST,
and the inherited video-failure kind absent from the installed native preview
catalog. The label and GET matrix ownership are corrected. Native video-failure
copy now stays generic even when a title/content is present; four synthetic
vectors cover both preview versions and title states. App and instrumentation
Java/resource compilation and Capacitor foundation checks pass. The snapshot
hashes are represented as typed path/digest records so public API-file SHA-256
values cannot be mistaken for API credentials. The complete-history secret
scan remains unchanged, with no new exclusions or ignored findings.

## Compatibility and remaining acceptance boundary

Deploy the API GET route before or with the shared Web client; rebuild packaged
native clients to ship the updated GET client. Older POST clients keep their API
compatibility but require that client update to avoid the bridge's text path.
No migration, new entitlement, resource allowance or credential is introduced.
The reported Immich version is 3.3.6; the selected-only API/permission contract is
unchanged from the reviewed 3.3.5 integration. See the official
[Immich release](https://github.com/immich-app/immich/releases/tag/v3.3.6),
[API](https://api.immich.app/endpoints/assets/viewAsset) and
[Capacitor HTTP contract](https://capacitorjs.com/docs/apis/http).

Personal live-library and physical-device acceptance are not claimed by these
synthetic tests. Final-head hosted CI and normal branch protection remain
required before merge; no merge or release publication is performed here.
