# Product consistency and deliberate Plan completion

Date: 2026-10-29. PO amendments in the owning workspace chat. Baseline main: `f35f82dbab2465fe337850a1e8db147f4eb3942a`; this isolated checkout starts at the separately validated Plan image fix `b53f7e973ec6764a25ec783223b062057ad643d4` (#1506). #1506 remains independently in CI. #1503 owns browser parallelization; the release chat owns its selected immutable test build. The experimental Android PR uses android-native-test/, a separate client. Preserve the shared dirty checkout and all those boundaries.

## Repository-aware visual preflight

Inspected TodayPage, DailyQuoteCard, CouplePresence, DashboardSettingsPanel/availability, the passport statistics preference, StoryProductPage/List and timeline markers, MemoryCreatePage/ProductPage/MomentPlaces, PlanProductPage/StoryContinuation, App bootstrap and the Android alias/resource generator/validator. Product Reference v1 R1-R5, the image/system direction, Detail/Create-Edit and ShortTaskSheet contracts apply.

Generated with the built-in Imagegen tool before implementation: [Compact product composition](references/product-consistency-20261029/compact-product-reference.png) and [places/startup/native-mask composition](references/product-consistency-20261029/places-and-startup-reference.png). Exact prompts are adjacent. These guide hierarchy, not invented domain capabilities. Exclude the generated alternate navigation glyphs, extra module actions, fictional relationship-strength content, place photos, replacement brand artwork, duplicate Plan title, and navigation shown during unauthenticated startup. Keep the actual navigation, domains, source data and approved brand assets.

## Accepted changes and Mobile Interaction Contract

1. **Global section anatomy:** a section title and its contextual action sit above the section's content surface, consistently. Content titles inside cards remain content, not another section header. Record this explicit PO rule in the normative design references and apply it to affected couple-facing surfaces.
2. **Quote:** remove the colored left rule and excess heading/body gap; slightly reduce quote/attribution size without suppressing attribution, settings, loading/error/offline or Pro behavior.
3. **Moments:** remove redundant visible type words on rediscovery cards, retaining conventional semantic icons and accessible type/name labels. Align every diary node center to the same rail at all widths/text sizes.
4. **Places:** a named Add Place action remains available on editable Memories/Moments with no photo GPS. Reuse existing saved-place and shared map mechanisms, authorization and typed relation APIs. Existing/new selection, confirm/cancel, loading/empty/error/offline, permission and retry are explicit. No automatic provider/location request; private content must not be exposed through shared Place relations.
5. **Optional Pro statistics on Wir:** deliberately enable only under the existing relationship.passport capability, with a personal opt-in initially off. Reuse authoritative counters and existing preference scope (instance/Account/Space); retain compatibility keys and source history. The separate passport view remains the owning Pro presentation. Update the versioned feature matrix for this new PO availability decision, superseding the temporary all-tier suppression.
6. **Couple Hero:** enrich the existing identity/duration with truthful already-available shared context such as the next Plan. Respect privacy, visibility preferences and sparse states. No invented scores, streaks, relationship strengths, duplicate large dashboard widgets or additional provider/query machinery.
7. **Launcher and startup:** the PO clarified that the video complaint refers only to the eimir launcher symbol and brief startup logo, not app-navigation or Android-system icons. Reuse approved artwork, correct platform adaptive geometry and native SplashScreen configuration, and replace the oversized Web bootstrap status card with a restrained branded state. Keep account/session, launcher aliases, sign-in entry and selected icon semantics. Never show cached private couple content before current authorization.
8. **Plan completion:** retain only the Als erlebt markieren CTA in reading. Activating it opens the shared short sheet with the experienced date; confirm completes the versioned Plan, cancel writes nothing. Pending/error/conflict/offline preserve intent. After confirmed completion offer the existing canonical Memory creation task with appropriate confirmed Plan defaults. Preserve the completed Plan; never silently reuse an exclusively bound attachment ID or invent an atomic conversion.

## Platform sources and native correction

Reviewed official Android adaptive-icon and SplashScreen guidance on 2026-10-29:
- https://developer.android.com/codelabs/basic-android-kotlin-compose-training-change-app-icon
- https://developer.android.com/develop/ui/views/launch/splash-screen
- https://source.android.com/docs/core/display/adaptive-icons

Current approved foregrounds are 432px with a centered 288px tile. The generated 132dp layer paints an 88dp tile, extending beyond the platform safe region. Correct the existing generator and geometry validator, not only one output resource; retain the approved raster pixels, native mask ownership and immutable package/signing/update contracts. The older 2026-10-26 overscan decision is superseded where it clips the requested complete mark. Native compiled/mask proof and real-device acceptance must be reported distinctly.

## Reuse, commercial and cross-cutting review

Use existing sections/tokens, ShortTaskSheet, PlaceMapPicker, typed APIs, scoped queries, authorized media/cache/Object URL lifecycle, staged attachment pipeline, canonical capture and native Android capabilities. No new third-party/provider or runtime service. Ordinary Plan/Memory/Place functions stay Free/Core with existing ownership, managed-media quota, deletion/export and Cloud/Self-Hosted behavior. The explicit Pro statistics availability change uses the existing passport grant and retains source history/export on downgrade. Launcher Original remains Free; existing cosmetic alternatives retain their current Mixed classification.

Verify current-owner admission before/after writes; fail closed on unreadable/private sources. Preserve partially successful create/link outcomes and retry only the unfinished step. No sensitive text, coordinates, imagery or credentials in logs, telemetry, browser-history payloads or committed fixtures. Public startup remains content-free. Localization, accessible names/targets/focus/return, large text, reduced motion and theme behavior are implementation requirements.

## Evidence plan

Use production journeys and disposable fixtures: Wir settings -> optional Pro statistics, quote settings, rediscovery -> diary, Memory -> add existing/new place -> cancel/save/return, Plan -> completion date -> confirmed result -> canonical Memory draft -> save/return, and cold/restored startup. Check Compact 320/390/430, Expanded, Light/Dark, 200%/400% reflow, offline/failure/pending/privacy and native icon masks. Static references never replace behavioral or installed-device evidence.
