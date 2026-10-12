# App-icon selection — Web implementation

## Status and authority

Owner continuation on 2026-10-12 after the complete catalog review; draft #1309
continues the preparation into a reviewable Web implementation. Main baseline
is still `170a89faadef184c124472f544680262e159d207`. The generated full-catalog
reference and existing Mobile Interaction Contract in [the preflight](README.md)
remain valid for that unchanged Appearance destination. This document records
branch behavior; it does not claim a merge, deployment or installed-device proof.

## Product contract

- Original and System/Light/Dark are Free. All ten additional fixed choices are
  Pro under the existing `theme.bespoke_packs` capability. Proposed catalog names
  are implemented through localization; contextual UI color worlds do not change.
- Appearance retains theme choice, shell and Back to Settings. A personal icon
  summary opens the existing ShortTaskSheet; eleven native radios preview locally.
  One explicit completion writes the preference. Free preview leads to the
  existing Pro-information destination rather than a new checkout.
- A saved choice remains effective after Pro expiry. Choosing another paid icon
  requires a current grant; Original is always selectable. This applies the
  matrix's non-destructive cosmetic retention contract and adds no provider cost.
- Selection and focus use scheme-sensitive semantic roles, a check plus outline,
  named radio controls and existing sheet motion/reduced-motion behavior. The
  optional shared sheet footer keeps completion and recovery reachable while
  the catalog scrolls. Large footer content itself can scroll without hiding
  the body permanently.
- Pending prevents duplicate writes, Escape and dismissal. Failure keeps preview;
  conflict requires an explicit reload before retry. Capability failure never
  becomes an entitlement grant or a false Free result. Original still works.

## Persistence, security and lifecycle

`AppIconPreference` is Account plus Space system metadata with unique ownership,
UUIDv7, version and timestamps. The tenant guard share-locks membership before
reading or writing. The caller cannot nominate another Account. Pro writes use
the central grant evaluator and lock its authorization snapshot; Free reset does
not depend on entitlement availability. IDs are a closed OpenAPI enum, not URLs.

`GET/PATCH /api/v1/spaces/{spaceId}/appearance/app-icon` returns only icon ID and
version. Reads and writes carry `private, no-store` and an opaque strong ETag;
PATCH requires If-Match and returns 409 for stale state. Initial inserts use
PostgreSQL ON CONFLICT DO NOTHING on the unique pair; concurrent absent writes
have one winner. Existing rows use a row lock and fresh version. This avoids
reversing Account/Membership deletion lock order to lock an absent preference.

The read is machine-readable for Free/expired owners. PERSONAL transfer bundles
also carry only the caller's `personalAppearance.appIconId` in `accounts.json`;
SHARED export omits it. It is export-only metadata: import never activates paid
choices or installation changes from an untrusted archive. Physical Account or
Space deletion cascades; the actual pseudonymizing Account-deletion lifecycle
explicitly purges this row. Full database backup/restore naturally includes it.

Web queries include instance, Account and Space. The provider is remounted at
owner changes; reads use cancellation, pending saves abort on teardown and late
responses may reconcile only the query instance that admitted them. No icon
preference is stored globally in localStorage or read on the unauthenticated
entry screen. Capability lookup stays lazy until the selector opens. No offline
write queue, new runtime dependency or private manifest cache is introduced.

## Browser surface and launcher boundary

The authenticated saved preference drives the active browser favicon, including
after reload. Fixed choices survive Light/Dark changes; Original resumes the
existing adaptive family. Teardown restores the default. Header brand, manifest
link, Apple touch metadata and native launcher remain the standard family.
Success reports a saved preference; localized copy explains the current browser
scope and unchanged home-screen icon.

Eleven static proof manifests and deterministic 180/192/512 px assets are under
`web/public/identity/app-icons/v1`. Every manifest has explicit `id: /`, identical
name/start URL/scope and no private identifiers. No production link activates
them. `build-platform-proof.py` reproduces them from the exact crops and the
baseline manifest; `verify.py` proves source equality, Pro coverage, resampling
and stable metadata. Alternative manifests currently use `purpose: any`; mask
quality and existing-install updates must be established on the real devices.

Rechecked primary documentation on 2026-10-12:
[Chrome identity review](https://developer.chrome.com/blog/improvements-to-web-app-updates)
and [WebKit icon precedence](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/#new-fallback-icon).
Document metadata changes are not an installed-launcher completion signal.

### Remaining real-device proof

On the intended Chrome Android/desktop and Safari iOS/iPadOS versions, test a
fresh install and an existing install with the proof manifest, explicit consent,
cancellation, restart and return to Original. Record app identity/data retention,
actual icon quality and supported behavior. Test platform-specific masking and
Apple touch precedence separately. Do not change app ID, reinstall automatically
or infer success from a timer. Native launcher integration remains separate.

## Verification and evidence

- PostgreSQL tests cover all ten paid choices, shared grants with personal
  ownership, Free reset, downgrade, membership/owner/Space isolation, invalid
  IDs, strong ETags, stale/concurrent writes, personal export and deletion.
- Client tests cover lazy capability work, fixed-icon theme behavior, default
  teardown, pending cancellation and late-query ownership.
- Actual-App browser journeys cover Free preview, authoritative Pro save,
  reload/reset, reachable completion, Escape/focus restoration, retained conflict
  preview, revocation and pending close protection. Only HTTP is replaced.
- Browser evidence covers 320/390/430 px and Expanded, Light/Dark, reduced motion
  and 200% text. Axe checks the actual sheet. This is browser evidence, not proof
  of a physical device launcher.
- Existing browser fixtures share a narrowly matched default GET response for
  the new shell preference; PATCH and unknown requests keep their strict failure
  behavior. No existing assertion is relaxed.

Representative captures: [Free summary](evidence/app-icons-free-390-light.png),
[Free preview](evidence/app-icons-free-preview-390-light.png),
[Pro saved/Dark](evidence/app-icons-pro-saved-390-dark.png),
[320 px](evidence/app-icons-pro-320-light.png),
[430 px](evidence/app-icons-pro-430-light.png),
[Expanded](evidence/app-icons-pro-1280-light.png),
[large text](evidence/app-icons-pro-360-large-text.png).
