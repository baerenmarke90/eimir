# Issue 1517 — cloud continuation checkpoint

Repository: baerenmarke90/eimir. Branch: fix/app-continuity-and-composition.
Baseline main: 44cd3d59bd33a47472b320025efd6bc9ab22a26d.

## Owner request

Continue the entire change in the cloud. Preserve the prior local concise-copy
commits (93e21268 and fbe2fd15) as part of this branch. Do not lose any work.

Requested product changes:
- Clear sign-out button with logout icon and distinct semantic surface.
- Deliberate centered brand footer; round search pill without forward arrow.
- Shared More child-page typography, widths and settings navigation surfaces/icons.
- More color and differentiation in Diary entries and month labels.
- Modern Wir hero with larger centered portraits, names, duration and separate next event.
- App-owned persistent media store informed by RWN Messenger cache principles.
- Remove decorative forward destination arrows throughout couple-facing screens;
  retain actual gallery next/previous and explicit Back controls.
- Quote preferences (including category/source selection) belong in More → Settings → Wir,
  with no overflow button on the Wir quote itself.
- Monthly highlights include captions/dates and text/Milestone highlights, not just 3 photos.
- Memory view shows location/address/map only. Add/edit/unlink controls appear in
  the Memory editor; no Add button when a location already exists.

## Implemented

See current branch diff and media-cache-lifecycle.md. Durable media: IndexedDB,
128 MiB / 512 entries / 7 days, bounded RAM retained, current authorization before
all deliveries, account/origin/Space/parent/variant identities, epoch fencing,
logout/switch clear and targeted denial eviction. Does not claim encryption or
offline-media authorization. Query RAM retention raised to 30 minutes without
changing one-minute freshness.

Quote advanced settings reuse DailyQuoteCard's existing preferences sheet via
settingsOnly mode, mounted under DailyQuoteSettingsPanel. Normal Wir mode hides
the overflow button and does not request the preferences catalog. Existing
visibility switch remains in More settings. No new backend or native Kotlin code.

Generated references were created before implementation and linked in #1517:
references/more-modern-diary-2026-10-30.png and
references/monthly-quote-location-2026-10-30.png. Existing functions and hierarchy
were inspected; mock content is illustrative, not a new product/data contract.

Business/freemium reviewed: essential continuity and navigation stay non-paywallable;
Modern keeps its current Pro classification. Cloud and Self-Hosted share behavior.

## Validation already completed

Before the final scope extension: production build passed; 2,273 unit/component
tests passed (2 skipped) with external fetch disabled by a verification-only setup.
Original full run was blocked by automatic approval review because a test attempted
api.example.com; the safer offline run succeeded. Do not retry real external fetches.

Browser: 13 More/Wir design journeys passed (320/360/390/430/1280, light/dark,
large text, reduced motion, capability and sign-out). 17 further media/Diary
journeys passed. Three initial failures were corrected: two expected a removed
redundant intro, and the new media-restart test counted only absent variant query
params instead of variant=original. The final five affected browser reruns all
passed, including persisted bytes across reload with fresh authorization.
Screenshots under evidence/app-composition are real fixture-based browser evidence.

After the additional owner scope, TypeScript and all 120 focused extension tests
passed (7 files). The monthly-visibility fixture now uses a previous-month trace
row, since current-month notes consume the old fixture's last current-month row.
DailyQuoteCard/SettingsPanel, TodayPage, PhotoPlaces, Memory and activity/notification
component tests passed after the product expectations were updated.

## Work still required

1. Format only changed files from web cwd (Biome nested configs reject root invocation).
2. Rerun focused and complete unit tests with network disabled. Verification-only
   files verify-no-network.ts and verify-offline.config.ts currently exist locally,
   intentionally excluded from this checkpoint. Recreate a setup that assigns
   globalThis.fetch to an async function throwing TypeError and extend vite.config.ts
   with setupFiles. Existing per-test mocks override it. Do not ship the verification configs.
3. Add meaningful regression assertions for read-only location (no Add/overflow),
   existing location in editor (no Add; actions available), and monthly text inclusion.
4. Migrate today-daily-quote.spec.ts settings journeys from Wir overflow to the
   More settings entry. Preserve privacy/ETag, conflict, offline, capability,
   hidden-quote restore, focus and return assertions. SettingsPanel now has generic
   privacy fallback because partner identity is not required there. Some journeys
   currently assume remaining on Today after saving; navigate back explicitly.
5. photo-places.spec.ts canonical correction currently opens place actions from
   Memory viewing mode: enter /story/memories/mem-canal/edit first. Returning from
   Place must preserve the Memory editor context; update expected path accordingly.
   Other read-only address/map journeys should continue to pass.
6. Run the affected browser suites; capture final More footer/settings, Modern
   hero, colored Diary, monthly highlights and read-only/editor location evidence.
7. Review cache security/races and all UI changes. No broad refactors or weakened
   tests. Make the draft PR reviewable with validation and limitations.
8. No merge or test-release was requested for this new scope in the latest messages;
   retain the branch/PR for review unless the owner adds authorization.

## Browser runtime used successfully

A Chromium binary was extracted from @sparticuz/chromium (MIT distribution;
Chromium upstream licenses apply) installed under /tmp/eimir-browser. Executable:
/workspace/scratch/60502d8a1f63/browser-tmp/chromium. Normal Playwright browser
archive download had previously produced HTML, so the npm-distributed binary was
used. The package's tar extraction chown fails in this container; the binary was
Brotli-decompressed directly to scratch and chmod 0700. No network policy was bypassed.
A temporary e2e config extends playwright.config.ts with launchOptions executablePath
and args --no-sandbox --disable-dev-shm-usage --disable-gpu. Do not commit absolute
runtime paths. If the scratch runtime is gone, recreate this setup using permitted
package access; do not assume the executable or logs still exist.
