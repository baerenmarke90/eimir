# Primary-tab swipe delivery — #1521

Baseline: `e9f6646065440c24baf4dfe02477704adaee57b7`.
The Product Owner requested supplementary horizontal tab switching like the
familiar RWN Messenger interaction. The composition and persistent media cache
are already delivered through #1518; this slice adds navigation gestures.

## Preflight and product contract

[The owning issue](https://github.com/baerenmarke90/eimir/issues/1521) records the
Mobile Interaction Contract, reuse, freemium and cross-cutting reviews before
implementation. Its [generated reference](generated-reference.png) was created
from the existing Modern Wir and Moments screenshots after inspecting current
AppShell, route registry, TaskOriginProvider, RouteEntryHandoff, pull-to-refresh,
media/gallery mechanics, tokens and Product Reference v1 R2–R5. The reference
commit is `da14f81791ae62a6ec4742762a43b8764ee2d298`; it illustrates the new gesture
without authorizing a layout redesign or an in-product tutorial.
The original asset transfer was repaired byte-for-byte from that already-generated
reference during publication verification; the design was not regenerated after
implementation.

The existing Today, Story, Plan Hub and Utility templates remain in use. Personal
content remains the focal point. Bottom navigation and Quick Create keep their
existing position, glyphs, labels, keyboard access and selected-state semantics.

## Interaction and reuse

`usePrimaryNavigation` owns the destination, return-state capture and native
history replacement for both primary links and swipes. `usePrimaryTabSwipe`
owns a one-finger, direction-locked interaction only on `/today`, `/story`,
`/plan` and `/more`, deriving adjacency from `PRIMARY_APP_ROUTES`. It does not
wrap at either end. It never serializes queries or mounts hidden route trees.
Existing query freshness, bounded RAM retention, authorized media ownership,
Timeline scope/pagination and Planning segment restoration remain authoritative.

| Input or context | Ownership |
| --- | --- |
| Deliberate horizontal drag on primary reading content | Adjacent primary tab through the same contract as its link |
| Vertical-first input, document movement or top-edge refresh | Existing scroll/pull-to-refresh |
| Media gallery or horizontal content scroller, including either boundary | Existing content scroller; never chains into tab navigation |
| Buttons, forms, sliders, maps, editable or selected text | Existing local interaction |
| Open menu, modal or focused text input | Existing layer/task; no primary swipe |
| First/last 24 CSS pixels of the viewport | Browser/system edge navigation |
| Pinch/multitouch, touchcancel, visibility loss, resize or route replacement | Cancel the pending gesture |
| Details, editors, settings, games and other secondary routes | Existing workflow navigation |

Direct bounded transform feedback follows touch movement without React state
updates per move. On accepted release, a modest directional entry uses the
canonical transition duration/easing; navigation and data publication never wait
for animation. The shell remains fixed. Reduced motion removes translation and
entry animation, including when the preference changes during entry. Consumed
drags suppress their trailing pointer click; keyboard activation and the next
deliberate pointer interaction remain available. No runtime dependency or
provider was added.

## Validation and evidence

- Full Web unit/component suite: **2,305 passed, two existing skips** across
  251 passing files and two skipped files. No test assertions or budgets were
  relaxed. The new gesture contract contributes 30 tests, including immediate
  input after a new destination commits. Gesture listeners bind in the layout
  phase so a visible new root cannot retain the previous root's input owner.
- Six new Chromium touch journeys pass at 360 Light, 390 Dark/reduced-motion,
  430 Light and 1280 Dark, using real CDP touch input on the production shell.
  They verify both directions, endpoint bounds, active navigation, no document
  reload, restored Timeline position, preserved Planning mode, no repeated
  fresh Timeline read, native history replacement and native scroller ownership.
- Production build, TypeScript, semantic token/PWA checks, changed-file
  format/lint, browser inventory, English-language audit and whitespace pass.
- **54 distinct shell/gallery browser journeys pass across the final verification
  runs**: 53 in the regression run plus the corrected canonical-read counter case
  in its targeted verification. This covers focus/reflow, photo interaction,
  sensitive-media controls and authorization on resume as well as the new input.
  The fresh-read counter observes the actual canonical `/timeline` endpoint
  and must see at least one initial read before checking for duplicates.

| State after swipe | Compact evidence | Expanded evidence |
| --- | --- | --- |
| Wir | [360 Light](swipe-wir-360-light.png), [390 Dark/reduced motion](swipe-wir-390-dark.png), [430 Light](swipe-wir-430-light.png) | [1280 Dark](swipe-wir-1280-dark.png) |
| Mehr | [360 Light](swipe-more-360-light.png), [390 Dark/reduced motion](swipe-more-390-dark.png), [430 Light](swipe-more-430-light.png) | [1280 Dark](swipe-more-1280-dark.png) |

[Source fingerprints](source-manifest.json) identify the exact implementation
and browser cases exercised. Screenshots show settled states; the touch journeys
establish the interaction, preservation and cancellation behavior. Browser
fixtures use the existing default Wir design; the generated Modern reference
illustrates the same supplementary gesture without changing design selection.

## Follow-up gesture ownership verification

Independent acceptance found that a horizontal content region with all items
visible could otherwise hand a swipe to primary navigation. Overflow ownership
now follows the region's declared scrolling behavior even without overflow.
Dirty document owners remain protected after focus leaves their field, and a
context menu cancels a pending gesture.

The four added regressions fail on the original implementation and pass after
the correction. The focused suite passes **54 tests**, including **34 gesture
cases**. A separate Chromium 153 mobile-touch diagnostic passes **28 checks**
across Light and Dark/reduced-motion, including all roots in both directions,
endpoint bounds, active links, no reload, short cancellation, no-overflow regions
and native vertical scrolling. The existing browser ownership journey now also
checks a single fitting item in both directions. Production build, TypeScript
and changed-file formatting/lint pass. The supplemental local full-suite attempt
was stopped by the environment's blocked `example.test` network request; exact-head
GitHub CI remains authoritative. No job was manually retried.

## Boundaries

Essential navigation stays Core with identical Cloud/Self-Hosted behavior. There
is no entitlement, backend/API, migration, quota, provider, export or persistent
privacy-data change. Existing destination Loading/Empty/Error/Offline states and
authorization remain unchanged; swipe does not grant offline authorization or
force a refetch.

Browser acceptance uses Chromium 153 and synthetic fixtures. A temporary local
launcher removed the serverless binary's single-process flag so isolated browser
contexts remain stable; no launcher or environment path ships. Tests deliberately
start on reading content after the preceding route entry settles; dedicated
ownership cases exercise horizontal scrollers separately. No physical-device,
real-backend, production-performance or separate Android-wrapper acceptance is
claimed. CI on the pushed head remains required before a separately authorized
merge. This delivery does not publish a release.

