# Automatic photo places

Baseline main: `3955f44435f880fb9424602f7a2dcfbd17726148` (2026-10-26).

## Product Owner decision

An account-wide **Automatically add places** setting is enabled by default. Selected photos with usable GPS coordinates automatically supply places when saved to shared Memories or shared HeartMoments. There is no per-entry confirmation. Manual places take precedence. Disable stops future extraction and association; existing places remain editable, removable and exportable. Missing GPS never blocks a moment. This selected-photo decision supersedes older blanket opt-in wording only for this feature. Live location, presence, history and background tracking remain off and out of scope.

## Mobile Interaction Contract and design preflight

Reviewed actual main SettingsPage/category routes/index, PreferenceSwitch, MemoryCreatePage, MemoryProductPage, HeartMomentProductPage, PlaceProductPage, shared shell/navigation, semantic tokens and existing image sanitization/binding. Concurrent diary PR #1458 stays separate.

- Goal: keep where a shared moment happened without another capture task.
- Product Reference v1 R1/R2 content-first capture/reading and R5 calm utility; Settings, Create/Edit and Detail templates.
- Settings index retains relationship, notifications, Today, appearance, data and account. Add Memories; its focused page contains one immediately persisted switch and a clear sharing explanation.
- Capture retains photos, narrative, optional title, date, tags, shared audience and Save; the automation disclosure is secondary to content.
- Detail retains gallery/text/date/author/comments/edit/return. Add a compact location section with Maps, correction/removal and manual addition. No embedded map or provider traffic on viewing.
- Reuse PreferenceSwitch, ShortTaskSheet, PageHeader, existing buttons and tokens. Compact 360/390/430 with 320 reflow and large text; Expanded preserves bounded reading width.
- Loading: disabled switch until real state loads. Error: retain existing state and offer retry. Offline: no write/sync promise. Success: confirmed server state and polite status.
- Existing reduced-motion, focus, Back, draft/save/reconciliation behavior remain authoritative. No privacy-setting celebration or unsolicited keyboard.
- Private HeartMoments must never produce shared Places. Manual choices are never overwritten.
- Generate a repository-aware Compact composition before UI code; record prompt/output alongside this file and link the owning issue. Actual implementation evidence will cover Open → interact → save → observe → return.

## Reuse and provider decision

Use existing Pillow/Pillow-HEIF and EXIF GPS tags, protected attachment payloads, canonical Places and typed relations, parent transaction/locking and generated OpenAPI clients. Use Google universal Maps URLs: no API key or SDK. Official sources reviewed 2026-10-26:

- https://pillow.readthedocs.io/en/stable/reference/ExifTags.html
- https://developers.google.com/maps/documentation/urls/get-started

Do not add a second image decoder, EXIF binary parser, paid geocoder or arbitrary URL-fetch service. Manual names/addresses and coordinate-bearing map links work without a provider. Address autocomplete and reverse-geocoded venue names need a separately reviewed service; generic localized photo-place names remain honest about the available metadata. Existing Pillow components retain their declared licenses; Maps is a deliberate external navigation receiving the selected place only after activation. Cloud and Self-Hosted behave identically without configuration.

## Business / freemium impact reviewed

Memory CRUD/media and basic Place CRUD/pins/content links are Free/Core in the feature matrix. This selected-photo metadata automation is Free/Core, with no new entitlement, quota, raw-original retention or provider cost. Version the classification explicitly.

## Cross-cutting contract

Account-scoped durable preference, optimistic concurrency, server checks at both extraction and association. GPS is finite/range-validated and optional; malformed EXIF does not reject a valid image. Per the subsequent Product Owner decision, marked moment-photo primary images preserve readable EXIF/ICC when possible; thumbnails remain metadata-free. The association switch does not scrub metadata from photos. Unrelated upload contexts retain metadata removal. GPS staging remains owner-scoped protected content and never appears in generic attachment responses, logs, events or metrics. Existing same-Space typed FKs and parent locks apply. Repeated gallery PUTs cannot duplicate places. No implicit merging of existing Places. Nearby coordinates may be grouped only within one newly bound photo batch, retaining a real source coordinate rather than averaging distant places. Private/shared transitions and manual removal must preserve privacy. Existing deletion, offboarding and portable export remain authoritative. Test actual encoded GPS, sanitization, off/on, scope, retries, manual precedence, private/shared boundaries, safe Maps links and setting persistence/recovery.

## Generated visual reference

[Compact composition](compact.png) was generated with the built-in Imagegen tool after reviewing the baseline and destination sources above. The [exact prompt](image-prompt.txt) is retained. The photo-location subtitle in the generated image is illustrative; this implementation has no reverse geocoder and uses a localized generic label until explicitly renamed. Existing screen hierarchy, user content and normative product contracts take precedence over mockup decoration.

## Publication status

The Product Owner explicitly authorized publication of the issue, generated reference and draft PR on 2026-10-26. Runtime/UI implementation follows the preflight above. Merge and deployment are separate.
