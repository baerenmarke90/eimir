# Android sign-in links and Push introduction — #1600

Baseline: main `38bd4e6ac544e5da6adf425749621dce62773e42`.

## Pre-implementation reference

[Generated Compact whole-screen reference](compact-reference.webp). Generated with the built-in Imagegen tool before UI implementation, using the existing actual Warm Wir capture at `docs/product/design/evidence/1538/wir-warm-360-light.webp` as a visual input. Reviewed current `App.tsx`, `TodayPage.tsx`, four-destination shell, current Today modules, `NotificationSettingsPanel`, `ShortTaskSheet`, identity intake and native Push registration. The underlying product composition remains authoritative; this reference specifies the added permission choice, not a replacement Today layout or a pixel lock for older fixture content.

Prompt: preserve the existing warm Wir composition, couple avatars, current mood, quote, keepsake, upcoming content and four labeled destinations with central create action; overlay the existing bounded bottom sheet, named personal Push choice, one Allow action, quiet Not now action and expandable privacy details. No stock art, forms, provider setup or dashboard. Generated image is design preflight only, never runtime evidence.

## Mobile Interaction Contract

Product Reference v1 D1/D6, R4 entry and R5 utility; UX Patterns section 7. Existing `ShortTaskSheet` owns modal focus, inert background, Back/Escape, handle dismissal, Expanded close control and reduced motion. Existing semantic tokens and localized content own presentation. Compact is a bottom sheet, Expanded a bounded centered modal, with identical consent and recovery. No keyboard or typing. The person may allow, defer or dismiss alone; the partner is unaffected.

Wait for an available device transport and authenticated relationship shell. Never activate on mount. An explicit Allow calls the existing `useDevicePush.enable` lifecycle: Android permission, native provider, authenticated endpoint write. Connecting is not success. Denied permission uses the existing device-settings recovery, errors reuse status/retry presentation, and only authoritative endpoint success closes with confirmation. Defer/dismiss is remembered per Account/API/device, not per Space; an existing active registration also counts as already introduced. Changing Account or API cannot inherit another decision. Offline/unavailable startup does not consume the choice. An unsaved task defers the introduction.

No event preferences, Quiet Hours, entitlement, backend API/schema, signing identity or provider change. Notification Policy and official client access remain Free/Core. Proofs remain memory-only and exact-origin validated. Manifest routes cover only the requested HTTPS host and five known identity proof paths; website verification and physical-device delivery remain separately verifiable deployment boundaries.

## Acceptance evidence

Actual browser journey screenshots and exact-source test results will be recorded here before merge. Synthetic browser plugins establish shared Web behavior only; they do not prove Android domain verification, real OS permission UI or actual FCM delivery.
