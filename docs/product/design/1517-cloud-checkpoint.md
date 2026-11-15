# App composition and continuity delivery — #1517

Repository: `baerenmarke90/eimir`. Branch: `fix/app-continuity-and-composition`.
Baseline main: `44cd3d59bd33a47472b320025efd6bc9ab22a26d`.

The complete private checkpoint and earlier copy-polish commits were restored
successfully in the cloud. The scheduled continuation recorded a failed run and
no result. The owner authorized cloud completion and pushing a PR. After automatic approval
review required the public target to be named explicitly, the owner explicitly
named `https://github.com/baerenmarke90/eimir` for PR publication. Publication of this
source and fixture evidence to that repository is now explicitly authorized.
The current request does not authorize merging or releasing this new scope.

## Delivered scope

- Replace the visible quote title with a quotation icon; shorten repeated copy
  throughout the app and remove the redundant Plan notes/creator labels.
- Clear sign-out action, centered brand footer, search pill without a forward
  arrow and shared More child-page presentation.
- Purposeful Diary colors and a centered Modern couple hero with an independent
  duration and next-plan surface. Preserve existing capabilities and Pro tiers.
- App-owned persistent authorized media bytes, informed by RWN Messenger cache
  principles and implemented through the existing shared media loader.
- Remove decorative forward arrows while retaining functional gallery/Back controls.
- Move personal quote category/source preferences to More → Settings → Wir.
  The Wir quote has no overflow action and does not request preference/catalog data.
- Monthly photo captions/dates plus distinct text and Milestone highlights from
  already loaded authorized projections, with no fabricated overall count.
- Memory reading retains Place name/address/map. Add/edit/unlink controls belong
  in the editor; an existing location has no Add button. Correcting a Place returns
  to the Memory editor. Unsaved content requires explicit discard before leaving.

## Storage and ownership

RAM: 48 MiB / 192 entries / 30 minutes. IndexedDB: 128 MiB / 512 entries /
seven days. Keys separate origin, Account, Space, parent, attachment and variant;
credentials, signed URLs and Object URLs are never persisted. Access is checked
before every delivery. Synchronous epoch rotation, current-owner/lease checks,
logout/Space invalidation and targeted denial eviction fence stale work.
Storage failure falls back to the established network/RAM path. This is disposable
unencrypted app/browser storage, not offline authorization or full domain sync.
Ordinary query RAM retention is 30 minutes; freshness remains one minute.
See [the lifecycle contract](media-cache-lifecycle.md).

## Acceptance

All previously open test migrations and meaningful regressions are complete.
The full Web suite passes 2,275 tests (two existing skips), using the private
verification setup that blocks accidental external fetches. Production build,
token/PWA, changed-file formatting/lint, language audits and whitespace pass.
Forty-three distinct selected browser journeys pass across the final verification
runs. The additional monthly screenshot refresh also passes. The final checks
caught and fixed the editor return allowlist and Modern 200% avatar overflow;
tests were corrected only where their expected product behavior was superseded.

[Actual visual evidence, source fingerprints and behavioral limits](evidence/1517-app-composition/README.md).
Generated references remain linked from #1517. Existing quote conflict/offline
component coverage is preserved. No temporary runtime configuration or test
transport override is shipped. GitHub CI on the pushed head remains a separate
merge gate. Physical-device, real backend and production performance acceptance
are not claimed. No merge or test-release is part of this PR delivery.
