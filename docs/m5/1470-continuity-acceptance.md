# App continuity acceptance — #1470

## Baseline and preflight

Baseline: `main` `624458354c651b39c19f97a82f04eda1a93a5314` (2026-10-28).
The first corrective slice, #1472 (`e786ff1`), is already merged: transient
membership failures preserve an authorized shell, route changes no longer key
the main element, ordinary reads stay fresh for 60 seconds, and hover motion
requires a fine pointer. Do not implement those corrections again.

This follow-up verifies interruption safety and media ownership on the current
product, including the merged #1479 sensitive-media and #1480 photo-place flows.
The issue's historical root-cause section describes the pre-#1472 baseline.

### Reuse before build

Inspect the installed TanStack Query focus manager, Capacitor App lifecycle,
existing session refresh, authorized byte cache and single-consumer Object URL
ownership. Compare the framework's focus API with synthetic browser focus,
custom reload timers and another media cache. Prefer the existing framework and
platform primitives. No new dependency, provider, service, persistence or cache
is proposed. Existing component licenses and Cloud/Self-Hosted support continue;
there is no additional data recipient, configuration or recurring cost.

### Product design and Mobile Interaction Contract

Product Reference v1 R1/R2 and the App Shell, Story Detail and capture templates
remain authoritative. The human task is to read, compose and return without
losing content during an interruption. Personal photos/prose remain the focal
point; existing save, return, gallery, sheet and map interactions are reused.
Compact is primary and Expanded retains the same task and hierarchy. Existing
tokens, touch targets, motion/reduced motion, keyboard/focus and localized copy
remain. This is corrective lifecycle work with no new screen, control or visual
composition; it needs runtime behavioral evidence rather than a new concept.

Loading, empty, error and offline states must preserve usable authorized content
without implying a successful offline write. Definitive authorization loss
still blocks private rendering. A refresh must not remove an active draft,
replace an already loaded photo or reset the originating scroll position.
Sensitive-media reveal remains volatile and must be concealed on backgrounding.

### Business/freemium and cross-cutting review

No business/freemium impact: reliability, accessibility, navigation and ordinary
media are Free/Core for both operating models. No entitlement, relationship
ownership, quota, retention, downgrade, export or billing contract changes.
The authoritative business model and feature matrix remain unchanged.

Security/privacy: retain Account/Space isolation, authorization checks, revocation
and resource disposal. Use only synthetic fixtures in tests/evidence; do not log
tokens, media URLs, content or coordinates. Concurrency: callbacks must not act
after their lifecycle subscription is disposed. Resilience/performance: keep
short resumes quiet while refreshing stale active reads after longer pauses;
measure descriptor requests, byte transports and Object URL allocation/disposal.
No API, schema, migration, infrastructure or backup change is planned.

## Acceptance plan

- Prove fresh versus stale resume behavior through the real query observer and
  native App lifecycle callback, without a browser visibility event masking a
  missing integration.
- Verify transient membership failures retain loaded photos, scroll and drafts;
  separately verify definitive membership rejection blocks the shell.
- Exercise repeated gallery navigation and fullscreen open/close with bounded
  transports and balanced Object URL ownership.
- Retain the existing photo-place, sensitive-media and token-rotation journeys.
- Capture representative Compact/Expanded, Light/Dark behavior where relevant.

## Evidence boundary

Browser interception and plugin callbacks establish client regression evidence,
not an actual provider, deployed worker or physical Android result. A physical
APK/device acceptance is still required to close #1470, including WebView memory,
renderer/process recreation, picker return, TalkBack and ordinary touch use.
Do not claim a deployment, APK publication or device acceptance from this file.
