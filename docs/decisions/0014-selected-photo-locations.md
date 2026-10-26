# ADR 0014: Selected-photo locations and metadata preservation

Status: accepted Product Owner decisions in the implementation chat, 2026-10-26. Owning issue: #1459.

The account-wide **Automatically add places** setting defaults to true. It controls selected-photo GPS extraction and canonical shared Place association, with no per-entry confirmation. It is independent of live location/presence/history, which remain off. Both operating models receive the Free/Core behavior; no API key or paid map SDK is needed.

The Product Owner subsequently explicitly allowed metadata to remain inside photos. Validated, marked moment-photo primary images preserve readable EXIF and ICC profiles when the output format can safely encode them. Corrupt or unencodable optional metadata may be omitted without rejecting usable pixels. Thumbnails remain clean derivatives; unrelated uploads keep their previous metadata removal. This changes the historical blanket metadata-removal policy; stored primary images and downloads can contain location, capture and device information, even when automatic place association is disabled. Never promise that removing a Place relation also scrubs the photo file. Existing metadata already removed from old files cannot be recovered.

Only Memory/HeartMoment upload clients mark a photo-location candidate. Other uploads do not extract GPS. The worker validates finite/ranged DMS with existing Pillow decoding and the current account preference. Optional coordinates stay in owner-scoped encrypted/protected staging; generic attachment APIs, events and logs do not expose them. Binding consumes staging GPS once. Shared Memories and shared HeartMoments may create canonical Places/typed relations in the same transaction. Private HeartMoments never create shared Places, including after a later visibility transition.

Existing place links take precedence. A new batch groups source coordinates within 100 m, retaining an actual source coordinate; distant places stay separate. This is grouping one incoming batch, not implicit merging of saved Places. Reorder/retry cannot restore removed associations or create duplicates. Existing Place collaboration/deletion/offboarding/export rules remain authoritative.

Explicit manual names, addresses, coordinates and allowlisted HTTPS Google Maps share URLs are supported without server-side URL fetching. A map URL remains a protected Place value. A map viewport center is never asserted as an exact selected place. Links are opened only deliberately; viewing a moment produces no provider call. No reverse-geocoded venue name or live autocomplete is promised.

The setting is account-scoped, version-protected and portable in the requesting account's PERSONAL export, never the partner's SHARED export. Untrusted imported archives do not silently change this account preference. Existing authored Places and photo files survive disabling. Changing the setting neither retroactively scans images nor rewrites their metadata.
